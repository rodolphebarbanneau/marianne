import { createPublicKey, verify, type KeyObject } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  ICON_SIZE,
  pictureProblems,
  PROFILE_FIELDS,
  SERVICE_CATEGORIES,
  SERVICE_CODE,
  type PixelArt,
  type ProfileField,
  type ServiceTrust
} from '@marianne/sdk'
import { CATALOGUE_FORMAT, type CatalogueEntry, type CatalogueIndex, type CatalogueState, type CatalogueStatus, type Withdrawal } from '../../shared/catalogue'
import { writeFileAtomic } from '../files'
import { log } from '../log'
import { download, TooLarge } from './download'
import { MAX_SERVICE_FILE_BYTES, SERVICE_VERSION } from './package'

/**
 * The community catalogue (see shared/catalogue.ts): the index of the community repository, signed
 * with the project's key, the one content bundles are signed with (one authority). Marianne reads
 * it soon after start, every day, and when the window asks for an index older than that; it takes
 * an index only once its signature, its format and its entries check out, and keeps the last one
 * taken (re-checked at each start). Reading it sends nothing about the user.
 */

/** The community repository's index (its signature beside it, `<url>.sig`). None yet: set when the repository opens. */
export const CATALOGUE_URL: string | null = null

/** In development only (the app not packaged): the path of a local index, read unsigned instead of the repository's. */
export const DEV_CATALOGUE_ENV = 'MARIANNE_CATALOGUE'

export const INDEX_FILE = 'index.json'
export const SIGNATURE_FILE = 'index.json.sig'
/** What was last seen of the published index (conditional requests) and when it was last read. */
const REMOTE_FILE = 'remote.json'

const FIRST_CHECK_MS = 30_000
const CHECK_EVERY_MS = 24 * 3600_000
/** After a reading failed, the window asking doesn't try again sooner than this. */
const RETRY_MS = 10 * 60_000
const TIMEOUT_MS = 30_000
/** Thousands of services stay far below this; an ed25519 signature is 64 bytes. */
const MAX_INDEX_BYTES = 4 * 1024 * 1024
const MAX_SIGNATURE_BYTES = 1024
/** Bounds on what the index may list, so that a wrong index can't swamp the window. */
const MAX_ENTRIES = 5000
const MAX_TEXT = 300
const MAX_LIST = 64

/** As readManifest's: host names, lowercase. */
const HOST = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/
const SHA256 = /^[0-9a-f]{64}$/
/** As readManifest's: an https:// prefix ending with a path. */
const LINK = /^https:\/\/[^/]+\//
const DAY = /^\d{4}-\d{2}-\d{2}$/
const STATUSES: readonly CatalogueStatus[] = ['validated', 'unvalidated']

type Logger = Pick<typeof log, 'info' | 'warn' | 'error'>
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= MAX_TEXT
const isList = (v: unknown): v is unknown[] => Array.isArray(v) && v.length <= MAX_LIST

// ---------------------------------------------------------------- the index

/** Why an index as a whole can't be used (English, for the log). `format`: it is of a newer format than this Marianne reads. */
export class IndexError extends Error {
  constructor(
    message: string,
    readonly reason: 'format' | 'invalid' = 'invalid'
  ) {
    super(message)
  }
}

/** An index checked: what it lists that is right, and a line for each entry dropped or corrected (for the log). */
export interface IndexReading {
  index: CatalogueIndex
  notes: string[]
}

/** A real day, YYYY-MM-DD. */
const isDay = (v: unknown): v is string => typeof v === 'string' && DAY.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v

/** Its .3615 file: an https URL, a size a service may have, a SHA-256 in lowercase hex. */
function fileProblem(file: unknown): string | null {
  if (!isObject(file)) return '"file" must be { url, size, sha256 }'
  let url: URL | null = null
  try {
    url = typeof file.url === 'string' ? new URL(file.url) : null
  } catch {
    // not a URL
  }
  if (!url || url.protocol !== 'https:' || url.username || url.password) return '"file.url" must be an https:// URL'
  if (!Number.isSafeInteger(file.size) || (file.size as number) <= 0 || (file.size as number) > MAX_SERVICE_FILE_BYTES)
    return `"file.size" must be a number of bytes, at most ${MAX_SERVICE_FILE_BYTES}`
  if (typeof file.sha256 !== 'string' || !SHA256.test(file.sha256)) return '"file.sha256" must be 64 lowercase hexadecimal digits'
  return null
}

