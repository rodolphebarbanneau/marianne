import { defineTool, table, ToolError, type ServiceContext, type ServiceTool, type Vehicle } from '@marianne/sdk/main'
import * as z from 'zod'
import { NETWORKS, networkOf, SCAM_SOURCES } from './networks'
import { dueOf, paid, unpaid } from './schedule'
import { checkTrip, type TripProblem, type TripStore } from './store'
import { durationEn, stamp } from './time'
import type { Trip, TollNetwork } from './types'

/** The tools engines see as peage_<name>: the catalog, the user's trips and what is due, and recording a trip. None pays. */

const NO_AMOUNTS = "3615 PEAGE doesn't know the amounts due: the operator's official payment page shows them from the plate. Never state or guess an amount."
const SCAMS =
  'Operators send no payment link by SMS: a text or email claiming an unpaid toll is a scam; pay only on the official page, typed in, never from a link received.'
const SETTINGS_SERVICES = 'marianne:settings/services'
const SETTINGS_HOUSEHOLD = 'marianne:settings/household'

/** A vehicle for the model: its plate when granted (the app turns it into a token), its model when known, its id. */
function vehicleName(vehicles: Vehicle[], id: string): string {
  const v = vehicles.find((x) => x.id === id)
  const named = [v?.plate, v?.model].filter(Boolean).join(', ')
  return named ? `${named} (id ${id})` : `vehicle ${id}`
}

function describeNetwork(n: TollNetwork): string {
  return [
    `### ${n.name} (id ${n.id})`,
    `- Motorways: ${n.motorways.join(', ')} · operator: ${n.operator}`,
    `- Time to pay: ${n.deadlineHours} h after the passage, without a toll badge or an account that pays automatically`,
    `- Pay online by plate (official): ${n.payUrl}`,
    ...(n.accountUrl ? [`- Customer account (automatic payment, reminders): ${n.accountUrl}`] : []),
    `- Ways to pay (French): ${n.channels.join(' ; ')}`,
    `- If unpaid (French): ${n.penalties}`,
    ...(n.phone ? [`- Customer service: ${n.phone}`] : []),
    `- Sources (checked ${n.checked}): ${n.sources.join(' ; ')}`
  ].join('\n')
}

/** Why the model can't record a trip, and what to do about it. */
function problemText(problem: TripProblem, args: { vehicle: string; network: string; at: string }, granted: boolean, vehicles: Vehicle[]): string {
  switch (problem) {
    case 'vehicle':
      if (!granted)
        return `3615 PEAGE can't see the user's vehicles: they haven't let it read their plates. They can allow it in Réglages › Services (${SETTINGS_SERVICES}).`
      if (!vehicles.length) return `The user has no vehicle in their profile: they add one in Réglages › Foyer & entités (${SETTINGS_HOUSEHOLD}).`
      return `No vehicle of the user has the id "${args.vehicle}". Their vehicles: ${vehicles.map((v) => vehicleName(vehicles, v.id)).join('; ')}.`
    case 'network':
      return `No free-flow network has the id "${args.network}". Networks: ${NETWORKS.map((n) => `${n.id} (${n.name})`).join(', ')}.`
    case 'date':
      return `"${args.at}" is not a date and time: give ISO 8601, e.g. 2026-10-28T14:30 (Paris time) or 2026-10-28T13:30:00Z.`
    case 'future':
      return `The passage (${args.at}) is in the future: record a trip once it has happened.`
  }
}

/** The trips as a table for the model. */
function tripTable(trips: Trip[], vehicles: Vehicle[], now: Date): string {
  return table(
    ['trip', 'vehicle', 'network', 'passage (Paris)', 'pay by (Paris)', 'status'],
    trips.map((t) => {
      const network = networkOf(t.network)
      const due = dueOf(t)
      const left = due ? due.getTime() - now.getTime() : 0
      const status = t.paidAt
        ? `marked paid ${stamp(new Date(t.paidAt))}`
        : !due
          ? 'network no longer in the catalog'
          : left > 0
            ? `${durationEn(left)} left`
            : 'deadline passed: a payment notice may follow by mail'
      return [
        t.id,
        vehicleName(vehicles, t.vehicleId),
        network ? `${network.name} (${network.id})` : t.network,
        stamp(new Date(t.at)),
        due ? stamp(due) : '',
        status
      ]
    })
  )
}

