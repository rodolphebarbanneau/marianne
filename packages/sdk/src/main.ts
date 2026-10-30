import type * as z from 'zod'
import type {
  DomainId,
  Lean,
  Leaning,
  NewsArticle,
  NewsHeadline,
  NewsReading,
  NewsSourceInfo,
  ProfileField,
  ServiceDeadline,
  ServiceImpl,
  ServiceManifest,
  ServiceMethods,
  ServiceSummary,
  ServiceTile,
  SyncStatus,
  TodayItem
} from './index'

/**
 * @marianne/sdk/main: a service's main-process side. The service exports `service`, made with
 * `defineService`; Marianne calls `activate` once, with a context that is all the service gets
 * of the app: the network (its declared hosts only), the user's data for it (encrypted, in the
 * archive), a folder for public data, the communes. It gives back what its view may call, the
 * tools it lends the engines, its guides for them, its lines of "Aujourd'hui" and its tile.
 */

export * from './index'

export interface RequestOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  /** JSON body (POST). */
  json?: unknown
  /** Form body (POST, application/x-www-form-urlencoded). */
  form?: Record<string, string>
  timeoutMs?: number
  /** Cache GET responses this long (default 5 min; 0: no cache). */
  cacheMs?: number
}

/** HTTPS to the service's declared hosts, with Marianne's user agent; other URLs are refused. */
export interface ServiceHttp {
  /** Parsed JSON (a leading byte-order mark is ignored). */
  json<T>(url: string, options?: RequestOptions): Promise<T>
  text(url: string, options?: RequestOptions): Promise<string>
  /** As a browser asks for a page (some sites refuse other clients). */
  page(url: string, options?: { timeoutMs?: number; accept?: string }): Promise<string>
}

