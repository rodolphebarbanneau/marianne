import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import { allowedUrl, serviceCode, type ServiceManifest } from '@marianne/sdk'
import type { RequestOptions, ServiceHttp } from '@marianne/sdk/main'

/**
 * A community service's network: HTTPS to its declared hosts, and nowhere else, whatever the
 * answers say. Each redirect is followed by hand and checked again (https, a declared host), five
 * at most, and never sends a body again; every connection's address is checked once the name is
 * resolved, so that a declared name can't lead to this computer or its local network (loopback,
 * private, link-local, unique-local addresses). Answers are bounded in size and in time (a whole
 * request has a deadline, whatever drips in), decoded as they come, never all at once. A service
 * has a few requests in flight at most, its pictures included; what it keeps in cache is its own,
 * keyed by the whole request, within a size.
 */

/** How much of an answer a service may read. */
export const MAX_ANSWER_BYTES = 10 * 1024 * 1024
/** A picture from a declared host, for its screen. */
export const MAX_PICTURE_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 5
const DEFAULT_TIMEOUT_MS = 20_000
/** The longest a request may take, from its first byte sent to its last read. */
const MAX_TIMEOUT_MS = 60_000
const DEFAULT_CACHE_MS = 300_000
/** What a service's cache may hold, in bytes. */
export const CACHE_BYTES = 16 * 1024 * 1024
/** How many of a service's requests may be in flight at once (its pictures included), and wait for one. */
export const IN_FLIGHT = 6
export const WAITING = 24

/** Addresses a service never reaches: this computer, the local network, the reserved ranges. */
const BLOCKED = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3]
] as const)
  BLOCKED.addSubnet(net, prefix, 'ipv4')
// IPv4-mapped addresses (::ffff:0:0/96) are checked against the IPv4 ranges by BlockList itself;
// the other ways IPv6 carries an IPv4 address (compatible, translated, NAT64, 6to4) are blocked
// whole, so that none leads to this computer or its network.
for (const [net, prefix] of [
  // The unspecified address, the loopback, and IPv4-compatible addresses (::127.0.0.1).
  ['::', 96],
  // IPv4-translated (::ffff:0:a.b.c.d).
  ['::ffff:0:0:0', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  // NAT64, the well-known prefix and the local-use one.
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  // 6to4.
  ['2002::', 16],
  ['2001:db8::', 32]
] as const)
  BLOCKED.addSubnet(net, prefix, 'ipv6')

/** Whether an address is one a community service may not connect to (IPv4 inside IPv6 included). */
export function blockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return BLOCKED.check(address, 'ipv4')
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
    if (mapped) return BLOCKED.check(mapped[1], 'ipv4')
    return BLOCKED.check(address, 'ipv6')
  }
  return true
}

type Lookup = (hostname: string, options: { all: true }, callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void

/** A resolver for https.request that refuses a name resolving to a blocked address (all of its addresses are checked). */
export function guardedLookup(resolve: Lookup = dnsLookup as unknown as Lookup) {
  return (hostname: string, options: { all?: boolean; family?: number }, callback: (...args: unknown[]) => void) => {
    resolve(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err)
      const usable = addresses.filter((a) => !options.family || a.family === options.family)
      if (!usable.length || usable.some((a) => blockedAddress(a.address))) {
        const refused = Object.assign(new Error(`${hostname} mène à une adresse de cet ordinateur ou de son réseau`), { code: 'EADDRBLOCKED' })
        return callback(refused)
      }
      if (options.all) callback(null, usable)
      else callback(null, usable[0].address, usable[0].family)
    })
  }
}

/** One HTTP exchange, as the redirect loop sees it (https.request in the app, a fake in tests). */
export interface Exchange {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: Buffer
}
export type Transport = (
  url: URL,
  init: { method: string; headers: Record<string, string>; body?: string; timeoutMs: number; maxBytes: number }
) => Promise<Exchange>

/**
 * Node's https, through the guarded resolver: the whole exchange within `timeoutMs` (the request is
 * destroyed then, however slowly its answer drips), its answer decoded as it comes (a stream, off
 * the main thread's way), never past `maxBytes` read or decoded.
 */
