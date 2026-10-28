/**
 * Assemblée nationale open data (data.assemblee-nationale.fr, JSON dumps): deputies with their
 * current mandate, the organs they belong to (groups, committees), and every public vote.
 * The JSON comes from XML: single children are objects, several are arrays, empty ones null.
 */

export interface Organe {
  id: string
  type: string
  libelle: string
  abrege: string
}

export interface Depute {
  id: string
  civ: string
  prenom: string
  nom: string
  groupeId: string
  departement: string
  numDepartement: string
  circo: string
  profession: string
  dateNaissance: string
  mandatDebut: string
  emails: string[]
  sites: string[]
  permanence: string
  hatvp: string
  /** Committees and other organs, with the deputy's role. */
  organes: Array<{ id: string; qualite: string }>
}

export type Position = 'pour' | 'contre' | 'abstention' | 'nonVotant'

/** Positions as stored in the index (their position in this list). */
export const POSITION_CODES: Position[] = ['pour', 'contre', 'abstention', 'nonVotant']

/** PA1008 → 1008: deputies are stored by number in the votes table. */
export const actorNumber = (id: string) => Number(id.replace(/^PA/i, ''))

export interface Scrutin {
  id: string
  numero: number
  date: string
  titre: string
  type: string
  sort: string
  votants: number
  pour: number
  contre: number
  abstentions: number
  seance: string
  dossier: string
  groupes: Array<{ organeId: string; membres: number; position: string; pour: number; contre: number; abstentions: number; nonVotants: number }>
}

export interface Vote {
  scrutin: string
  acteur: string
  position: Position
  delegation: boolean
}

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** XML-derived JSON: a single item is an object, several are an array, none is null. */
export function asArray<T = Json>(v: unknown): T[] {
  if (v === null || v === undefined) return []
  return (Array.isArray(v) ? v : [v]) as T[]
}

const str = (v: unknown): string => (v === null || v === undefined || typeof v === 'object' ? '' : String(v))
const num = (v: unknown): number => Number(str(v)) || 0

export function parseOrgane(doc: Json): Organe | null {
  const o = doc.organe
  if (!o?.uid) return null
  return { id: str(o.uid), type: str(o.codeType), libelle: str(o.libelle), abrege: str(o.libelleAbrege ?? o.libelleAbrev) }
}

const current = (m: Json) => !m.dateFin

/** A deputy with a mandate in progress; null for former deputies and other actors. */
export function parseActeur(doc: Json): Depute | null {
  const a = doc.acteur
  const id = str(a?.uid?.['#text'] ?? a?.uid)
  if (!id) return null
  const mandats = asArray(a.mandats?.mandat)
  const mandat = mandats.find((m) => m.typeOrgane === 'ASSEMBLEE' && current(m))
  if (!mandat) return null
  const groupe = mandats.find((m) => m.typeOrgane === 'GP' && current(m))
  const adresses = asArray(a.adresses?.adresse)
  const typed = (type: string) => adresses.filter((ad) => str(ad['@xsi:type']) === type)
  const permanence = typed('AdressePostale_Type').find((ad) => str(ad.type) === '2')
  const lieu = mandat.election?.lieu ?? {}
  const ident = a.etatCivil?.ident ?? {}
  return {
    id,
    civ: str(ident.civ),
    prenom: str(ident.prenom),
    nom: str(ident.nom),
    groupeId: str(groupe?.organes?.organeRef),
    departement: str(lieu.departement),
    numDepartement: str(lieu.numDepartement),
    circo: str(lieu.numCirco),
    profession: str(a.profession?.libelleCourant),
    dateNaissance: str(a.etatCivil?.infoNaissance?.dateNais),
    mandatDebut: str(mandat.mandature?.datePriseFonction ?? mandat.dateDebut),
    emails: typed('AdresseMail_Type')
      .map((ad) => str(ad.valElec))
      .filter(Boolean),
    sites: typed('AdresseSiteWeb_Type')
      .map((ad) => str(ad.valElec))
      .filter(Boolean),
    permanence: permanence ? [permanence.numeroRue, permanence.nomRue, permanence.codePostal, permanence.ville].map(str).filter(Boolean).join(' ') : '',
    hatvp: str(a.uri_hatvp),
    organes: mandats
      .filter((m) => current(m) && !['ASSEMBLEE', 'GP', 'PARPOL'].includes(m.typeOrgane))
      .map((m) => ({ id: str(asArray(m.organes?.organeRef)[0]), qualite: str(m.infosQualite?.libQualite) }))
      .filter((o) => o.id)
  }
}

const POSITIONS: Array<[string, Position]> = [
  ['pours', 'pour'],
  ['contres', 'contre'],
  ['abstentions', 'abstention'],
  ['nonVotants', 'nonVotant']
]

/** One vote and every deputy's position in it. */
export function parseScrutin(doc: Json): { scrutin: Scrutin; votes: Vote[] } | null {
  const s = doc.scrutin
  if (!s?.uid) return null
  const id = str(s.uid)
  const decompte = s.syntheseVote?.decompte ?? {}
  const votes: Vote[] = []
  const groupes = asArray(s.ventilationVotes?.organe?.groupes?.groupe).map((g) => {
    const nominatif = g.vote?.decompteNominatif ?? {}
    for (const [key, position] of POSITIONS) {
      for (const v of asArray(nominatif[key]?.votant)) {
        if (v?.acteurRef) votes.push({ scrutin: id, acteur: str(v.acteurRef), position, delegation: str(v.parDelegation) === 'true' })
      }
    }
    const d = g.vote?.decompteVoix ?? {}
    return {
      organeId: str(g.organeRef),
      membres: num(g.nombreMembresGroupe),
      position: str(g.vote?.positionMajoritaire),
      pour: num(d.pour),
      contre: num(d.contre),
      abstentions: num(d.abstentions),
      nonVotants: num(d.nonVotants)
    }
  })
  return {
    scrutin: {
      id,
      numero: num(s.numero),
      date: str(s.dateScrutin),
      titre: str(s.titre) || str(s.objet?.libelle),
      type: str(s.typeVote?.libelleTypeVote),
      sort: str(s.sort?.code),
      votants: num(s.syntheseVote?.nombreVotants),
      pour: num(decompte.pour),
      contre: num(decompte.contre),
      abstentions: num(decompte.abstentions),
      seance: str(s.seanceRef),
      dossier: str(s.objet?.dossierLegislatif?.dossierRef),
      groupes
    },
    votes
  }
}

/** Lowercase, without accents: deputies are searched by name, department or constituency. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
