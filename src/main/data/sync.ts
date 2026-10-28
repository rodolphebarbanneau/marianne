import { EventEmitter } from 'node:events'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'
import type { DatabaseSync } from 'node:sqlite'
import { utilityProcess } from 'electron'
import { SOURCES, sourceInfo } from '../../shared/constants'
import type { SourceId, SourceStatus } from '../../shared/types'
import { configStore } from '../config'
import { userAgent } from '../http'
import { log } from '../log'
import { paths } from '../paths'
import { openIndex } from './db'
import type { IndexJob, WorkerMessage } from './worker'

/**
 * Offline sources: their dumps are downloaded (conditionally, by ETag), indexed by the worker
 * into ~/.marianne/index.db, and refreshed in the background when they get old.
 */

type OfflineId = Extract<SourceId, 'service-public' | 'assemblee'>

/** The files of each offline source, from its configured URL. */
function dumps(id: OfflineId, url: string): Record<string, string> {
  if (id === 'service-public') return { vosdroits: url }
  // The Assemblée source URL is the repository of a legislature: its dumps sit under it.
  const base = url.replace(/\/[^/]*\.zip$/, '').replace(/\/amo\/.*$/, '')
  return {
    deputes: `${base}/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes.json.zip`,
    scrutins: `${base}/loi/scrutins/Scrutins.json.zip`
  }
}

interface SyncRow {
  source: string
  synced_at: string
  etags: string
  count: number
}

const isOffline = (id: SourceId): id is OfflineId => sourceInfo(id).kind === 'offline'
const sourceUrl = (id: SourceId) => configStore.get().sources[id].url.trim() || sourceInfo(id).defaultUrl

class Sync extends EventEmitter {
  private database: DatabaseSync | null = null
  private running = new Map<SourceId, NonNullable<SourceStatus['syncing']>>()
  private errors = new Map<SourceId, string>()
  /** Whether a source needs credentials it doesn't have (set by the keychain). */
  hasKey: (id: SourceId) => boolean = () => true

  get db(): DatabaseSync {
    this.database ??= openIndex(paths.index)
    return this.database
  }

  private row(id: SourceId): SyncRow | undefined {
    return this.db.prepare('select * from sync where source = ?').get(id) as SyncRow | undefined
  }

  status(): SourceStatus[] {
    const cfg = configStore.get().sources
    return SOURCES.map((s) => {
      const row = isOffline(s.id) ? this.row(s.id) : undefined
      return {
        id: s.id,
        enabled: cfg[s.id].enabled,
        syncedAt: row?.synced_at,
        count: row?.count,
        syncing: this.running.get(s.id),
        error: this.errors.get(s.id),
        hasKey: s.key ? this.hasKey(s.id) : undefined
      }
    })
  }

  /** True once an offline source has been indexed at least once. */
  ready(id: OfflineId): boolean {
    return !!this.row(id)
  }

  private changed(): void {
    this.emit('change', this.status())
  }

  private setProgress(id: SourceId, p: NonNullable<SourceStatus['syncing']>): void {
    this.running.set(id, p)
    this.changed()
  }

  async sync(id: SourceId): Promise<void> {
    if (!isOffline(id) || this.running.has(id)) return
    const files = dumps(id, sourceUrl(id))
    const previous: Record<string, string> = JSON.parse(this.row(id)?.etags ?? '{}')
    const etags: Record<string, string> = {}
    const downloaded: Record<string, string> = {}
    this.errors.delete(id)
    this.setProgress(id, { phase: 'download', done: 0, total: 0 })
    try {
      let changed = false
      for (const [name, url] of Object.entries(files)) {
        const dest = join(paths.tmp, `${id}-${name}.zip`)
        const etag = await this.download(id, url, dest, previous[url])
        etags[url] = etag ?? previous[url] ?? ''
        if (etag !== null) {
          downloaded[name] = dest
          changed = true
        }
      }
      if (!changed && this.ready(id)) {
        log.info(`Sync ${id}: up to date`)
        this.db.prepare('update sync set synced_at = ? where source = ?').run(new Date().toISOString(), id)
        return
      }
      // A dump that didn't change but must be indexed again with the others: fetch it anyway.
      for (const [name, url] of Object.entries(files)) {
        if (downloaded[name]) continue
        const dest = join(paths.tmp, `${id}-${name}.zip`)
        etags[url] = (await this.download(id, url, dest)) ?? ''
        downloaded[name] = dest
      }
      this.setProgress(id, { phase: 'index', done: 0, total: 0 })
      const count = await this.index({ source: id, db: paths.index, files: downloaded })
      this.db
        .prepare('insert or replace into sync (source, synced_at, etags, count) values (?, ?, ?, ?)')
        .run(id, new Date().toISOString(), JSON.stringify(etags), count)
      // Fold the worker's write-ahead log back into the database file.
      this.db.exec('pragma wal_checkpoint(truncate)')
      log.info(`Sync ${id}: indexed ${count} items`)
    } catch (err) {
      const message = (err as Error).message
      log.warn(`Sync ${id} failed:`, message)
      this.errors.set(id, message)
    } finally {
      for (const file of Object.values(downloaded)) await rm(file, { force: true })
      this.running.delete(id)
      this.changed()
    }
  }

  /** Download `url` to `dest`; null when the server says it hasn't changed since `etag`. */
  private async download(id: SourceId, url: string, dest: string, etag?: string): Promise<string | null> {
    const headers: Record<string, string> = { 'User-Agent': userAgent() }
    if (etag) headers['If-None-Match'] = etag
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(15 * 60_000) })
    if (res.status === 304) return null
    if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (HTTP ${res.status}) : ${url}`)
    const total = Number(res.headers.get('content-length')) || 0
    let done = 0
    let last = 0
    const body = Readable.fromWeb(res.body as ReadableStream<Uint8Array>)
    body.on('data', (chunk: Buffer) => {
      done += chunk.length
      if (Date.now() - last > 250) {
        last = Date.now()
        this.setProgress(id, { phase: 'download', done, total })
      }
    })
    await pipeline(body, createWriteStream(dest))
    return res.headers.get('etag') ?? ''
  }

  private index(job: IndexJob): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = utilityProcess.fork(join(__dirname, 'worker.js'), [], { serviceName: 'Marianne index', stdio: 'inherit', execArgv: [] })
      let settled = false
      const finish = (err: Error | null, count = 0) => {
        if (settled) return
        settled = true
        child.kill()
        if (err) reject(err)
        else resolve(count)
      }
      child.on('message', (m: WorkerMessage) => {
        if (m.type === 'progress') this.setProgress(job.source, { phase: 'index', done: m.done, total: m.total })
        else if (m.type === 'done') finish(null, m.count)
        else finish(new Error(m.message))
      })
      child.on('exit', (code) => finish(new Error(`L’indexation s’est arrêtée (code ${code})`)))
      child.postMessage(job)
    })
  }

  /** Sync the enabled offline sources that were never indexed, or are older than the refresh interval. */
  async auto(force = false): Promise<void> {
    const cfg = configStore.get()
    if (!cfg.sync.auto && !force) return
    for (const s of SOURCES) {
      if (!isOffline(s.id) || !cfg.sources[s.id].enabled) continue
      const at = this.row(s.id)?.synced_at
      if (!at || Date.now() - Date.parse(at) > cfg.sync.everyHours * 3600_000) await this.sync(s.id)
    }
  }

  close(): void {
    this.database?.close()
    this.database = null
  }
}

export const sync = new Sync()
