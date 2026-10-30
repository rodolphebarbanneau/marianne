/**
 * HTTP GETs for the community catalogue and its files: Marianne's user agent, a timeout, and a size
 * limit kept while the body arrives (a server that lies about its length, or sends none, still
 * can't make Marianne hold more than `max` bytes). Nothing about the user is sent.
 */

export class TooLarge extends Error {}

export interface Fetched {
  status: number
  /** The body, for 2xx answers only. */
  data?: Buffer
  etag?: string
  lastModified?: string
  /** Where the answer came from, after redirects. */
  url: string
}

export interface DownloadOptions {
  max: number
  userAgent: string
  timeoutMs: number
  /** Conditional request: what was seen last. */
  seen?: { etag?: string; lastModified?: string }
  fetch?: typeof fetch
}

/** A GET; the body only for 2xx, and never more than `max` bytes (TooLarge past it). */
export async function download(url: string, opts: DownloadOptions): Promise<Fetched> {
  const headers: Record<string, string> = { 'User-Agent': opts.userAgent }
  if (opts.seen?.etag) headers['If-None-Match'] = opts.seen.etag
  if (opts.seen?.lastModified) headers['If-Modified-Since'] = opts.seen.lastModified
  const res = await (opts.fetch ?? fetch)(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs) })
  const head = {
    status: res.status,
    etag: res.headers.get('etag') ?? undefined,
    lastModified: res.headers.get('last-modified') ?? undefined,
    url: res.url || url
  }
  if (!res.ok) {
    await res.body?.cancel()
    return head
  }
  if (Number(res.headers.get('content-length') ?? 0) > opts.max) {
    await res.body?.cancel()
    throw new TooLarge(`${url} is larger than ${opts.max} bytes`)
  }
  if (!res.body) return { ...head, data: Buffer.alloc(0) }
  const chunks: Buffer[] = []
  let length = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > opts.max) {
      await reader.cancel()
      throw new TooLarge(`${url} is larger than ${opts.max} bytes`)
    }
    chunks.push(Buffer.from(value))
  }
  return { ...head, data: Buffer.concat(chunks, length) }
}
