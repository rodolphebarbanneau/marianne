import { foldText } from '@marianne/sdk'
import { addDays } from './time'
import type { Position } from './types'

/**
 * The Sénat's sources, on senat.fr (no open-data dump covers them as well): its senators and
 * their seats (the list the site draws its hemicycle from), its groups' colours (on its home
 * page), its public ballots (a page per ballot, and a JSON of each senator's vote), and its
 * agenda (the API of agenda.senat.fr). Pages are parsed as text: they are the site's own, kept
 * in this one module.
 */

export const SENATE_SITE = 'https://www.senat.fr'
export const SENATORS_URL = `${SENATE_SITE}/api-senat/senateurs.json`
export const SENATE_HOME = `${SENATE_SITE}/`
export const SENATE_AGENDA_API = `${SENATE_SITE}/api/v1/agenda/events`

/** The page of a session's ballots ("scr2025.html"), and of one ballot (its votes as JSON alongside). */
export const senateSessionPage = (session: number) => `${SENATE_SITE}/scrutin-public/scr${session}.html`
export const senateBallotUrl = (session: number, number: number, ext: 'html' | 'json') =>
  `${SENATE_SITE}/scrutin-public/${session}/scr${session}-${number}.${ext}`

/**
 * The Sénat's session of a day: it opens on the first working day of October and is named after
 * that year ("2026" runs from October 2026 to the summer's extraordinary sitting of 2027).
 */
export const senateSession = (day: string) => {
  const [year, month] = day.split('-').map(Number)
  return month >= 10 ? year : year - 1
}

/** A ballot's id: "SE2026-44", its votes' key: 2026 × 10 000 + 44. */
export const senateBallotId = (session: number, number: number) => `SE${session}-${number}`
export const senateBallotKey = (session: number, number: number) => session * 10_000 + number

/** "19591F" → a number for the votes table: the digits, then the letter. */
export const senatorKey = (id: string) => {
  const m = id
    .trim()
    .toUpperCase()
    .match(/^(\d+)([A-Z])$/)
  return m ? Number(m[1]) * 32 + (m[2].charCodeAt(0) - 64) : 0
}

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const str = (v: unknown): string => (v === null || v === undefined || typeof v === 'object' ? '' : String(v))

export interface SenatorOrgan {
  code: string
  /** COMMISSION, DELEGATION, TEMPORAIRE, ETUDE, AUTRE… */
  type: string
  name: string
}

export interface Senator {
  /** The matricule: "19591F". */
  id: string
  civility: string
  firstName: string
  lastName: string
  female: boolean
  groupId: string
  groupShort: string
  groupName: string
  /** "92", "2A", "974"; "998" and "997": French citizens abroad. */
  departmentNumber: string
  department: string
  /** Its seat in the hemicycle (1–348); 0: none (a member of the Government). */
  seat: number
  page: string
  photo: string
  organs: SenatorOrgan[]
}

/** The groups whose short label is a name: their usual acronym. */
const SHORT_NAMES: Record<string, string> = { 'Les Républicains': 'LR', 'Les Indépendants': 'LIRT' }

/** The senators in office, from the list senat.fr draws its hemicycle with. */
export function parseSenators(json: unknown): Senator[] {
  if (!Array.isArray(json)) throw new Error('The Sénat’s list of senators has changed shape')
  return (json as Json[]).flatMap((s): Senator[] => {
    const id = str(s.matricule).toUpperCase()
    if (!id || !s.groupe) return []
    return [
      {
        id,
        civility: str(s.civilite),
        firstName: str(s.prenom),
        lastName: str(s.nom),
        female: !!s.feminise || str(s.civilite) === 'Mme',
        groupId: str(s.groupe.code),
        groupShort: SHORT_NAMES[str(s.groupe.libelleCourt)] ?? (str(s.groupe.libelleCourt) || str(s.groupe.code)),
        groupName: str(s.groupe.libelle).replace(/^Groupe (du |de l'|des )?/i, ''),
        departmentNumber: str(s.circonscription?.code).toUpperCase(),
        department: str(s.circonscription?.libelle),
        seat: Number(s.siege) || 0,
        page: s.url ? `${SENATE_SITE}${str(s.url)}` : '',
        photo: s.urlAvatar ? `${SENATE_SITE}${str(s.urlAvatar)}` : '',
        organs: (Array.isArray(s.organismes) ? (s.organismes as Json[]) : []).map((o) => ({ code: str(o.code), type: str(o.type), name: str(o.libelle) }))
      }
    ]
  })
}

const COMBINING: Record<string, string> = { acute: '́', grave: '̀', circ: '̂', uml: '̈', cedil: '̧' }

/** The few HTML entities senat.fr writes, and numeric ones. */
export function decodeHtml(s: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    deg: '°',
    laquo: '«',
    raquo: '»',
    rsquo: '’',
    lsquo: '‘'
  }
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name: string) => {
      if (named[name]) return named[name]
      // Accented letters: &eacute; &Agrave; &ccedil; &oelig;…
      const letter = name.match(/^([a-z])(acute|grave|circ|uml|cedil)$/i)
      if (letter) return `${letter[1]}${COMBINING[letter[2].toLowerCase()]}`.normalize('NFC')
      if (/^oelig$/i.test(name)) return name[0] === 'O' ? 'Œ' : 'œ'
      return m
    })
}

