import type { ServiceTile } from '@marianne/sdk'
import { NETWORKS, networkOf } from './networks'
import { dueTrips, URGENT_MS } from './schedule'
import { clock, parisInput, shortDay, when } from './time'
import type { Trip } from './types'

/**
 * 3615 PEAGE's tile on the Services page: how many trips are left to pay, the first one and its
 * deadline, a button that opens it; a calm tile when nothing is. From what the user keeps, so no
 * network; days in Paris time, as the deadlines. Pure.
 */

/** Under this, the first deadline is near; under URGENT_MS, urgent. */
const SOON_MS = 48 * 3600_000

const parisDay = (date: Date) => parisInput(date).slice(0, 10)

/** The calendar day after "2026-10-31": "2026-11-01". */
function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10)
}

/** "aujourd’hui avant 18 h", "avant demain 18 h", "avant le 02/11 à 18 h", "délai dépassé depuis le 31/10 à 14 h 30". */
export function dueText(due: Date, now: Date): string {
  if (due.getTime() <= now.getTime()) return `délai dépassé depuis ${when(due)}`
  const today = parisDay(now)
  if (parisDay(due) === today) return `aujourd’hui avant ${clock(due)}`
  if (parisDay(due) === nextDay(today)) return `avant demain ${clock(due)}`
  return `avant ${when(due)}`
}

/** The tile of the user's trips at a moment; `granted`: the user let the service read their plates, without which no trip can be noted. */
export function tripTile(trips: Trip[], granted: boolean, now: Date): ServiceTile {
  const due = dueTrips(trips)
  if (!due.length)
    return granted || trips.length
      ? {
          title: 'aucun trajet à payer',
          lines: [{ text: `notez vos passages en flux libre : ${Math.min(...NETWORKS.map((n) => n.deadlineHours))} h pour payer`, tone: 'dim' }]
        }
      : { title: 'vos plaques ?', lines: [{ text: 'accordez l’accès à vos plaques pour noter vos trajets', tone: 'dim' }] }
  const [first] = due
  const left = first.due.getTime() - now.getTime()
  const late = left <= 0
  // The screen opens on that trip, with its ways to pay.
  const params = { trip: first.trip.id }
  return {
    value: { text: String(due.length), unit: due.length > 1 ? 'trajets à payer' : 'trajet à payer' },
    lines: [
      { text: `${networkOf(first.trip.network)?.name ?? first.trip.network} · ${shortDay(new Date(first.trip.at))}` },
      { text: dueText(first.due, now), tone: late ? 'bad' : 'accent' }
    ],
    ...(left < URGENT_MS ? { urgency: 'urgent' as const } : left < SOON_MS ? { urgency: 'soon' as const } : {}),
    action: { label: 'payer', params },
    params
  }
}
