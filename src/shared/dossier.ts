/**
 * The personal file: who the user is, what is linked to them, and what they have to do. It lives
 * encrypted on this computer (main/dossier); only a context view, with identifiers replaced by
 * [[tokens]], ever reaches the agent.
 */

export type DomainId = 'identite' | 'sante' | 'impots' | 'famille' | 'travail' | 'retraite' | 'logement' | 'justice' | 'entreprises' | 'mobilite'

export type FamilyStatus = '' | 'celibataire' | 'marie' | 'pacse' | 'concubinage' | 'divorce' | 'veuf'
export type WorkStatus = '' | 'salarie' | 'fonctionnaire' | 'independant' | 'demandeur_emploi' | 'etudiant' | 'retraite' | 'sans_activite'

export interface Person {
  civilite: '' | 'M.' | 'Mme'
  nomNaissance: string
  nomUsage: string
  prenoms: string
  /** YYYY-MM-DD */
  dateNaissance: string
  communeNaissance: string
  paysNaissance: string
  nationalite: string
  /** Numéro de sécurité sociale, 15 characters without spaces. */
  nir: string
  situationFamiliale: FamilyStatus
  situationPro: WorkStatus
  telephone: string
  email: string
}

export interface Address {
  /** Number and street: "12 rue des Olivettes". */
  rue: string
  complement: string
  codePostal: string
  commune: string
  codeInsee: string
  lat?: number
  lon?: number
  /** YYYY-MM-DD */
  depuis: string
}

export interface HouseholdMember {
  id: string
  lien: 'conjoint' | 'enfant' | 'autre'
  prenom: string
  nom: string
  dateNaissance: string
  aCharge: boolean
}

/** A public-service website the user uses, with the identifiers it needs. */
export interface ServiceAccount {
  serviceId: string
  fields: Record<string, string>
  since: string
}

export type PieceType = 'cni' | 'passeport' | 'permis' | 'titre_sejour' | 'carte_vitale'

export interface IdDocument {
  id: string
  type: PieceType
  numero: string
  delivrance: string
  expiration: string
  /** 'moi' or a household member id. */
  titulaire: string
}

export type CompanyRegime = 'micro' | 'ei_reel' | 'societe_is' | 'societe_ir' | 'association'

export interface Company {
  id: string
  siren: string
  denomination: string
  forme: string
  activite: string
  creation: string
  adresse: string
  role: 'dirigeant' | 'associe' | 'entrepreneur' | 'autre'
  regime: CompanyRegime
  /** Micro-entrepreneurs: how often turnover is declared to the URSSAF. */
  periodicite: '' | 'mensuelle' | 'trimestrielle'
  tva: '' | 'franchise' | 'reel_simplifie' | 'reel_normal'
  /** Financial year end, MM-DD. */
  cloture: string
}

export interface Employer {
  id: string
  nom: string
  siren: string
  poste: string
  contrat: 'cdi' | 'cdd' | 'interim' | 'apprentissage' | 'fonction_publique' | 'autre'
  debut: string
  fin: string
  /** Collective agreement number (on the payslip). */
  idcc: string
}

export interface Vehicle {
  id: string
  immatriculation: string
  modele: string
  premiereImmatriculation: string
  dernierControle: string
  critair: string
}

export interface Property {
  id: string
  adresse: string
  codeInsee: string
  usage: 'residence_principale' | 'residence_secondaire' | 'locatif'
  statut: 'locataire' | 'proprietaire' | 'heberge'
  loyer: string
  debutBail: string
  bailleur: string
}

export type EntityKind = 'entreprises' | 'employeurs' | 'vehicules' | 'logements'

export type DeadlineStatus = 'a_faire' | 'fait' | 'ignore'

/** A deadline the user or the agent added (rules and the official calendar are computed). */
export interface ManualDeadline {
  id: string
  domain: DomainId
  title: string
  /** YYYY-MM-DD */
  date: string
  note: string
  source: 'utilisateur' | 'agent'
}