/** An entry of the index, rebuilt from what it should hold (nothing else passes); or what is wrong with it. */
function readEntry(raw: unknown): CatalogueEntry | string {
  if (!isObject(raw)) return 'not an object'
  const e = raw
  if (typeof e.code !== 'string' || !SERVICE_CODE.test(e.code) || e.code.length > 32) return '"code" must be lowercase letters and digits'
  if (typeof e.version !== 'string' || !SERVICE_VERSION.test(e.version)) return `"version" must read like 1.2.3`
  for (const key of ['name', 'description', 'author'] as const)
    if (!isText(e[key])) return `"${key}" must be a non-empty line of at most ${MAX_TEXT} characters`
  if (!SERVICE_CATEGORIES.some((c) => c.id === e.category)) return `unknown category "${String(e.category)}"`
  for (const key of ['keywords', 'connections', 'tools'] as const)
    if (!isList(e[key]) || !(e[key] as unknown[]).every(isText)) return `"${key}" must be a list of at most ${MAX_LIST} non-empty strings`
  if (!isList(e.hosts) || !e.hosts.every((h) => typeof h === 'string' && HOST.test(h))) return '"hosts" must list host names (api.example.fr)'
  // Older entries have no links: none.
  const links = e.links ?? []
  if (
    !isList(links) ||
    !links.every((l) => typeof l === 'string' && l.length <= MAX_TEXT && LINK.test(l) && (e.hosts as string[]).includes(new URL(l).hostname))
  )
    return '"links" must list https:// prefixes, each ending with a path, on its hosts'
  if (!isList(e.reads) || !e.reads.every((f) => typeof f === 'string' && Object.hasOwn(PROFILE_FIELDS, f)))
    return `"reads" must list fields of the profile (${Object.keys(PROFILE_FIELDS).join(', ')})`
  if (typeof e.sync !== 'boolean') return '"sync" must be true or false'
  if (e.icon !== null) {
    const wrong = pictureProblems(e.icon, { width: ICON_SIZE, height: ICON_SIZE, exact: true })
    if (wrong.length) return `"icon": ${wrong.join('; ')}`
  }
  if (!STATUSES.includes(e.status as CatalogueStatus)) return `"status" must be ${STATUSES.join(' or ')}`
  if (typeof e.recommended !== 'boolean') return '"recommended" must be true or false'
  if (!isDay(e.published)) return '"published" must be a day, YYYY-MM-DD'
  const wrongFile = fileProblem(e.file)
  if (wrongFile) return wrongFile
  const icon = e.icon as PixelArt | null
  const file = e.file as CatalogueEntry['file']
  return {
    code: e.code,
    version: e.version,
    name: (e.name as string).trim(),
    description: (e.description as string).trim(),
    category: e.category as CatalogueEntry['category'],
    keywords: (e.keywords as string[]).map((k) => k.trim()),
    author: (e.author as string).trim(),
    hosts: [...new Set(e.hosts as string[])],
    links: [...new Set(links as string[])],
    connections: [...new Set(e.connections as string[])],
    reads: [...new Set(e.reads as ProfileField[])],
    tools: (e.tools as string[]).map((t) => t.trim()),
    sync: e.sync,
    icon: icon ? { palette: { ...icon.palette }, pixels: [...icon.pixels] } : null,
    status: e.status as CatalogueStatus,
    recommended: e.recommended,
    published: e.published,
    file: { url: file.url, size: file.size, sha256: file.sha256 }
  }
}

function readWithdrawal(raw: unknown): Withdrawal | string {
  if (!isObject(raw)) return 'not an object'
  if (typeof raw.code !== 'string' || !SERVICE_CODE.test(raw.code)) return '"code" must be lowercase letters and digits'
  if (typeof raw.version !== 'string' || !SERVICE_VERSION.test(raw.version)) return '"version" must read like 1.2.3'
  if (typeof raw.sha256 !== 'string' || !SHA256.test(raw.sha256)) return '"sha256" must be 64 lowercase hexadecimal digits'
  if (!isText(raw.reason)) return `"reason" must say why, in at most ${MAX_TEXT} characters`
  return { code: raw.code, version: raw.version, sha256: raw.sha256, reason: raw.reason.trim() }
}

