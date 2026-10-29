/**
 * @marianne/sdk: the contract between Marianne and its services, the apps of the Services page
 * (the 3615 codes: 3615 METEO, 3615 ASSEMBLEE…). A service is a package of its own, which
 * depends on this SDK and on nothing of the app:
 *
 * - package.json: its manifest, in the `marianne` field (see ServicePackage);
 * - main: its main-process side, built with @marianne/sdk/main (methods, engine tools, skills…);
 * - sync: optionally, the background job that keeps its offline data, with @marianne/sdk/sync;
 * - view: its screen, built with @marianne/sdk/view.
 *
 * Its tests get the context Marianne would give its main side from @marianne/sdk/testing.
 *
 * This entry point is what both sides share: the manifest, its categories, and plain helpers.
 * See docs/services.md.
 */

export type ServiceCategory = 'daily' | 'administration' | 'democracy' | 'territory' | 'health' | 'economy' | 'environment' | 'culture'

/** In the order of the Services page. */
export const SERVICE_CATEGORIES: ReadonlyArray<{ id: ServiceCategory; label: string }> = [
  { id: 'daily', label: 'Vie quotidienne' },
  { id: 'administration', label: 'Administration' },
  { id: 'democracy', label: 'Vie démocratique' },
  { id: 'territory', label: 'Territoires' },
  { id: 'health', label: 'Santé' },
  { id: 'economy', label: 'Économie et emploi' },
  { id: 'environment', label: 'Environnement' },
  { id: 'culture', label: 'Culture et loisirs' }
]

/**
 * Marianne's domains: the fixed themes of the user's file and of the Démarches page. A service
 * says which ones it is useful for; guided démarches and content belong to one.
 */
export const DOMAIN_IDS = ['identity', 'family', 'health', 'taxes', 'work', 'retirement', 'housing', 'mobility', 'justice', 'business'] as const
export type DomainId = (typeof DOMAIN_IDS)[number]

/**
 * The fields of the user's profile a service may ask to read, each with what the consent card
 * says. A service never sees anything else of the profile, nor the masking tokens.
 */
export const PROFILE_FIELDS = {
  'vehicles.plate': 'les plaques d’immatriculation de vos véhicules',
  'vehicles.model': 'le modèle de vos véhicules',
  'vehicles.firstRegistration': 'la date de première immatriculation de vos véhicules',
  'vehicles.lastInspection': 'la date du dernier contrôle technique de vos véhicules',
  'vehicles.critair': 'la vignette Crit’Air de vos véhicules'
} as const
export type ProfileField = keyof typeof PROFILE_FIELDS

/** A service's code: lowercase letters and digits, no accents ("meteo" is 3615 METEO). */
export const SERVICE_CODE = /^[a-z0-9]+$/

/** Service packages are named after their code: @marianne/service-meteo. */
export const SERVICE_PACKAGE_PREFIX = '@marianne/service-'

/** What a service declares in the `marianne` field of its package.json. */
export interface ServiceDeclaration {
  /** Its code, and its folder's name. */
  code: string
  name: string
  /** One line, in French. */
  description: string
  category: ServiceCategory
  /** Words that find it in the search, besides its name and code. */
  keywords?: string[]
  /** Marianne's connections it relies on ("geo"): it is unavailable while one of them is off. */
  connections?: string[]
  /** The hosts it may reach, from its main side, its sync job and its view: nothing else. */
  hosts: string[]
  /** Links it opens itself: in an answer, a link starting with one of these opens the service. */
  links?: string[]
  /** The domains it is useful for: their dashboards show it. */
  domains?: DomainId[]
  /** What of the user's profile it asks to read, and what for (French, one line); the user decides. */
  permissions?: { profile: ProfileField[]; purpose: string }
}

/** The fields of a service's package.json that Marianne reads. */
export interface ServicePackage {
  name: string
  version: string
  author?: string | { name: string }
  marianne: ServiceDeclaration
}

