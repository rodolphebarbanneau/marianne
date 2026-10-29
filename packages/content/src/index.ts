import { DOMAIN_IDS, SERVICE_CODE } from '@marianne/sdk'
import type { DomainId } from '@marianne/sdk'

/**
 * @marianne/content: what Marianne knows that anyone may improve, through review: the engines'
 * skills, the guided démarches (procedures), the official calendar, the public-sites catalog, the
 * news sources and the parliamentary groups. Skills go into the engines' instructions and démarches are legal guidance, so
 * every change is reviewed, every source is official, and the app only takes a bundle the project
 * signed.
 *
 * The app ships this content built in (`@marianne/content/files`), and replaces it with a newer
 * signed bundle published between releases. This module is pure (no file system, no network):
 * the formats, their parser and validator, and the bundle's text. See docs/content.md.
 */

// ---------------------------------------------------------------- official sites

/**
 * Official domains besides gouv.fr: a host is official when it is under gouv.fr, or is one of
 * these or under one (www.ameli.fr). Social security bodies, institutions, and the public
 * services whose sites are outside gouv.fr.
 */
export const OFFICIAL_DOMAINS: readonly string[] = [
  'agirc-arrco.fr',
  'ameli.fr',
  'anil.org',
  'assemblee-nationale.fr',
  'caf.fr',
  'cnil.fr',
  'cnsa.fr',
  'conseil-constitutionnel.fr',
  'conseil-etat.fr',
  'courdecassation.fr',
  'defenseurdesdroits.fr',
  'demarches-simplifiees.fr',
  'francetravail.fr',
  'info-retraite.fr',
  'inpi.fr',
  'insee.fr',
  'justice.fr',
  'lassuranceretraite.fr',
  'monespacesante.fr',
  'msa.fr',
  'senat.fr',
  'service-public.fr',
  'telerecours.fr',
  'urssaf.fr',
  'vie-publique.fr'
]

/** A Service-Public document: F (sheet), N (topic) or R (form, online service…), then digits. */
export const SHEET_ID = /^[FNR]\d+$/