/**
 * An index, checked: throws an IndexError when it can't be used at all (not an object, another
 * format, no lists); otherwise drops each entry that isn't right, saying why. A code listed twice
 * is dropped altogether (which one is meant?), as is an entry taking the code of a service built
 * into Marianne (`reserved`), or listing a file the index withdraws.
 */
export function readIndex(data: unknown, reserved: ReadonlySet<string>): IndexReading {
  if (!isObject(data)) throw new IndexError('the index is not a JSON object')
  if (data.format !== CATALOGUE_FORMAT) {
    const newer = typeof data.format === 'number' && data.format > CATALOGUE_FORMAT
    throw new IndexError(`the index is of format ${String(data.format)}; this Marianne reads format ${CATALOGUE_FORMAT}`, newer ? 'format' : 'invalid')
  }
  if (typeof data.published !== 'string' || Number.isNaN(Date.parse(data.published))) throw new IndexError('"published" must be an ISO date')
  if (typeof data.expires !== 'string' || Number.isNaN(Date.parse(data.expires)) || Date.parse(data.expires) <= Date.parse(data.published))
    throw new IndexError('"expires" must be an ISO date after "published"')
  if (!Array.isArray(data.services) || !Array.isArray(data.withdrawn)) throw new IndexError('"services" and "withdrawn" must be lists')
  if (data.services.length > MAX_ENTRIES || data.withdrawn.length > MAX_ENTRIES) throw new IndexError(`the index lists more than ${MAX_ENTRIES} entries`)
  const notes: string[] = []
  const where = (raw: unknown, i: number, list: string) => (isObject(raw) && typeof raw.code === 'string' ? `"${raw.code.slice(0, 40)}"` : `${list}[${i}]`)

  const withdrawn: Withdrawal[] = []
  for (const [i, raw] of data.withdrawn.entries()) {
    const w = readWithdrawal(raw)
    if (typeof w === 'string') notes.push(`withdrawal ${where(raw, i, 'withdrawn')} dropped: ${w}`)
    else if (!withdrawn.some((x) => x.sha256 === w.sha256)) withdrawn.push(w)
  }
  const withdrawnFiles = new Set(withdrawn.map((w) => w.sha256))

  const read: CatalogueEntry[] = []
  for (const [i, raw] of data.services.entries()) {
    const entry = readEntry(raw)
    if (typeof entry === 'string') notes.push(`entry ${where(raw, i, 'services')} dropped: ${entry}`)
    else read.push(entry)
  }
  const count = new Map<string, number>()
  for (const e of read) count.set(e.code, (count.get(e.code) ?? 0) + 1)
  const services: CatalogueEntry[] = []
  for (const e of read) {
    if (count.get(e.code)! > 1) notes.push(`entry "${e.code}" dropped: the index lists this code ${count.get(e.code)} times`)
    else if (reserved.has(e.code)) notes.push(`entry "${e.code}" dropped: it is the code of a service built into Marianne`)
    else if (withdrawnFiles.has(e.file.sha256)) notes.push(`entry "${e.code}" dropped: the index withdraws its file`)
    else {
      if (e.recommended && e.status !== 'validated') notes.push(`entry "${e.code}": "recommended" ignored, the service is not validated`)
      services.push({ ...e, recommended: e.recommended && e.status === 'validated' })
    }
  }
  return { index: { format: CATALOGUE_FORMAT, published: data.published, expires: data.expires, services, withdrawn }, notes }
}

/** What a community service's file is worth by the catalogue, and the entry or the withdrawal that says so. */
export interface Verdict {
  verdict: ServiceTrust
  entry?: CatalogueEntry
  /** For a withdrawn validation: why, as the project says it. */
  reason?: string
}

/**
 * The standing of a service's file (its code, the SHA-256 of its .3615) by the catalogue:
 * withdrawn when the index takes back this file's validation; validated or unvalidated when the
 * index lists this exact file under this code; outside otherwise (not listed, or no catalogue).
 */
export function verdictOf(catalogue: Pick<CatalogueState, 'entries' | 'withdrawn'>, code: string, sha256: string): Verdict {
  const withdrawal = catalogue.withdrawn.find((w) => w.sha256 === sha256)
  if (withdrawal) return { verdict: 'withdrawn', reason: withdrawal.reason }
  const entry = catalogue.entries.find((e) => e.code === code && e.file.sha256 === sha256)
  return entry ? { verdict: entry.status, entry } : { verdict: 'outside' }
}

// ---------------------------------------------------------------- the store

