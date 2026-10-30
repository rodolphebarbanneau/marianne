import { app, net, session, type Session } from 'electron'
import { REPO_URL } from '../shared/project'
import { guardedLookup } from './community/runtime/net'

/** HTTP for the data sources: a timeout, an honest user agent, and a short cache for GETs. */

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

interface Options {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  /** JSON body (POST). */
  json?: unknown
  /** Form body (POST, application/x-www-form-urlencoded). */
  form?: Record<string, string>
  timeoutMs?: number
  /** Cache GET responses this long (default 5 min; 0 = no cache). */
  cacheMs?: number
}

const CACHE_MAX = 200
const cache = new Map<string, { at: number; ttl: number; text: string }>()

export const userAgent = () => `Marianne/${app.getVersion()} (+${REPO_URL})`

export async function fetchText(url: string, opts: Options = {}): Promise<string> {
  const method = opts.method ?? (opts.json !== undefined || opts.form ? 'POST' : 'GET')
  const ttl = method === 'GET' ? (opts.cacheMs ?? 300_000) : 0
  const hit = ttl ? cache.get(url) : undefined
  if (hit && Date.now() - hit.at < hit.ttl) return hit.text

  const headers: Record<string, string> = { 'User-Agent': userAgent(), Accept: 'application/json, text/plain, */*', ...opts.headers }
  let body: string | undefined
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.json)
  } else if (opts.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(opts.form).toString()
  }
  let res: Response
  try {
    res = await fetch(url, { method, headers, body, redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) })
  } catch (err) {
    const e = err as Error
    throw new Error(e.name === 'TimeoutError' ? `Pas de réponse de ${new URL(url).host} (délai dépassé)` : `${new URL(url).host} injoignable : ${e.message}`)
  }
  const text = await res.text()
  if (!res.ok) throw new HttpError(`HTTP ${res.status} de ${new URL(url).host}${text ? ` : ${text.replace(/\s+/g, ' ').slice(0, 300)}` : ''}`, res.status)
  if (ttl) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!)
    cache.set(url, { at: Date.now(), ttl, text })
  }
  return text
}

export async function fetchJson<T>(url: string, opts: Options = {}): Promise<T> {
  const text = await fetchText(url, opts)
  try {
    // Some servers prefix JSON with a byte-order mark.
    return JSON.parse(text.replace(/^﻿/, '')) as T
  } catch {
    throw new Error(`Réponse illisible de ${new URL(url).host}`)
  }
}

/**
 * GET through Chromium's network stack (Electron's net) instead of Node's: the app's own browser
 * user agent, cookies and the system proxy. Some publishers' CDNs (Akamai, Imperva) only serve
 * their pages and feeds to a browser. Not cached: callers keep what they parsed. An answer past
 * `maxBytes` (10 MB unless said) is refused, read as it comes rather than all at once.
 */
export async function fetchAsBrowser(url: string, opts: { timeoutMs?: number; accept?: string; maxBytes?: number } = {}): Promise<string> {
  const host = new URL(url).host
  const max = opts.maxBytes ?? 10 * 1024 * 1024
  let res: Response
  try {
    res = await net.fetch(url, { headers: { Accept: opts.accept ?? '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) })
  } catch (err) {
    throw unreachable(err, host)
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {})
    throw new HttpError(`HTTP ${res.status} de ${host}`, res.status)
  }
  const chunks: Buffer[] = []
  let size = 0
  const reader = res.body?.getReader()
  try {
    while (reader) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > max) break
      chunks.push(Buffer.from(value))
    }
  } catch (err) {
    throw unreachable(err, host)
  }
  if (size > max) {
    await reader?.cancel().catch(() => {})
    throw new Error(`la réponse de ${host} dépasse ${Math.round(max / 1024 / 1024)} Mo`)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function unreachable(err: unknown, host: string): Error {
  const e = err as Error
  return new Error(e.name === 'TimeoutError' ? `Pas de réponse de ${host} (délai dépassé)` : `${host} injoignable : ${e.message}`)
}

/** An address the reader won't go to (this computer, its network, a scheme other than http and https): asking again changes nothing. */
export class RefusedUrl extends Error {}

/** Whether a failure would be the same if asked again: a refused address, or an HTTP answer that isn't a server's trouble. */
export function lasting(err: unknown): boolean {
  if (err instanceof RefusedUrl) return true
  const status = (err as { status?: unknown } | null)?.status
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429
}

/** One answer of the reader's fetch, its redirect not followed: its status, where it points, its body (cut past maxBytes). */
export interface Hop {
  status: number
  location?: string
  type: string
  bytes: Buffer
  whole: boolean
}
export type HopTransport = (url: string, init: { accept: string; timeoutMs: number; maxBytes: number }) => Promise<Hop>
type Resolve = NonNullable<Parameters<typeof guardedLookup>[0]>

const MAX_HOPS = 5

let readerSession: Session | null = null
/** A session of its own, in memory: no cookie of the user's visits, nothing of the pages in a disk cache. */
const readerSessionOf = () => (readerSession ??= session.fromPartition('marianne-news', { cache: false }))

/**
 * One request through Chromium's stack, its redirect not followed: in net.request's manual mode a
 * redirect is cancelled unless followed at once, and the next hop has to be checked before it is
 * asked. No credentials sent (net.request's `credentials: 'omit'`), in the reader's own session.
 */
const chromiumHop: HopTransport = (url, init) =>
  new Promise((resolve, reject) => {
    const host = new URL(url).host
    let settled = false
    const req = net.request({ url, method: 'GET', session: readerSessionOf(), credentials: 'omit', redirect: 'manual', headers: { Accept: init.accept } })
    const finish = (err: Error | null, hop?: Hop, abort = false) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      if (err || abort) req.abort()
      if (err) reject(err)
      else resolve(hop!)
    }
    const deadline = setTimeout(() => finish(Object.assign(new Error(`Pas de réponse de ${host} (délai dépassé)`), { name: 'TimeoutError' })), init.timeoutMs)
    req.on('redirect', (status, _method, location) => finish(null, { status, location, type: '', bytes: Buffer.alloc(0), whole: true }, true))
    req.on('response', (res) => {
      const status = res.statusCode
      const raw = res.headers['content-type']
      const type = (Array.isArray(raw) ? raw[0] : raw) ?? ''
      if (status < 200 || status >= 300) return finish(null, { status, type, bytes: Buffer.alloc(0), whole: true }, true)
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (chunk: Buffer) => {
        if (settled) return
        chunks.push(chunk)
        size += chunk.length
        if (size >= init.maxBytes) finish(null, { status, type, bytes: Buffer.concat(chunks).subarray(0, init.maxBytes), whole: false }, true)
      })
      res.on('end', () => finish(null, { status, type, bytes: Buffer.concat(chunks), whole: true }))
      res.on('error', (err: Error) => finish(err))
    })
    req.on('error', (err) => finish(err))
    req.end()
  })

