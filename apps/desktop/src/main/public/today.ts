import type { TodayEvent } from '../../shared/public'
import { fetchJson, query } from '../http'
import { log } from '../log'
import { serviceToday } from '../host'
import { franceDigest } from './france'
import { isEnabled, sourceUrl } from './sources'
import { frenchDay, nextDay, parisDay } from './time'

/**
 * "Aujourd'hui": what happens today in public life. Public holidays (calendrier.api.gouv.fr),
 * school holidays (Éducation nationale open data), the clock change, the changes Service-Public
 * announces for today, and what the services that are on add (the Assemblée's sittings…). Each
 * part may fail alone.
 */

const SCHOOL_CALENDAR = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records'

async function holidayEvents(day: string, tomorrow: string): Promise<TodayEvent[]> {
  if (!isEnabled('calendar')) return []
  const years = [...new Set([day.slice(0, 4), tomorrow.slice(0, 4)])]
  const lists = await Promise.all(
    years.map((y) => fetchJson<Record<string, string>>(`${sourceUrl('calendar')}/jours-feries/metropole/${y}.json`, { cacheMs: 86_400_000 }))
  )
  const holidays = Object.assign({}, ...lists) as Record<string, string>
  return [day, tomorrow].flatMap((d) =>
    holidays[d]
      ? [
          {
            id: `holiday-${d}`,
            kind: 'holiday' as const,
            title: d === day ? `Jour férié : ${holidays[d]}` : `Demain, jour férié : ${holidays[d]}`,
            start: d,
            source: 'Calendrier officiel'
          }
        ]
      : []
  )
}

interface SchoolPeriod {
  description: string
  start_date: string
  end_date: string
  zones: string
  population: string
}

const ZONES = ['Zone A', 'Zone B', 'Zone C', 'Corse']

const list = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} et ${words.at(-1)}` : (words[0] ?? ''))

/** "zones A, B et C, Corse". */
function zoneList(zones: Set<string>): string {
  const letters = ['A', 'B', 'C'].filter((l) => zones.has(`Zone ${l}`))
  return [letters.length ? `zone${letters.length > 1 ? 's' : ''} ${list(letters)}` : '', zones.has('Corse') ? 'Corse' : ''].filter(Boolean).join(', ')
}

/** School holidays in progress in metropolitan France, one line per holiday. */
export function schoolEvents(day: string, periods: SchoolPeriod[]): TodayEvent[] {
  const byName = new Map<string, { zones: Set<string>; end: string }>()
  for (const p of periods) {
    if (!ZONES.includes(p.zones) || p.population === 'Enseignants') continue
    const end = parisDay(new Date(p.end_date))
    if (parisDay(new Date(p.start_date)) > day || end <= day) continue
    const g = byName.get(p.description) ?? { zones: new Set(), end }
    g.zones.add(p.zones)
    if (end > g.end) g.end = end
    byName.set(p.description, g)
  }
  return [...byName].map(([name, g]) => ({
    id: `school-${name}-${day}`,
    kind: 'school' as const,
    title: name,
    detail: `${zoneList(g.zones)} · reprise des cours le ${frenchDay(g.end, true)}`,
    start: day,
    source: 'Éducation nationale'
  }))
}

async function schoolHolidays(day: string): Promise<TodayEvent[]> {
  const data = await fetchJson<{ results?: SchoolPeriod[] }>(
    `${SCHOOL_CALENDAR}${query({
      where: `start_date <= "${nextDay(day)}" and end_date >= "${day}"`,
      select: 'description,start_date,end_date,zones,population',
      limit: 100
    })}`,
    { cacheMs: 6 * 3600_000 }
  )
  return schoolEvents(day, data.results ?? [])
}

/** The last Sunday of a month (March: summer time, October: winter time). */
function lastSunday(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0))
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

export function clockEvents(day: string, tomorrow: string): TodayEvent[] {
  const year = Number(day.slice(0, 4))
  const changes = [
    { date: lastSunday(year, 3), text: 'passage à l’heure d’été : à 2 h, il sera 3 h' },
    { date: lastSunday(year, 10), text: 'passage à l’heure d’hiver : à 3 h, il sera 2 h' }
  ]
  return changes
    .filter((c) => c.date === day || c.date === tomorrow)
    .map((c) => ({
      id: `clock-${c.date}`,
      kind: 'clock' as const,
      title: `${c.date === day ? 'Cette nuit' : 'La nuit prochaine'}, ${c.text}`,
      start: c.date,
      source: 'Calendrier officiel'
    }))
}

async function changeEvents(day: string): Promise<TodayEvent[]> {
  const { changes } = await franceDigest()
  return changes
    .filter((c) => c.from === day)
    .map((c) => ({
      id: `change-${c.id}`,
      kind: 'change' as const,
      title: c.title,
      ...(c.when ? { detail: c.when } : {}),
      start: day,
      url: c.url,
      source: 'Service public'
    }))
}

/** Today's events: whole days first (holidays, clock, changes), then the agenda by time. */
export async function todayEvents(now = new Date()): Promise<TodayEvent[]> {
  const day = parisDay(now)
  const tomorrow = nextDay(day)
  const parts = await Promise.allSettled([
    holidayEvents(day, tomorrow),
    Promise.resolve(clockEvents(day, tomorrow)),
    schoolHolidays(day),
    changeEvents(day),
    serviceToday(day)
  ])
  return parts.flatMap((p) => {
    if (p.status === 'fulfilled') return p.value
    log.warn('Today:', (p.reason as Error).message)
    return []
  })
}
