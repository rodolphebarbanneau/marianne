/**
 * @marianne/sdk: the contract between Marianne and its services, the apps of the Services page
 * (the 3615 codes: 3615 METEO, 3615 PARLEMENT…). A service is a package of its own, which
 * depends on this SDK and on nothing of the app:
 *
 * - package.json: its manifest, in the `marianne` field (see ServicePackage);
 * - main: its main-process side, built with @marianne/sdk/main (methods, engine tools, skills…);
 * - sync: optionally, the background job that keeps its offline data, with @marianne/sdk/sync;
 * - view: its screen, built with @marianne/sdk/view.
 *
 * Its tests get the context Marianne would give its main side from @marianne/sdk/testing.
 *
 * This entry point is what both sides share: the manifest, its categories, the palette its icon
 * and its tile's pictures are drawn with, the tile, and plain helpers. See docs/services.md.
 */

import { ICON_SIZE, pictureProblems, type PixelArt } from './palette'

export * from './news'
export * from './palette'
export * from './tile'

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
  'vehicles.critair': 'la vignette Crit’Air de vos véhicules',
  'opinions.leaning': 'votre sensibilité politique (les groupes dont vous vous sentez proche)',
  'opinions.themes': 'les thèmes qui comptent pour vous',
  'opinions.sources': 'vos sources d’information (celles que vous acceptez)'
} as const
export type ProfileField = keyof typeof PROFILE_FIELDS

/** The same fields in a few words, for a list of what a service reads (« lit : vos plaques, thèmes »). */
export const PROFILE_FIELD_SHORT: Record<ProfileField, string> = {
  'vehicles.plate': 'vos plaques',
  'vehicles.model': 'vos modèles de véhicule',
  'vehicles.firstRegistration': 'vos dates d’immatriculation',
  'vehicles.lastInspection': 'vos contrôles techniques',
  'vehicles.critair': 'vos vignettes Crit’Air',
  'opinions.leaning': 'sensibilité',
  'opinions.themes': 'thèmes',
  'opinions.sources': 'sources'
}

/**
 * The political groups the user said they feel close to, by the acronym each chamber gives them
 * ("EcoS" at the Assemblée, "GEST" at the Sénat): optional, never inferred, a sensitive datum
 * (GDPR, article 9) a service reads only when the user lets it.
 */
export interface Leaning {
  assembly: string[]
  senate: string[]
}

/**
 * The themes the user may say matter to them: they bring forward what is about them (ballots,
 * videos, headlines), without saying anything of an opinion. `words`: what a title about it holds
 * (lowercase, accents aside; a word's start).
 */
export const THEMES = [
  {
    id: 'ecology',
    label: 'écologie',
    words: ['ecolog', 'climat', 'environnement', 'biodiversite', 'pollution', 'carbone', 'energie', 'renouvelable', 'nucleaire']
  },
  {
    id: 'purchasing-power',
    label: 'pouvoir d’achat',
    words: ['pouvoir d', 'salaire', 'smic', 'prix', 'inflation', 'tva', 'carburant', 'consommat', 'remuneration']
  },
  { id: 'health', label: 'santé', words: ['sante', 'hopita', 'medic', 'soins', 'urgences', 'securite sociale', 'assurance maladie', 'pharmac', 'plfss'] },
  { id: 'housing', label: 'logement', words: ['logement', 'loyer', 'locati', 'immobilier', 'hlm', 'habitat', 'propriet'] },
  { id: 'pensions', label: 'retraites', words: ['retraite', 'pension', 'vieillesse', 'age de depart'] },
  { id: 'security', label: 'sécurité', words: ['securite interieure', 'police', 'gendarmerie', 'delinquan', 'terroris', 'violence', 'penal', 'prison'] },
  { id: 'school', label: 'école', words: ['ecole', 'education', 'enseignant', 'eleve', 'scolaire', 'lycee', 'college', 'universit', 'etudiant'] },
  { id: 'agriculture', label: 'agriculture', words: ['agricol', 'agricult', 'paysan', 'eleveur', 'elevage', 'alimentation', 'peche', 'foret'] },
  { id: 'europe', label: 'Europe', words: ['europe', 'union europeenne', 'bruxelles', 'commission europeenne'] },
  { id: 'digital', label: 'numérique', words: ['numerique', 'internet', 'reseaux sociaux', 'donnees', 'intelligence artificielle', 'cyber', 'plateforme'] }
] as const

