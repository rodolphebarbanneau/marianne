import { randomUUID } from 'node:crypto'
import type { ServiceStorage } from '@marianne/sdk/main'
import { networkOf } from './networks'
import { parseMoment } from './time'
import type { NewTrip, Trip } from './types'

/** The user's trips, in the service's storage (the encrypted archive): what they recorded, and what they said they paid. */

const KEY = 'trips'
const DAY = 86_400_000
/** Paid trips are kept this long after they were paid, then dropped. */
const PAID_KEPT_MS = 180 * DAY
/** A passage may be a few minutes ahead of this computer's clock, no more. */
const AHEAD_MS = 5 * 60_000

/** Why a trip can't be recorded. */
export type TripProblem = 'vehicle' | 'network' | 'date' | 'future'

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isMoment = (v: unknown): v is string => isText(v) && !Number.isNaN(new Date(v).getTime())

/** A stored trip as it should be; anything else is left out. */
function readTrip(raw: unknown): Trip | null {
  const t = (raw ?? {}) as Partial<Trip>
  if (!isText(t.id) || !isText(t.vehicleId) || !isText(t.network) || !isMoment(t.at)) return null
  if (t.paidAt !== undefined && !isMoment(t.paidAt)) return null
  const iso = (v: string) => new Date(v).toISOString()
  return { id: t.id, vehicleId: t.vehicleId, network: t.network, at: iso(t.at), ...(t.paidAt ? { paidAt: iso(t.paidAt) } : {}) }
}

/** What to record of a new trip, or why it can't be: a known vehicle and network, a passage that has happened. */
export function checkTrip(input: NewTrip, vehicleIds: string[], now: Date): { trip: Omit<Trip, 'id'> } | { problem: TripProblem } {
  const { vehicleId, network, at } = (input ?? {}) as Partial<NewTrip>
  if (!isText(vehicleId) || !vehicleIds.includes(vehicleId)) return { problem: 'vehicle' }
  if (!isText(network) || !networkOf(network)) return { problem: 'network' }
  const moment = typeof at === 'string' ? parseMoment(at) : null
  if (!moment) return { problem: 'date' }
  if (moment.getTime() > now.getTime() + AHEAD_MS) return { problem: 'future' }
  return { trip: { vehicleId, network, at: moment.toISOString() } }
}

export class TripStore {
  constructor(private readonly storage: ServiceStorage) {}

  /** The trips, most recent passage first. */
  list(): Trip[] {
    const stored = this.storage.get<unknown[]>(KEY)
    return (Array.isArray(stored) ? stored : [])
      .map(readTrip)
      .filter((t): t is Trip => t !== null)
      .sort((a, b) => b.at.localeCompare(a.at))
  }

  /** Record a trip; the same vehicle on the same network in the same minute is the one already recorded. */
  add(trip: Omit<Trip, 'id'>): { trip: Trip; added: boolean } {
    const trips = this.list()
    const minute = (iso: string) => iso.slice(0, 16)
    const same = trips.find((t) => t.vehicleId === trip.vehicleId && t.network === trip.network && minute(t.at) === minute(trip.at))
    if (same) return { trip: same, added: false }
    const ids = new Set(trips.map((t) => t.id))
    let id = randomUUID().slice(0, 8)
    while (ids.has(id)) id = randomUUID().slice(0, 8)
    const added: Trip = { id, ...trip }
    this.save([added, ...trips])
    return { trip: added, added: true }
  }

  /** Mark a trip paid (now) or not paid. */
  setPaid(id: string, paidAt: Date | null): Trip[] {
    const trips = this.list()
    const trip = trips.find((t) => t.id === id)
    if (!trip) throw new Error('Trajet introuvable : il a peut-être été supprimé.')
    if (paidAt) trip.paidAt = paidAt.toISOString()
    else delete trip.paidAt
    return this.save(trips)
  }

  remove(id: string): Trip[] {
    const trips = this.list()
    if (!trips.some((t) => t.id === id)) throw new Error('Trajet introuvable : il a peut-être été supprimé.')
    return this.save(trips.filter((t) => t.id !== id))
  }

  /** Store the trips, without those paid long ago; gives back what is kept. */
  private save(trips: Trip[]): Trip[] {
    const now = Date.now()
    const kept = trips.filter((t) => !t.paidAt || now - new Date(t.paidAt).getTime() < PAID_KEPT_MS).sort((a, b) => b.at.localeCompare(a.at))
    this.storage.set(KEY, kept)
    return kept
  }
}
