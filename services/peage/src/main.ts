import { defineService } from '@marianne/sdk/main'
import { NETWORKS } from './networks'
import { tripDeadlines, tripSummary } from './schedule'
import guide from './skills/free-flow-tolls.md?raw'
import { checkTrip, TripStore, type TripProblem } from './store'
import { createTools } from './tools'
import type { PeageMethods, Vehicles } from './types'

/**
 * 3615 PEAGE: free-flow motorway tolls. The operators publish no API, so the service keeps the
 * trips the user records, reminds them of the time to pay, opens the official payment page and
 * warns about fake toll messages. It never pays: the user does, on the official site, or
 * Marianne does with them, in its browser, through their approval card.
 */

export const INSTRUCTIONS = `- Free-flow motorway sections (A13-A14, A79, the A4 at Boulay) have no barriers: the toll is paid afterwards, within 72 hours of the passage, by plate on the operator's official site, at a Nirio tobacconist, or automatically with a toll badge or an account. peage_networks gives each section's official pages, deadline and ways to pay; peage_trips the user's trips and what is due; peage_add_trip records a passage they tell you about.
- The service doesn't know the amounts: never state one. The official payment page shows it from the plate.
- Payment happens only on the operator's official site: open it with open_site (the user agrees to go online), find the passage with the plate token; paying waits for the user's approval card, and they type their card details themselves (hand_over).
- Never pay from a link received by SMS or email: operators send no payment link by SMS. A message claiming an unpaid toll is a scam; tell the user to delete it and forward the SMS to 33700.`

/** What the view reads when a trip can't be recorded. */
const PROBLEMS: Record<TripProblem, string> = {
  vehicle: 'Choisissez un de vos véhicules.',
  network: 'Choisissez une autoroute en flux libre.',
  date: 'Indiquez la date et l’heure du passage.',
  future: 'Le passage ne peut pas être dans le futur.'
}

export const service = defineService<PeageMethods>({
  activate(ctx) {
    const store = new TripStore(ctx.storage)
    const vehicles = (): Vehicles => ({ granted: ctx.profile.granted().includes('vehicles.plate'), list: ctx.profile.vehicles() })

    return {
      methods: {
        networks: () => [...NETWORKS],
        vehicles,
        trips: () => store.list(),
        addTrip(input) {
          const ids = vehicles().list.map((v) => v.id)
          const checked = checkTrip(input, ids, new Date())
          if ('problem' in checked) throw new Error(PROBLEMS[checked.problem])
          store.add(checked.trip)
          return store.list()
        },
        markPaid: (id) => store.setPaid(id, new Date()),
        markUnpaid: (id) => store.setPaid(id, null),
        removeTrip: (id) => store.remove(id)
      },
      tools: createTools(ctx, store),
      skills: [guide],
      instructions: INSTRUCTIONS,
      summary: async (domain) => (domain === 'mobility' ? tripSummary(store.list(), new Date()) : null),
      deadlines: () => tripDeadlines(store.list())
    }
  }
})
