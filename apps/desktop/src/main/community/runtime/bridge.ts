import { allowedUrl, serviceCode, type ServiceManifest } from '@marianne/sdk'
import type { RequestOptions, ServiceContext } from '@marianne/sdk/main'
import { SANDBOX_ASYNC_CALLS, SANDBOX_LIMITS, SANDBOX_SYNC_CALLS, type BridgeReply } from '../../../shared/community'
import { RateLimit } from './limits'
import { serviceHeaders } from './net'

/**
 * The bridge's main side: what a community service's sandbox asks of its context, checked, then
 * done by the context Marianne built for that service's manifest (the same one a built-in service
 * gets: the network to its declared hosts, its own records of the archive, the profile fields the
 * user granted). The sandbox names a capability and gives plain arguments; it never names another
 * service, a file or a host it didn't declare, and it may only ask so often. Only its own renderer
 * may ask (`fromOwn`).
 */

/** A request the bridge refuses: the sandbox's code reads why. */
export class BridgeRefused extends Error {
  override name = 'BridgeRefused'
}

/** A stored value is at most this big, as JSON. */
export const MAX_STORED_BYTES = 1024 * 1024
const MAX_KEY = 200
const MAX_URL = 4096

const ASYNC: ReadonlySet<string> = new Set(SANDBOX_ASYNC_CALLS)
const SYNC: ReadonlySet<string> = new Set(SANDBOX_SYNC_CALLS)

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const stringRecord = (v: unknown, max: number): v is Record<string, string> =>
  isRecord(v) && Object.keys(v).length <= max && Object.values(v).every((x) => typeof x === 'string' && x.length <= 8192)
const number = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined)

export interface SandboxBridgeMain {
  /** An async capability: the network, the communes. Throws BridgeRefused for what isn't allowed. */
  call(name: unknown, args: unknown): Promise<unknown>
  /** A sync capability: the storage, the commune of the address, the profile; the error is in the reply. */
  callSync(name: unknown, args: unknown): BridgeReply
}