export interface DocumentMeta {
  id: string
  domain: DomainId
  title: string
  type: 'avis_impot' | 'attestation' | 'bulletin_paie' | 'releve' | 'courrier' | 'contrat' | 'justificatif' | 'autre'
  /** Date of the document, YYYY-MM-DD. */
  date: string
  fileName: string
  mime: string
  size: number
  addedAt: string
}

export interface JournalEntry {
  id: string
  at: string
  domain: DomainId
  text: string
}

export interface Dossier {
  version: 1
  /** The user went through the first steps. */
  onboarded: boolean
  person: Person
  address: Address
  household: HouseholdMember[]
  accounts: ServiceAccount[]
  pieces: IdDocument[]
  entreprises: Company[]
  employeurs: Employer[]
  vehicules: Vehicle[]
  logements: Property[]
  deadlines: ManualDeadline[]
  /** Status of computed deadlines, by their key. */
  deadlineStatus: Record<string, DeadlineStatus>
  documents: DocumentMeta[]
  journal: JournalEntry[]
  /** Guided procedures: steps done, by procedure id. */
  procedures: Record<string, number[]>
  /** Free notes for the assistant ("je suis malvoyant", "je travaille de nuit"…), sent as context. */
  notes: string
}

export const EMPTY_DOSSIER: Dossier = {
  version: 1,
  onboarded: false,
  person: {
    civilite: '',
    nomNaissance: '',
    nomUsage: '',
    prenoms: '',
    dateNaissance: '',
    communeNaissance: '',
    paysNaissance: 'France',
    nationalite: 'française',
    nir: '',
    situationFamiliale: '',
    situationPro: '',
    telephone: '',
    email: ''
  },
  address: { rue: '', complement: '', codePostal: '', commune: '', codeInsee: '', depuis: '' },
  household: [],
  accounts: [],
  pieces: [],
  entreprises: [],
  employeurs: [],
  vehicules: [],
  logements: [],
  deadlines: [],
  deadlineStatus: {},
  documents: [],
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
  source: 'regle' | 'calendrier' | 'utilisateur' | 'agent'
  status: DeadlineStatus
  note?: string
  /** The date is indicative (confirmed each year by the administration). */
  indicative?: boolean
  /** Where to act: a service of the catalog or a guided procedure. */
  serviceId?: string
  demarcheId?: string
  sourceUrl?: string
}

// ---------------------------------------------------------------- operations

export type DossierOp =
  | { type: 'person'; patch: Partial<Person> }
  | { type: 'address'; address: Address }
  | { type: 'member'; member: HouseholdMember }
  | { type: 'deleteMember'; id: string }
  | { type: 'account'; account: ServiceAccount }
  | { type: 'deleteAccount'; serviceId: string }
  | { type: 'piece'; piece: IdDocument }
  | { type: 'deletePiece'; id: string }
  | { type: 'entity'; kind: 'entreprises'; item: Company }
  | { type: 'entity'; kind: 'employeurs'; item: Employer }
  | { type: 'entity'; kind: 'vehicules'; item: Vehicle }
  | { type: 'entity'; kind: 'logements'; item: Property }
  | { type: 'deleteEntity'; kind: EntityKind; id: string }
  | { type: 'deadline'; deadline: ManualDeadline }
  | { type: 'deleteDeadline'; id: string }
  | { type: 'deadlineStatus'; key: string; status: DeadlineStatus }
  | { type: 'procedureStep'; id: string; step: number; done: boolean }
  | { type: 'documentMeta'; id: string; patch: Partial<Pick<DocumentMeta, 'title' | 'domain' | 'type' | 'date'>> }
  | { type: 'notes'; notes: string }
  | { type: 'onboarded'; value: boolean }

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

/** "2880344109123" → "2 88 03 44 109 123 47". */
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

/** "Nom Prénoms", from the usage name or the birth name. */
export function fullName(p: Person): string {
  return [p.prenoms.split(/\s+/)[0], p.nomUsage || p.nomNaissance].filter(Boolean).join(' ')
}

export function formatAddress(a: Address): string {
  return [a.rue, a.complement, [a.codePostal, a.commune].filter(Boolean).join(' ')].filter((x) => x.trim()).join(', ')
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
