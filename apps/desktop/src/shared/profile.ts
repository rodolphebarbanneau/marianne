import { domainInfo } from './domains'
import type { Site } from './sites'
import type { DomainId } from './types'

/**
 * The personal file: who the user is, what is linked to them, and what they have to do. It lives
 * in the account archive (main/profile); only a context view, with identifiers replaced by
 * [[tokens]], ever reaches the engines.
 */

export type Civility = '' | 'mr' | 'ms'
export type FamilyStatus = '' | 'single' | 'married' | 'pacs' | 'cohabiting' | 'divorced' | 'widowed'
export type WorkStatus = '' | 'employee' | 'civil_servant' | 'self_employed' | 'job_seeker' | 'student' | 'retired' | 'inactive'

export interface Person {
  civility: Civility
  birthName: string
  usedName: string
  firstNames: string
  /** YYYY-MM-DD */
  birthDate: string
  birthPlace: string
  birthCountry: string
  nationality: string
  /** Numéro de sécurité sociale, 15 characters without spaces. */
  nir: string
  /** Where refunds and benefits are paid, without spaces. */
  iban: string
  familyStatus: FamilyStatus
  workStatus: WorkStatus
  phone: string
  email: string
}

export interface Address {
  /** Number and street: "12 rue des Olivettes". */
  street: string
  complement: string
  postcode: string
  city: string
  inseeCode: string
  lat?: number
  lon?: number
  /** YYYY-MM-DD */
  since: string
}

export type Relation = 'spouse' | 'child' | 'other'

export interface HouseholdMember {
  id: string
  relation: Relation
  firstName: string
  lastName: string
  birthDate: string
  dependent: boolean
}

/** A public-service website the user uses, with the identifiers it needs. */
export interface SiteAccount {
  siteId: string
  fields: Record<string, string>
  since: string
}

export type IdDocumentType = 'id_card' | 'passport' | 'driving_licence' | 'residence_permit' | 'health_card'

export interface IdDocument {
  id: string
  type: IdDocumentType
  number: string
  issued: string
  expires: string
  /** 'me' or a household member id. */
  holder: string
}

/** corporate_tax: a company paying corporate tax (IS) · income_tax: a company taxed through its partners (IR). */
export type CompanyRegime = 'micro' | 'sole_trader' | 'corporate_tax' | 'income_tax' | 'association'

export interface Company {
  id: string
  siren: string
  name: string
  legalForm: string
  activity: string
  created: string
  address: string
  role: 'director' | 'partner' | 'entrepreneur' | 'other'
  regime: CompanyRegime
  /** Micro-entrepreneurs: how often turnover is declared to the URSSAF. */
  frequency: '' | 'monthly' | 'quarterly'
  /** exempt: franchise en base · simplified, normal: réel simplifié, réel normal. */
  vat: '' | 'exempt' | 'simplified' | 'normal'
  /** Financial year end, MM-DD. */
  yearEnd: string
}

export interface Employer {
  id: string
  name: string
  siren: string
  position: string
  contract: 'permanent' | 'fixed_term' | 'temporary' | 'apprenticeship' | 'civil_service' | 'other'
  start: string
  end: string
  /** Collective agreement number (on the payslip). */
  idcc: string
}

export interface Vehicle {
  id: string
  plate: string
  model: string
  firstRegistration: string
  lastInspection: string
  critair: string
}

export interface Property {
  id: string
  address: string
  inseeCode: string
  use: 'main_home' | 'second_home' | 'rental'
  status: 'tenant' | 'owner' | 'hosted'
  rent: string
  leaseStart: string
  landlord: string
}

export type EntityKind = 'companies' | 'employers' | 'vehicles' | 'properties'

export type DeadlineStatus = 'todo' | 'done' | 'ignored'

/** A deadline the user or the agent added (rules and the official calendar are computed). */
export interface ManualDeadline {
  id: string
  domain: DomainId
  title: string
  /** YYYY-MM-DD */
  date: string
  note: string
  source: 'user' | 'agent'
}

export type DocumentType = 'tax_notice' | 'certificate' | 'payslip' | 'statement' | 'letter' | 'contract' | 'proof' | 'other'

/** A document of the archive (main/profile/documents): the meta of its archive file. */
export interface DocumentMeta {
  id: string
  domain: DomainId
  title: string
  type: DocumentType
  /** Date of the document, YYYY-MM-DD. */
  date: string
  /** The linked company, employer, vehicle or property id; empty when none. */
  entity: string
  fileName: string
  mime: string
  size: number
  /** The folder whose pièces it belongs to. */
  folderId?: string
  addedAt: string
}