/** The user's data for this service (favorites…), in their encrypted archive; throws while it is locked. */
export interface ServiceStorage {
  get<T>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

export interface Commune {
  /** INSEE code. */
  code: string
  name: string
  postalCodes: string[]
  department: string
  departmentName: string
  region: string
  population: number
  longitude: number
  latitude: number
}

/** Marianne's "geo" connection: the communes of France. */
export interface ServiceGeo {
  /** By name, postal code or INSEE code, most populated first. */
  findCommunes(text: string, limit?: number): Promise<Commune[]>
  getCommune(code: string): Promise<Commune | null>
}

/** The commune of the user's address. */
export interface HomeCommune {
  code: string
  name: string
  postcode: string
  latitude?: number
  longitude?: number
}

export interface ServiceLog {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/** A vehicle of the user, with only the fields the service was granted (and its id, always). */
export interface Vehicle {
  id: string
  plate?: string
  model?: string
  firstRegistration?: string
  lastInspection?: string
  critair?: string
}

/** What the user let the service read of their profile ("permissions" in its manifest). */
export interface ServiceProfile {
  /** The fields granted so far: none until the user says yes, and after they take it back. */
  granted(): ProfileField[]
  /** Their vehicles, granted fields only; [] while locked or without a vehicles field granted. */
  vehicles(): Vehicle[]
  /** The groups they said they feel close to; null while locked, without opinions.leaning granted, or when they said nothing. */
  leaning(): Leaning | null
  /** The themes that matter to them (THEMES ids); [] while locked or without opinions.themes granted. */
  themes(): string[]
  /**
   * The news sources they accept, the sections they keep (by source id; absent: all) and the
   * colours they gave sources (only those they changed); null while locked or without
   * opinions.sources granted.
   */
  sources(): { accepted: string[]; sections: Record<string, string[]>; leanings: Record<string, Lean> } | null
}

/**
 * The headlines Marianne reads for a service that declares `"news": true`: it reaches no press site
 * itself. With opinions.sources granted, only the user's accepted sources and sections (`all`: the
 * set-aside ones too, marked); without it, every source of Marianne's list, unmarked.
 */
export interface ServiceNews {
  /** The user's sources apply (opinions.sources granted); false: all of Marianne's. */
  filtered(): boolean
  /** The last 24 hours (or a day of the 7-day history, YYYY-MM-DD, Paris time): every title, and the subjects. */
  read(opts?: { day?: string; all?: boolean }): Promise<NewsReading>
  /** Headlines matching words over the last 7 days, most recent first. */
  search(words: string, opts?: { since?: string; limit?: number; all?: boolean }): Promise<NewsHeadline[]>
  /** For one headline on screen: its media and the start of its article (read once, then kept with it); null: nothing to read. */
  article(id: string): Promise<NewsArticle | null>
  /** The catalogue, to name and colour sources. */
  sources(opts?: { all?: boolean }): Promise<NewsSourceInfo[]>
}

export interface ServiceContext {
  manifest: ServiceManifest
  http: ServiceHttp
  log: ServiceLog
  storage: ServiceStorage
  /** A folder of this computer for the service's public data (its sync job fills it). Never personal data. */
  dataDir: string
  geo: ServiceGeo
  /** The commune of the user's address, when the profile has one and the account is open. */
  home(): HomeCommune | null
  profile: ServiceProfile
  /** The service's sync job: its last run, and a way to run it now. */
  sync: { status(): SyncStatus; run(): Promise<void> }
  /** The headlines Marianne reads for it: present only when its manifest says `"news": true`. */
  news?: ServiceNews
}

export interface ToolCall {
  /** The folder whose conversation called the tool. */
  folderId?: string
}

export interface ServiceTool<S extends z.ZodRawShape = z.ZodRawShape> {
  /** Unique in the service; engines see it as "<code>_<name>" (parlement_ballots). */
  name: string
  /** In French, as the conversation shows the call ("assemblée · scrutins"). */
  label: string
  /** For the model, in English: what it returns, when to use it. */
  description: string
  input: S
  /** It only reads data. */
  readOnly?: boolean
  /** Compact Markdown for the model, in English, with the links and ids it needs to cite. */
  run(args: z.output<z.ZodObject<S>>, call: ToolCall): Promise<string>
}

export interface ServiceRuntime<M extends ServiceMethods = ServiceMethods> {
  /** What the view may call. */
  methods: ServiceImpl<M>
  tools?: ServiceTool[]
  /** Guides the engines read when a request calls for them: Markdown with a front matter (name, title, description). */
  skills?: string[]
  /** A few lines (English) for the engines' instructions while the service is on. */
  instructions?: string
  /** Its lines of "Aujourd'hui" for a day (YYYY-MM-DD, Paris time). */
  today?(day: string): Promise<TodayItem[]>
  /** Its line on the dashboard of one of its domains; null: nothing to say there. */
  summary?(domain: DomainId): Promise<ServiceSummary | null>
  /** The deadlines it knows of, from what it keeps (ctx.storage): read often, so no network. */
  deadlines?(): ServiceDeadline[]
  /**
   * Its tile on the Services page, once the user pins it: data that Marianne lays out (see
   * ServiceTile). Called when the page shows and every `tile.everyMinutes` while it does; it reads
   * what the service keeps and may reach its declared hosts. Marianne shows the last tile at once,
   * with its age, until a new one comes. Null: the default tile (its name and description).
   */
  tile?(): Promise<ServiceTile | null>
  /** Its sync job has just written new data. */
  synced?(): void
}

export interface ServiceModule<M extends ServiceMethods = ServiceMethods> {
  /** Called once, when Marianne starts. */
  activate(ctx: ServiceContext): ServiceRuntime<M>
  /** The service has a sync job (its package exports "./sync"): run it this often. */
  sync?: { everyHours: number }
  /** How often its tile is worth asking again while the Services page shows (default 15, at least 5). */
  tile?: { everyMinutes: number }
}

/** A service's main side, its methods checked against the ones it declares. */
export function defineService<M extends ServiceMethods>(module: ServiceModule<M>): ServiceModule {
  return module as unknown as ServiceModule
}

/** A tool, its `run` arguments inferred from `input`. */
export function defineTool<S extends z.ZodRawShape>(tool: ServiceTool<S>): ServiceTool {
  return tool as unknown as ServiceTool
}

/** A failure the model should read and work around (a missing argument, nothing found), not a crash. */
export class ToolError extends Error {
  override name = 'ToolError'
}

/** Cut long text at a paragraph boundary, saying so. */
export function clip(text: string, max: number, hint = ''): string {
  if (text.length <= max) return text
  const cut = text.lastIndexOf('\n', max)
  return `${text.slice(0, cut > max * 0.6 ? cut : max)}\n\n[… truncated: ${text.length - max} more characters${hint ? `. ${hint}` : ''}]`
}

/** A Markdown table from rows of cells. */
export function table(head: string[], rows: Array<Array<string | number>>): string {
  const cell = (v: string | number) =>
    String(v ?? '')
      .replace(/\|/g, '/')
      .replace(/\n/g, ' ')
  return [`| ${head.join(' | ')} |`, `|${' --- |'.repeat(head.length)}`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n')
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`

/** Query string from defined, non-empty values: "?q=caf&limit=5". */
export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}