/** A service as Marianne knows it, from its package.json. */
export interface ServiceManifest {
  /** Its code: "meteo". */
  id: string
  package: string
  version: string
  author: string
  name: string
  description: string
  category: ServiceCategory
  keywords: string[]
  connections: string[]
  hosts: string[]
  links: string[]
  domains: DomainId[]
  permissions: { profile: ProfileField[]; purpose: string }
}

export class ManifestError extends Error {
  override name = 'ManifestError'
}

const HOST = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

/** The manifest of a service package; throws a ManifestError saying what is wrong. */
export function readManifest(pkg: unknown): ServiceManifest {
  const p = (pkg ?? {}) as Partial<ServicePackage>
  const where = typeof p.name === 'string' ? p.name : 'a service package'
  const fail = (what: string): never => {
    throw new ManifestError(`${where}: ${what}`)
  }
  const m = (p.marianne ?? fail('no "marianne" field')) as Partial<ServiceDeclaration>
  if (typeof m.code !== 'string' || !SERVICE_CODE.test(m.code)) fail('"marianne.code" must be lowercase letters and digits, without accents')
  const code = m.code as string
  if (p.name !== SERVICE_PACKAGE_PREFIX + code) fail(`the package must be named ${SERVICE_PACKAGE_PREFIX}${code}`)
  if (typeof p.version !== 'string') fail('no version')
  for (const key of ['name', 'description'] as const) if (typeof m[key] !== 'string' || !m[key]?.trim()) fail(`"marianne.${key}" is missing`)
  if (!SERVICE_CATEGORIES.some((c) => c.id === m.category)) fail(`unknown category "${m.category}"`)
  for (const key of ['keywords', 'connections', 'links'] as const)
    if (m[key] !== undefined && !isStrings(m[key])) fail(`"marianne.${key}" must be a list of strings`)
  if (!isStrings(m.hosts) || !m.hosts.every((h) => HOST.test(h))) fail('"marianne.hosts" must list host names (api.example.fr)')
  for (const link of m.links ?? []) if (!/^https:\/\/[^/]+\//.test(link)) fail(`link "${link}" must be an https:// prefix ending with a path`)
  for (const d of m.domains ?? []) if (!(DOMAIN_IDS as readonly string[]).includes(d)) fail(`unknown domain "${d}"`)
  const permissions = m.permissions ?? { profile: [], purpose: '' }
  for (const f of permissions.profile ?? []) if (!(f in PROFILE_FIELDS)) fail(`unknown profile field "${f}"`)
  if (permissions.profile?.length && !permissions.purpose?.trim()) fail('"marianne.permissions.purpose" must say what the profile fields are for')
  const author = typeof p.author === 'string' ? p.author : (p.author?.name ?? '')
  return {
    id: code,
    package: p.name as string,
    version: p.version as string,
    author,
    name: m.name as string,
    description: m.description as string,
    category: m.category as ServiceCategory,
    keywords: m.keywords ?? [],
    connections: m.connections ?? [],
    hosts: m.hosts as string[],
    links: m.links ?? [],
    domains: m.domains ?? [],
    permissions: { profile: permissions.profile ?? [], purpose: permissions.purpose ?? '' }
  }
}

/** The département of a commune from its INSEE code: "33063" → "33", "97411" → "974", "2A004" → "2A". */
export const departmentOf = (insee: string) => (/^97/.test(insee) ? insee.slice(0, 3) : insee.slice(0, 2))

/** "METEO": what follows 3615. */
export const serviceCode = (m: Pick<ServiceManifest, 'id'>) => m.id.toUpperCase()

/** Whether a service may reach a URL: https, on one of its declared hosts. */
export function allowedUrl(m: Pick<ServiceManifest, 'hosts'>, url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && m.hosts.includes(u.hostname)
  } catch {
    return false
  }
}

