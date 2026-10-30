import { randomBytes, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { SERVICE_CODE, type ServiceManifest, type ServiceTrust } from '@marianne/sdk'
import type { CatalogueEntry, CatalogueState, ServiceFileReview } from '../../shared/catalogue'
import { log } from '../log'
import { verdictOf } from './catalogue'
import { download, TooLarge } from './download'
import { MAX_SERVICE_FILE_BYTES, megabytes, PackageRefused, SERVICE_FILE_EXT, SERVICE_VERSION, sha256, unpackService, type UnpackedService } from './package'

/**
 * The community services on this computer: the .3615 files the user reviews, then adds, and the
 * catalogue's services downloaded. A file reviewed is kept by its ticket (its path and SHA-256,
 * not its bytes): adding it reads it again, and refuses it if it changed. A service is written
 * whole to a folder of its own (<dir>/packages/<code>) or not at all: unpacked in staging/, then
 * moved into place, an older version moved aside only once the new one is complete. Nothing of a
 * package runs here: the community runtime loads what `installed()` lists ('installed' tells).
 */

/** Written in each package's folder: what was added, from which file, with which verdict. */
export const INSTALLED_FILE = 'installed.json'

/** A reviewed file waits this long for the user's agreement. */
const TICKET_MS = 30 * 60_000
const MAX_TICKETS = 20
const DOWNLOAD_TIMEOUT_MS = 60_000
const TRUSTS: readonly ServiceTrust[] = ['validated', 'unvalidated', 'outside', 'withdrawn']
const SHA256 = /^[0-9a-f]{64}$/

/** A community service added on this computer. */
export interface InstalledPackage {
  code: string
  version: string
  /** Its folder: the entries of its .3615 (package.json, main.js, view.js…) and installed.json. */
  dir: string
  /** The SHA-256 of the .3615 it came from: its standing by the catalogue today is verdictOf(catalogue, code, sha256). */
  sha256: string
  /** Its standing by the catalogue when it was added. */
  verdict: ServiceTrust
  /** When (ISO). */
  installedAt: string
  /** The SHA-256 of each file written: checked again before it runs. */
  files: Record<string, string>
}

type InstalledRecord = Omit<InstalledPackage, 'dir'>

interface Ticket {
  path: string
  sha256: string
  at: number
}

type Logger = Pick<typeof log, 'info' | 'warn' | 'error'>

export interface CommunityOptions {
  /** paths.community: packages/ and staging/ are there. */
  dir: string
  /** The codes of the services built into Marianne: no file may take one. */
  reserved: ReadonlySet<string>
  /** The hosts whose links are Marianne's (her services', her public sites'): no community service's link may be on one. */
  protectedHosts?: () => ReadonlySet<string>
  /** The catalogue in use, for the verdicts. */
  catalogue: () => Pick<CatalogueState, 'entries' | 'withdrawn'>
  userAgent: () => string
  fetch?: typeof fetch
  now?: () => number
  log?: Logger
}

/** The errors of a folder another program holds a moment, on Windows (as writeFileAtomic). */
const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY'])
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

function renameRetrying(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      return renameSync(from, to)
    } catch (err) {
      if (attempt >= 8 || !BUSY.has((err as NodeJS.ErrnoException).code ?? '')) throw err
      pause(10 * 2 ** Math.min(attempt, 5))
    }
  }
}

