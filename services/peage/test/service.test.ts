import { ToolError, type ServiceTool } from '@marianne/sdk/main'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as z from 'zod'
import { service } from '../src/main'
import { NETWORKS } from '../src/networks'
import type { PeageMethods, Trip, Vehicles } from '../src/types'
import { CLIO, fakeContext, GRANTED } from './context'

/** 28 October 2026, 15:00 in Paris. */
const NOW = new Date('2026-10-28T14:00:00Z')
const PASSAGE = '2026-10-28T13:30:00.000Z'

const setup = (profile: Parameters<typeof fakeContext>[0] = GRANTED) => {
  const { ctx, stored } = fakeContext(profile)
  const runtime = service.activate(ctx)
  // The service answers at once: its methods' results are the declared ones, not promises.
  const methods = runtime.methods as unknown as PeageMethods
  // As Marianne's MCP server does: the arguments are parsed with the tool's input first.
  const tool = (name: string) => {
    const t = runtime.tools?.find((x) => x.name === name) as ServiceTool
    return (args: unknown = {}) => t.run(z.object(t.input).parse(args), {})
  }
  return { runtime, methods, tool, stored }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('the runtime', () => {
  it('lends three tools, none that pays, a guide and instructions', () => {
    const { runtime } = setup()
    expect(runtime.tools?.map((t) => [t.name, !!t.readOnly])).toEqual([
      ['networks', true],
      ['trips', true],
      ['add_trip', false]
    ])
    expect(runtime.skills?.[0]).toMatch(/^---\nname: free-flow-tolls\ntitle: Péage en flux libre\ndescription: .+\n---\n/)
    expect(runtime.instructions).toContain('never state one')
    expect(runtime.instructions).toContain('open_site')
  })
})

describe('methods', () => {
  it('give the catalog, and the vehicles with whether the plates were granted', () => {
    const { methods } = setup()
    expect(methods.networks()).toEqual(NETWORKS)
    expect(methods.vehicles()).toEqual<Vehicles>({ granted: true, list: GRANTED.vehicles })
    expect(setup({}).methods.vehicles()).toEqual<Vehicles>({ granted: false, list: [] })
  })

  it('record a trip in the storage, once, as UTC, most recent passage first', () => {
    const { methods, stored } = setup()
    expect(methods.trips()).toEqual([])
    const [first] = methods.addTrip({ vehicleId: 'v1', network: 'a13-a14', at: '2026-10-28T14:30:00+01:00' })
    expect(first).toEqual({ id: expect.stringMatching(/^[0-9a-f]{8}$/), vehicleId: 'v1', network: 'a13-a14', at: PASSAGE })
    // The same passage again (a double click): nothing new.
    expect(methods.addTrip({ vehicleId: 'v1', network: 'a13-a14', at: PASSAGE })).toEqual([first])
    const trips = methods.addTrip({ vehicleId: 'v2', network: 'a79', at: '2026-10-28T12:00:00Z' })
    expect(trips.map((t) => [t.vehicleId, t.network])).toEqual([
      ['v1', 'a13-a14'],
      ['v2', 'a79']
    ])
    expect(stored.get('trips')).toEqual(trips)
  })

  it('refuse in French what can’t be recorded', () => {
    const { methods } = setup()
    expect(() => methods.addTrip({ vehicleId: 'v9', network: 'a13-a14', at: PASSAGE })).toThrow('Choisissez un de vos véhicules.')
    expect(() => methods.addTrip({ vehicleId: 'v1', network: 'a99', at: PASSAGE })).toThrow('Choisissez une autoroute en flux libre.')
    expect(() => methods.addTrip({ vehicleId: 'v1', network: 'a79', at: 'hier' })).toThrow('Indiquez la date et l’heure du passage.')
    expect(() => methods.addTrip({ vehicleId: 'v1', network: 'a79', at: '2026-10-28T16:00:00Z' })).toThrow('Le passage ne peut pas être dans le futur.')
    // Without the plates, the service sees no vehicle.
    expect(() => setup({}).methods.addTrip({ vehicleId: 'v1', network: 'a79', at: PASSAGE })).toThrow('Choisissez un de vos véhicules.')
  })

  it('mark a trip paid and not paid, and remove it', () => {
    const { methods } = setup()
    const [trip] = methods.addTrip({ vehicleId: 'v1', network: 'a13-a14', at: PASSAGE })
    expect(methods.markPaid(trip.id)).toEqual([{ ...trip, paidAt: NOW.toISOString() }])
    expect(methods.markUnpaid(trip.id)).toEqual([trip])
    expect(methods.removeTrip(trip.id)).toEqual([])
    expect(() => methods.markPaid(trip.id)).toThrow('Trajet introuvable')
    expect(() => methods.removeTrip(trip.id)).toThrow('Trajet introuvable')
  })

  it('keep paid trips six months, and drop what the storage holds that isn’t a trip', () => {
    const { methods, stored } = setup()
    const old: Trip = { id: 'old', vehicleId: 'v1', network: 'a79', at: '2026-03-01T08:00:00.000Z', paidAt: '2026-03-01T10:00:00.000Z' }
    const recent: Trip = { id: 'recent', vehicleId: 'v1', network: 'a79', at: '2026-09-01T08:00:00.000Z', paidAt: '2026-09-01T10:00:00.000Z' }
    stored.set('trips', [old, recent, { id: 'broken' }, 'nonsense'])
    expect(methods.trips().map((t) => t.id)).toEqual(['recent', 'old'])
    methods.addTrip({ vehicleId: 'v1', network: 'a13-a14', at: PASSAGE })
    expect(methods.trips().map((t) => t.id)).toEqual([expect.any(String), 'recent'])
  })
})

describe('deadlines and the dashboard line', () => {
  it('follow the trips left to pay', async () => {
    const { runtime, methods } = setup()
    expect(runtime.deadlines?.()).toEqual([])
    expect(await runtime.summary?.('mobility')).toBeNull()
    const [trip] = methods.addTrip({ vehicleId: 'v1', network: 'a13-a14', at: PASSAGE })
    expect(runtime.deadlines?.()).toEqual([
      expect.objectContaining({ id: trip.id, title: 'Péage A13-A14 : trajet du 28/10 à payer', due: '2026-10-31T14:30:00+01:00' })
    ])
    expect(await runtime.summary?.('mobility')).toMatchObject({ text: '1 trajet à payer · avant le 31/10 à 14 h 30', urgency: 'soon' })
    expect(await runtime.summary?.('taxes')).toBeNull()
    methods.markPaid(trip.id)
    expect(runtime.deadlines?.()).toEqual([])
  })
})

describe('peage_networks', () => {
  it('gives each section’s official pages and deadline, and no amount', async () => {
    const text = await setup().tool('networks')()
    expect(text).toContain('### A13-A14 Paris–Normandie (id a13-a14)')
    expect(text).toContain('- Pay online by plate (official): https://www.sanef.com/')
    expect(text).toContain('- Time to pay: 72 h after the passage')
    expect(text).toContain('### A79 Sazeret – Digoin (id a79)')
    expect(text).toContain('https://paiement.aliae.com/fr/')
    expect(text).toContain("doesn't know the amounts")
    expect(text).toContain('Operators send no payment link by SMS')
    expect(text).not.toMatch(/\d+[,.]\d{2} ?€/)
  })
})

describe('peage_trips', () => {
  it('lists what is due with the time left, the vehicles by plate and id, never an amount', async () => {
    const { methods, tool } = setup()
    const [trip] = methods.addTrip({ vehicleId: 'v1', network: 'a13-a14', at: PASSAGE })
    const text = await tool('trips')()
    expect(text).toContain('## Unpaid trips (1)')
    expect(text).toContain('| trip | vehicle | network | passage (Paris) | pay by (Paris) | status |')
    expect(text).toContain(`| ${trip.id} | AB-123-CD (id v1) | A13-A14 Paris–Normandie (a13-a14) | 2026-10-28 14:30 | 2026-10-31 14:30 | 2 d 23 h left |`)
    expect(text).toContain('Official payment pages: A13-A14 → https://www.sanef.com/ (Sanef).')
    expect(text).toContain('Never state or guess an amount.')
    expect(text).toContain('Vehicles: AB-123-CD (id v1); EF-456-GH (id v2).')
    expect(text).not.toContain('Marked paid')
  })

  it('adds the paid ones when asked, and says when nothing is due', async () => {
    const { methods, tool } = setup()
    const [trip] = methods.addTrip({ vehicleId: 'v1', network: 'a13-a14', at: PASSAGE })
    methods.markPaid(trip.id)
    const text = await tool('trips')({ paid: true })
    expect(text).toContain('No unpaid free-flow trip is recorded in 3615 PEAGE.')
    expect(text).toContain('## Marked paid (1)')
    expect(text).toContain('marked paid 2026-10-28 15:00')
  })

  it('refers to vehicles by id when the plates aren’t granted', async () => {
    const profile = { ...GRANTED }
    const { methods, tool } = setup(profile)
    methods.addTrip({ vehicleId: 'v1', network: 'a79', at: PASSAGE })
    // The user takes the plates back in the settings.
    profile.granted = []
    profile.vehicles = []
    const text = await tool('trips')()
    expect(text).toContain('| vehicle v1 | A79 Sazeret – Digoin (a79) |')
    expect(text).not.toContain(CLIO.plate!)
    expect(text).toContain("the user hasn't let 3615 PEAGE read their plates (Réglages › Services, marianne:settings/services)")
  })
})

describe('peage_add_trip', () => {
  it('records a passage given in Paris time and says when to pay, and where', async () => {
    const { methods, tool } = setup()
    const text = await tool('add_trip')({ vehicle: 'v2', network: 'a79', at: '2026-10-28T14:30' })
    const [trip] = methods.trips()
    expect(trip).toMatchObject({ vehicleId: 'v2', network: 'a79', at: PASSAGE })
    expect(text).toBe(
      [
        `Recorded: trip ${trip.id}, A79 Sazeret – Digoin, EF-456-GH (id v2), passage 2026-10-28 14:30 (Paris).`,
        "To pay by 2026-10-31 14:30 (Paris), on https://paiement.aliae.com/fr/ (ALIAE) or another way of peage_networks; the deadline is in the user's deadlines.",
        "3615 PEAGE doesn't know the amounts due: the operator's official payment page shows them from the plate. Never state or guess an amount."
      ].join('\n')
    )
    expect(await tool('add_trip')({ vehicle: 'v2', network: 'a79', at: '2026-10-28T13:30:00Z' })).toMatch(/^Already recorded: trip /)
    expect(methods.trips()).toHaveLength(1)
  })

  it('refuses unknown ids and impossible dates, saying what is valid', async () => {
    const add = setup().tool('add_trip')
    const failure = add({ vehicle: 'v9', network: 'a79', at: PASSAGE })
    await expect(failure).rejects.toBeInstanceOf(ToolError)
    await expect(failure).rejects.toThrow('No vehicle of the user has the id "v9". Their vehicles: AB-123-CD (id v1); EF-456-GH (id v2).')
    await expect(add({ vehicle: 'v1', network: 'a99', at: PASSAGE })).rejects.toThrow(
      'No free-flow network has the id "a99". Networks: a13-a14 (A13-A14 Paris–Normandie), a79 (A79 Sazeret – Digoin), a4-boulay (A4 Boulay-Moselle (sortie 36)).'
    )
    await expect(add({ vehicle: 'v1', network: 'a79', at: '28/10/2026 14:30' })).rejects.toThrow('is not a date and time')
    await expect(add({ vehicle: 'v1', network: 'a79', at: '2026-10-29T10:00' })).rejects.toThrow('is in the future')
  })

  it('sends the user to the settings when it can’t see a vehicle', async () => {
    await expect(setup({}).tool('add_trip')({ vehicle: 'v1', network: 'a79', at: PASSAGE })).rejects.toThrow(
      "3615 PEAGE can't see the user's vehicles: they haven't let it read their plates. They can allow it in Réglages › Services (marianne:settings/services)."
    )
    await expect(setup({ granted: ['vehicles.plate'], vehicles: [] }).tool('add_trip')({ vehicle: 'v1', network: 'a79', at: PASSAGE })).rejects.toThrow(
      'The user has no vehicle in their profile: they add one in Réglages › Foyer & entités (marianne:settings/household).'
    )
  })
})