/** Refuses a name that leads to this computer or its network (any of the addresses it resolves to), as the community services' network does. */
function publicHost(hostname: string, resolve?: Resolve): Promise<void> {
  return new Promise((ok, fail) =>
    guardedLookup(resolve)(hostname.replace(/^\[|\]$/g, ''), { all: true }, (err) => {
      const e = err as (Error & { code?: string }) | null
      if (!e) ok()
      else fail(e.code === 'EADDRBLOCKED' ? new RefusedUrl(e.message) : e)
    })
  )
}

/**
 * A page or a picture read the way a reader view reads it: through Chromium's stack (the CDNs that
 * only serve a browser), but in a session of its own and without credentials (nothing of a visit
 * the user made), a short wait for the whole of it and a size cap. Only the open web: each hop is
 * http or https on a name whose addresses are all public, its redirects followed by hand (five at
 * most) and each checked again, so that a page or a feed can't send Marianne to this computer or
 * its network. (Chromium resolves the name again to connect: a name that changes its answer in
 * between isn't caught, which Node's stack, the community services', does catch.) Past `maxBytes`
 * the answer is cut, and `whole` says so: a reader needs a page's head and its first paragraphs,
 * never a picture in part. `deps` are the tests'.
 */
export async function fetchCapped(
  url: string,
  opts: { timeoutMs: number; maxBytes: number; accept: string },
  deps: { transport?: HopTransport; resolve?: Resolve } = {}
): Promise<{ bytes: Buffer; type: string; whole: boolean }> {
  const transport = deps.transport ?? chromiumHop
  let target = new URL(url)
  const first = target.host
  // One deadline for the whole of it, its redirects included.
  const end = Date.now() + opts.timeoutMs
  for (let hop = 0; ; hop++) {
    if (!/^https?:$/.test(target.protocol)) throw new RefusedUrl(`${first} mène à une adresse qui n’est pas du web (${target.protocol})`)
    await publicHost(target.hostname, deps.resolve)
    const left = end - Date.now()
    if (left <= 0) throw Object.assign(new Error(`Pas de réponse de ${first} (délai dépassé)`), { name: 'TimeoutError' })
    let answer: Hop
    try {
      answer = await transport(target.href, { accept: opts.accept, timeoutMs: left, maxBytes: opts.maxBytes })
    } catch (err) {
      throw unreachable(err, target.host)
    }
    if (answer.status >= 300 && answer.status < 400 && answer.location) {
      if (hop >= MAX_HOPS) throw new RefusedUrl(`trop de redirections depuis ${first}`)
      target = new URL(answer.location, target)
      continue
    }
    if (answer.status < 200 || answer.status >= 300) throw new HttpError(`HTTP ${answer.status} de ${target.host}`, answer.status)
    return { bytes: answer.bytes, type: answer.type, whole: answer.whole }
  }
}

/** Query string from defined, non-empty values. */
export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}