export type ThemeId = (typeof THEMES)[number]['id']

/** The themes a text is about (its title…), among those given. */
export function themesOf(text: string, themes: readonly string[] = THEMES.map((t) => t.id)): ThemeId[] {
  const folded = ` ${foldText(text).replace(/[’']/g, "'")}`
  return THEMES.filter((t) => themes.includes(t.id) && t.words.some((w) => folded.includes(` ${w}`) || folded.includes(`'${w}`))).map((t) => t.id)
}

/** A service's code: lowercase letters and digits, no accents ("meteo" is 3615 METEO). */
export const SERVICE_CODE = /^[a-z0-9]+$/

/** Service packages are named after their code: @marianne/service-meteo. */
export const SERVICE_PACKAGE_PREFIX = '@marianne/service-'

/**
 * A tab of a service's screen, as its manifest declares it: Marianne draws the bar (under the 3615
 * header, fixed while the content scrolls), gives each tab its function key (F2, F3…: F1 is GUIDE)
 * and tells the view which one is shown (`useTab`). `label`: French, lowercase, a word or two.
 */
export interface ServiceTab {
  /** Lowercase letters, digits and hyphens: "home", "ballots". */
  id: string
  label: string
}

/** At most this many tabs: F2 to F9. One tab, or none, and the screen has no bar. */
export const MAX_TABS = 8

/** The function key of a service's tab, by its place: F2 for the first (F1 is GUIDE). */
export const tabKey = (index: number) => `F${index + 2}`

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
  /** The tabs of its screen, in their order; none (or one) for a screen of one page. */
  tabs?: ServiceTab[]
  /** Its icon: 8 × 8 pixels in the palette (see palette.ts). Without one, Marianne draws a neutral frame. */
  icon?: PixelArt
  /**
   * The tools it lends the engines, as its main side defines them ({ name, label }): Marianne
   * shows them before the user adds it. A community service may lend no other.
   */
  tools?: Array<{ name: string; label: string }>
  /** The screen's search field, drawn by Marianne in its header (`useSearch`): its placeholder, in French. */
  search?: { placeholder: string }
  /** It reads headlines through Marianne (ctx.news): no press host to declare. Built-in services only. */
  news?: boolean
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
  tabs: ServiceTab[]
  /** Its icon, checked; null: none. */
  icon: PixelArt | null
  /** The tools it declares (see ServiceDeclaration.tools). */
  tools: Array<{ name: string; label: string }>
  /** Its screen's search field (see ServiceDeclaration.search); null: none. */
  search: { placeholder: string } | null
  /** It reads headlines through Marianne (ctx.news). */
  news: boolean
}

export class ManifestError extends Error {
  override name = 'ManifestError'
}

/** How long a manifest's words may be: they show in Marianne's lists, and go to the engines. */
export const MANIFEST_LIMITS = { name: 60, description: 200, label: 48, keyword: 40, purpose: 200 } as const

const code = (n: number) => String.fromCharCode(n)
/** Control characters and line separators: a manifest's words are single lines. */
const NOT_A_LINE = new RegExp(`[${code(0)}-${code(0x1f)}${code(0x7f)}${code(0x2028)}${code(0x2029)}]`)
/** One line of text, not empty, within `max` characters. */
const isLine = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max && !NOT_A_LINE.test(v)

