import type { Vehicle } from '@marianne/sdk/main'

export type { Vehicle }

/** A motorway section with free-flow tolling (no barriers: the toll is paid after the passage), and how to pay it. */
export interface TollNetwork {
  /** Stable: trips refer to it ("a13-a14"). */
  id: string
  /** "A13-A14 Paris–Normandie" */
  name: string
  /** For titles: "A13-A14". */
  short: string
  motorways: string[]
  /** The concessionaire that collects the toll. */
  operator: string
  /** The official page to pay by plate, online. */
  payUrl: string
  /** The official page of the customer account (automatic payment, reminders). */
  accountUrl?: string
  /** Time to pay after the passage, without a badge or an account that pays automatically. */
  deadlineHours: number
  /** The ways to pay, in French. */
  channels: string[]
  /** What happens when the toll isn't paid in time, in French. */
  penalties: string
  /** The operator's customer service. */
  phone?: string
  /** The official pages this entry is based on. */
  sources: string[]
  /** The day it was last checked against its sources (YYYY-MM-DD). */
  checked: string
}

/** A free-flow passage the user keeps (ctx.storage, key "trips"). */
export interface Trip {
  id: string
  /** One of the user's vehicles (profile). */
  vehicleId: string
  /** A TollNetwork id. */
  network: string
  /** The passage, ISO (UTC). */
  at: string
  /** When the user said it was paid, ISO (UTC). */
  paidAt?: string
}

export interface NewTrip {
  vehicleId: string
  network: string
  /** ISO date and time of the passage. */
  at: string
}

/** The user's vehicles as the service may see them: their ids, and their plates once granted. */
export interface Vehicles {
  /** The user let the service read their plates. */
  granted: boolean
  list: Vehicle[]
}

/** What the view calls. The changes give back the trips as they are now. */
export type PeageMethods = {
  /** The catalog of free-flow sections. */
  networks(): TollNetwork[]
  vehicles(): Vehicles
  /** The user's trips, most recent passage first. */
  trips(): Trip[]
  addTrip(trip: NewTrip): Trip[]
  markPaid(id: string): Trip[]
  markUnpaid(id: string): Trip[]
  removeTrip(id: string): Trip[]
}