/** Why a reading failed: what the window says of it (French), the log has the details. */
const FAILURES = {
  unreachable: 'Le catalogue de la communauté est injoignable pour le moment.',
  unsigned: 'Le catalogue reçu n’est pas signé par le projet : Marianne ne l’a pas pris.',
  format: 'Le catalogue reçu est d’un format plus récent : mettez Marianne à jour pour le lire.',
  invalid: 'Le catalogue reçu est illisible : Marianne ne l’a pas pris.',
  expired: 'Le catalogue de la communauté a expiré : Marianne attend sa nouvelle version, et ne compte plus ses validations d’ici là.'
} as const

/** The latest publication date of an index ever taken: an older one is never taken again, even once the kept index is gone. */
const HIGHEST_FILE = 'published.json'

class ReadFailure extends Error {
  constructor(
    message: string,
    readonly reason: keyof typeof FAILURES | 'stale'
  ) {
    super(message)
  }
}

export interface CatalogueOptions {
  /** The published index; null: there is no repository yet, nothing is read. */
  url: string | null
  /** The project's public key (PEM, ed25519); null: no index is ever taken. */
  signingKey: string | null
  /** Where the index taken is kept. */
  dir: string
  /** The codes of the services built into Marianne: no entry may take one. */
  reserved: ReadonlySet<string>
  userAgent: () => string
  /** Packaged, the development catalogue is never read, whatever the environment says. */
  isPackaged: boolean
  env: Record<string, string | undefined>
  /** What a relative MARIANNE_CATALOGUE is relative to. */
  cwd?: string
  fetch?: typeof fetch
  now?: () => number
  log?: Logger
}

interface Remote {
  etag?: string
  lastModified?: string
  /** When the index kept was last read or confirmed (ISO). */
  readAt?: string
}

export class CatalogueStore extends EventEmitter {
  private current: CatalogueState = { status: 'none', entries: [], withdrawn: [] }
  /** The development index, when there is one (never packaged). */
  private readonly devFile: string | null
  private key: KeyObject | null = null
  private started = false
  private reading: Promise<void> | null = null
  private lastAttempt = 0
  /** The publication date of the index in use: an older one never replaces it. */
  private inUse: string | null = null
  /** When the index in use expires (ISO). */
  private expires: string | null = null
  /** The development file as last read (its modification time and size). */
  private devStamp = ''
  private readonly fetch: typeof fetch
  private readonly now: () => number
  private readonly log: Logger

  constructor(private readonly opts: CatalogueOptions) {
    super()
    const dev = opts.isPackaged ? undefined : opts.env[DEV_CATALOGUE_ENV]?.trim()
    this.devFile = dev ? resolve(opts.cwd ?? process.cwd(), dev) : null
    this.fetch = opts.fetch ?? fetch
    this.now = opts.now ?? Date.now
    this.log = opts.log ?? log
  }

  /**
   * The catalogue as it is. `fresh`: the window asks, so an index older than a day, or none yet,
   * is read again (once at a time, not sooner than ten minutes after a failure): 'change' tells.
   */
  state(fresh = false): CatalogueState {
    this.expireIfDue()
    if (fresh && this.started) this.refreshIfOld()
    return this.current
  }

  /** Once, at start: the development index now; or the index kept, re-checked, then the published one soon and every day. */
  start(): void {
    if (this.started) return
    this.started = true
    if (this.devFile) {
      this.log.info(`Community catalogue: development catalogue ${this.devFile} (${DEV_CATALOGUE_ENV}, not signed, never in a packaged app)`)
      void this.check()
      return
    }
    if (!this.opts.url) return this.log.info('Community catalogue: no community repository yet; nothing to read')
    this.key = this.readKey()
    if (!this.key) return
    this.set({ status: 'loading', entries: [], withdrawn: [] })
    this.loadKept()
    setTimeout(() => void this.check(), FIRST_CHECK_MS).unref()
    setInterval(() => void this.check(), CHECK_EVERY_MS).unref()
  }

  /** Read the index now: the published one (conditional, when one is kept), or the development file. */
  check(): Promise<void> {
    if (!this.devFile && (!this.opts.url || !this.key)) return Promise.resolve()
    this.reading ??= (this.devFile ? this.readDev() : this.readPublished()).finally(() => (this.reading = null))
    return this.reading
  }

