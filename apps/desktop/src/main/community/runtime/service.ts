import { EventEmitter } from 'node:events'
import { DOMAIN_IDS, serviceCode, type DomainId, type ServiceDeadline, type ServiceManifest, type ServiceSummary, type TodayItem } from '@marianne/sdk'
import type { ServiceImpl, ServiceMethods, ServiceModule, ServiceRuntime, ServiceTool, ToolCall } from '@marianne/sdk/main'
import * as z from 'zod'
import type { BridgeReply, SandboxInvoke, SandboxKind } from '../../../shared/community'
import type { SandboxBridgeMain } from './bridge'
import { DescriptionRefused, readDescription, type ServiceDescription } from './description'
import { isLine, logLine, MAX_TOOL_ARGUMENTS_BYTES, RateLimit } from './limits'
import { RpcTimeout, SandboxRpc } from './rpc'

/**
 * One community service, as the host runs it: its sandbox started, activated and watched. The
 * host sees it as it sees a built-in service, through `runtime` (a ServiceRuntime whose every
 * part is a request to the sandbox) and `module`. Its sandbox may fail: what its code says at
 * activation can refuse it (an undeclared tool), and a crash or a hang stops it; Marianne starts it
 * again once, then leaves it off with the reason (`error`), its tools withdrawn.
 */

/** A running sandbox, to its owner: a way to send it requests, and to end it. */
export interface SandboxHandle {
  send(message: SandboxInvoke): void
  /** Ends it, killing its renderer; no event comes from it after. */
  destroy(): void
}

/** What a sandbox tells its owner, and asks of it. */
export interface SandboxEvents {
  /** Its page is loaded: it may be activated. */
  loaded(): void
  reply(id: unknown, reply: unknown): void
  /** It is gone: its renderer crashed, hung, or its page didn't load. */
  gone(reason: 'crashed' | 'unresponsive' | 'load-failed'): void
  call(name: unknown, args: unknown): Promise<unknown>
  callSync(name: unknown, args: unknown): BridgeReply
  log(level: unknown, text: unknown): void
}

/** Starts the sandbox of a service: Electron's in the app (sandbox.ts), a fake one in tests. */
export type SandboxFactory = (code: string, events: SandboxEvents) => SandboxHandle

export type CommunityStatus = 'stopped' | 'starting' | 'ready' | 'failed'

type Logger = { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void }

export interface CommunityServiceOptions {
  manifest: ServiceManifest
  bridge: SandboxBridgeMain
  factory: SandboxFactory
  log: Logger
  /** How long its page may take to load. */
  loadMs?: number
  /** After a crash, how soon it is started again (once). */
  restartMs?: number
  /** How often it is looked at (alive?) and its deadlines read again. */
  everyMs?: number
  /** Asked before a tool's arguments, checked, cross; what it throws stops them. */
  beforeTool?: (tool: { label: string }, args: Record<string, unknown>, call: ToolCall) => Promise<void>
}

const MAX_LOG = 2000
const MAX_TODAY = 50
const MAX_DEADLINES = 100
const URGENCIES = new Set(['none', 'soon', 'urgent'])
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
/** What the model should read rather than a crash. */
const toolError = (message: string) => Object.assign(new Error(message), { name: 'ToolError' })
/**
 * One line, not empty, within `max`: a title or an id reaches the engines (a deadline's, in the
 * user's profile), where a line break would let it write a heading of its own.
 */
const str = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max && isLine(v)
const optStr = (v: unknown, max: number) => v === undefined || (typeof v === 'string' && v.length <= max)
const optLine = (v: unknown, max: number) => v === undefined || (typeof v === 'string' && v.length <= max && isLine(v))

/** Params to open the service with: short strings and numbers. */
function params(v: unknown): Record<string, string | number> | undefined {
  if (!isRecord(v)) return undefined
  const entries = Object.entries(v).filter(
    ([k, x]) => k.length <= 40 && ((typeof x === 'string' && x.length <= 500) || (typeof x === 'number' && Number.isFinite(x)))
  )
  return entries.length ? (Object.fromEntries(entries.slice(0, 16)) as Record<string, string | number>) : undefined
}

