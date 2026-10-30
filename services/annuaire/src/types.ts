export interface OfficeKind {
  /** The directory's "pivot" type ("caf"). */
  id: string
  /** Its French name, and a short one for the chips. */
  label: string
  short: string
}

/** Common kinds of local public offices, with their French names. */
export const OFFICE_KINDS: OfficeKind[] = [
  { id: 'mairie', label: 'Mairie', short: 'Mairie' },
  { id: 'caf', label: 'Caisse d’allocations familiales (Caf)', short: 'Caf' },
  { id: 'cpam', label: 'Caisse primaire d’assurance maladie (CPAM)', short: 'CPAM' },
  { id: 'prefecture', label: 'Préfecture', short: 'Préfecture' },
  { id: 'sous_pref', label: 'Sous-préfecture', short: 'Sous-préfecture' },
  { id: 'france_services', label: 'France services', short: 'France services' },
  { id: 'france_travail', label: 'France Travail', short: 'France Travail' },
  { id: 'sip', label: 'Service des impôts des particuliers (SIP)', short: 'Impôts des particuliers' },
  { id: 'sie', label: 'Service des impôts des entreprises (SIE)', short: 'Impôts des entreprises' },
  { id: 'carsat', label: 'Carsat (retraite)', short: 'Carsat' },
  { id: 'msa', label: 'Mutualité sociale agricole (MSA)', short: 'MSA' },
  { id: 'urssaf', label: 'Urssaf', short: 'Urssaf' },
  { id: 'ccas', label: 'Centre communal d’action sociale (CCAS)', short: 'CCAS' },
  { id: 'maison_handicapees', label: 'Maison départementale des personnes handicapées (MDPH)', short: 'MDPH' },
  { id: 'mission_locale', label: 'Mission locale', short: 'Mission locale' },
  { id: 'adil', label: 'Agence départementale d’information sur le logement (ADIL)', short: 'ADIL' },
  { id: 'cdad', label: 'Conseil départemental de l’accès au droit (CDAD)', short: 'CDAD' },
  { id: 'point_justice', label: 'Point-justice', short: 'Point-justice' },
  { id: 'tgi', label: 'Tribunal judiciaire', short: 'Tribunal judiciaire' },
  { id: 'ta', label: 'Tribunal administratif', short: 'Tribunal administratif' },
  { id: 'prudhommes', label: 'Conseil de prud’hommes', short: 'Prud’hommes' },
  { id: 'tribunal_commerce', label: 'Tribunal de commerce', short: 'Tribunal de commerce' },
  { id: 'cour_appel', label: 'Cour d’appel', short: 'Cour d’appel' },
  { id: 'commissariat_police', label: 'Commissariat de police', short: 'Police' },
  { id: 'gendarmerie', label: 'Brigade de gendarmerie', short: 'Gendarmerie' },
  { id: 'crous', label: 'Crous', short: 'Crous' }
]

export interface OfficeAddress {
  /** Street lines, without the town. */
  lines: string[]
  postalCode: string
  city: string
  /** A postal address (mail only), not where to go. */
  postal: boolean
  latitude?: number
  longitude?: number
}

/** Opening hours over a range of days: 1 = lundi … 7 = dimanche. */
export interface OpeningPeriod {
  fromDay: number
  toDay: number
  /** "08:30" → "12:00"; empty when the office gives only a note. */
  slots: Array<{ from: string; to: string }>
  note?: string
  /** French: "Du lundi au vendredi : 8h30–12h00, 13h30–15h00". */
  label: string
}

export interface PublicOffice {
  id: string
  name: string
  /** Its pivot type ("caf"), and the French name of that kind. */
  kind: string
  kindLabel: string
  addresses: OfficeAddress[]
  phones: Array<{ number: string; note?: string }>
  emails: string[]
  websites: string[]
  contactForm?: string
  hours: OpeningPeriod[]
  /** "Uniquement sur rendez-vous". */
  hoursNote?: string
  /** Its page on lannuaire.service-public.gouv.fr. */
  url: string
  /** km from the commune searched, when known. */
  distance?: number
}

export interface OfficeQuery {
  /** A kind of office ("caf": see OFFICE_KINDS). */
  kind?: string
  /** A commune by INSEE code: exact. */
  insee?: string
  /** A commune by name or postal code. */
  commune?: string
  /** Words of the office's name ("Défenseur des droits"). */
  text?: string
  /** 1 to 100; 5 by default. */
  limit?: number
}

export interface OfficeResults {
  offices: PublicOffice[]
  /** How many the directory has, the first `offices` of them shown. */
  total: number
  /** The communes searched, in French ("Bordeaux (33063)"); empty for a search in all of France. */
  place: string
  /** Where they were found: in or for the commune, in its département (nearest first), anywhere. */
  scope: 'commune' | 'department' | 'national'
}

/** The offices of one kind near a commune. */
export interface NearbyOffices {
  kind: string
  label: string
  offices: PublicOffice[]
  /** Why the directory didn't answer for this kind: its offices are then unknown, not none. */
  error?: string
}

/** What the view calls. */
export type AnnuaireMethods = {
  /** The kinds of offices to choose from. */
  kinds(): OfficeKind[]
  /** Offices by kind, commune and words of their name. */
  search(query: OfficeQuery): OfficeResults
  /** The usual offices of a commune (INSEE code): its mairie, France services, Caf, CPAM… */
  near(insee: string): NearbyOffices[]
}
