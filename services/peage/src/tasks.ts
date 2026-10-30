import type { ServiceTaskTemplate, Vehicle } from '@marianne/sdk/main'
import { NETWORKS } from './networks'

/**
 * The task 3615 PEAGE proposes, vehicle by vehicle: looking for unpaid passages on the operators'
 * official pages, every 2 days by default. A passage is paid within 72 hours, so a rhythm of 2 days
 * leaves at least a day to pay, provided the user opens Marianne: a task only runs unlocked. The
 * service never pays: the run looks, records the passage, and leaves paying to the user.
 */

const hostOf = (url: string) => new URL(url).hostname

/** Each operator's payment page, once. */
const SITES = [...new Set(NETWORKS.map((n) => hostOf(n.payUrl)))]

const WHERE = 'A13-A14 et l’A4 à Boulay (Sanef), A79 (Aliaé)'

const RHYTHMS: ServiceTaskTemplate['rhythms'] = [
  {
    every: { unit: 'day', n: 1 },
    label: 'chaque jour',
    note: 'un passage se paie dans les 72 h : chaque jour laisse le plus de temps pour payer, si vous ouvrez Marianne'
  },
  {
    every: { unit: 'day', n: 2 },
    label: 'tous les 2 jours',
    note: 'un passage se paie dans les 72 h : tous les 2 jours laisse au moins un jour pour payer, si vous ouvrez Marianne'
  },
  {
    every: { unit: 'week', n: 1 },
    label: 'chaque semaine',
    note: 'trop espacé : un passage se paie dans les 72 h, une semaine laisse passer le délai',
    warn: true
  }
]

const ALLOWS = (plate: string) => [
  `aller sur ${SITES.join(' et ')} sans redemander, pour cette tâche`,
  `y chercher vos passages avec la plaque de ${plate}`,
  'noter ce qu’elle trouve dans 3615 PEAGE, qui compte le temps qu’il reste'
]

const NEVER = 'Marianne ne paie jamais : elle vous montre le passage, vous validez, et vous saisissez votre carte vous-même.'

const instruction = (vehicle: string) =>
  `Look for unpaid free-flow toll passages of vehicle ${vehicle}, on each operator's official payment page. Read the free-flow-tolls guide first. peage_networks gives the pages, peage_trips what is already recorded. Get the plate's token from the profile tool, type it with type_text, and read what the site shows, without paying and without going further than the list of passages.
For each passage the site shows that peage_trips doesn't have, record it with peage_add_trip. Report "found" with the motorway and the date, and say the user can ask you to pay it: paying happens in a conversation, on a card, and they type their card themselves. If no site shows a passage to pay, report "nothing".`

/** One task per vehicle whose plate the service was given: without it, there is nothing to look for. */
export function tollTasks(vehicles: Vehicle[]): ServiceTaskTemplate[] {
  return vehicles.flatMap((v) =>
    v.plate
      ? [
          {
            id: `tolls:${v.id}`,
            domain: 'mobility' as const,
            title: 'Péages en flux libre',
            checks: 'les passages en flux libre non payés',
            detail: WHERE,
            entity: { id: v.id, label: v.plate },
            rhythms: RHYTHMS,
            rhythm: 1,
            allows: ALLOWS(v.plate),
            never: NEVER,
            unplanned: 'péages non vérifiés',
            instruction: instruction(v.id),
            sites: SITES
          }
        ]
      : []
  )
}
