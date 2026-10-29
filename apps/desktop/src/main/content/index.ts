import { createPublicKey, verify, type KeyObject } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUNDLE_FILE, ContentError, readBundle, readContent, SIGNATURE_FILE, type ContentSet, type Procedure } from '@marianne/content'
import { files, signingKey } from '@marianne/content/files'
import { DOCUMENT_TYPE_LABELS, SETUP_TARGETS } from '../../shared/profile'
import { REPO_URL } from '../../shared/project'
import { writeFileAtomic } from '../files'
import { userAgent } from '../http'
import { log } from '../log'
import { paths } from '../paths'

/**
 * The content in use: skills, guided démarches, the official calendar, the public sites and the
 * news sources (see docs/content.md). The app is built with a copy (@marianne/content); between
 * releases the project publishes newer content as a bundle signed with its key, which replaces
 * that copy once its signature, its version and every one of its files check out. The bundle
 * taken is kept in paths.content for the next starts. Nothing personal: shared by the accounts.
 */

export const CONTENT_URL = `${REPO_URL}/releases/latest/download/${BUNDLE_FILE}`

const FIRST_CHECK_MS = 30_000
const CHECK_EVERY_MS = 24 * 3600_000
const TIMEOUT_MS = 30_000
/** Far more than the content needs (about 150 kB); an ed25519 signature is 64 bytes. */
const MAX_BUNDLE_BYTES = 8 * 1024 * 1024
const MAX_SIGNATURE_BYTES = 1024
/** What was last seen of the published bundle, for conditional requests. */
const REMOTE_FILE = 'remote.json'

type Logger = Pick<typeof log, 'info' | 'warn' | 'error'>

export interface ContentOptions {
  /** The built-in content, by path (@marianne/content/files). */
  files: Record<string, string>
  /** The project's public key (PEM, ed25519); null: no bundle is ever taken. */
  signingKey: string | null
  /** Where the bundle taken is kept. */
  dir: string
  /** The published bundle; its signature is beside it. */
  url: string
  userAgent: () => string
  fetch?: typeof fetch
  log?: Logger
}

interface Remote {
  etag?: string
  lastModified?: string
  /** The version of the content in use when it was seen: the same file then needs no new decision. */
  seenWith: string
}

/**
 * Why a bundle is not taken. stale: not newer than the content in use · invalid: signed, but
 * this version can't use it · unsigned: its signature doesn't match (it may arrive later).
 */
class Refused extends Error {
  constructor(
    message: string,
    readonly reason: 'stale' | 'invalid' | 'unsigned'
  ) {
    super(message)
  }
}

/** What this version of the app can't honor in content that is otherwise valid: settings and document types it doesn't know. */
export function appProblems(set: ContentSet): string[] {
  const problems: string[] = []
  for (const p of set.procedures)
    for (const [i, step] of p.steps.entries())
      for (const a of step.actions) {
        const where = `procedures/${p.domain}/${p.id}.md: step ${i + 1} "${step.title}"`
        if (a.kind === 'setup' && !a.target.startsWith('account:') && !Object.hasOwn(SETUP_TARGETS, a.target))
          problems.push(`${where}: setup: "${a.target}" is not a setting of Marianne (${Object.keys(SETUP_TARGETS).join(', ')}, account:<site id>)`)
        if (a.kind === 'document' && !Object.hasOwn(DOCUMENT_TYPE_LABELS, a.target))
          problems.push(`${where}: document: "${a.target}" is not a document type of Marianne (${Object.keys(DOCUMENT_TYPE_LABELS).join(', ')})`)
      }
  return problems
}

/** The built-in content counts until the end of the day of its last change. */
const builtInVersion = (set: ContentSet) => `${set.updated}T23:59:59.999Z`
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const counts = (set: ContentSet) =>
  `${set.skills.length} skills, ${set.procedures.length} démarches, ${set.calendar.length} dates, ${set.sites.length} sites, ${set.newsSources.length} news sources`

export class ContentStore extends EventEmitter {
  private readonly builtIn: ContentSet
  private active: { set: ContentSet; version: string; origin: 'built-in' | 'bundle' }
  private key: KeyObject | null = null
  private started = false
  private checking = false
  private readonly fetch: typeof fetch
  private readonly log: Logger