/**
 * The methods a service's view may call, as the service declares them, e.g.
 * `{ forecast(commune: string): Forecast }`. Arguments and results cross processes: plain data only.
 */
export type ServiceMethods = Record<string, (...args: any[]) => unknown> // eslint-disable-line @typescript-eslint/no-explicit-any

/** The main-side implementation of those methods: each may answer later. */
export type ServiceImpl<M extends ServiceMethods> = {
  [K in keyof M]: (...args: Parameters<M[K]>) => Awaited<ReturnType<M[K]>> | Promise<Awaited<ReturnType<M[K]>>>
}

/** Progress of a service's background sync. */
export interface SyncProgress {
  phase: 'download' | 'index'
  done: number
  total: number
  /** What is being downloaded or indexed, in French ("les scrutins"). */
  label?: string
}

export interface SyncStatus {
  syncedAt?: string
  /** What the last sync holds ("577 députés, 5 210 scrutins"). */
  summary?: string
  running?: SyncProgress
  error?: string
}

/** A service as the user has it. */
export interface ServiceState {
  manifest: ServiceManifest
  /** Its connections are on. */
  available: boolean
  /** Available, and not switched off by the user. */
  on: boolean
  starred: boolean
  /** Its engine tools, as the conversation names them. */
  tools: Array<{ name: string; label: string }>
  /** Services with offline data. */
  sync?: SyncStatus
  /** It failed to start: why (it stays off). */
  error?: string
  /** The profile fields it asks for, and the ones the user granted; null: not asked yet. */
  access: { asked: ProfileField[]; granted: ProfileField[] | null }
}

export type Urgency = 'none' | 'soon' | 'urgent'

/** A service's line on a domain's dashboard: data, which Marianne lays out the same for every service. */
export interface ServiceSummary {
  /** French, one line: "1 trajet à payer avant le 30/10". */
  text: string
  detail?: string
  urgency: Urgency
  /** What opening the service from this line shows. */
  params?: Record<string, string | number>
}

/** A deadline a service knows of (a toll to pay): it joins the user's deadlines and reminders. */
export interface ServiceDeadline {
  /** Stable within the service. */
  id: string
  domain: DomainId
  /** French. */
  title: string
  /** ISO date or date and time. */
  due: string
  detail?: string
  params?: Record<string, string | number>
}

/**
 * A line of "Aujourd'hui" on the Actualités page that a service contributes: a sitting of the
 * Assemblée, a weather alert… Opening it opens the service with `params`.
 */
export interface TodayItem {
  id: string
  title: string
  detail?: string
  /** ISO; a date alone (YYYY-MM-DD) for whole days. */
  start: string
  end?: string
  place?: string
  url?: string
  /** Happening now (a broadcast). */
  live?: boolean
  cancelled?: boolean
  /** Who says so, in French ("Assemblée nationale"). */
  source: string
  params?: Record<string, string | number>
}

/** Lowercase, without accents: "Météo" and "METEO" both find "meteo". */
export const foldText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Whether a search finds the service: its code, its name, its description, its keywords. */
export function serviceMatches(m: ServiceManifest, query: string): boolean {
  const q = foldText(query.trim())
  if (!q) return true
  return [m.id, m.name, m.description, ...m.keywords].some((s) => foldText(s).includes(q))
}

/** Starred first, then by category in page order, then by name. */
export function sortServices<T extends Pick<ServiceState, 'manifest' | 'starred'>>(list: T[]): T[] {
  const rank = (c: ServiceCategory) => SERVICE_CATEGORIES.findIndex((x) => x.id === c)
  return [...list].sort(
    (a, b) =>
      Number(b.starred) - Number(a.starred) || rank(a.manifest.category) - rank(b.manifest.category) || a.manifest.name.localeCompare(b.manifest.name, 'fr')
  )
}

/** French number formatting: 68 373 433. */
export const formatNumber = (n: number, digits = 0) => n.toLocaleString('fr-FR', { maximumFractionDigits: digits })