export interface JournalEntry {
  id: string
  at: string
  domain: DomainId
  text: string
}

export interface Profile {
  version: 1
  /** The user went through the first steps. */
  onboarded: boolean
  person: Person
  address: Address
  household: HouseholdMember[]
  accounts: SiteAccount[]
  idDocuments: IdDocument[]
  companies: Company[]
  employers: Employer[]
  vehicles: Vehicle[]
  properties: Property[]
  deadlines: ManualDeadline[]
  /** Status of computed deadlines, by their key. */
  deadlineStatus: Record<string, DeadlineStatus>
  journal: JournalEntry[]
  /** Guided procedures: steps done (0-based), by procedure id. */
  procedures: Record<string, number[]>
  /** Free notes for the assistant ("je suis malvoyant", "je travaille de nuit"…), sent as context. */
  notes: string
}

export const EMPTY_PROFILE: Profile = {
  version: 1,
  onboarded: false,
  person: {
    civility: '',
    birthName: '',
    usedName: '',
    firstNames: '',
    birthDate: '',
    birthPlace: '',
    birthCountry: 'France',
    nationality: 'française',
    nir: '',
    iban: '',
    familyStatus: '',
    workStatus: '',
    phone: '',
    email: ''
  },
  address: { street: '', complement: '', postcode: '', city: '', inseeCode: '', since: '' },
  household: [],
  accounts: [],
  idDocuments: [],
  companies: [],
  employers: [],
  vehicles: [],
  properties: [],
  deadlines: [],
  deadlineStatus: {},
  journal: [],
  procedures: {},
  notes: ''
}

/** A deadline as shown: computed or manual, with its status. */
export interface Deadline {
  /** Stable key: rule keys like "urssaf:<company>:2026-T3", or the manual deadline id. */
  key: string
  domain: DomainId
  title: string
  date: string
  source: 'rule' | 'calendar' | 'user' | 'agent' | 'service'
  status: DeadlineStatus
  note?: string
  /** The date is indicative (confirmed each year by the administration). */
  indicative?: boolean
  /** Where to act: a site of the catalog or a guided procedure. */
  siteId?: string
  procedureId?: string
  sourceUrl?: string
  /** source 'service': the service that knows of it, opened with `params`. */
  service?: string
  params?: Record<string, string | number>
}

// ---------------------------------------------------------------- guided procedures

/** Guided procedures (démarches) are content: their format is @marianne/content's. */
export type { Procedure, ProcedureAction, ProcedureActionKind, ProcedureStep } from '@marianne/content'

// ---------------------------------------------------------------- operations

export type ProfileOp =
  | { type: 'person'; patch: Partial<Person> }
  | { type: 'address'; address: Address }
  | { type: 'member'; member: HouseholdMember }
  | { type: 'deleteMember'; id: string }
  | { type: 'account'; account: SiteAccount }
  | { type: 'deleteAccount'; siteId: string }
  | { type: 'idDocument'; document: IdDocument }
  | { type: 'deleteIdDocument'; id: string }
  | { type: 'entity'; kind: 'companies'; item: Company }
  | { type: 'entity'; kind: 'employers'; item: Employer }
  | { type: 'entity'; kind: 'vehicles'; item: Vehicle }
  | { type: 'entity'; kind: 'properties'; item: Property }
  | { type: 'deleteEntity'; kind: EntityKind; id: string }
  | { type: 'deadline'; deadline: ManualDeadline }
  | { type: 'deleteDeadline'; id: string }
  | { type: 'deadlineStatus'; key: string; status: DeadlineStatus }
  | { type: 'procedureStep'; id: string; step: number; done: boolean }
  | { type: 'notes'; notes: string }
  | { type: 'onboarded'; value: boolean }

// ---------------------------------------------------------------- labels

export const CIVILITY_LABELS: Record<Exclude<Civility, ''>, string> = { mr: 'M.', ms: 'Mme' }

export const FAMILY_STATUS_LABELS: Record<Exclude<FamilyStatus, ''>, string> = {
  single: 'célibataire',
  married: 'marié(e)',
  pacs: 'pacsé(e)',
  cohabiting: 'en concubinage',
  divorced: 'divorcé(e)',
  widowed: 'veuf ou veuve'
}

export const WORK_STATUS_LABELS: Record<Exclude<WorkStatus, ''>, string> = {
  employee: 'salarié(e) du privé',
  civil_servant: 'agent public',
  self_employed: 'indépendant(e)',
  job_seeker: 'demandeur d’emploi',
  student: 'étudiant(e)',
  retired: 'retraité(e)',
  inactive: 'sans activité'
}