const HOST = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/
const TAB_ID = /^[a-z][a-z0-9-]*$/
/** A tool's name within its service: engines see it as "<code>_<name>". */
export const TOOL_NAME = /^[a-z][a-z0-9_]*$/
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
  for (const key of ['name', 'description'] as const) {
    if (typeof m[key] !== 'string' || !m[key]?.trim()) fail(`"marianne.${key}" is missing`)
    if (!isLine(m[key], MANIFEST_LIMITS[key])) fail(`"marianne.${key}" must be one line of at most ${MANIFEST_LIMITS[key]} characters`)
  }
  if (!SERVICE_CATEGORIES.some((c) => c.id === m.category)) fail(`unknown category "${m.category}"`)
  for (const key of ['keywords', 'connections', 'links'] as const)
    if (m[key] !== undefined && !isStrings(m[key])) fail(`"marianne.${key}" must be a list of strings`)
  for (const k of m.keywords ?? [])
    if (!isLine(k, MANIFEST_LIMITS.keyword)) fail(`keyword "${String(k).slice(0, 40)}" must be one line of at most ${MANIFEST_LIMITS.keyword} characters`)
  if (!isStrings(m.hosts) || !m.hosts.every((h) => HOST.test(h))) fail('"marianne.hosts" must list host names (api.example.fr)')
  for (const link of m.links ?? []) if (!/^https:\/\/[^/]+\//.test(link)) fail(`link "${link}" must be an https:// prefix ending with a path`)
  for (const d of m.domains ?? []) if (!(DOMAIN_IDS as readonly string[]).includes(d)) fail(`unknown domain "${d}"`)
  const permissions = m.permissions ?? { profile: [], purpose: '' }
  // Its own keys only: `in` would take `constructor` or `__proto__` for a field.
  for (const f of permissions.profile ?? []) if (typeof f !== 'string' || !Object.hasOwn(PROFILE_FIELDS, f)) fail(`unknown profile field "${String(f)}"`)
  if (permissions.profile?.length && !permissions.purpose?.trim()) fail('"marianne.permissions.purpose" must say what the profile fields are for')
  if (permissions.purpose && !isLine(permissions.purpose, MANIFEST_LIMITS.purpose))
    fail(`"marianne.permissions.purpose" must be one line of at most ${MANIFEST_LIMITS.purpose} characters`)
  const tabs = m.tabs ?? []
  if (!Array.isArray(tabs) || tabs.length > MAX_TABS) fail(`"marianne.tabs" must list at most ${MAX_TABS} tabs`)
  for (const t of tabs) {
    if (typeof t?.id !== 'string' || !TAB_ID.test(t.id)) fail(`tab "${String(t?.id)}": its id must be lowercase letters, digits and hyphens`)
    if (typeof t.label !== 'string' || !t.label.trim()) fail(`tab "${t.id}" has no label`)
    if (!isLine(t.label, MANIFEST_LIMITS.label)) fail(`tab "${t.id}": its label must be one line of at most ${MANIFEST_LIMITS.label} characters`)
  }
  if (new Set(tabs.map((t) => t.id)).size !== tabs.length) fail('two tabs have the same id')
  if (m.icon !== undefined) {
    const wrong = pictureProblems(m.icon, { width: ICON_SIZE, height: ICON_SIZE, exact: true })
    if (wrong.length) fail(`"marianne.icon": ${wrong.join('; ')}`)
  }
  const tools = m.tools ?? []
  if (!Array.isArray(tools)) fail('"marianne.tools" must list { name, label }')
  for (const t of tools) {
    if (typeof t?.name !== 'string' || !TOOL_NAME.test(t.name)) fail(`tool "${String(t?.name)}": its name must be lowercase letters, digits and underscores`)
    if (typeof t.label !== 'string' || !t.label.trim()) fail(`tool "${t.name}" has no label`)
    if (!isLine(t.label, MANIFEST_LIMITS.label)) fail(`tool "${t.name}": its label must be one line of at most ${MANIFEST_LIMITS.label} characters`)
  }
  if (new Set(tools.map((t) => t.name)).size !== tools.length) fail('two tools have the same name')
  if (m.search !== undefined && (typeof m.search !== 'object' || m.search === null || !isLine(m.search.placeholder, MANIFEST_LIMITS.label)))
    fail(`"marianne.search" must be { "placeholder": one line of at most ${MANIFEST_LIMITS.label} characters }`)
  if (m.news !== undefined && typeof m.news !== 'boolean') fail('"marianne.news" must be true or false')
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
    permissions: { profile: permissions.profile ?? [], purpose: permissions.purpose ?? '' },
    tabs: tabs.map((t) => ({ id: t.id, label: t.label.trim() })),
    icon: m.icon ? { palette: { ...m.icon.palette }, pixels: [...m.icon.pixels] } : null,
    tools: tools.map((t) => ({ name: t.name, label: t.label.trim() })),
    search: m.search ? { placeholder: m.search.placeholder.trim() } : null,
    news: m.news === true
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

/**
 * A community service's standing, by the community catalogue: validated (this exact version was
 * reviewed, and the project signed it), unvalidated (published, its author known, not reviewed),
 * outside (a file the catalogue doesn't list: one's own service, a test), withdrawn (the project
 * took back the validation of this version: it is switched off).
 */
export type ServiceTrust = 'validated' | 'unvalidated' | 'outside' | 'withdrawn'

/** A service as the user has it. */
export interface ServiceState {
  manifest: ServiceManifest
  /** Its connections are on. */
  available: boolean
  /** Available, and not switched off by the user. */
  on: boolean
  /** Among the user's services (« mes services »); false: offered in « découvrir », not added yet. */
  added: boolean
  /** Pinned as a tile on the Services page (the order is the settings' `services.pinned`). */
  pinned: boolean
  /** When the user last opened its screen (ISO); absent: never. */
  openedAt?: string
  /** Its engine tools, as the conversation names them. */
  tools: Array<{ name: string; label: string }>
  /** Services with offline data. */
  sync?: SyncStatus
  /** It failed to start: why (it stays off). */
  error?: string
  /** Built into Marianne; false: published by the community. */
  builtIn: boolean
  /** A community service's standing, by the catalogue (see ServiceTrust); none for a built-in service. */
  trust?: ServiceTrust
  /**
   * A community service another account updated on this computer: the version this account
   * reviewed. It stays off until this account reviews the one now here.
   */
  reviewedVersion?: string
  /** The profile fields it asks for, and the ones the user granted (null: not asked yet); the day it last read the user's opinions. */
  access: { asked: ProfileField[]; granted: ProfileField[] | null; readAt?: string }
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

/** How often something comes back: every `n` days, weeks, months or years. */
export interface TaskEvery {
  unit: 'day' | 'week' | 'month' | 'year'
  n: number
}

/** A rhythm a service offers for a task: what the user chooses from. */
export interface ServiceTaskRhythm {
  every: TaskEvery
  /** French, lowercase: "tous les 2 jours". */
  label: string
  /** French, one line: what this rhythm means here. */
  note?: string
  /** The note warns: too spaced for what the task is for. */
  warn?: boolean
}

/**
 * A planned task a service proposes, for what it covers (a vehicle): data, which Marianne lays out
 * on the sheet the user reads before saying yes. A service proposes and never schedules: nothing
 * runs without that yes, and a task can only look and report.
 */
export interface ServiceTaskTemplate {
  /** Stable within the service, for one entity: "tolls:<vehicle id>". */
  id: string
  domain: DomainId
  /** French, short: "Péages en flux libre". */
  title: string
  /** French: what it checks, "les passages en flux libre non payés". */
  checks: string
  /** French, one line: where. */
  detail?: string
  /** What it is about: an entity's id and how the user knows it. */
  entity?: { id: string; label: string }
  /** The rhythms offered, the usual one at `rhythm`. */
  rhythms: ServiceTaskRhythm[]
  rhythm: number
  /** French, one line each: what Marianne may do at each run. */
  allows: string[]
  /** French: what she will never do. */
  never: string
  /** French, short: what an entity's card says while the task isn't planned, "péages non vérifiés". */
  unplanned?: string
  /** What Marianne is asked at each run, in English. */
  instruction: string
  /** The hosts she may open at each run without asking again, for this task only. */
  sites: string[]
}

/**
 * A line of "Aujourd'hui" a service contributes (read by no screen yet; the day's agenda, 3615
 * CALENDRIER, will): a sitting of the Assemblée, a weather alert… Opening it opens the service
 * with `params`.
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

/** Pinned first, then by category in page order, then by name. */
export function sortServices<T extends Pick<ServiceState, 'manifest' | 'pinned'>>(list: T[]): T[] {
  const rank = (c: ServiceCategory) => SERVICE_CATEGORIES.findIndex((x) => x.id === c)
  return [...list].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || rank(a.manifest.category) - rank(b.manifest.category) || a.manifest.name.localeCompare(b.manifest.name, 'fr')
  )
}

/** French number formatting: 68 373 433. */
export const formatNumber = (n: number, digits = 0) => n.toLocaleString('fr-FR', { maximumFractionDigits: digits })