export function createTools(ctx: Pick<ServiceContext, 'profile'>, store: TripStore): ServiceTool[] {
  const plates = () => ctx.profile.granted().includes('vehicles.plate')

  return [
    defineTool({
      name: 'networks',
      label: 'autoroutes en flux libre',
      description:
        'The French motorway sections with free-flow tolling (no barriers, the toll is paid after the passage): for each, its id, motorways and operator, the official page to pay by plate, ' +
        'the customer account page, the time to pay after the passage, the other ways to pay (toll badge, Nirio tobacconists, terminals), what happens when it is not paid in time, ' +
        'the customer service and the official sources. Amounts are not known.',
      input: {},
      readOnly: true,
      run: async () => {
        const sections = NETWORKS.map(describeNetwork).join('\n\n')
        return ['## Free-flow toll networks', '', sections, '', NO_AMOUNTS, `${SCAMS} Sources: ${SCAM_SOURCES.join(' ; ')}`].join('\n')
      }
    }),

    defineTool({
      name: 'trips',
      label: 'trajets à payer',
      description:
        "The user's free-flow trips recorded in 3615 PEAGE: the unpaid ones, soonest deadline first, with the deadline (passage + the network's time to pay, Paris time) and the time left; " +
        'with paid: true, also those they marked paid. Lists their vehicles too (ids for peage_add_trip). Amounts are not known: never state one.',
      input: { paid: z.boolean().default(false).describe('Also list the trips marked paid') },
      readOnly: true,
      run: async ({ paid: withPaid }) => {
        const now = new Date()
        const trips = store.list()
        const vehicles = ctx.profile.vehicles()
        const due = unpaid(trips)
        const done = withPaid ? paid(trips) : []
        const parts: string[] = []
        if (due.length) parts.push(`## Unpaid trips (${due.length})`, '', tripTable(due, vehicles, now))
        else parts.push('No unpaid free-flow trip is recorded in 3615 PEAGE.')
        if (done.length) parts.push('', `## Marked paid (${done.length})`, '', tripTable(done, vehicles, now))
        const used = [...new Set(due.map((t) => t.network))].flatMap((id) => networkOf(id) ?? [])
        if (used.length) parts.push('', `Official payment pages: ${used.map((n) => `${n.short} → ${n.payUrl} (${n.operator})`).join(' ; ')}.`)
        parts.push('', NO_AMOUNTS, SCAMS)
        parts.push(
          '',
          !plates()
            ? `Vehicles: the user hasn't let 3615 PEAGE read their plates (Réglages › Services, ${SETTINGS_SERVICES}); vehicles show by id only.`
            : vehicles.length
              ? `Vehicles: ${vehicles.map((v) => vehicleName(vehicles, v.id)).join('; ')}.`
              : `Vehicles: none in the profile (Réglages › Foyer & entités, ${SETTINGS_HOUSEHOLD}).`
        )
        return parts.join('\n')
      }
    }),

    defineTool({
      name: 'add_trip',
      label: 'ajouter un trajet',
      description:
        "Records a free-flow passage of one of the user's vehicles in 3615 PEAGE, when they tell you about one: its deadline then joins their deadlines and reminders. " +
        'Give the vehicle id (peage_trips or the profile), the network id (peage_networks) and the date and time of the passage. It pays nothing.',
      input: {
        vehicle: z.string().trim().min(1).describe('The vehicle id'),
        network: z.string().trim().min(1).describe('The network id, e.g. "a13-a14"'),
        at: z.string().trim().min(10).describe('Date and time of the passage, ISO 8601: Paris time without an offset ("2026-10-28T14:30"), or with one')
      },
      run: async (args) => {
        const vehicles = ctx.profile.vehicles()
        const ids = vehicles.map((v) => v.id)
        const checked = checkTrip({ vehicleId: args.vehicle, network: args.network, at: args.at }, ids, new Date())
        if ('problem' in checked) throw new ToolError(problemText(checked.problem, args, plates(), vehicles))
        const { trip, added } = store.add(checked.trip)
        const network = networkOf(trip.network)!
        const due = dueOf(trip)!
        return [
          `${added ? 'Recorded' : 'Already recorded'}: trip ${trip.id}, ${network.name}, ${vehicleName(vehicles, trip.vehicleId)}, passage ${stamp(new Date(trip.at))} (Paris).`,
          `To pay by ${stamp(due)} (Paris), on ${network.payUrl} (${network.operator}) or another way of peage_networks; the deadline is in the user's deadlines.`,
          NO_AMOUNTS
        ].join('\n')
      }
    })
  ]
}