export const httpsTransport: Transport = (url, init) =>
  new Promise((resolve, reject) => {
    let settled = false
    const finish = (err: Error | null, value?: Exchange) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      if (err) {
        req.destroy()
        reject(err)
      } else resolve(value!)
    }
    const tooBig = () => new Error(`la réponse de ${url.host} dépasse ${Math.round(init.maxBytes / 1024 / 1024)} Mo`)
    const req = httpsRequest(
      url,
      { method: init.method, headers: init.headers, lookup: guardedLookup() as never, timeout: init.timeoutMs, agent: false },
      (res) => {
        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase()
        const decoder = encoding === 'gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : null
        const chunks: Buffer[] = []
        let read = 0
        let decoded = 0
        res.on('data', (c: Buffer) => {
          read += c.length
          if (read > init.maxBytes) finish(tooBig())
        })
        res.on('error', (err) => finish(err))
        const out = decoder ? res.pipe(decoder) : res
        out.on('data', (c: Buffer) => {
          decoded += c.length
          if (decoded > init.maxBytes) {
            decoder?.destroy()
            return finish(tooBig())
          }
          chunks.push(c)
        })
        out.on('error', () => finish(new Error(`réponse illisible de ${url.host}`)))
        out.on('end', () => finish(null, { status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
      }
    )
    const deadline = setTimeout(
      () => finish(Object.assign(new Error(`Pas de réponse de ${url.host} (délai dépassé)`), { name: 'TimeoutError' })),
      Math.min(init.timeoutMs, MAX_TIMEOUT_MS)
    )
    req.on('timeout', () => finish(Object.assign(new Error(`Pas de réponse de ${url.host} (délai dépassé)`), { name: 'TimeoutError' })))
    req.on('error', (err) => finish(err))
    if (init.body !== undefined) req.write(init.body)
    req.end()
  })

/** A service's requests in flight: IN_FLIGHT at once, WAITING more in line; beyond, refused. */
class Slots {
  private running = 0
  private queue: Array<() => void> = []

  async run<T>(who: string, job: () => Promise<T>): Promise<T> {
    if (this.running >= IN_FLIGHT) {
      if (this.queue.length >= WAITING) throw new Error(`${who} a trop de requêtes en cours : Marianne en laisse passer moins.`)
      await new Promise<void>((resolve) => this.queue.push(resolve))
    }
    this.running++
    try {
      return await job()
    } finally {
      this.running--
      this.queue.shift()?.()
    }
  }
}

const slots = new Map<string, Slots>()
/** The slots of a service, shared by its main side's requests and its screen's pictures. */
export const slotsOf = (code: string) => slots.get(code) ?? slots.set(code, new Slots()).get(code)!

/** Headers a service may not set: who the request is for, and how the connection is carried. */
const FORBIDDEN_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authorization',
  'proxy-authenticate',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'accept-encoding'
])

/** A service's headers, without the forbidden ones. */
export function serviceHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => !FORBIDDEN_HEADERS.has(name.toLowerCase()) && !/^(proxy-|sec-)/i.test(name)))
}

export interface FetchInit {
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
  timeoutMs?: number
  maxBytes?: number
}

/**
 * A request to a declared host, its redirects followed by hand: each one https, on a declared
 * host, five at most; a 301/302/303 goes on as a GET without the body, a 307/308 with a body is
 * refused (it would send it again). Throws a French error for anything not allowed.
 */
