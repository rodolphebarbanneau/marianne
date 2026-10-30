import type { TodayItem } from '@marianne/sdk'
import { AGENDA_PAGE, SENATE_AGENDA_PAGE, videoKey } from './links'
import type { LiveStream, Meeting } from './types'

/** The Parliament's lines of "Aujourd'hui": the sittings and committee meetings of the day, in both chambers. */

const SOURCES = { an: 'Assemblée nationale', se: 'Sénat' }

const short = (s: string, max = 240) => (s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s)

/** A meeting as a line of the day: a sitting by its agenda, a committee by its name. */
export function meetingLine(m: Meeting, live = false): TodayItem {
  const sitting = m.kind === 'sitting'
  const detail = [m.state === 'tentative' ? 'À confirmer' : '', short(m.items.join(' ; '))].filter(Boolean).join(' · ')
  return {
    id: m.id,
    title: sitting ? 'Séance publique' : m.organ || 'Réunion de commission',
    ...(detail ? { detail } : {}),
    start: m.start,
    ...(m.end ? { end: m.end } : {}),
    ...(m.place && !sitting ? { place: m.place } : {}),
    url: m.chamber === 'se' ? SENATE_AGENDA_PAGE : AGENDA_PAGE,
    ...(live ? { live: true } : {}),
    ...(m.state === 'cancelled' ? { cancelled: true } : {}),
    source: SOURCES[m.chamber],
    params: { meeting: m.id }
  }
}

/** A broadcast as a line of the day, when the Assemblée's agenda isn't indexed yet: its video when the portal has it, else its meeting. */
export function streamLine(s: LiveStream): TodayItem {
  const detail = s.title || s.subject
  return {
    id: s.id,
    title: s.organ || 'Réunion',
    ...(detail ? { detail: short(detail) } : {}),
    start: s.startAt,
    ...(s.place ? { place: s.place } : {}),
    url: s.chamber === 'se' ? SENATE_AGENDA_PAGE : AGENDA_PAGE,
    ...(s.live ? { live: true } : {}),
    source: SOURCES[s.chamber],
    params: s.video ? { video: videoKey(s.chamber, s.video) } : s.chamber === 'se' ? { video: `se:${s.id}` } : { meeting: s.meeting ?? s.id }
  }
}

/**
 * The lines of a day: the sittings and committee meetings of both chambers' agendas, live ones
 * flagged; without the Assemblée's agenda (not synced yet), its broadcasts of the day, the filmed part of it.
 */
export function todayItems(day: string, meetings: Array<Meeting & { live?: boolean }>, streams: LiveStream[]): TodayItem[] {
  const agenda = meetings.filter((m) => m.kind !== 'other')
  const live = new Set(streams.filter((s) => s.live).map((s) => s.id))
  // The agenda says which meeting a broadcast shows (liveMeetings); without it, the broadcast's own id.
  const lines = agenda.map((m) => meetingLine(m, m.live ?? live.has(m.id)))
  if (!agenda.some((m) => m.chamber === 'an')) lines.push(...streams.filter((s) => s.chamber === 'an' && s.startAt.startsWith(day)).map(streamLine))
  return lines.sort((a, b) => a.start.localeCompare(b.start))
}