export const RELATION_LABELS: Record<Relation, string> = { spouse: 'conjoint', child: 'enfant', other: 'autre' }

export const ID_DOCUMENT_LABELS: Record<IdDocumentType, string> = {
  id_card: 'carte d’identité',
  passport: 'passeport',
  driving_licence: 'permis de conduire',
  residence_permit: 'titre de séjour',
  health_card: 'carte vitale'
}

export const REGIME_LABELS: Record<CompanyRegime, string> = {
  micro: 'micro-entreprise',
  sole_trader: 'entreprise individuelle au réel',
  corporate_tax: 'société à l’impôt sur les sociétés',
  income_tax: 'société à l’impôt sur le revenu',
  association: 'association'
}

export const ROLE_LABELS: Record<Company['role'], string> = { director: 'dirigeant', partner: 'associé', entrepreneur: 'entrepreneur', other: 'autre' }
export const FREQUENCY_LABELS: Record<Exclude<Company['frequency'], ''>, string> = { monthly: 'mensuelle', quarterly: 'trimestrielle' }
export const VAT_LABELS: Record<Exclude<Company['vat'], ''>, string> = { exempt: 'franchise en base', simplified: 'réel simplifié', normal: 'réel normal' }

export const CONTRACT_LABELS: Record<Employer['contract'], string> = {
  permanent: 'cdi',
  fixed_term: 'cdd',
  temporary: 'intérim',
  apprenticeship: 'apprentissage',
  civil_service: 'fonction publique',
  other: 'autre contrat'
}

export const PROPERTY_USE_LABELS: Record<Property['use'], string> = {
  main_home: 'résidence principale',
  second_home: 'résidence secondaire',
  rental: 'locatif'
}
export const PROPERTY_STATUS_LABELS: Record<Property['status'], string> = { tenant: 'locataire', owner: 'propriétaire', hosted: 'hébergé' }

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  tax_notice: 'avis d’impôt',
  certificate: 'attestation',
  payslip: 'bulletin de paie',
  statement: 'relevé',
  letter: 'courrier',
  contract: 'contrat',
  proof: 'justificatif',
  other: 'autre'
}

// ---------------------------------------------------------------- setup

/**
 * What the user can be sent to configure, and how to name it. Sites are "account:<site id>".
 * Shared by the engines' view of the file and the pages, so both point to the same places.
 */
export const SETUP_TARGETS: Record<string, string> = {
  identity: 'votre identité',
  address: 'votre adresse',
  household: 'votre foyer',
  id_documents: 'vos pièces d’identité',
  notes: 'vos précisions pour l’assistant',
  companies: 'vos entreprises',
  employers: 'vos employeurs',
  vehicles: 'vos véhicules',
  properties: 'vos logements'
}

/** Where each setup target is set in the settings; the sites ("account:<site id>") are on "sites". */
const SETUP_PAGES: Record<string, string> = {
  identity: 'identity',
  address: 'identity',
  notes: 'identity',
  household: 'household',
  id_documents: 'household',
  companies: 'household',
  employers: 'household',
  vehicles: 'household',
  properties: 'household'
}

/** The settings page of a setup target; null when there is no such target. */
export function setupPage(target: string): string | null {
  if (target.startsWith('account:')) return 'sites'
  return Object.hasOwn(SETUP_PAGES, target) ? SETUP_PAGES[target] : null
}

/** The label of a setup target; null when there is no such target. */
export function setupLabel(target: string, sites: Site[]): string | null {
  if (SETUP_TARGETS[target]) return SETUP_TARGETS[target]
  const site = target.startsWith('account:') ? sites.find((s) => s.id === target.slice('account:'.length)) : null
  return site ? `votre compte ${site.name}` : null
}

export interface Missing {
  target: string
  label: string
}

/** A site is configured once the user chose it and gave the identifiers it needs. */
export function siteReady(p: Profile, s: Site): boolean {
  const account = p.accounts.find((a) => a.siteId === s.id)
  if (!account) return false
  if (s.needsNir && !p.person.nir) return false
  return (s.fields ?? []).every((f) => account.fields[f.key]?.trim())
}

/**
 * What a domain lacks. For the pages, only what is essential or started and left incomplete: an
 * unused site is not a gap, the user configures only what they use. For the engines, every gap,
 * so they can point the user to the right place when the conversation needs it.
 */