/** Its lines of "Aujourd'hui", the ones that read as TodayItem. */
export function readToday(v: unknown): TodayItem[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((i): i is Record<string, unknown> => isRecord(i) && str(i.id, 200) && str(i.title, 300) && str(i.start, 40) && str(i.source, 120))
    .filter(
      (i) =>
        optStr(i.detail, 500) &&
        optLine(i.end, 40) &&
        optLine(i.place, 200) &&
        (i.url === undefined || (typeof i.url === 'string' && /^https:\/\//.test(i.url) && isLine(i.url)))
    )
    .slice(0, MAX_TODAY)
    .map((i) => ({
      id: i.id as string,
      title: i.title as string,
      start: i.start as string,
      source: i.source as string,
      ...(i.detail ? { detail: i.detail as string } : {}),
      ...(i.end ? { end: i.end as string } : {}),
      ...(i.place ? { place: i.place as string } : {}),
      ...(i.url ? { url: i.url as string } : {}),
      ...(i.live === true ? { live: true } : {}),
      ...(i.cancelled === true ? { cancelled: true } : {}),
      ...(params(i.params) ? { params: params(i.params) } : {})
    }))
}

/** Its line on a domain's dashboard, when it reads as a ServiceSummary. */
export function readSummary(v: unknown): ServiceSummary | null {
  if (!isRecord(v) || !str(v.text, 300) || !URGENCIES.has(v.urgency as string) || !optStr(v.detail, 500)) return null
  return {
    text: v.text as string,
    urgency: v.urgency as ServiceSummary['urgency'],
    ...(v.detail ? { detail: v.detail as string } : {}),
    ...(params(v.params) ? { params: params(v.params) } : {})
  }
}

/** Its deadlines, the ones that read as ServiceDeadline. */
export function readDeadlines(v: unknown): ServiceDeadline[] {
  if (!Array.isArray(v)) return []
  return v
    .filter(
      (d): d is Record<string, unknown> => isRecord(d) && str(d.id, 200) && str(d.title, 300) && str(d.due, 40) && DOMAIN_IDS.includes(d.domain as DomainId)
    )
    .filter((d) => optStr(d.detail, 500))
    .slice(0, MAX_DEADLINES)
    .map((d) => ({
      id: d.id as string,
      domain: d.domain as DomainId,
      title: d.title as string,
      due: d.due as string,
      ...(d.detail ? { detail: d.detail as string } : {}),
      ...(params(d.params) ? { params: params(d.params) } : {})
    }))
}

interface Deferred {
  promise: Promise<void>
  resolve: () => void
  reject: (err: Error) => void
  settled: boolean
}

function deferred(): Deferred {
  const d = { settled: false } as Deferred
  d.promise = new Promise<void>((resolve, reject) => {
    d.resolve = () => ((d.settled = true), resolve())
    d.reject = (err) => ((d.settled = true), reject(err))
  })
  // Nobody may be waiting: a failure to start isn't an unhandled rejection.
  d.promise.catch(() => undefined)
  return d
}

export class CommunityService extends EventEmitter {
  status: CommunityStatus = 'stopped'
  /** Why it is off, after « n’a pas pu démarrer : » (French). */
  error: string | undefined
  readonly runtime: ServiceRuntime
  readonly module: ServiceModule
  private sandbox: SandboxHandle | null = null
  private rpc: SandboxRpc | null = null
  private description: ServiceDescription | null = null
  private tools: ServiceTool[] = []
  private ready: Deferred = deferred()
  private kept: ServiceDeadline[] = []
  private restarts = 0
  /** Each sandbox started has its number: what an older one says is not heard. */
  private generation = 0
  private timers: Array<ReturnType<typeof setTimeout>> = []
  private pinging = false
  private activating = false
  private storedTimer: ReturnType<typeof setTimeout> | null = null
  private readonly label: string
  /** Its log: twenty lines a second, a hundred at once; past that, dropped (and said once). */
  private readonly logLimit = new RateLimit(20, 100)
  private logDropped = false

  constructor(private readonly opts: CommunityServiceOptions) {
    super()
    this.label = `3615 ${serviceCode(opts.manifest)}`
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    this.runtime = {
      // Any name is a function, so that the host's call reaches the sandbox; the sandbox's methods decide.
      methods: new Proxy({} as ServiceImpl<ServiceMethods>, {
        get: (_target, name) => (typeof name === 'string' && name !== 'then' ? (...args: unknown[]) => self.method(name, args) : undefined)
      }),
      get tools() {
        return self.tools
      },
      get skills() {
        return self.description?.skills ?? []
      },
      get instructions() {
        return self.description?.instructions ?? ''
      },
      today: (day: string) => self.today(day),
      summary: (domain: DomainId) => self.summary(domain),
      deadlines: () => self.kept,
      // Until it says, it may have a tile; once it said it has none, the default tile.
      get tile() {
        return self.description && !self.description.has.tile ? undefined : () => self.request('tile', '', [])
      }
    } as ServiceRuntime
    this.module = {
      activate: () => this.runtime,
      get tile() {
        const minutes = self.description?.tileEveryMinutes
        return minutes ? { everyMinutes: minutes } : undefined
      }
    }
  }

  get manifest(): ServiceManifest {
    return this.opts.manifest
  }

  /** Its sandbox started, unless it runs already; a failed service stays off until it is stopped. */
  start(): void {
    if (this.status !== 'stopped') return
    this.restarts = 0
    this.launch()
  }

  /** Its sandbox ended (the account locked, the service removed or switched off); it may be started again. */
  stop(): void {
    if (this.status === 'stopped') return
    this.teardown(`${this.label} est arrêté.`)
    this.ready.reject(new Error(`${this.label} est arrêté.`))
    this.status = 'stopped'
    this.error = undefined
    this.emit('change')
  }

  /** It stored the user's data: its deadlines may have changed. */
  stored(): void {
    if (this.storedTimer) clearTimeout(this.storedTimer)
    this.storedTimer = setTimeout(() => {
      this.storedTimer = null
      void this.refreshDeadlines()
    }, 1000)
    this.storedTimer.unref?.()
  }

  private launch(): void {
    const gen = ++this.generation
    this.status = 'starting'
    this.error = undefined
    this.description = null
    this.tools = []
    // Who waits for it (a call made while it restarts) waits for this one.
    if (this.ready.settled) this.ready = deferred()
    this.activating = false
    this.rpc = new SandboxRpc({
      send: (m) => this.sandbox!.send(m),
      label: this.label,
      onTimeout: (kind) => kind !== 'ping' && kind !== 'activate' && void this.checkAlive(gen)
    })
    const current = () => gen === this.generation
    const events: SandboxEvents = {
      loaded: () => current() && void this.activate(gen),
      reply: (id, reply) => current() && this.rpc?.settle(id, reply),
      gone: (reason) => current() && this.gone(gen, reason),
      call: (name, args) => (current() ? this.opts.bridge.call(name, args) : Promise.reject(new Error('Appel refusé.'))),
      callSync: (name, args) => (current() ? this.opts.bridge.callSync(name, args) : { error: { name: 'BridgeRefused', message: 'Appel refusé.' } }),
      log: (level, text) => {
        if (!current() || typeof text !== 'string') return
        if (!this.logLimit.take(Date.now())) {
          if (!this.logDropped) this.opts.log.warn(`[${this.label}] logs too much: lines dropped`)
          this.logDropped = true
          return
        }
        // One line each, without control characters: it can't write lines of its own in Marianne's log
        // (nor through what else of it is logged: its errors, its tile's problems, its screen's links go through logLine too).
        const line = logLine(text, MAX_LOG)
        if (level === 'error') this.opts.log.error(`[${this.label}]`, line)
        else if (level === 'warn') this.opts.log.warn(`[${this.label}]`, line)
        else this.opts.log.info(`[${this.label}]`, line)
      }
    }
    this.emit('change')
    try {
      this.sandbox = this.opts.factory(this.opts.manifest.id, events)
    } catch (err) {
      this.opts.log.error(`${this.label}: its sandbox could not be created:`, err instanceof Error ? err.message : String(err))
      return this.fail(gen, 'Marianne n’a pas pu lui préparer un espace isolé.')
    }
    this.later(
      () => current() && this.status === 'starting' && !this.description && this.fail(gen, 'il n’a pas répondu à son démarrage.'),
      this.opts.loadMs ?? 30_000
    )
  }

  private async activate(gen: number): Promise<void> {
    if (this.activating || this.status !== 'starting') return
    this.activating = true
    let raw: unknown
    try {
      raw = await this.rpc!.invoke('activate', '', [this.opts.manifest])
    } catch (err) {
      if (gen !== this.generation) return
      const message = err instanceof Error ? err.message : String(err)
      this.opts.log.warn(`${this.label} failed to activate:`, logLine(message))
      return this.fail(gen, err instanceof RpcTimeout ? 'il n’a pas répondu à son démarrage.' : `son code a échoué au démarrage (${message.slice(0, 200)}).`)
    }
    if (gen !== this.generation) return
    try {
      this.description = readDescription(raw, this.opts.manifest)
    } catch (err) {
      const message = err instanceof DescriptionRefused ? err.message : 'son code ne s’est pas présenté à Marianne.'
      this.opts.log.warn(`${this.label} refused:`, logLine(message))
      return this.fail(gen, message)
    }
    this.tools = this.description.tools.map((t) => this.toolOf(t))
    for (const t of this.opts.manifest.tools)
      if (!this.tools.some((x) => x.name === t.name)) this.opts.log.info(`${this.label}: declares the tool ${t.name}, which its code doesn't lend`)
    this.status = 'ready'
    this.ready.resolve()
    this.opts.log.info(`${this.label} ${this.opts.manifest.version} started (${this.tools.length} tools)`)
    this.emit('change')
    void this.refreshDeadlines()
    this.every(gen)
  }

  /** Every minute while it runs: is it alive, and its deadlines read again. */
  private every(gen: number): void {
    this.later(() => {
      if (gen !== this.generation || this.status !== 'ready') return
      void this.checkAlive(gen)
      void this.refreshDeadlines()
      this.every(gen)
    }, this.opts.everyMs ?? 60_000)
  }

  /** A request timed out, or it's time to look: a sandbox that doesn't answer a ping is stuck, and is ended. */
  private async checkAlive(gen: number): Promise<void> {
    if (this.pinging || gen !== this.generation || !this.rpc) return
    this.pinging = true
    try {
      await this.rpc.invoke('ping', '', [])
    } catch (err) {
      if (gen === this.generation && err instanceof RpcTimeout) {
        this.opts.log.warn(`${this.label} doesn't answer: stopped`)
        this.gone(gen, 'unresponsive')
      }
    } finally {
      this.pinging = false
    }
  }

  /** Its sandbox is gone: started again once after a crash or a hang, else off with the reason. */
  private gone(gen: number, reason: 'crashed' | 'unresponsive' | 'load-failed'): void {
    if (gen !== this.generation) return
    const why =
      reason === 'unresponsive'
        ? 'il ne répondait plus, et Marianne l’a arrêté.'
        : reason === 'load-failed'
          ? 'ses fichiers n’ont pas pu être chargés.'
          : 'il s’est arrêté de façon inattendue.'
    this.opts.log.warn(`${this.label}: its sandbox is gone (${reason})`)
    if (reason !== 'load-failed' && this.restarts < 1) {
      this.restarts++
      this.teardown(`${this.label} a redémarré : réessayez.`)
      // Who waits for it waits for the new one.
      this.status = 'starting'
      if (this.ready.settled) this.ready = deferred()
      this.emit('change')
      const next = ++this.generation
      this.later(() => next === this.generation && this.launch(), this.opts.restartMs ?? 1000)
      return
    }
    this.fail(gen, this.restarts ? `${why.replace(/\.$/, '')} ; Marianne ne le relance pas une deuxième fois.` : why)
  }

  private fail(gen: number, error: string): void {
    if (gen !== this.generation) return
    this.teardown(`${this.label} est arrêté : ${error}`)
    this.status = 'failed'
    this.error = error
    this.ready.reject(new Error(`${this.label} n’a pas pu démarrer : ${error}`))
    this.emit('change')
  }

  private teardown(message: string): void {
    this.generation++
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
    if (this.storedTimer) clearTimeout(this.storedTimer)
    this.storedTimer = null
    this.rpc?.close(message)
    this.rpc = null
    const sandbox = this.sandbox
    this.sandbox = null
    this.description = null
    this.tools = []
    try {
      sandbox?.destroy()
    } catch (err) {
      this.opts.log.warn(`${this.label}: its sandbox could not be ended:`, err instanceof Error ? err.message : String(err))
    }
  }

  private later(fn: () => void, ms: number): void {
    const t = setTimeout(fn, ms)
    t.unref?.()
    this.timers.push(t)
  }

  /** A request to the sandbox, once it is ready (a request made while it starts waits for it). */
  private async request(kind: SandboxKind, name: string, args: unknown[]): Promise<unknown> {
    if (this.status === 'starting') await this.ready.promise
    if (this.status !== 'ready' || !this.rpc) throw new Error(this.error ? `${this.label} n’a pas pu démarrer : ${this.error}` : `${this.label} est arrêté.`)
    return this.rpc.invoke(kind, name, args)
  }

  private async method(name: string, args: unknown[]): Promise<unknown> {
    if (this.status === 'starting') await this.ready.promise
    if (this.description && !this.description.methods.includes(name)) throw new Error(`${this.opts.manifest.name} : méthode inconnue (${name})`)
    return this.request('method', name, args)
  }

  private async today(day: string): Promise<TodayItem[]> {
    if (this.description && !this.description.has.today) return []
    return readToday(await this.request('today', '', [day]))
  }

  private async summary(domain: DomainId): Promise<ServiceSummary | null> {
    if (this.description && !this.description.has.summary) return null
    return readSummary(await this.request('summary', '', [domain]))
  }

  /** Its deadlines, kept: the host reads them often and at once, so they are read again apart. */
  private async refreshDeadlines(): Promise<void> {
    if (this.status !== 'ready' || !this.description?.has.deadlines) return
    try {
      this.kept = readDeadlines(await this.request('deadlines', '', []))
    } catch (err) {
      this.opts.log.warn(`${this.label}: deadlines:`, logLine(err instanceof Error ? err.message : String(err)))
    }
  }

  /** A tool as the host lends it: its arguments checked against the schema it declared and their size, then the host's say, run in the sandbox. */
  private toolOf(t: ServiceDescription['tools'][number]): ServiceTool {
    return {
      name: t.name,
      label: t.label,
      description: t.description,
      input: t.input,
      readOnly: t.readOnly,
      run: async (args, call) => {
        const parsed = t.schema.safeParse(args ?? {})
        if (!parsed.success) throw toolError(`Invalid arguments for ${t.name}: ${z.prettifyError(parsed.error)}`)
        const size = Buffer.byteLength(JSON.stringify(parsed.data))
        if (size > MAX_TOOL_ARGUMENTS_BYTES)
          throw toolError(
            `Too much for a community service's tool: ${size} bytes, ${MAX_TOOL_ARGUMENTS_BYTES} at most. Nothing was sent. Send only what the request needs.`
          )
        await this.opts.beforeTool?.(t, parsed.data as Record<string, unknown>, call)
        // Never the folder it is called from: a community service doesn't know the user's folders.
        const out = await this.request('tool', t.name, [parsed.data, {}])
        if (typeof out !== 'string') throw new Error(`${this.label} · ${t.label}: no text came back`)
        return out
      }
    }
  }
}