  /** Throws a ContentError when the built-in content is not valid: the build is wrong. */
  constructor(private readonly opts: ContentOptions) {
    super()
    this.builtIn = readContent(opts.files)
    const problems = appProblems(this.builtIn)
    if (problems.length) throw new ContentError(problems)
    this.active = { set: this.builtIn, version: builtInVersion(this.builtIn), origin: 'built-in' }
    this.fetch = opts.fetch ?? fetch
    this.log = opts.log ?? log
  }

  get(): ContentSet {
    return this.active.set
  }

  /** The version of the content in use: its bundle's, or the end of the day of the built-in content's last change. */
  get version(): string {
    return this.active.version
  }

  get origin(): 'built-in' | 'bundle' {
    return this.active.origin
  }

  procedure(id: string): Procedure | null {
    return this.active.set.procedures.find((p) => p.id === id) ?? null
  }

  /** Once, at start: take the bundle kept from an earlier run, then look for a newer one, soon and every day. */
  start(): void {
    if (this.started) return
    this.started = true
    this.key = this.readKey()
    if (!this.key) return
    this.loadKept()
    setTimeout(() => void this.check(), FIRST_CHECK_MS).unref()
    setInterval(() => void this.check(), CHECK_EVERY_MS).unref()
  }

  /** Download the published bundle when it changed, and take it when it may replace the content in use. */
  async check(): Promise<void> {
    if (!this.key || this.checking) return
    this.checking = true
    try {
      const remote = this.readRemote()
      const bundle = await this.download(this.opts.url, MAX_BUNDLE_BYTES, remote?.seenWith === this.active.version ? remote : undefined)
      if (bundle.status === 304) return
      if (bundle.status === 404) return this.log.info(`Content: no bundle published at ${this.opts.url}`)
      if (!bundle.data) return this.log.warn(`Content: HTTP ${bundle.status} from ${this.opts.url}`)
      const signatureUrl = new URL(SIGNATURE_FILE, this.opts.url).href
      const signature = await this.download(signatureUrl, MAX_SIGNATURE_BYTES)
      if (!signature.data)
        return this.log.warn(`Content bundle ${this.opts.url} refused: no signature (HTTP ${signature.status} from ${signatureUrl}); trying again next time`)
      const seen = { etag: bundle.etag, lastModified: bundle.lastModified }
      try {
        this.use(this.accept(bundle.data, signature.data))
        this.keep(bundle.data, signature.data)
        this.writeRemote({ ...seen, seenWith: this.active.version })
      } catch (err) {
        if (!(err instanceof Refused)) throw err
        this.refused(err, this.opts.url, err.reason === 'unsigned' ? '; trying again next time' : '')
        if (err.reason !== 'unsigned') this.writeRemote({ ...seen, seenWith: this.active.version })
      }
    } catch (err) {
      this.log.warn('Content: update check failed:', message(err))
    } finally {
      this.checking = false
    }
  }

  private readKey(): KeyObject | null {
    if (!this.opts.signingKey) {
      this.log.info(`Content updates are off: no signing key (packages/content/signing-key.pem); using the built-in content of ${this.builtIn.updated}`)
      return null
    }
    try {
      const key = createPublicKey(this.opts.signingKey)
      if (key.asymmetricKeyType === 'ed25519') return key
      this.log.error(`Content updates are off: the signing key is ${key.asymmetricKeyType}, not ed25519`)
    } catch (err) {
      this.log.error('Content updates are off: unreadable signing key:', message(err))
    }
    return null
  }

  /** The content of a bundle, when it may replace the one in use; throws Refused saying why. Nothing is read before the signature checks out. */
  private accept(data: Buffer, signature: Buffer): { set: ContentSet; version: string } {
    let signed = false
    try {
      signed = !!this.key && verify(null, data, this.key, signature)
    } catch {
      // a malformed signature: not signed
    }
    if (!signed) throw new Refused('its signature does not match the project’s key', 'unsigned')
    let version = 'unknown'
    try {
      const bundle = readBundle(data.toString('utf8'))
      version = bundle.version
      if (Date.parse(version) <= Date.parse(this.active.version))
        throw new Refused(`its version ${version} is not newer than the content in use (${this.active.version})`, 'stale')
      const set = readContent(bundle.files)
      const problems = appProblems(set)
      if (problems.length) throw new ContentError(problems)
      return { set, version }
    } catch (err) {
      if (err instanceof Refused) throw err
      throw new Refused(`version ${version}: ${message(err)}`, 'invalid')
    }
  }