  private refreshIfOld(): void {
    if (this.devFile) {
      // The development file, read again as soon as it changes.
      if (this.stampOf(this.devFile) !== this.devStamp) void this.check()
      return
    }
    if (!this.key) return
    const readAt = this.current.readAt ? Date.parse(this.current.readAt) : 0
    if (this.now() - readAt >= CHECK_EVERY_MS && this.now() - this.lastAttempt >= RETRY_MS) void this.check()
  }

  private readKey(): KeyObject | null {
    if (!this.opts.signingKey) {
      this.log.info('Community catalogue is off: no signing key (packages/content/signing-key.pem)')
      return null
    }
    try {
      const key = createPublicKey(this.opts.signingKey)
      if (key.asymmetricKeyType === 'ed25519') return key
      this.log.error(`Community catalogue is off: the signing key is ${key.asymmetricKeyType}, not ed25519`)
    } catch (err) {
      this.log.error('Community catalogue is off: unreadable signing key:', message(err))
    }
    return null
  }

  private async readPublished(): Promise<void> {
    const url = this.opts.url!
    this.lastAttempt = this.now()
    try {
      const remote = this.readRemote()
      const index = await this.get(url, MAX_INDEX_BYTES, this.inUse ? remote : undefined)
      if (index.status === 304) return this.confirmed(remote)
      if (!index.data) throw new ReadFailure(`HTTP ${index.status} from ${url}`, 'unreachable')
      const signatureUrl = `${url}.sig`
      const signature = await this.get(signatureUrl, MAX_SIGNATURE_BYTES)
      if (!signature.data) throw new ReadFailure(`no signature (HTTP ${signature.status} from ${signatureUrl})`, 'unsigned')
      const reading = this.accept(index.data, signature.data)
      const readAt = new Date(this.now()).toISOString()
      this.keep(index.data, signature.data, { etag: index.etag, lastModified: index.lastModified, readAt })
      this.use(reading, readAt)
    } catch (err) {
      this.failed(err, url)
    }
  }

  private async readDev(): Promise<void> {
    const file = this.devFile!
    this.lastAttempt = this.now()
    try {
      const stamp = this.stampOf(file)
      if (!stamp) throw new ReadFailure(`${file} does not exist`, 'unreachable')
      if (statSync(file).size > MAX_INDEX_BYTES) throw new ReadFailure(`${file} is larger than ${MAX_INDEX_BYTES} bytes`, 'invalid')
      const reading = this.parse(readFileSync(file))
      this.devStamp = stamp
      this.use(reading, new Date(this.now()).toISOString())
    } catch (err) {
      this.failed(err, file)
    }
  }

  private stampOf(file: string): string {
    try {
      const s = statSync(file)
      return `${s.mtimeMs}:${s.size}`
    } catch {
      return ''
    }
  }

  /** The reading of an index, when its signature checks out and it may replace the one in use; throws ReadFailure saying why. Nothing is read before the signature checks out. */
  private accept(data: Buffer, signature: Buffer): IndexReading {
    let signed = false
    try {
      signed = !!this.key && verify(null, data, this.key, signature)
    } catch {
      // a malformed signature: not signed
    }
    if (!signed) throw new ReadFailure('its signature does not match the project’s key', 'unsigned')
    const reading = this.parse(data)
    const latest = Math.max(this.inUse ? Date.parse(this.inUse) : 0, this.highest())
    if (Date.parse(reading.index.published) < latest)
      throw new ReadFailure(`it was published ${reading.index.published}, before the latest index taken (${new Date(latest).toISOString()})`, 'stale')
    return reading
  }

  private parse(data: Buffer): IndexReading {
    let json: unknown
    try {
      json = JSON.parse(data.toString('utf8'))
    } catch {
      throw new ReadFailure('it is not JSON', 'invalid')
    }
    try {
      return readIndex(json, this.opts.reserved)
    } catch (err) {
      if (err instanceof IndexError) throw new ReadFailure(err.message, err.reason)
      throw err
    }
  }

  private use(reading: IndexReading, readAt: string): void {
    for (const note of reading.notes) this.log.warn(`Community catalogue: ${note}`)
    this.inUse = reading.index.published
    this.expires = reading.index.expires
    this.raiseHighest(reading.index.published)
    const { services, withdrawn } = reading.index
    this.log.info(`Community catalogue: index of ${reading.index.published}, ${services.length} services, ${withdrawn.length} withdrawn`)
    this.set({ status: 'ready', entries: services, withdrawn, readAt })
    this.expireIfDue()
  }