export async function serviceFetch(
  m: Pick<ServiceManifest, 'id' | 'hosts'>,
  url: string,
  init: FetchInit,
  transport: Transport = httpsTransport
): Promise<Exchange & { url: string }> {
  const who = `3615 ${serviceCode(m)}`
  let target = url
  let method = init.method
  let body = init.body
  // One deadline for the whole request, its redirects included.
  const end = Date.now() + Math.min(init.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)
  for (let hop = 0; ; hop++) {
    if (!allowedUrl(m, target)) {
      let host = target.slice(0, 80)
      try {
        host = new URL(target).host || host
      } catch {
        // shown as given
      }
      throw new Error(
        hop ? `${who} : une redirection mène à ${host}, qu’il n’a pas déclaré.` : `${who} n’a pas déclaré ${host} (package.json, marianne.hosts).`
      )
    }
    const left = end - Date.now()
    if (left <= 0) throw new Error(`Pas de réponse de ${new URL(url).host} (délai dépassé)`)
    let answer: Exchange
    try {
      answer = await transport(new URL(target), {
        method,
        headers: init.headers,
        body,
        timeoutMs: left,
        maxBytes: init.maxBytes ?? MAX_ANSWER_BYTES
      })
    } catch (err) {
      const e = err as Error & { code?: string }
      const host = new URL(target).host
      if (e.code === 'EADDRBLOCKED') throw new Error(`${who} : ${e.message}, Marianne ne l’y laisse pas aller.`)
      throw new Error(e.name === 'TimeoutError' ? `Pas de réponse de ${host} (délai dépassé)` : `${host} injoignable : ${e.message}`)
    }
    const location = answer.headers.location
    if (answer.status < 300 || answer.status >= 400 || !location) return { ...answer, url: target }
    if (hop >= MAX_REDIRECTS) throw new Error(`${who} : trop de redirections depuis ${new URL(url).host}.`)
    if ((answer.status === 307 || answer.status === 308) && body !== undefined)
      throw new Error(`${who} : une redirection demanderait d’envoyer à nouveau sa requête.`)
    if (answer.status !== 307 && answer.status !== 308) {
      method = 'GET'
      body = undefined
    }
    target = new URL(Array.isArray(location) ? location[0] : location, target).href
  }
}

const text = (e: Exchange) => e.body.toString('utf8')

/** A service's own cache of GET answers, keyed by the whole request (no service reads another's), within CACHE_BYTES. */
class ServiceCache {
  private entries = new Map<string, { at: number; ttl: number; text: string; bytes: number }>()
  private bytes = 0

  get(key: string): string | undefined {
    const hit = this.entries.get(key)
    if (!hit) return undefined
    if (Date.now() - hit.at < hit.ttl) return hit.text
    this.drop(key)
    return undefined
  }

  put(key: string, text: string, ttl: number): void {
    const bytes = text.length * 2
    if (bytes > CACHE_BYTES / 4) return
    this.drop(key)
    while (this.bytes + bytes > CACHE_BYTES && this.entries.size) this.drop(this.entries.keys().next().value!)
    this.entries.set(key, { at: Date.now(), ttl, text, bytes })
    this.bytes += bytes
  }

  private drop(key: string): void {
    const e = this.entries.get(key)
    if (!e) return
    this.entries.delete(key)
    this.bytes -= e.bytes
  }
}

const caches = new Map<string, ServiceCache>()
const cacheOf = (code: string) => caches.get(code) ?? caches.set(code, new ServiceCache()).get(code)!

/** `ServiceHttp` for a community service: json, text and page through `serviceFetch`. */
export function communityHttp(m: Pick<ServiceManifest, 'id' | 'hosts'>, userAgent: () => string, transport: Transport = httpsTransport): ServiceHttp {
  const send = async (url: string, options: RequestOptions, accept: string): Promise<string> => {
    const json = options.json !== undefined
    const method = options.method ?? (json || options.form ? 'POST' : 'GET')
    const headers: Record<string, string> = {
      'User-Agent': userAgent(),
      Accept: accept,
      'Accept-Encoding': 'gzip, deflate, br',
      ...serviceHeaders(options.headers)
    }
    let body: string | undefined
    if (json) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(options.json)
    } else if (options.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      body = new URLSearchParams(options.form).toString()
    }
    const ttl = method === 'GET' ? (options.cacheMs ?? DEFAULT_CACHE_MS) : 0
    const key = JSON.stringify([method, url, headers])
    const cache = cacheOf(m.id)
    const hit = ttl ? cache.get(key) : undefined
    if (hit !== undefined) return hit
    const answer = await slotsOf(m.id).run(`3615 ${serviceCode(m)}`, () =>
      serviceFetch(m, url, { method, headers, body, timeoutMs: options.timeoutMs }, transport)
    )
    const host = new URL(answer.url).host
    const got = text(answer)
    if (answer.status < 200 || answer.status >= 300)
      throw Object.assign(new Error(`HTTP ${answer.status} de ${host}${got ? ` : ${got.replace(/\s+/g, ' ').slice(0, 300)}` : ''}`), { status: answer.status })
    if (ttl) cache.put(key, got, ttl)
    return got
  }
  return {
    json: async <T>(url: string, options: RequestOptions = {}) => {
      const got = await send(url, options, 'application/json, text/plain, */*')
      try {
        return JSON.parse(got.replace(/^﻿/, '')) as T
      } catch {
        throw new Error(`Réponse illisible de ${new URL(url).host}`)
      }
    },
    text: (url, options = {}) => send(url, options, 'application/json, text/plain, */*'),
    page: (url, options = {}) =>
      send(url, { timeoutMs: options.timeoutMs, cacheMs: 0 }, options.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
  }
}

