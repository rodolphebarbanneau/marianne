import { EventEmitter } from 'node:events'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { utilityProcess } from 'electron'
import type { ServiceManifest, SyncStatus } from '@marianne/sdk'
import type { SyncJob, SyncMessage } from '@marianne/sdk/sync'
import { writeFileAtomic } from '../files'
import { userAgent } from '../http'
import { log } from '../log'
import { paths } from '../paths'

/**
 * A service's sync job, run in an Electron utility process of its own (out/main/sync-<code>.js,
 * built from the package's "./sync" export): it downloads the service's open data and indexes it
 * into its data folder. What the last run left is in <data folder>/sync.json.
 */

interface Saved {
  syncedAt: string
  summary: string
  etags: Record<string, string>
}

const RUN_MS = 30 * 60_000

export class ServiceSync extends EventEmitter {
  private progress: SyncStatus['running']
  private error = ''
  private running: Promise<void> | null = null

  constructor(
    private readonly manifest: ServiceManifest,
    /** Hours between two runs; 0: the service has no sync job. */
    readonly everyHours: number,
    private readonly onSynced: () => void
  ) {
    super()
  }

  private get file(): string {
    return join(paths.services, this.manifest.id, 'sync.json')
  }

  private saved(): Saved | null {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as Saved
    } catch {
      return null
    }
  }

  status(): SyncStatus {
    const s = this.saved()
    return { syncedAt: s?.syncedAt, summary: s?.summary, running: this.progress, error: this.error || undefined }
  }

  /** Never run, or older than its period. */
  due(): boolean {
    const at = this.saved()?.syncedAt
    return this.everyHours > 0 && (!at || Date.now() - Date.parse(at) > this.everyHours * 3600_000)
  }

  run(): Promise<void> {
    if (!this.everyHours) return Promise.resolve()
    this.running ??= this.execute().finally(() => {
      this.running = null
      this.progress = undefined
      this.emit('change')
    })
    return this.running
  }

  private execute(): Promise<void> {
    const code = this.manifest.id
    const entry = join(__dirname, `sync-${code}.js`)
    if (!existsSync(entry)) return Promise.reject(new Error(`No sync job built for ${code} (${entry})`))
    const previous = this.saved()
    const job: SyncJob = {
      dataDir: join(paths.services, code),
      tmpDir: join(paths.tmp, `sync-${code}`),
      hosts: this.manifest.hosts,
      userAgent: userAgent(),
      etags: previous?.etags ?? {}
    }
    this.error = ''
    this.progress = { phase: 'download', done: 0, total: 0 }
    this.emit('change')
    return new Promise<void>((resolve) => {
      const child = utilityProcess.fork(entry, [], { serviceName: `Marianne · 3615 ${code.toUpperCase()}`, stdio: 'inherit' })
      let over = false
      const finish = (error?: string) => {
        if (over) return
        over = true
        clearTimeout(timer)
        child.kill()
        rmSync(job.tmpDir, { recursive: true, force: true })
        if (error) {
          this.error = error
          log.warn(`Sync ${code} failed:`, error)
        }
        resolve()
      }
      const timer = setTimeout(() => finish('La mise à jour a pris trop de temps.'), RUN_MS)
      child.on('message', (m: SyncMessage) => {
        if (m.type === 'progress') {
          this.progress = m.progress
          this.emit('change')
        } else if (m.type === 'log') log.info(`[sync ${code}]`, m.text)
        else if (m.type === 'error') finish(m.message)
        else {
          const saved: Saved = { syncedAt: new Date().toISOString(), summary: m.summary ?? previous?.summary ?? '', etags: m.etags }
          writeFileAtomic(this.file, JSON.stringify(saved, null, 2))
          log.info(`Sync ${code}: ${m.summary ?? 'up to date'}`)
          if (m.summary !== null) this.onSynced()
          finish()
        }
      })
      child.on('exit', (exitCode) => finish(`La mise à jour s’est arrêtée (code ${exitCode}).`))
      child.postMessage(job)
    })
  }
}