/** The bridge of one service: its manifest, and the context Marianne built for it. */
export function sandboxBridge(manifest: ServiceManifest, ctx: ServiceContext, now: () => number = Date.now): SandboxBridgeMain {
  const who = `3615 ${serviceCode(manifest)}`
  // Fifty requests a second to the network and the communes, two hundred to the storage and the profile, a few times that at once.
  const asyncLimit = new RateLimit(50, 200)
  const syncLimit = new RateLimit(200, 1000)
  const tooMany = `${who} demande trop de choses à la fois : Marianne en laisse passer moins.`
  const refuse = (why: string): never => {
    throw new BridgeRefused(why)
  }
  /** Its arguments: JSON text within SANDBOX_LIMITS.args (measured before anything is parsed), a short list. */
  const argsOf = (args: unknown, max: number): unknown[] => {
    if (typeof args !== 'string' || args.length > SANDBOX_LIMITS.args) return refuse(`${who} : arguments illisibles ou trop longs.`)
    let list: unknown
    try {
      list = JSON.parse(args)
    } catch {
      return refuse(`${who} : arguments illisibles.`)
    }
    return Array.isArray(list) && list.length <= max ? list : refuse(`${who} : arguments illisibles.`)
  }
  const url = (v: unknown): string => {
    if (typeof v !== 'string' || v.length > MAX_URL) return refuse(`${who} : adresse illisible.`)
    if (!allowedUrl(manifest, v)) {
      let host = v.slice(0, 80)
      try {
        host = new URL(v).host || host
      } catch {
        // shown as given
      }
      return refuse(`${who} n’a pas déclaré ${host} (package.json, marianne.hosts) : Marianne ne l’y laisse pas aller.`)
    }
    return v
  }
  const key = (v: unknown): string => (typeof v === 'string' && v.length > 0 && v.length <= MAX_KEY ? v : refuse(`${who} : clé de stockage illisible.`))
  /** What it stores is plain data, as the archive keeps it: JSON, within a size. */
  const storable = (v: unknown): unknown => {
    let json: string | undefined
    try {
      json = JSON.stringify(v)
    } catch {
      json = undefined
    }
    if (json === undefined) return refuse(`${who} : seules des données simples (JSON) peuvent être gardées.`)
    if (Buffer.byteLength(json) > MAX_STORED_BYTES) return refuse(`${who} : une donnée gardée fait au plus 1 Mo.`)
    return JSON.parse(json)
  }
  const options = (v: unknown): RequestOptions => {
    if (v === undefined || v === null) return {}
    if (!isRecord(v)) return refuse(`${who} : options de requête illisibles.`)
    const out: RequestOptions = {}
    if (v.method !== undefined) out.method = v.method === 'POST' ? 'POST' : v.method === 'GET' ? 'GET' : refuse(`${who} : méthode HTTP refusée.`)
    if (v.headers !== undefined) out.headers = stringRecord(v.headers, 32) ? serviceHeaders(v.headers) : refuse(`${who} : en-têtes illisibles.`)
    if (v.json !== undefined) out.json = storable(v.json)
    if (v.form !== undefined) out.form = stringRecord(v.form, 256) ? { ...v.form } : refuse(`${who} : formulaire illisible.`)
    const timeoutMs = number(v.timeoutMs, 1000, 60_000)
    if (timeoutMs !== undefined) out.timeoutMs = timeoutMs
    const cacheMs = number(v.cacheMs, 0, 24 * 3600_000)
    if (cacheMs !== undefined) out.cacheMs = cacheMs
    return out
  }
  const pageOptions = (v: unknown): { timeoutMs?: number; accept?: string } => {
    if (v === undefined || v === null) return {}
    if (!isRecord(v)) return refuse(`${who} : options de requête illisibles.`)
    const timeoutMs = number(v.timeoutMs, 1000, 60_000)
    return { ...(timeoutMs !== undefined ? { timeoutMs } : {}), ...(typeof v.accept === 'string' && v.accept.length <= 200 ? { accept: v.accept } : {}) }
  }

  return {
    async call(name, args) {
      if (!asyncLimit.take(now())) return refuse(tooMany)
      if (typeof name !== 'string' || !ASYNC.has(name)) return refuse(`${who} : capacité inconnue.`)
      const a = argsOf(args, 2)
      switch (name) {
        case 'http.json':
          return ctx.http.json(url(a[0]), options(a[1]))
        case 'http.text':
          return ctx.http.text(url(a[0]), options(a[1]))
        case 'http.page':
          return ctx.http.page(url(a[0]), pageOptions(a[1]))
        case 'geo.findCommunes': {
          if (typeof a[0] !== 'string' || a[0].length > 200) return refuse(`${who} : recherche de commune illisible.`)
          return ctx.geo.findCommunes(a[0], number(a[1], 1, 50) ?? 5)
        }
        case 'geo.getCommune':
          if (typeof a[0] !== 'string' || !/^[0-9AB]{5}$/.test(a[0])) return refuse(`${who} : code de commune illisible.`)
          return ctx.geo.getCommune(a[0])
      }
      return refuse(`${who} : capacité inconnue.`)
    },

    callSync(name, args) {
      try {
        if (!syncLimit.take(now())) refuse(tooMany)
        if (typeof name !== 'string' || !SYNC.has(name)) refuse(`${who} : capacité inconnue.`)
        const a = argsOf(args, 2)
        const ok = (value: unknown): BridgeReply => ({ ok: value ?? null })
        switch (name) {
          case 'storage.get':
            return ok(ctx.storage.get(key(a[0])))
          case 'storage.set': {
            const k = key(a[0])
            ctx.storage.set(k, storable(a[1]))
            return ok(null)
          }
          case 'storage.remove':
            ctx.storage.remove(key(a[0]))
            return ok(null)
          case 'home':
            return ok(ctx.home())
          case 'profile.granted':
            return ok(ctx.profile.granted())
          case 'profile.vehicles':
            return ok(ctx.profile.vehicles())
          case 'profile.leaning':
            return ok(ctx.profile.leaning())
          case 'profile.themes':
            return ok(ctx.profile.themes())
        }
        return refuse(`${who} : capacité inconnue.`)
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        return { error: { name: e.name === 'BridgeRefused' ? 'BridgeRefused' : 'Error', message: e.message } }
      }
    }
  }
}

/** An IPC event, as far as the bridge looks at it: who sent it, from which frame. */
export interface SenderEvent {
  sender: unknown
  senderFrame?: { parent: unknown } | null
}

/**
 * Whether an IPC event comes from the service's own sandbox: its webContents, and its main frame
 * (a frame its page would open has no bridge). Anything else is refused.
 */
export const fromOwn = (own: unknown, e: SenderEvent): boolean => e.sender === own && !!e.senderFrame && e.senderFrame.parent === null

/** The refusal a sync call gets when it doesn't come from the service's sandbox. */
export const REFUSED: BridgeReply = { error: { name: 'BridgeRefused', message: 'Appel refusé.' } }