export function officialHost(host: string): boolean {
  const h = host.toLowerCase()
  return h.endsWith('.gouv.fr') || OFFICIAL_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`))
}

/** What keeps a URL out of the content, or null: https, and on an official site unless `anyHost`. */
export function urlProblem(url: string, anyHost = false): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return `"${url}" is not a URL`
  }
  if (u.protocol !== 'https:') return `"${url}" is not https`
  if (u.username || u.password) return `"${url}" carries credentials`
  if (!anyHost && !officialHost(u.hostname)) return `"${url}" is not on an official site (gouv.fr, or a domain of OFFICIAL_DOMAINS)`
  return null
}

// ---------------------------------------------------------------- formats

/** What every skill and procedure says of itself, in its front matter. */
export interface ContentMeta {
  /** What it is based on: Service-Public ids (F18509) or official https URLs; at least one. */
  sources: string[]
  /** The day of its last change (YYYY-MM-DD). */
  updated: string
  /** Who maintains it: "marianne" for the project's own, or a contributor's GitHub handle. */
  owner: string
  /** The day a reviewer checked it against its sources (YYYY-MM-DD); absent until one has. */
  verified?: string
}

/** A method guide the engines read before handling a kind of request. */
export interface Skill extends ContentMeta {
  name: string
  title: string
  description: string
  /** Markdown, in French. */
  body: string
}

export const PROCEDURE_ACTION_KINDS = ['open', 'setup', 'document', 'ask', 'sheet', 'service'] as const
/**
 * open: a site of the catalog (its id) or an https page · setup: a setting to fill in ("address",
 * "account:caf"…) · document: a pièce to add, by type · ask: a question for Marianne · sheet: a
 * Service-Public document · service: a 3615 service, by its code.
 */
export type ProcedureActionKind = (typeof PROCEDURE_ACTION_KINDS)[number]

export interface ProcedureAction {
  kind: ProcedureActionKind
  target: string
  label: string
}

export interface ProcedureStep {
  title: string
  /** Markdown. */
  body: string
  actions: ProcedureAction[]
}

/** A guided démarche: a formality, step by step. */
export interface Procedure extends ContentMeta {
  id: string
  domain: DomainId
  title: string
  description: string
  when: string
  duration: string
  /** What to have at hand. */
  documents: string[]
  steps: ProcedureStep[]
}

export const CALENDAR_APPLIES = ['always', 'owner', 'company'] as const

/** A date of the official calendar: it comes back every year and can't be computed. */
export interface CalendarItem {
  id: string
  domain: DomainId
  title: string
  /** MM-DD, every year. */
  monthDay: string
  /** always · owner (owns a property) · company (has a company subject to it) */
  applies: (typeof CALENDAR_APPLIES)[number]
  /** The administration confirms the date each year. */
  indicative?: boolean
  /** Where to act: a site of the catalog. */
  site?: string
  /** A guided démarche for it. */
  procedure?: string
  /** An official page that gives the date. */
  source?: string
}

export const LOGIN_KINDS = ['franceconnect', 'account', 'none'] as const
/** franceconnect: through FranceConnect · account: the site's own account · none: no sign-in. */
export type LoginKind = (typeof LOGIN_KINDS)[number]

/** An identifier a site needs, kept in the profile (and reached by the engines as [[key]]). */
export interface SiteField {
  key: string
  label: string
  hint?: string
  /** Regular expression the value must match (without spaces). */
  pattern?: string
}

/** A public-service website, and how one signs in. */
export interface Site {
  id: string
  name: string
  url: string
  domain: DomainId
  description: string
  login: LoginKind
  fields?: SiteField[]
  /** The site identifies you by your social security number. */
  needsNir?: boolean
}

export const NEWS_GROUPS = ['national', 'regional', 'broadcast', 'factcheck'] as const
export type NewsGroup = (typeof NEWS_GROUPS)[number]

/** A news source of Actualités: its public feed (RSS 2.0 or Atom). */
export interface NewsSource {
  id: string
  name: string
  group: NewsGroup
  feed: string
  homepage: string
}

/** The two chambers of the Parlement: the Assemblée nationale and the Sénat. */
export const CHAMBERS = ['an', 'se'] as const
export type ChamberId = (typeof CHAMBERS)[number]

/**
 * A political group of either chamber, for the leaning a user may declare (Réglages › Identité):
 * its acronym as the chamber's open data writes it, its colour, and for a group of the Assemblée,
 * the Sénat group of its political family, proposed when the user picks it.
 */
export interface ParliamentGroup {
  chamber: ChamberId
  acronym: string
  name: string
  color: string
  /** The acronym of the Sénat group of its family (Assemblée groups only); none when there isn't one. */
  senate?: string
}

/** The whole content, read and checked. */
export interface ContentSet {
  /** The day of its latest change: the most recent `updated` of its files (YYYY-MM-DD). */
  updated: string
  /** By name. */
  skills: Skill[]
  /** By title. */
  procedures: Procedure[]
  calendar: CalendarItem[]
  /** In the catalog's order. */
  sites: Site[]
  newsSources: NewsSource[]
  /** Each chamber's groups, from left to right in its hemicycle. */
  parliament: ParliamentGroup[]
}

/** The content's files besides skills/<name>.md and procedures/<domain>/<id>.md. */
export const CONTENT_FILES = ['calendar.json', 'sites.json', 'news-sources.json', 'parliament.json'] as const

/** Content that can't be used: every problem found, as "file: field: what is wrong". */
export class ContentError extends Error {
  override name = 'ContentError'
  readonly problems: string[]

  constructor(problems: string[]) {
    super(`${problems.length} problem${problems.length > 1 ? 's' : ''} in the content:\n${problems.map((p) => `- ${p}`).join('\n')}`)
    this.problems = problems
  }
}

// ---------------------------------------------------------------- front matter

export interface FrontMatter {
  meta: Record<string, string>
  body: string
  /** Lines that aren't `key: value`, keys given twice. */
  errors: string[]
}

/** `---`, one `key: value` per line, `---`, then the body; null without front matter. Line endings become LF. */
export function splitFrontMatter(text: string): FrontMatter | null {
  const t = text.replace(/\r\n?/g, '\n')
  const m = t.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
  if (!m) return null
  const meta = new Map<string, string>()
  const errors: string[] = []
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (!kv) {
      errors.push(`"${line}" is not "key: value"`)
      continue
    }
    if (meta.has(kv[1])) errors.push(`${kv[1]}: given twice`)
    meta.set(kv[1], kv[2].trim())
  }
  return { meta: Object.fromEntries(meta), body: t.slice(m[0].length), errors }
}

// ---------------------------------------------------------------- checks

type Report = (field: string, message: string) => void
type Json = Record<string, unknown>

const reporter =
  (problems: string[], file: string): Report =>
  (field, message) =>
    problems.push(`${file}: ${field ? `${field}: ` : ''}${message}`)

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/
const FIELD_KEY = /^[a-z][a-z0-9_]*$/
const SETUP_TARGET = /^[a-z_]+(?::[a-z0-9-]+)?$/
const DOCUMENT_TYPE = /^[a-z_]+$/
const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>()[\]"'`]+/gi

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const list = (value: string | undefined) =>
  (value ?? '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
const twice = (values: string[]) => [...new Set(values.filter((v, i) => values.indexOf(v) !== i))]

function validDate(s: string): boolean {
  const t = Date.parse(`${s}T00:00:00Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s
}

function unknownKeys(o: object, allowed: readonly string[], report: Report, prefix = ''): void {
  for (const key of Object.keys(o)) if (!allowed.includes(key)) report(`${prefix}${key}`, `unknown key (expected: ${allowed.join(', ')})`)
}

/** Every web address of a Markdown text: https, on an official site. */
function checkLinks(markdown: string, field: string, report: Report): void {
  for (const m of markdown.matchAll(URL_IN_TEXT)) {
    const problem = urlProblem(m[0].replace(/[.,;:!?»]+$/, ''))
    if (problem) report(field, problem)
  }
}

/** A front matter value, written as is (no quotes). */
function value(meta: Record<string, string>, key: string, report: Report, required = true): string {
  const v = meta[key] ?? ''
  if (required && !v) report(key, 'required')
  if (/^(["']).*\1$/.test(v)) report(key, 'write the value without quotes')
  return v
}

function readMeta(meta: Record<string, string>, report: Report): ContentMeta {
  const sources = list(meta.sources)
  if (!sources.length) report('sources', 'at least one is required: a Service-Public id (F18509) or an official https URL')
  for (const s of sources) {
    const problem = SHEET_ID.test(s) ? null : /^[a-z]+:/i.test(s) ? urlProblem(s) : `"${s}" is neither a Service-Public id (F18509) nor a URL`
    if (problem) report('sources', problem)
  }
  for (const s of twice(sources)) report('sources', `"${s}" is listed twice`)
  const updated = meta.updated ?? ''
  if (!validDate(updated)) report('updated', updated ? `"${updated}" is not a date (YYYY-MM-DD)` : 'required: the day of the last change (YYYY-MM-DD)')
  const owner = meta.owner ?? ''
  if (!OWNER.test(owner)) report('owner', owner ? `"${owner}" is not a name (marianne, or a GitHub handle)` : 'required: marianne, or a GitHub handle')
  const verified = meta.verified
  if (verified !== undefined && !validDate(verified)) report('verified', `"${verified}" is not a date (YYYY-MM-DD)`)
  return { sources, updated, owner, ...(verified !== undefined ? { verified } : {}) }
}

/** The front matter of a skill or a démarche, with its malformed lines and unknown keys reported. */
function frontMatterOf(text: string, allowed: readonly string[], report: Report): FrontMatter | null {
  const fm = splitFrontMatter(text)
  if (!fm) {
    report('', 'no front matter: the file starts with ---, then a "key: value" per line, then ---')
    return null
  }
  for (const e of fm.errors) report('front matter', e)
  unknownKeys(fm.meta, allowed, report)
  return fm
}

// ---------------------------------------------------------------- skills

const SKILL_KEYS = ['name', 'title', 'description', 'sources', 'updated', 'owner', 'verified'] as const

function readSkill(name: string, text: string, report: Report): Skill | null {
  const fm = frontMatterOf(text, SKILL_KEYS, report)
  if (!fm) return null
  if (fm.meta.name !== name) report('name', `must be the file's name, "${name}"`)
  const title = value(fm.meta, 'title', report)
  const description = value(fm.meta, 'description', report)
  const meta = readMeta(fm.meta, report)
  const body = fm.body.trim()
  if (!body) report('body', 'empty')
  checkLinks(body, 'body', report)
  return { name, title, description, ...meta, body }
}

// ---------------------------------------------------------------- procedures

const PROCEDURE_KEYS = ['id', 'domain', 'title', 'description', 'when', 'duration', 'documents', 'sources', 'updated', 'owner', 'verified'] as const

/** `> kind: target | label`; not a link quoted alone (`> https://…`). */
const ACTION = /^>\s*([a-z]+):(?!\/\/)\s*(.*)$/

/** What is wrong with an action's target, or null. Sites are checked once the catalog is read. */
function targetProblem(kind: ProcedureActionKind, target: string): string | null {
  if (!target) return 'no target'
  switch (kind) {
    case 'open':
      return /^[a-z]+:/i.test(target) ? urlProblem(target) : SLUG.test(target) ? null : `"${target}" is neither a site id nor an https URL`
    case 'setup':
      return SETUP_TARGET.test(target) ? null : `"${target}" is not a setting ("address", "account:<site id>"…)`
    case 'document':
      return DOCUMENT_TYPE.test(target) ? null : `"${target}" is not a document type (tax_notice, letter…)`
    case 'sheet':
      return SHEET_ID.test(target) ? null : `"${target}" is not a Service-Public id (F18509)`
    case 'service':
      return SERVICE_CODE.test(target) ? null : `"${target}" is not a service code (lowercase letters and digits)`
    case 'ask':
      return null
  }
}

function readStep(chunk: string, n: number, report: Report): ProcedureStep {
  const [first, ...rest] = chunk.split('\n')
  const title = first.trim()
  const field = `step ${n}${title ? ` "${title}"` : ''}`
  if (!title) report(field, 'no title')
  const actions: ProcedureAction[] = []
  const lines: string[] = []
  for (const line of rest) {
    const a = line.match(ACTION)
    if (!a) {
      lines.push(line)
      continue
    }
    const kind = a[1] as ProcedureActionKind
    if (!PROCEDURE_ACTION_KINDS.includes(kind)) {
      report(field, `unknown action "${a[1]}:" (expected: ${PROCEDURE_ACTION_KINDS.join(', ')})`)
      continue
    }
    const bar = a[2].indexOf('|')
    const target = (bar < 0 ? a[2] : a[2].slice(0, bar)).trim()
    const label = bar < 0 ? '' : a[2].slice(bar + 1).trim()
    if (!label) report(field, `${kind}: ${target}: no label (> ${kind}: target | label)`)
    const problem = targetProblem(kind, target)
    if (problem) report(field, `${kind}: ${problem}`)
    actions.push({ kind, target, label })
  }
  const body = lines.join('\n').trim()
  checkLinks(body, field, report)
  return { title, body, actions }
}

function readProcedure(domain: string, id: string, text: string, report: Report): Procedure | null {
  const fm = frontMatterOf(text, PROCEDURE_KEYS, report)
  if (!fm) return null
  if (fm.meta.id !== id) report('id', `must be the file's name, "${id}"`)
  if (fm.meta.domain !== domain) report('domain', `must be its folder's, "${domain}"`)
  const title = value(fm.meta, 'title', report)
  const description = value(fm.meta, 'description', report)
  const when = value(fm.meta, 'when', report, false)
  const duration = value(fm.meta, 'duration', report, false)
  const documents = list(fm.meta.documents)
  const meta = readMeta(fm.meta, report)
  const [intro, ...chunks] = fm.body.split(/^## /m)
  if (intro.trim()) report('body', 'text before the first step (## Title) is never shown')
  const steps = chunks.map((chunk, i) => readStep(chunk, i + 1, report))
  if (steps.length < 2) report('steps', 'a guided démarche has at least two steps (## Title)')
  return { id, domain: domain as DomainId, title, description, when, duration, documents, ...meta, steps }
}

// ---------------------------------------------------------------- catalogs (JSON)

function readJson(text: string, listKey: string, report: Report): { updated: string; entries: unknown[] } | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    report('', `not JSON: ${(err as Error).message}`)
    return null
  }
  if (!isObject(data)) {
    report('', `must be an object: { "updated", "note", "${listKey}" }`)
    return null
  }
  unknownKeys(data, ['updated', 'note', listKey], report)
  const updated = typeof data.updated === 'string' ? data.updated : ''
  if (!validDate(updated)) report('updated', updated ? `"${updated}" is not a date (YYYY-MM-DD)` : 'required: the day of the last change (YYYY-MM-DD)')
  if (data.note !== undefined && typeof data.note !== 'string') report('note', 'must be text')
  if (!Array.isArray(data[listKey])) {
    report(listKey, 'must be a list')
    return { updated, entries: [] }
  }
  return { updated, entries: data[listKey] }
}

type Check = (v: string) => string | null
const oneOf =
  (values: readonly string[]): Check =>
  (v) =>
    values.includes(v) ? null : `"${v}" is not one of ${values.join(', ')}`
const like =
  (pattern: RegExp, what: string): Check =>
  (v) =>
    pattern.test(v) ? null : `"${v}" is not ${what}`

/** The entries of a catalog, each checked for its keys; `where` names it in problems ("sites[4] (impots)"). */
function* entries(items: unknown[], name: string, keys: readonly string[], report: Report): Generator<{ o: Json; where: string }> {
  for (const [i, o] of items.entries()) {
    const where = `${name}[${i}]${isObject(o) && typeof o.id === 'string' ? ` (${o.id})` : ''}`
    if (!isObject(o)) {
      report(where, 'must be an object')
      continue
    }
    unknownKeys(o, keys, report, `${where}.`)
    yield { o, where }
  }
}

/** An entry's text field, checked. */
function field(o: Json, key: string, where: string, report: Report, check?: Check): string {
  const v = o[key]
  if (typeof v !== 'string' || !v.trim()) {
    report(`${where}.${key}`, v === undefined ? 'required' : 'must be text')
    return ''
  }
  const problem = check?.(v)
  if (problem) report(`${where}.${key}`, problem)
  return v
}

function optionalField(o: Json, key: string, where: string, report: Report, check?: Check): string | undefined {
  return o[key] === undefined ? undefined : field(o, key, where, report, check)
}

function optionalFlag(o: Json, key: string, where: string, report: Report): boolean | undefined {
  if (o[key] !== undefined && typeof o[key] !== 'boolean') report(`${where}.${key}`, 'must be true or false')
  return o[key] as boolean | undefined
}

function idsOnce(items: Array<{ id: string }>, name: string, report: Report): void {
  for (const id of twice(items.map((x) => x.id).filter(Boolean))) report(name, `id "${id}" is used twice`)
}

const SITE_KEYS = ['id', 'name', 'url', 'domain', 'login', 'description', 'fields', 'needsNir'] as const
const SITE_FIELD_KEYS = ['key', 'label', 'hint', 'pattern'] as const

function validPattern(v: string): string | null {
  try {
    new RegExp(v)
    return null
  } catch {
    return `"${v}" is not a regular expression`
  }
}

function readSites(file: string, report: Report): { updated: string; sites: Site[] } | null {
  const data = readJson(file, 'sites', report)
  if (!data) return null
  const sites: Site[] = []
  for (const { o, where } of entries(data.entries, 'sites', SITE_KEYS, report)) {
    const site: Site = {
      id: field(o, 'id', where, report, like(SLUG, 'lowercase words joined by hyphens')),
      name: field(o, 'name', where, report),
      url: field(o, 'url', where, report, (v) => urlProblem(v)),
      domain: field(o, 'domain', where, report, oneOf(DOMAIN_IDS)) as DomainId,
      login: field(o, 'login', where, report, oneOf(LOGIN_KINDS)) as LoginKind,
      description: field(o, 'description', where, report)
    }
    if (o.fields !== undefined) {
      if (!Array.isArray(o.fields)) report(`${where}.fields`, 'must be a list')
      else
        site.fields = [...entries(o.fields, `${where}.fields`, SITE_FIELD_KEYS, report)].map(({ o: f, where: at }) => {
          const key = field(f, 'key', at, report, like(FIELD_KEY, 'a key (lowercase letters, digits and _)'))
          const label = field(f, 'label', at, report)
          const hint = optionalField(f, 'hint', at, report)
          const pattern = optionalField(f, 'pattern', at, report, validPattern)
          return { key, label, ...(hint !== undefined ? { hint } : {}), ...(pattern !== undefined ? { pattern } : {}) }
        })
    }
    const needsNir = optionalFlag(o, 'needsNir', where, report)
    if (needsNir !== undefined) site.needsNir = needsNir
    sites.push(site)
  }
  idsOnce(sites, 'sites', report)
  // A field's key is the token of the identifier: one site only.
  for (const key of twice(sites.flatMap((s) => (s.fields ?? []).map((f) => f.key)).filter(Boolean))) report('sites', `field key "${key}" is used twice`)
  return { updated: data.updated, sites }
}

const NEWS_KEYS = ['id', 'name', 'group', 'feed', 'homepage'] as const

/** The press is not an official site: its addresses need only be https. */
function readNewsSources(file: string, report: Report): { updated: string; sources: NewsSource[] } | null {
  const data = readJson(file, 'sources', report)
  if (!data) return null
  const sources = [...entries(data.entries, 'sources', NEWS_KEYS, report)].map(({ o, where }): NewsSource => ({
    id: field(o, 'id', where, report, like(SLUG, 'lowercase words joined by hyphens')),
    name: field(o, 'name', where, report),
    group: field(o, 'group', where, report, oneOf(NEWS_GROUPS)) as NewsGroup,
    feed: field(o, 'feed', where, report, (v) => urlProblem(v, true)),
    homepage: field(o, 'homepage', where, report, (v) => urlProblem(v, true))
  }))
  idsOnce(sources, 'sources', report)
  return { updated: data.updated, sources }
}

const PARLIAMENT_KEYS = ['chamber', 'acronym', 'name', 'color', 'senate'] as const
/** As the profile keeps a leaning: letters, digits, spaces, dots, apostrophes and hyphens. */
const ACRONYM = /^[\p{L}\d .'-]{1,24}$/u
const COLOR = /^#[0-9a-f]{6}$/

function readParliament(file: string, report: Report): { updated: string; groups: ParliamentGroup[] } | null {
  const data = readJson(file, 'groups', report)
  if (!data) return null
  const groups: ParliamentGroup[] = []
  for (const { o, where } of entries(data.entries, 'groups', PARLIAMENT_KEYS, report)) {
    const chamber = field(o, 'chamber', where, report, oneOf(CHAMBERS)) as ChamberId
    const senate = optionalField(o, 'senate', where, report, () => (chamber === 'an' ? null : 'only a group of the Assemblée (an) has a Sénat counterpart'))
    groups.push({
      chamber,
      acronym: field(o, 'acronym', where, report, like(ACRONYM, 'an acronym (up to 24 letters, digits, spaces, dots, apostrophes or hyphens)')),
      name: field(o, 'name', where, report),
      color: field(o, 'color', where, report, like(COLOR, 'a colour (#rrggbb, lowercase)')),
      ...(senate !== undefined ? { senate } : {})
    })
  }
  for (const chamber of CHAMBERS)
    for (const acronym of twice(groups.filter((g) => g.chamber === chamber).map((g) => g.acronym)))
      report('groups', `"${acronym}" is listed twice in the same chamber`)
  const senate = new Set(groups.filter((g) => g.chamber === 'se').map((g) => g.acronym))
  for (const [i, g] of groups.entries())
    if (g.senate && !senate.has(g.senate)) report(`groups[${i}].senate`, `"${g.senate}" is not a group of the Sénat (se) in this file`)
  return { updated: data.updated, groups }
}

const CALENDAR_KEYS = ['id', 'domain', 'title', 'monthDay', 'applies', 'indicative', 'site', 'procedure', 'source'] as const

function readCalendar(file: string, sites: Set<string> | null, procedures: Set<string>, report: Report): { updated: string; items: CalendarItem[] } | null {
  const data = readJson(file, 'items', report)
  if (!data) return null
  const items: CalendarItem[] = []
  for (const { o, where } of entries(data.entries, 'items', CALENDAR_KEYS, report)) {
    const item: CalendarItem = {
      id: field(o, 'id', where, report, like(SLUG, 'lowercase words joined by hyphens')),
      domain: field(o, 'domain', where, report, oneOf(DOMAIN_IDS)) as DomainId,
      title: field(o, 'title', where, report),
      // Any day of a year, 02-29 included.
      monthDay: field(o, 'monthDay', where, report, (v) =>
        /^\d{2}-\d{2}$/.test(v) && validDate(`2024-${v}`) ? null : `"${v}" is not a day of the year (MM-DD)`
      ),
      applies: field(o, 'applies', where, report, oneOf(CALENDAR_APPLIES)) as CalendarItem['applies']
    }
    const indicative = optionalFlag(o, 'indicative', where, report)
    const site = optionalField(o, 'site', where, report, (v) => (!sites || sites.has(v) ? null : `"${v}" is not a site of sites.json`))
    const procedure = optionalField(o, 'procedure', where, report, (v) => (procedures.has(v) ? null : `"${v}" is not a guided démarche`))
    const source = optionalField(o, 'source', where, report, (v) => urlProblem(v))
    items.push({
      ...item,
      ...(indicative !== undefined ? { indicative } : {}),
      ...(site !== undefined ? { site } : {}),
      ...(procedure !== undefined ? { procedure } : {}),
      ...(source !== undefined ? { source } : {})
    })
  }
  idsOnce(items, 'items', report)
  return { updated: data.updated, items }
}

// ---------------------------------------------------------------- the content

/**
 * The content of a set of files, by their path in the package ("skills/benefits.md",
 * "procedures/taxes/declare-income.md", "calendar.json"…). Throws a ContentError that lists every
 * problem, each with its file and field: content is used whole or not at all.
 */
export function readContent(files: Record<string, string>): ContentSet {
  const problems: string[] = []
  const skills: Skill[] = []
  const procedures: Procedure[] = []
  const paths = Object.keys(files).sort()
  const known: readonly string[] = CONTENT_FILES

  const sites = files['sites.json'] === undefined ? null : readSites(files['sites.json'], reporter(problems, 'sites.json'))
  const siteIds = sites ? new Set(sites.sites.map((s) => s.id)) : null
  const news = files['news-sources.json'] === undefined ? null : readNewsSources(files['news-sources.json'], reporter(problems, 'news-sources.json'))
  const parliament = files['parliament.json'] === undefined ? null : readParliament(files['parliament.json'], reporter(problems, 'parliament.json'))

  for (const path of paths) {
    const report = reporter(problems, path)
    const skill = path.match(/^skills\/([^/]+)\.md$/)
    const procedure = path.match(/^procedures\/([^/]+)\/([^/]+)\.md$/)
    if (skill) {
      if (!SLUG.test(skill[1])) report('', `the file's name must be lowercase words joined by hyphens`)
      const s = readSkill(skill[1], files[path], report)
      if (s) skills.push(s)
    } else if (procedure) {
      if (!(DOMAIN_IDS as readonly string[]).includes(procedure[1])) report('', `"${procedure[1]}" is not a domain (${DOMAIN_IDS.join(', ')})`)
      if (!SLUG.test(procedure[2])) report('', `the file's name must be lowercase words joined by hyphens`)
      const p = readProcedure(procedure[1], procedure[2], files[path], report)
      if (p) procedures.push(p)
    } else if (!known.includes(path)) {
      report('', 'not a content file: skills/<name>.md, procedures/<domain>/<id>.md, calendar.json, sites.json, news-sources.json or parliament.json')
    }
  }
  for (const name of CONTENT_FILES) if (files[name] === undefined) problems.push(`${name}: missing`)

  // An id names one démarche, whatever its domain.
  for (const id of twice(procedures.map((p) => p.id))) problems.push(`procedures: id "${id}" is used by two démarches`)
  // Sites named by the démarches are in the catalog.
  if (siteIds)
    for (const p of procedures)
      for (const [i, step] of p.steps.entries())
        for (const a of step.actions) {
          const site = a.kind === 'open' && SLUG.test(a.target) ? a.target : a.kind === 'setup' && a.target.startsWith('account:') ? a.target.slice(8) : null
          if (site && !siteIds.has(site))
            problems.push(`procedures/${p.domain}/${p.id}.md: step ${i + 1} "${step.title}": ${a.kind}: "${site}" is not a site of sites.json`)
        }
  const calendar =
    files['calendar.json'] === undefined
      ? null
      : readCalendar(files['calendar.json'], siteIds, new Set(procedures.map((p) => p.id)), reporter(problems, 'calendar.json'))

  if (problems.length || !sites || !news || !calendar || !parliament) throw new ContentError(problems)
  const updated = [sites.updated, news.updated, calendar.updated, parliament.updated, ...skills.map((s) => s.updated), ...procedures.map((p) => p.updated)]
    .sort()
    .at(-1)!
  return {
    updated,
    skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
    procedures: procedures.sort((a, b) => a.title.localeCompare(b.title, 'fr')),
    calendar: calendar.items,
    sites: sites.sites,
    newsSources: news.sources,
    parliament: parliament.groups
  }
}

// ---------------------------------------------------------------- bundles

/** A bundle is published with each release as content.json, and its ed25519 signature as content.json.sig. */
export const BUNDLE_FILE = 'content.json'
export const SIGNATURE_FILE = 'content.json.sig'

export interface ContentBundle {
  /** When it was built: an ISO timestamp, UTC. */
  version: string
  /** Every file of the content, by its path in the package. */
  files: Record<string, string>
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
const validInstant = (s: string) => INSTANT.test(s) && !Number.isNaN(Date.parse(s))

/** A bundle's text: keys sorted and line endings LF, so that the same content gives the same bytes. */
export function writeBundle(files: Record<string, string>, version: string): string {
  if (!validInstant(version)) throw new ContentError([`${BUNDLE_FILE}: version: "${version}" is not an ISO timestamp (UTC)`])
  const sorted = Object.fromEntries(
    Object.keys(files)
      .sort()
      .map((path) => [path, files[path].replace(/\r\n?/g, '\n')])
  )
  return JSON.stringify({ files: sorted, version })
}

/** The bundle a text holds, or a ContentError; its files are then read with readContent. */
export function readBundle(text: string): ContentBundle {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new ContentError([`${BUNDLE_FILE}: not JSON: ${(err as Error).message}`])
  }
  if (!isObject(data)) throw new ContentError([`${BUNDLE_FILE}: must be an object: { "files", "version" }`])
  const problems: string[] = []
  const report = reporter(problems, BUNDLE_FILE)
  unknownKeys(data, ['files', 'version'], report)
  const version = typeof data.version === 'string' ? data.version : ''
  if (!validInstant(version)) report('version', version ? `"${version}" is not an ISO timestamp (UTC)` : 'required')
  const files = data.files
  if (!isObject(files)) report('files', 'must be an object: { path: text }')
  else for (const [path, v] of Object.entries(files)) if (typeof v !== 'string') report(`files.${path}`, 'must be text')
  if (problems.length) throw new ContentError(problems)
  return { version, files: files as Record<string, string> }
}