/** A file written and flushed to the disk before the folder holding it is moved into place. */
function writeDurable(file: string, data: string | Uint8Array): void {
  const fd = openSync(file, 'wx')
  try {
    writeFileSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

const refusedReview = (fileName: string, size: number, sha: string, problems: string[]): ServiceFileReview => ({
  ticket: '',
  fileName,
  size,
  sha256: sha,
  manifest: null,
  verdict: 'refused',
  problems,
  sync: false,
  tools: [],
  links: []
})

const sorted = (list: readonly string[]) => [...list].sort().join('\n')

/** What of a catalogue entry a downloaded file's manifest doesn't say the same (English, for the log). */
export function manifestDiffers(m: ServiceManifest, e: Pick<CatalogueEntry, 'name' | 'hosts' | 'connections' | 'reads' | 'tools' | 'links'>): string[] {
  const differs: string[] = []
  if (m.name.trim() !== e.name.trim()) differs.push('name')
  if (sorted(m.hosts) !== sorted(e.hosts)) differs.push('hosts')
  if (sorted(m.connections) !== sorted(e.connections)) differs.push('connections')
  if (sorted(m.permissions.profile) !== sorted(e.reads)) differs.push('reads')
  if (sorted(m.tools.map((t) => t.label)) !== sorted(e.tools)) differs.push('tools')
  if (sorted(m.links) !== sorted(e.links)) differs.push('links')
  return differs
}

export class CommunityPackages extends EventEmitter {
  private readonly tickets = new Map<string, Ticket>()
  /** Installs and removals, one at a time. */
  private queue: Promise<unknown> = Promise.resolve()
  private readonly now: () => number
  private readonly log: Logger

  constructor(private readonly opts: CommunityOptions) {
    super()
    this.now = opts.now ?? Date.now
    this.log = opts.log ?? log
  }

  private get packages() {
    return join(this.opts.dir, 'packages')
  }

  private get staging() {
    return join(this.opts.dir, 'staging')
  }

  /**
   * Once, at start: what an install cut short left in staging/. A folder moved aside while its
   * replacement was moved in goes back when the replacement never arrived; the rest is removed.
   */
  start(): void {
    if (!existsSync(this.staging)) return
    for (const name of readdirSync(this.staging)) {
      const path = join(this.staging, name)
      const aside = /^([a-z0-9]+)-[0-9a-f]+\.old$/.exec(name)
      try {
        if (aside && !existsSync(join(this.packages, aside[1]))) {
          renameRetrying(path, join(this.packages, aside[1]))
          this.log.warn(`Community services: ${aside[1]} restored (an update was cut short)`)
        } else rmSync(path, { recursive: true, force: true })
      } catch (err) {
        this.log.warn(`Community services: could not tidy ${path}:`, err instanceof Error ? err.message : String(err))
      }
    }
  }

  /** A .3615 file read and checked, nothing of it run: its review, with a ticket to add it when the user agrees (none when it is refused). */
  async review(path: string): Promise<ServiceFileReview> {
    if (typeof path !== 'string' || !path) throw new Error('Aucun fichier à lire.')
    const fileName = basename(path)
    const info = await stat(path).catch(() => null)
    if (!info) throw new Error('Ce fichier est introuvable.')
    if (!info.isFile()) throw new Error('Ce n’est pas un fichier.')
    if (!fileName.toLowerCase().endsWith(SERVICE_FILE_EXT))
      return refusedReview(fileName, info.size, '', [`Ce fichier n’est pas un service Marianne : un service est un fichier ${SERVICE_FILE_EXT}.`])
    if (info.size > MAX_SERVICE_FILE_BYTES) return refusedReview(fileName, info.size, '', [this.tooBig(info.size)])
    const bytes = await readFile(path).catch(() => null)
    if (!bytes) throw new Error('Ce fichier n’a pas pu être lu.')
    if (bytes.length > MAX_SERVICE_FILE_BYTES) return refusedReview(fileName, bytes.length, '', [this.tooBig(bytes.length)])
    const sha = sha256(bytes)
    const unpacked = this.unpack(bytes)
    if (unpacked instanceof PackageRefused) return refusedReview(fileName, bytes.length, sha, unpacked.problems)
    this.prune()
    const ticket = randomUUID()
    this.tickets.set(ticket, { path, sha256: sha, at: this.now() })
    return this.reviewOf(unpacked, { ticket, fileName, size: bytes.length, sha })
  }

  /** The service of a file reviewed, added: the file is read again, and must be the one reviewed. */
  install(ticket: string): Promise<InstalledPackage> {
    return this.serially(async () => {
      const t = typeof ticket === 'string' ? this.tickets.get(ticket) : undefined
      if (!t || this.now() - t.at > TICKET_MS) throw new Error('Ce fichier n’est plus en attente : choisissez-le à nouveau.')
      const bytes = await readFile(t.path).catch(() => null)
      if (!bytes) throw new Error('Ce fichier est introuvable : choisissez-le à nouveau.')
      if (bytes.length > MAX_SERVICE_FILE_BYTES || sha256(bytes) !== t.sha256) {
        this.tickets.delete(ticket)
        throw new Error('Ce fichier a changé depuis qu’il a été lu : choisissez-le à nouveau.')
      }
      const unpacked = this.unpack(bytes)
      if (unpacked instanceof PackageRefused) throw new Error(`Ce fichier ne peut pas être ajouté. ${unpacked.message}`)
      const installed = this.write(unpacked, t.sha256)
      this.tickets.delete(ticket)
      return installed
    })
  }

  /** A service of the catalogue: downloaded, checked against its entry in the signed index (size, SHA-256, code and version), then added. */
  addFromCatalogue(code: string): Promise<InstalledPackage> {
    return this.serially(async () => {
      const entry = typeof code === 'string' ? this.opts.catalogue().entries.find((e) => e.code === code) : undefined
      if (!entry) throw new Error('Ce service n’est pas (ou plus) dans le catalogue.')
      let data: Buffer | undefined
      try {
        const got = await download(entry.file.url, {
          max: entry.file.size,
          userAgent: this.opts.userAgent(),
          timeoutMs: DOWNLOAD_TIMEOUT_MS,
          fetch: this.opts.fetch
        })
        if (!got.data) this.log.warn(`Community services: HTTP ${got.status} from ${entry.file.url}`)
        else if (!got.url.startsWith('https:')) this.log.warn(`Community services: ${entry.file.url} came from ${got.url}, not over https`)
        else data = got.data
      } catch (err) {
        if (err instanceof TooLarge) throw new Error(this.mismatch(entry.code, err.message))
        this.log.warn(`Community services: ${entry.file.url} not downloaded:`, err instanceof Error ? err.message : String(err))
      }
      if (!data) throw new Error('Le fichier du service n’a pas pu être téléchargé : réessayez plus tard.')
      const sha = sha256(data)
      if (data.length !== entry.file.size || sha !== entry.file.sha256) throw new Error(this.mismatch(entry.code, `${data.length} bytes, SHA-256 ${sha}`))
      const unpacked = this.unpack(data)
      if (unpacked instanceof PackageRefused) throw new Error(`Le fichier du catalogue est refusé. ${unpacked.message}`)
      if (unpacked.manifest.id !== entry.code || unpacked.manifest.version !== entry.version)
        throw new Error(this.mismatch(entry.code, `the file holds ${unpacked.manifest.id} ${unpacked.manifest.version}`))
      // What the user reviewed is the entry: the file says the same, or isn't added.
      const differs = manifestDiffers(unpacked.manifest, entry)
      if (differs.length) throw new Error(this.mismatch(entry.code, `its manifest differs from the entry: ${differs.join(', ')}`))
      return this.write(unpacked, sha)
    })
  }

  /** The community services added on this computer, as their folders say; a folder that doesn't check out is left aside. */
  installed(): InstalledPackage[] {
    if (!existsSync(this.packages)) return []
    const list: InstalledPackage[] = []
    for (const name of readdirSync(this.packages).sort()) {
      // The system's own files (.DS_Store…) aren't worth a line.
      if (name.startsWith('.')) continue
      const found = this.read(name)
      if (found) list.push(found)
      else this.log.warn(`Community services: ${join(this.packages, name)} is not a package added by Marianne; left aside`)
    }
    return list
  }

  /** A community service off this computer: its folder moved aside, then removed ('removed' tells). */
  remove(code: string): Promise<void> {
    return this.serially(async () => {
      if (typeof code !== 'string' || !SERVICE_CODE.test(code)) throw new Error('Ce service est inconnu.')
      const dir = join(this.packages, code)
      if (!existsSync(dir)) return
      mkdirSync(this.staging, { recursive: true })
      const gone = join(this.staging, `${code}-${randomBytes(6).toString('hex')}.gone`)
      try {
        renameRetrying(dir, gone)
      } catch (err) {
        this.log.error(`Community services: ${code} not removed:`, err instanceof Error ? err.message : String(err))
        throw new Error(`3615 ${code.toUpperCase()} n’a pas pu être retiré de cet ordinateur.`)
      }
      try {
        rmSync(gone, { recursive: true, force: true })
      } catch {
        // still held a moment: start() removes it next time
      }
      this.log.info(`Community services: ${code} removed`)
      this.emit('removed', { code })
    })
  }

  /** The files reviewed and not added, forgotten (the account was locked). */
  forget(): void {
    this.tickets.clear()
  }

  private reviewOf(unpacked: UnpackedService, file: { ticket: string; fileName: string; size: number; sha: string }): ServiceFileReview {
    const { manifest } = unpacked
    const { verdict, entry, reason } = verdictOf(this.opts.catalogue(), manifest.id, file.sha)
    const installed = this.read(manifest.id)?.version
    return {
      ticket: file.ticket,
      fileName: file.fileName,
      size: file.size,
      sha256: file.sha,
      manifest,
      verdict,
      problems: [],
      // Never a sync job in this version: a file with a sync.js is refused (unpackService, NO_SYNC).
      sync: false,
      tools: manifest.tools.map((t) => t.label),
      links: manifest.links,
      ...(entry ? { entry } : {}),
      ...(installed ? { installed } : {}),
      ...(reason ? { withdrawnReason: reason } : {})
    }
  }

  /** The service in a file's bytes, or why it is refused; an unexpected error refuses it too (and goes to the log). */
  private unpack(bytes: Uint8Array): UnpackedService | PackageRefused {
    try {
      return unpackService(bytes, { reserved: this.opts.reserved, protectedHosts: this.opts.protectedHosts?.() })
    } catch (err) {
      if (err instanceof PackageRefused) return err
      this.log.warn('Community services: a .3615 file could not be read:', err instanceof Error ? err.message : String(err))
      return new PackageRefused(['Ce fichier n’est pas une archive .3615 lisible.'])
    }
  }

  /**
   * The package written whole into its folder, or not at all: its entries and installed.json in a
   * new folder of staging/, flushed, then moved into place; an older version is moved aside first,
   * back if the move fails, and removed once the new one is in.
   */
  private write(unpacked: UnpackedService, sha: string): InstalledPackage {
    const { manifest, files } = unpacked
    const { verdict } = verdictOf(this.opts.catalogue(), manifest.id, sha)
    if (verdict === 'withdrawn')
      throw new Error(`La validation de 3615 ${manifest.id.toUpperCase()} ${manifest.version} a été retirée : Marianne ne l’ajoute pas.`)
    const code = manifest.id
    const target = join(this.packages, code)
    const fresh = join(this.staging, `${code}-${randomBytes(6).toString('hex')}`)
    const record: InstalledRecord = {
      code,
      version: manifest.version,
      sha256: sha,
      verdict,
      installedAt: new Date(this.now()).toISOString(),
      files: Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)]))
    }
    try {
      mkdirSync(this.packages, { recursive: true })
      mkdirSync(fresh, { recursive: true })
      for (const [name, bytes] of files) writeDurable(join(fresh, name), bytes)
      writeDurable(join(fresh, INSTALLED_FILE), JSON.stringify(record, null, 2))
      const aside = existsSync(target) ? `${fresh}.old` : null
      if (aside) renameRetrying(target, aside)
      try {
        renameRetrying(fresh, target)
      } catch (err) {
        if (aside) renameRetrying(aside, target)
        throw err
      }
      if (aside) {
        try {
          rmSync(aside, { recursive: true, force: true })
        } catch {
          // still held a moment: start() removes it next time
        }
      }
    } catch (err) {
      rmSync(fresh, { recursive: true, force: true })
      this.log.error(`Community services: ${code} ${manifest.version} not written:`, err instanceof Error ? err.message : String(err))
      throw new Error(`3615 ${code.toUpperCase()} n’a pas pu être enregistré sur cet ordinateur.`)
    }
    const installed: InstalledPackage = {
      code,
      version: record.version,
      dir: target,
      sha256: sha,
      verdict,
      installedAt: record.installedAt,
      files: record.files
    }
    this.log.info(`Community services: ${code} ${record.version} added (${verdict}, ${sha})`)
    this.emit('installed', installed)
    return installed
  }

  /** The package of a folder of packages/, when its installed.json checks out and its entries are there. */
  private read(code: string): InstalledPackage | null {
    if (!SERVICE_CODE.test(code)) return null
    const dir = join(this.packages, code)
    try {
      const r = JSON.parse(readFileSync(join(dir, INSTALLED_FILE), 'utf8')) as Partial<InstalledRecord>
      if (r.code !== code || typeof r.version !== 'string' || !SERVICE_VERSION.test(r.version)) return null
      if (typeof r.sha256 !== 'string' || !SHA256.test(r.sha256) || !TRUSTS.includes(r.verdict as ServiceTrust) || typeof r.installedAt !== 'string')
        return null
      if (!['package.json', 'main.js', 'view.js'].every((name) => existsSync(join(dir, name)))) return null
      const files = r.files
      if (
        !files ||
        typeof files !== 'object' ||
        !Object.entries(files).every(([name, hash]) => typeof hash === 'string' && SHA256.test(hash) && /^[\w.-]+$/.test(name))
      )
        return null
      return { code, version: r.version, dir, sha256: r.sha256, verdict: r.verdict as ServiceTrust, installedAt: r.installedAt, files: { ...files } }
    } catch {
      return null
    }
  }

  private tooBig(size: number): string {
    return `Le fichier fait ${megabytes(size)} : un service fait au plus ${megabytes(MAX_SERVICE_FILE_BYTES)}.`
  }

  private mismatch(code: string, detail: string): string {
    this.log.warn(`Community services: the file of ${code} does not match the catalogue (${detail})`)
    return 'Le fichier téléchargé ne correspond pas à celui que le catalogue a vérifié : Marianne ne l’a pas ajouté.'
  }

  /** Expired tickets dropped, and the oldest past MAX_TICKETS. */
  private prune(): void {
    for (const [id, t] of this.tickets) if (this.now() - t.at > TICKET_MS) this.tickets.delete(id)
    while (this.tickets.size >= MAX_TICKETS) this.tickets.delete(this.tickets.keys().next().value!)
  }

  private serially<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => undefined)
    return run
  }
}
