import type { TodayItem } from '@marianne/sdk'
import { AGENDA_PAGE } from './links'
import type { LiveStream, Meeting } from './types'

/** The Assemblée's lines of "Aujourd'hui": its sittings and committee meetings of the day. */

const SOURCE = 'Assemblée nationale'

const short = (s: string, max = 240) => (s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s)

/** A meeting as a line of the day: a sitting by its agenda, a committee by its name. */
export function meetingLine(m: Meeting, stream?: LiveStream): TodayItem {
  const sitting = m.kind === 'sitting'
  const detail = [m.state === 'tentative' ? 'À confirmer' : '', short(m.items.join(' ; '))].filter(Boolean).join(' · ')
  return {
    id: m.id,
    title: sitting ? 'Séance publique' : m.organ || 'Réunion de commission',
    ...(detail ? { detail } : {}),
    start: m.start,
    ...(m.end ? { end: m.end } : {}),
    ...(m.place && !sitting ? { place: m.place } : {}),
    url: AGENDA_PAGE,
    ...(stream?.live ? { live: true } : {}),
    ...(m.state === 'cancelled' ? { cancelled: true } : {}),
    source: SOURCE,
    params: { meeting: m.id }
  }
}

/** A broadcast as a line of the day, when the agenda isn't indexed yet. */
export function streamLine(s: LiveStream): TodayItem {
  const detail = s.title || s.subject
  return {
    id: s.meetingId,
    title: s.organ || 'Réunion',
    ...(detail ? { detail: short(detail) } : {}),
    start: s.startAt,
    ...(s.place ? { place: s.place } : {}),
    url: AGENDA_PAGE,
    ...(s.live ? { live: true } : {}),
    source: SOURCE,
    params: { meeting: s.meetingId }
  }
}

/**
 * The lines of a day: its sittings and committee meetings from the agenda, live ones flagged;
 * without an agenda (not synced yet), today's broadcasts, the filmed part of it.
 */
export function todayItems(day: string, meetings: Meeting[], streams: LiveStream[]): TodayItem[] {
  const agenda = meetings.filter((m) => m.kind !== 'other')
  const live = new Map(streams.map((s) => [s.meetingId, s]))
  if (agenda.length) return agenda.map((m) => meetingLine(m, live.get(m.id)))
  return streams.filter((s) => s.startAt.startsWith(day)).map(streamLine)
}
