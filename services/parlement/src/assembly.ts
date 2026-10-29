import { foldText } from '@marianne/sdk'
import type { AssemblyOrgan, Attendance, Ballot, BallotVote, Deputy, Meeting, MeetingKind, MeetingState, Position } from './types'

/**
 * Assemblée nationale open data (data.assemblee-nationale.fr, JSON dumps): deputies with their
 * current mandate, the organs they belong to (groups, committees), every public vote, and the
 * agenda of sittings and meetings. The JSON comes from XML: single children are objects, several
 * are arrays, empty ones null.
 */

/** Positions as stored in the index (their position in this list). */
export const POSITION_CODES: Position[] = ['for', 'against', 'abstention', 'nonVoting']

/** PA1008 → 1008: deputies are stored by number in the votes table. */
export const actorNumber = (id: string) => Number(id.trim().replace(/^PA/i, ''))

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** XML-derived JSON: a single item is an object, several are an array, none is null. */
export function asArray<T = Json>(v: unknown): T[] {
  if (v === null || v === undefined) return []
  return (Array.isArray(v) ? v : [v]) as T[]
}

const str = (v: unknown): string => (v === null || v === undefined || typeof v === 'object' ? '' : String(v))
const num = (v: unknown): number => Number(str(v)) || 0

/** Folded words, single spaces: what the index's searchable columns hold, and what searches look for. */
export const searchKey = (text: string) =>
  foldText(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export function parseOrgan(doc: Json): AssemblyOrgan | null {
  const o = doc.organe
  if (!o?.uid) return null
  const code = str(o.libelleAbrev)
  return {
    id: str(o.uid),
    type: str(o.codeType),
    name: str(o.libelle),
    shortName: str(o.libelleAbrege) || code,
    code,
    color: /^#[0-9a-f]{6}$/i.test(str(o.couleurAssociee)) ? str(o.couleurAssociee) : ''
  }
}

const current = (m: Json) => !m.dateFin

/** A deputy with a mandate in progress; null for former deputies and other actors. */
export function parseDeputy(doc: Json): Deputy | null {
  const a = doc.acteur
  const id = str(a?.uid?.['#text'] ?? a?.uid)
  if (!id) return null
  const mandates = asArray(a.mandats?.mandat)
  const mandate = mandates.find((m) => m.typeOrgane === 'ASSEMBLEE' && current(m))
  if (!mandate) return null
  const group = mandates.find((m) => m.typeOrgane === 'GP' && current(m))
  const addresses = asArray(a.adresses?.adresse)
  const typed = (type: string) => addresses.filter((ad) => str(ad['@xsi:type']) === type)
  // Type 2: the published address of the constituency office.
  const office = typed('AdressePostale_Type').find((ad) => str(ad.type) === '2')
  const place = mandate.election?.lieu ?? {}
  const ident = a.etatCivil?.ident ?? {}
  const roles = new Map<string, string>()
  for (const m of mandates) {
    if (!current(m) || ['ASSEMBLEE', 'GP', 'PARPOL'].includes(m.typeOrgane)) continue
    const organ = str(asArray(m.organes?.organeRef)[0])
    const role = str(m.infosQualite?.libQualite)
    // A deputy can hold two mandates in one organ (member and rapporteur): the more specific role wins.
    if (organ && (!roles.has(organ) || roles.get(organ) === 'Membre')) roles.set(organ, role)
  }
  return {
    id,
    civility: str(ident.civ),
    firstName: str(ident.prenom),
    lastName: str(ident.nom),
    seat: num(mandate.mandature?.placeHemicycle),
    groupId: str(group?.organes?.organeRef),
    department: str(place.departement),
    departmentNumber: str(place.numDepartement),
    constituency: str(place.numCirco),
    profession: str(a.profession?.libelleCourant),
    birthDate: str(a.etatCivil?.infoNaissance?.dateNais),
    mandateStart: str(mandate.mandature?.datePriseFonction ?? mandate.dateDebut),
    emails: typed('AdresseMail_Type')
      .map((ad) => str(ad.valElec))
      .filter(Boolean),
    websites: typed('AdresseSiteWeb_Type')
      .map((ad) => str(ad.valElec))
      .filter(Boolean),
    office: office ? [office.numeroRue, office.nomRue, office.codePostal, office.ville].map(str).filter(Boolean).join(' ') : '',
    hatvp: str(a.uri_hatvp),
    organs: [...roles].map(([id, role]) => ({ id, role }))
  }
}

/** The open data's words for positions: lists of voters, and a group's majority position. */
const VOTER_LISTS: Array<[string, Position]> = [
  ['pours', 'for'],
  ['contres', 'against'],
  ['abstentions', 'abstention'],
  ['nonVotants', 'nonVoting']
]
const POSITIONS: Record<string, Position> = { pour: 'for', contre: 'against', abstention: 'abstention', nonVotant: 'nonVoting' }

/** One ballot and every deputy's position in it. */
export function parseBallot(doc: Json): { ballot: Ballot; votes: BallotVote[] } | null {
  const s = doc.scrutin
  if (!s?.uid) return null
  const id = str(s.uid)
  const count = s.syntheseVote?.decompte ?? {}
  const votes: BallotVote[] = []
  const groups = asArray(s.ventilationVotes?.organe?.groupes?.groupe).map((g) => {
    const named = g.vote?.decompteNominatif ?? {}
    for (const [key, position] of VOTER_LISTS) {
      for (const v of asArray(named[key]?.votant)) {
        if (v?.acteurRef) votes.push({ ballot: id, deputy: str(v.acteurRef), position, proxy: str(v.parDelegation) === 'true' })
      }
    }
    const d = g.vote?.decompteVoix ?? {}
    return {
      organId: str(g.organeRef),
      members: num(g.nombreMembresGroupe),
      position: POSITIONS[str(g.vote?.positionMajoritaire)] ?? '',
      for: num(d.pour),
      against: num(d.contre),
      abstentions: num(d.abstentions),
      nonVoting: num(d.nonVotants)
    }
  })
  return {
    ballot: {
      id,
      number: num(s.numero),
      date: str(s.dateScrutin),
      title: str(s.titre) || str(s.objet?.libelle),
      type: str(s.typeVote?.libelleTypeVote),
      result: str(s.sort?.code),
      voters: num(s.syntheseVote?.nombreVotants),
      for: num(count.pour),
      against: num(count.contre),
      abstentions: num(count.abstentions),
      sitting: str(s.seanceRef),
      bill: str(s.objet?.dossierLegislatif?.dossierRef),
      billTitle: str(s.objet?.dossierLegislatif?.libelle),
      groups
    },
    votes
  }
}

const MEETING_KINDS: Record<string, MeetingKind> = { seance_type: 'sitting', reunionCommission_type: 'committee' }
/** "Supprimé" meetings are withdrawn from the agenda: not kept. */
const MEETING_STATES: Record<string, MeetingState> = { Confirmé: 'confirmed', Eventuel: 'tentative', Annulé: 'cancelled' }

/** An agenda item as a sentence: whitespace collapsed, the notice's leading dashes dropped, a capital. */
const sentence = (s: string) => {
  const t = s
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—•]+/, '')
    .trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Attendance as stored in the index (its position in this list). */