  /** Past its date, an index's validations no longer count (its withdrawals still do): failed, until a newer one comes. */
  private expireIfDue(): void {
    if (!this.expires || this.now() < Date.parse(this.expires)) return
    // Whatever happened since (a reading that failed kept the entries): once, its entries gone, the reason said.
    if (this.current.status === 'failed' && !this.current.entries.length && this.current.error === FAILURES.expired) return
    this.log.warn(`Community catalogue: the index of ${this.inUse} expired on ${this.expires}`)
    this.set({ ...this.current, status: 'failed', entries: [], error: FAILURES.expired })
  }

  /** The latest publication date ever taken (ms; 0: none). */
  private highest(): number {
    try {
      const v = (JSON.parse(readFileSync(join(this.opts.dir, HIGHEST_FILE), 'utf8')) as { published?: unknown }).published
      return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : 0
    } catch {
      return 0
    }
  }

  private raiseHighest(published: string): void {
    if (Date.parse(published) <= this.highest()) return
    try {
      mkdirSync(this.opts.dir, { recursive: true })
      writeFileAtomic(join(this.opts.dir, HIGHEST_FILE), JSON.stringify({ published }))
    } catch (err) {
      this.log.warn('Community catalogue: the latest publication date could not be kept:', message(err))
    }
  }

  /** Unchanged since it was kept: the index in use is current. */
  private confirmed(remote: Remote | null): void {
    const readAt = new Date(this.now()).toISOString()
    this.writeRemote({ ...remote, readAt })
    this.set({ ...this.current, status: 'ready', readAt, error: undefined })
  }

  /** The reading failed: the entries in use stay, the window says why. An older index is only worth a line in the log. */
  private failed(err: unknown, what: string): void {
    const reason = err instanceof ReadFailure ? err.reason : err instanceof TooLarge ? 'invalid' : 'unreachable'
    if (reason === 'stale') return this.log.warn(`Community catalogue ${what} refused: ${message(err)}`)
    this.log.warn(`Community catalogue ${what} not read: ${message(err)}`)
    this.set({ ...this.current, status: 'failed', error: FAILURES[reason] })
  }

  private set(next: CatalogueState): void {
    this.current = next
    this.emit('change', next)
  }

  /** The index taken on an earlier run, checked again; removed when it no longer checks out. */
  private loadKept(): void {
    const file = join(this.opts.dir, INDEX_FILE)
    const signatureFile = join(this.opts.dir, SIGNATURE_FILE)
    if (!existsSync(file)) return
    try {
      if (!existsSync(signatureFile)) throw new ReadFailure('no signature beside it', 'unsigned')
      const reading = this.accept(readFileSync(file), readFileSync(signatureFile))
      const readAt = this.readRemote()?.readAt ?? statSync(file).mtime.toISOString()
      this.use(reading, readAt)
    } catch (err) {
      this.log.warn(`Community catalogue ${file} refused: ${message(err)}; removed`)
      for (const name of [INDEX_FILE, SIGNATURE_FILE, REMOTE_FILE]) rmSync(join(this.opts.dir, name), { force: true })
    }
  }

  /** Keep the index taken, then its signature: cut short between the two, the index fails its check next time and is read again. */
  private keep(data: Buffer, signature: Buffer, remote: Remote): void {
    mkdirSync(this.opts.dir, { recursive: true })
    writeFileAtomic(join(this.opts.dir, INDEX_FILE), data)
    writeFileAtomic(join(this.opts.dir, SIGNATURE_FILE), signature)
    this.writeRemote(remote)
  }

  private readRemote(): Remote | null {
    try {
      const r = JSON.parse(readFileSync(join(this.opts.dir, REMOTE_FILE), 'utf8')) as Remote
      const text = (v: unknown) => (typeof v === 'string' ? v : undefined)
      return { etag: text(r.etag), lastModified: text(r.lastModified), readAt: text(r.readAt) }
    } catch {
      return null
    }
  }

  private writeRemote(remote: Remote): void {
    mkdirSync(this.opts.dir, { recursive: true })
    writeFileSync(join(this.opts.dir, REMOTE_FILE), JSON.stringify(remote))
  }

  private get(url: string, max: number, seen?: Remote | null) {
    return download(url, { max, userAgent: this.opts.userAgent(), timeoutMs: TIMEOUT_MS, seen: seen ?? undefined, fetch: this.fetch })
  }
}