  /** Not newer is the usual case (the published bundle is the app's own content): not worth a warning. */
  private refused(err: Refused, what: string, then: string): void {
    const line = `Content bundle ${what} refused: ${err.message}${then}`
    if (err.reason === 'stale') this.log.info(line)
    else this.log.warn(line)
  }

  private use(next: { set: ContentSet; version: string }): void {
    this.active = { ...next, origin: 'bundle' }
    this.log.info(`Content: using the bundle of ${next.version} (${counts(next.set)})`)
    this.emit('change', next.set)
  }

  /** The bundle taken on an earlier run; removed when it no longer checks out (the app's own content is newer, the file is damaged…). */
  private loadKept(): void {
    const file = join(this.opts.dir, BUNDLE_FILE)
    const signatureFile = join(this.opts.dir, SIGNATURE_FILE)
    if (!existsSync(file)) return
    try {
      if (!existsSync(signatureFile)) throw new Refused('no signature beside it', 'unsigned')
      this.use(this.accept(readFileSync(file), readFileSync(signatureFile)))
    } catch (err) {
      const refusal = err instanceof Refused ? err : new Refused(message(err), 'invalid')
      this.refused(refusal, file, '; removed')
      rmSync(file, { force: true })
      rmSync(signatureFile, { force: true })
      // Damaged or unsigned, the published file is worth downloading again.
      if (refusal.reason !== 'stale') rmSync(join(this.opts.dir, REMOTE_FILE), { force: true })
    }
  }

  /** Keep the bundle taken, the signature first: a bundle is never left beside another's signature. */
  private keep(data: Buffer, signature: Buffer): void {
    mkdirSync(this.opts.dir, { recursive: true })
    for (const [name, bytes] of [
      [SIGNATURE_FILE, signature],
      [BUNDLE_FILE, data]
    ] as const) {
      writeFileAtomic(join(this.opts.dir, name), bytes)
    }
  }

  private readRemote(): Remote | null {
    try {
      const r = JSON.parse(readFileSync(join(this.opts.dir, REMOTE_FILE), 'utf8')) as Partial<Remote>
      return typeof r.seenWith === 'string' ? { etag: r.etag, lastModified: r.lastModified, seenWith: r.seenWith } : null
    } catch {
      return null
    }
  }

  private writeRemote(remote: Remote): void {
    mkdirSync(this.opts.dir, { recursive: true })
    writeFileSync(join(this.opts.dir, REMOTE_FILE), JSON.stringify(remote))
  }

  /** A GET, conditional when `seen` says what was seen last; the body only for 2xx, and never more than `max` bytes. */
  private async download(
    url: string,
    max: number,
    seen?: Pick<Remote, 'etag' | 'lastModified'>
  ): Promise<{ status: number; data?: Buffer; etag?: string; lastModified?: string }> {
    const headers: Record<string, string> = { 'User-Agent': this.opts.userAgent() }
    if (seen?.etag) headers['If-None-Match'] = seen.etag
    if (seen?.lastModified) headers['If-Modified-Since'] = seen.lastModified
    const res = await this.fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
    const etag = res.headers.get('etag') ?? undefined
    const lastModified = res.headers.get('last-modified') ?? undefined
    if (!res.ok) {
      await res.body?.cancel()
      return { status: res.status, etag, lastModified }
    }
    if (Number(res.headers.get('content-length') ?? 0) > max) {
      await res.body?.cancel()
      throw new Error(`${url} is larger than ${max} bytes`)
    }
    const data = Buffer.from(await res.arrayBuffer())
    if (data.length > max) throw new Error(`${url} is larger than ${max} bytes`)
    return { status: res.status, data, etag, lastModified }
  }
}

export const content = new ContentStore({ files, signingKey, dir: paths.content, url: CONTENT_URL, userAgent })