export function missingFor(p: Profile, domain: DomainId, sites: Site[], forEngine = false): Missing[] {
  const out: Missing[] = []
  const add = (target: string, label = SETUP_TARGETS[target]) => out.push({ target, label })
  if (!p.person.birthName && !p.person.usedName) add('identity')
  if (!p.address.inseeCode) add('address')
  if ((domain === 'health' || domain === 'retirement') && !p.person.nir) add('identity', 'votre numéro de sécurité sociale')
  if (forEngine) {
    for (const kind of domainInfo(domain).entities) if (!p[kind].length) add(kind)
    if (domain === 'family' && !p.household.length && !p.person.familyStatus) add('household')
    if (domain === 'identity' && !p.idDocuments.length) add('id_documents')
  }
  for (const s of sites.filter((x) => x.domain === domain && (x.fields?.length || x.needsNir))) {
    const started = p.accounts.some((a) => a.siteId === s.id)
    if ((forEngine || started) && !siteReady(p, s)) add(`account:${s.id}`, `votre compte ${s.name}`)
  }
  return out.filter((m, i, all) => all.findIndex((x) => x.label === m.label) === i)
}

// ---------------------------------------------------------------- helpers

/** Age in whole years on `at` (YYYY-MM-DD); null when the date is unknown. */
export function ageOf(birth: string, at = new Date()): number | null {
  const m = birth.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  let age = at.getFullYear() - Number(m[1])
  if (at.getMonth() + 1 < Number(m[2]) || (at.getMonth() + 1 === Number(m[2]) && at.getDate() < Number(m[3]))) age--
  return age
}

/**
 * A NIR is 13 characters (sex, year, month, department — 2A/2B for Corsica — commune, order)
 * and a 2-digit key: 97 minus the 13 characters modulo 97, Corsica counted as 19 and 18.
 */
export function nirValid(nir: string): boolean {
  const n = nir.replace(/\s+/g, '').toUpperCase()
  if (!/^[12378]\d{4}(\d{2}|2A|2B)\d{6}\d{2}$/.test(n)) return false
  const body = n.slice(0, 13).replace('2A', '19').replace('2B', '18')
  const key = Number(n.slice(13))
  return 97 - Number(BigInt(body) % 97n) === key
}

/** "288034410912376" → "2 88 03 44 109 123 76". */
export function formatNir(nir: string): string {
  const n = nir.replace(/\s+/g, '').toUpperCase()
  if (n.length !== 15) return nir
  return [n[0], n.slice(1, 3), n.slice(3, 5), n.slice(5, 7), n.slice(7, 10), n.slice(10, 13), n.slice(13)].join(' ')
}

/** Show only the end of an identifier: "••• 47". */
export const mask = (value: string, visible = 2) => (value ? `••• ${value.replace(/\s+/g, '').slice(-visible)}` : '')

/** A financial year end: "12-31", or "31/12" as written in French. Null if it isn't one. */
export function monthDay(s: string): [number, number] | null {
  const text = (s ?? '').trim()
  const iso = text.match(/^(\d{1,2})-(\d{1,2})$/)
  const fr = text.match(/^(\d{1,2})\/(\d{1,2})$/)
  const [mm, dd] = iso ? [Number(iso[1]), Number(iso[2])] : fr ? [Number(fr[2]), Number(fr[1])] : [NaN, NaN]
  // Leap year 2024: 29 February is a valid year end.
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= new Date(Date.UTC(2024, mm, 0)).getUTCDate() ? [mm, dd] : null
}

/** SIREN: 9 digits with a Luhn check. */
export function sirenValid(siren: string): boolean {
  const s = siren.replace(/\s+/g, '')
  if (!/^\d{9}$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let d = Number(s[8 - i])
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2
    sum += d
  }
  return sum % 10 === 0
}

/** "Prénom Nom", from the used name or the birth name. */
export function fullName(p: Person): string {
  return [p.firstNames.split(/\s+/)[0], p.usedName || p.birthName].filter(Boolean).join(' ')
}

export function formatAddress(a: Address): string {
  return [a.street, a.complement, [a.postcode, a.city].filter(Boolean).join(' ')].filter((x) => x.trim()).join(', ')
}

/** Day in French: "lundi 4 janvier 2027". */
export function longDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** dd/mm/yyyy from YYYY-MM-DD. */
export const frDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso)

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Whole days from today to `iso` (negative when past). */
export function daysUntil(iso: string, from = new Date()): number {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return NaN
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - a) / 86_400_000)
}

export const newKey = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
