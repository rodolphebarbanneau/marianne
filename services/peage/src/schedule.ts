import type { ServiceDeadline, ServiceSummary } from '@marianne/sdk'
import { hostOf, networkOf } from './networks'
import { duration, parisIso, shortDay, when } from './time'
import type { Trip } from './types'

/** What is due and when: a trip's deadline is its passage plus its network's time to pay. Pure, for both sides. */

const HOUR = 3600_000
/** Under this, a deadline is urgent. */
export const URGENT_MS = 24 * HOUR

/** When a trip's toll is due; null for a network no longer in the catalog. */
export function dueOf(trip: Trip): Date | null {
  const network = networkOf(trip.network)
  return network ? new Date(new Date(trip.at).getTime() + network.deadlineHours * HOUR) : null
}

/** The unpaid trips, the soonest deadline first (those of a network no longer in the catalog last). */
export function unpaid(trips: Trip[]): Trip[] {
  const due = (t: Trip) => dueOf(t)?.getTime() ?? Infinity
  return trips.filter((t) => !t.paidAt).sort((a, b) => due(a) - due(b) || a.at.localeCompare(b.at))
}

/** The unpaid trips with their deadline, the soonest first; those of a network no longer in the catalog are left out. */
export function dueTrips(trips: Trip[]): Array<{ trip: Trip; due: Date }> {
  return unpaid(trips).flatMap((t) => {
    const due = dueOf(t)
    return due ? [{ trip: t, due }] : []
  })
}

/** The paid trips, the last paid first. */
export const paid = (trips: Trip[]): Trip[] => trips.filter((t) => t.paidAt).sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''))

/** "reste 2 j 5 h", "délai dépassé depuis le 31/10 à 14 h 30" */
export function leftText(due: Date, now: Date): string {
  const left = due.getTime() - now.getTime()
  return left > 0 ? `reste ${duration(left)}` : `délai dépassé depuis ${when(due)}`
}

/** One deadline per unpaid trip, in the user's deadlines and reminders; due in Paris time, so that its date is the Paris day. */
export function tripDeadlines(trips: Trip[]): ServiceDeadline[] {
  return unpaid(trips).flatMap((t): ServiceDeadline[] => {
    const network = networkOf(t.network)
    const due = dueOf(t)
    if (!network || !due) return []
    return [
      {
        id: t.id,
        domain: 'mobility',
        title: `Péage ${network.short} : trajet du ${shortDay(new Date(t.at))} à payer`,
        due: parisIso(due),
        detail: `sur ${hostOf(network.payUrl)} (${network.operator}), jamais depuis un lien reçu par SMS`,
        params: { trip: t.id, vehicle: t.vehicleId }
      }
    ]
  })
}

/** The line of the Mobilité dashboard: what is left to pay and the first deadline; null when nothing is. */
export function tripSummary(trips: Trip[], now: Date): ServiceSummary | null {
  const due = dueTrips(trips)
  if (!due.length) return null
  const [first] = due
  const count = `${due.length} trajet${due.length > 1 ? 's' : ''} à payer`
  const late = first.due.getTime() <= now.getTime()
  return {
    text: late ? `${count} · délai dépassé depuis ${when(first.due)}` : `${count} · ${due.length > 1 ? 'le premier ' : ''}avant ${when(first.due)}`,
    detail: late
      ? 'passé le délai, un avis de paiement peut suivre par courrier : payez sans attendre sur le site officiel'
      : 'sur le site officiel de la société d’autoroute, jamais depuis un lien reçu par SMS',
    urgency: first.due.getTime() - now.getTime() < URGENT_MS ? 'urgent' : 'soon',
    params: { trip: first.trip.id }
  }
}