/** The picture types a screen may show from its declared hosts. */
const PICTURES: Record<string, string> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
  'image/avif': 'image/avif',
  'image/svg+xml': 'image/svg+xml'
}

/** A picture of a declared host, for its screen (through the scheme): its type and bytes, or null. */
export async function servicePicture(m: Pick<ServiceManifest, 'id' | 'hosts'>, url: string, userAgent: () => string, transport: Transport = httpsTransport) {
  // In the same line as its main side's requests: its screen can't flood the network either.
  const answer = await slotsOf(m.id).run(`3615 ${serviceCode(m)}`, () =>
    serviceFetch(
      m,
      url,
      {
        method: 'GET',
        headers: { 'User-Agent': userAgent(), Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8', 'Accept-Encoding': 'gzip, deflate, br' },
        maxBytes: MAX_PICTURE_BYTES
      },
      transport
    )
  )
  const type = String(answer.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (answer.status !== 200 || !PICTURES[type]) return null
  return { type: PICTURES[type], body: answer.body }
}

/** What a screen's video may be made of, from its declared hosts: playlists, segments, keys. */
const MEDIA_TYPE =
  /^(?:video\/[\w.+-]+|audio\/[\w.+-]+|application\/(?:vnd\.apple\.mpegurl|x-mpegurl|dash\+xml|mp4|octet-stream)|binary\/octet-stream|text\/plain)$/
/** A byte range a video asks for: one, plain. */
const RANGE = /^bytes=\d{0,15}-\d{0,15}$/

/**
 * A piece of a video of a declared host, for its screen (through the scheme): a playlist, a segment
 * or a range of a file, of a video's or a playlist's type only, within the answers' limit; null
 * otherwise. As its pictures, in the same line as its main side's requests.
 */
export async function serviceMedia(
  m: Pick<ServiceManifest, 'id' | 'hosts'>,
  url: string,
  range: string | null,
  userAgent: () => string,
  transport: Transport = httpsTransport
): Promise<{ status: number; type: string; body: Buffer; range?: string } | null> {
  const headers: Record<string, string> = { 'User-Agent': userAgent(), Accept: '*/*', 'Accept-Encoding': 'gzip, deflate, br' }
  // A range is of the bytes as stored: a server that compressed its 206 would send a Content-Range
  // that no longer matches what is decoded here, so a range is asked for uncompressed.
  if (range && RANGE.test(range)) Object.assign(headers, { Range: range, 'Accept-Encoding': 'identity' })
  const answer = await slotsOf(m.id).run(`3615 ${serviceCode(m)}`, () => serviceFetch(m, url, { method: 'GET', headers }, transport))
  const type = String(answer.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if ((answer.status !== 200 && answer.status !== 206) || !MEDIA_TYPE.test(type)) return null
  const got = answer.headers['content-range']
  return { status: answer.status, type, body: answer.body, ...(answer.status === 206 && typeof got === 'string' ? { range: got } : {}) }
}