/** Text of an HTML snippet: tags dropped, entities decoded, whitespace collapsed. */
export const htmlText = (html: string) =>
  decodeHtml(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

/** The groups' colours, from the hemicycle of the Sénat's home page: { UMP: "#2E70D1", … }. */
export function parseSenateColors(html: string): Record<string, string> {
  const attr = html.match(/<hemicycle-groups\s+groups="([^"]*)"/)?.[1]
  if (!attr) return {}
  try {
    const groups = JSON.parse(decodeHtml(attr)) as Array<{ id?: string; color?: string }>
    return Object.fromEntries(groups.filter((g) => g.id && /^#[0-9a-f]{6}$/i.test(g.color ?? '')).map((g) => [g.id!, g.color!]))
  } catch {
    return {}
  }
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** "29 octobre 2026", "1er juillet 2026" → "2026-10-29"; '' when it isn't a date. */
export function frenchDate(text: string): string {
  const m = foldText(text).match(/(\d{1,2})(?:er)?\s+([a-z]+)\s+(\d{4})/)
  if (!m) return ''
  const month = MONTHS.map(foldText).indexOf(m[2]) + 1
  return month ? `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''
}

export interface SenateBallotHead {
  number: number
  /** YYYY-MM-DD */
  date: string
  /** "sur l'amendement n° 5, présenté par M. Bernard Jomier… à l'article 1er de la proposition de loi…" */
  title: string
  /** "adopté", "rejeté": as the Assemblée's data says it. */
  result: string
  /** The legislative file: "pjl25-911". */
  bill: string
  /** The amendment's page, when the ballot is on one. */
  amendmentUrl: string
}

const result = (badge: string) => (/^adopt/i.test(foldText(badge)) ? 'adopté' : /^rejet/i.test(foldText(badge)) ? 'rejeté' : foldText(badge))

/** A ballot's head, from its page ("Scrutin n°44 - séance du 29 octobre 2026"); null when the page isn't one. */
export function parseSenateBallotPage(html: string): SenateBallotHead | null {
  const heading = htmlText(html.match(/<h1 class="page-title"[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '')
  const number = Number(heading.match(/n°\s*(\d+)/)?.[1])
  const date = frenchDate(heading)
  if (!number || !date) return null
  const lead = htmlText(html.match(/<p class="page-lead"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '')
  const badge = htmlText(html.match(/<span class="badge[^"]*"[^>]*>([^<]*)</)?.[1] ?? '')
  return {
    number,
    date,
    title: lead,
    result: result(badge),
    bill: html.match(/href="\/dossier-legislatif\/([a-z0-9-]+)\.html"/)?.[1] ?? '',
    amendmentUrl: html.match(/href="(https:\/\/www\.senat\.fr\/amendements\/[^"]+)"/)?.[1] ?? ''
  }
}

/** Every ballot of a session from its page: number, date, subject, result and legislative file. */
export function parseSenateSessionPage(html: string): SenateBallotHead[] {
  const heads: SenateBallotHead[] = []
  let date = ''
  // The page lists days ("21 juillet 2026"), each with its ballots, as paragraphs.
  for (const m of html.matchAll(/<div class="list-group-subtitle">([^<]*)<\/div>|<p class="my-2">([\s\S]*?)<\/p>/g)) {
    if (m[1] !== undefined) {
      date = frenchDate(htmlText(m[1]))
      continue
    }
    const p = m[2]
    const number = Number(p.match(/scr\d+-(\d+)\.html/)?.[1])
    if (!number || !date) continue
    const text = htmlText(p.replace(/<span class="badge[\s\S]*$/, ''))
      .replace(/^Scrutin N°\s*\d+\s*:\s*/i, '')
      .replace(/\s*-\s*consulter le dossier l[ée]gislatif\s*\.?\s*$/i, '')
    heads.push({
      number,
      date,
      title: text,
      result: result(htmlText(p.match(/<span class="badge[^"]*"[^>]*>([^<]*)</)?.[1] ?? '')),
      bill: p.match(/\/dossier-legislatif\/([a-z0-9-]+)\.html/)?.[1] ?? '',
      amendmentUrl: ''
    })
  }
  return heads
}

const VOTE_CODES: Record<string, Position> = { p: 'for', c: 'against', a: 'abstention', n: 'nonVoting' }

/** Each senator's vote in a ballot ({"votes":[{"matricule","vote":"p|c|a|n","siege"}]}). */
export function parseSenateVotes(json: unknown): Array<{ senator: string; position: Position }> {
  const votes = (json as { votes?: unknown })?.votes
  if (!Array.isArray(votes)) throw new Error('The Sénat’s votes have changed shape')
  return (votes as Json[]).flatMap((v) => {
    const position = VOTE_CODES[str(v.vote)]
    const senator = str(v.matricule).toUpperCase()
    return position && senator ? [{ senator, position }] : []
  })
}

/** The bill a Sénat ballot is about, as its subject names it: "projet de loi relatif à la protection des enfants". */
export function senateBillTitle(title: string): string {
  const m = title.match(
    /\b(?:du|de la|des) ((?:projet|proposition)s? de loi(?: organique| constitutionnelle)?[^,;]*?|texte élaboré par la commission mixte paritaire[^,;]*?)(?: \(|$|,|;|\.)/i
  )
  return m ? m[1].trim() : ''
}

// ---------------------------------------------------------------- agenda

export interface SenateEvent {
  id: string
  /** YYYY-MM-DD; the caller makes it a time with the Paris offset (parisIso). */
  day: string
  hour: string
  title: string
  place: string
  organ: string
  sitting: boolean
  tentative: boolean
  public: boolean
}

/** The agenda API's days ({"2026-10-29":{"events":[…]}}), as events, by day and hour. */
export function parseSenateAgenda(json: unknown): SenateEvent[] {
  if (!json || typeof json !== 'object') return []
  const events: SenateEvent[] = []
  for (const [day, value] of Object.entries(json as Record<string, Json>)) {
    for (const e of Array.isArray(value?.events) ? (value.events as Json[]) : []) {
      const instances = (Array.isArray(e.instances) ? (e.instances as unknown[]) : []).map(str).filter(Boolean)
      events.push({
        id: `SE-${str(e.id)}`,
        day: str(e.date) || day,
        hour: str(e.hour),
        title: str(e.title).replace(/\s+/g, ' ').trim(),
        place: str(e.place),
        organ: instances.filter((i) => i !== 'Séance publique').join(', ') || (instances.includes('Séance publique') ? 'Séance publique' : ''),
        sitting: instances.includes('Séance publique'),
        tentative: !!e.forecast,
        public: !!e.public
      })
    }
  }
  const minutes = (h: string) => {
    const m = h.match(/(\d{1,2})h(\d{2})?/)
    return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 24 * 60
  }
  return events.sort((a, b) => a.day.localeCompare(b.day) || minutes(a.hour) - minutes(b.hour))
}

/** "10h30" → "10:30:00", for an ISO time. */
export const senateHour = (hour: string) => {
  const m = hour.match(/(\d{1,2})h(\d{2})?/)
  return m ? `${m[1].padStart(2, '0')}:${m[2] ?? '00'}:00` : '00:00:00'
}

/** The URL of the agenda of a week (Monday) or a day. */
export const senateAgendaUrl = (day: string, week: boolean) => `${SENATE_AGENDA_API}?date=${day}&week=${week ? 1 : 0}`

/** The Monday of a day's week. */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  return addDays(day, -((d.getUTCDay() + 6) % 7))
}
