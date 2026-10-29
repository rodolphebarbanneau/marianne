import { createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'
import type { SyncProgress } from './index'

/**
 * @marianne/sdk/sync: a service's background sync, the job that downloads its open data and
 * indexes it into its data folder (a SQLite file…). The package exports it as "./sync": a module
 * that calls `runSync`. Marianne runs it in a process of its own, away from the app, once in a
 * while and when the user asks; downloads are conditional (ETag) and limited to the service's
 * declared hosts.
 */

export interface SyncContext {
  /** The service's data folder: what the job writes there, its main side reads. */
  dataDir: string
  /**
   * Downloads a file (https, declared hosts) to a temporary path; null when it hasn't changed since the last sync.
   * `optional`: null too when the file doesn't exist (404), for a job that probes for new files (the next ballot…).
   */
  download(url: string, options?: { force?: boolean; label?: string; optional?: boolean }): Promise<string | null>
  progress(progress: SyncProgress): void
  log(...args: unknown[]): void
}

/** null: nothing changed, the data stays as it is. */
export type SyncResult = { summary: string } | null

/** What Marianne sends the job. */
export interface SyncJob {
  dataDir: string
  tmpDir: string
  hosts: string[]
  userAgent: string
  /** ETags of the last downloads, by URL. */
  etags: Record<string, string>
}

export type SyncMessage =
  | { type: 'progress'; progress: SyncProgress }
  | { type: 'log'; text: string }
  | { type: 'done'; summary: string | null; etags: Record<string, string> }
  | { type: 'error'; message: string }

interface ParentPort {
  on(event: 'message', listener: (e: { data: unknown }) => void): void
  postMessage(message: SyncMessage): void
}

/** Run the job when Marianne asks: call it once, at the top level of the sync module. */
export function runSync(job: (ctx: SyncContext) => Promise<SyncResult>): void {
  const port = (process as unknown as { parentPort?: ParentPort }).parentPort
  if (!port) throw new Error('runSync: not started by Marianne')
  port.on('message', (e) => void execute(e.data as SyncJob, job, (m) => port.postMessage(m)))
}

/** One run of a job: exported for tests, which play Marianne's part. */
export async function execute(input: SyncJob, job: (ctx: SyncContext) => Promise<SyncResult>, post: (m: SyncMessage) => void): Promise<void> {
  const etags: Record<string, string> = { ...input.etags }
  const files: string[] = []
  let last = 0
  const ctx: SyncContext = {
    dataDir: input.dataDir,
    async download(url, options = {}) {
      const u = new URL(url)
      if (u.protocol !== 'https:' || !input.hosts.includes(u.hostname)) throw new Error(`${u.hostname} is not one of the service's hosts`)
      const headers: Record<string, string> = { 'User-Agent': input.userAgent }
      if (etags[url] && !options.force) headers['If-None-Match'] = etags[url]
      const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(15 * 60_000) })
      if (res.status === 304 || (res.status === 404 && options.optional)) {
        await res.body?.cancel()
        return null
      }
      if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (HTTP ${res.status}) : ${url}`)
      await mkdir(input.tmpDir, { recursive: true })
      const dest = join(input.tmpDir, `${files.length}-${u.pathname.split('/').pop() || 'download'}`)
      files.push(dest)
      const total = Number(res.headers.get('content-length')) || 0
      let done = 0
      const body = Readable.fromWeb(res.body as ReadableStream<Uint8Array>)
      body.on('data', (chunk: Buffer) => {
        done += chunk.length
        ctx.progress({ phase: 'download', done, total, ...(options.label ? { label: options.label } : {}) })
      })
      await pipeline(body, createWriteStream(dest))
      etags[url] = res.headers.get('etag') ?? ''
      return dest
    },
    progress(progress) {
      const now = Date.now()
      if (now - last < 200 && progress.done !== progress.total) return
      last = now
      post({ type: 'progress', progress })
    },
    log: (...args) => post({ type: 'log', text: args.map(String).join(' ') })
  }
  try {
    const result = await job(ctx)
    post({ type: 'done', summary: result?.summary ?? null, etags })
  } catch (err) {
    post({ type: 'error', message: (err as Error).message ?? String(err) })
  } finally {
    for (const file of files) await rm(file, { force: true })
  }
}