export const ATTENDANCE_CODES: Attendance[] = ['present', 'excused', 'absent']
const ATTENDANCE: Record<string, Attendance> = { présent: 'present', excusé: 'excused', absent: 'absent' }

/**
 * Who attended a committee meeting, as its minutes record it; none while they don't: every member
 * is "absent" until the minutes are filled in, so a list without anyone present says nothing.
 */
export function parseAttendance(doc: Json): Array<{ deputy: string; status: Attendance }> {
  const list = asArray(doc.reunion?.participants?.participantsInternes?.participantInterne)
    .map((p) => ({ deputy: str(p.acteurRef), status: ATTENDANCE[str(p.presence)] }))
    .filter((p) => p.deputy && p.status)
  return list.some((p) => p.status === 'present') ? list : []
}

/** The rapporteurs a committee named on a legislative file (the general and main ones, not those of an opinion). */
export function parseBill(doc: Json): { id: string; title: string; rapporteurs: Array<{ deputy: string; type: string; organ: string; date: string }> } | null {
  const d = doc.dossierParlementaire
  if (!d?.uid) return null
  const rapporteurs: Array<{ deputy: string; type: string; organ: string; date: string }> = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    const n = node as Json
    if (n['@xsi:type'] === 'NominRapporteurs_Type' && /COM-FOND-NOMIN$/.test(str(n.codeActe))) {
      for (const r of asArray(n.rapporteurs?.rapporteur)) {
        const type = str(r.typeRapporteur)
        if (r.acteurRef && /^rapporteur( général)?$/i.test(type))
          rapporteurs.push({ deputy: str(r.acteurRef), type, organ: str(n.organeRef), date: str(n.dateActe).slice(0, 10) })
      }
    }
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v)
  }
  walk(d.actesLegislatifs)
  return { id: str(d.uid), title: str(d.titreDossier?.titre), rapporteurs }
}

/** One meeting of the agenda (Agenda dump, "reunion" documents); null when withdrawn. */
export function parseMeeting(doc: Json): Meeting | null {
  const r = doc.reunion
  const state = MEETING_STATES[str(r?.cycleDeVie?.etat)]
  if (!r?.uid || !state || !str(r.timeStampDebut)) return null
  const agenda = r.ODJ ?? {}
  const kind = MEETING_KINDS[str(r['@xsi:type'])] ?? 'other'
  const points = asArray(agenda.pointsODJ?.pointODJ)
    .filter((p) => str(p.cycleDeVie?.etat) !== 'Supprimé')
    .map((p) => str(p.objet))
  const notice = asArray<unknown>(agenda.convocationODJ?.item ?? agenda.resumeODJ?.item).map(str)
  // Sittings are told by their points (some withdrawn); committees by their notice, whose points are generic ("Examen du texte").
  const items = kind === 'sitting' ? (points.length ? points : notice) : notice.length ? notice : points
  const end = str(r.timeStampFin)
  return {
    id: str(r.uid),
    chamber: 'an',
    kind,
    state,
    start: str(r.timeStampDebut),
    ...(end ? { end } : {}),
    organId: str(r.organeReuniRef),
    place: str(r.lieu?.libelleLong).replace(/\s+/g, ' ').trim(),
    items: [...new Set(items.map(sentence).filter(Boolean))],
    video: str(r.captationVideo) === 'true'
  }
}
