import { app, net } from 'electron'

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

export const userAgent = () => `Marianne/${app.getVersion()} (+https://github.com/rodolphebarbanneau/marianne)`

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
 * their pages and feeds to a browser. Not cached: callers keep what they parsed.
 */
export async function fetchAsBrowser(url: string, opts: { timeoutMs?: number; accept?: string } = {}): Promise<string> {
  const host = new URL(url).host
  let res: Response
  try {
    res = await net.fetch(url, { headers: { Accept: opts.accept ?? '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) })
  } catch (err) {
    const e = err as Error
    throw new Error(e.name === 'TimeoutError' ? `Pas de réponse de ${host} (délai dépassé)` : `${host} injoignable : ${e.message}`)
  }
  const text = await res.text()
  if (!res.ok) throw new HttpError(`HTTP ${res.status} de ${host}`, res.status)
  return text
}

/** Query string from defined, non-empty values. */
export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}
