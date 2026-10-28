import * as z from 'zod'
import { fetchJson } from '../http'
import { base, tool, ToolError } from './tool'

/**
 * Legal deadlines, computed rather than left to the model: French rules on how a deadline runs
 * (code de procédure civile, art. 640 to 642) and the "délai franc" of administrative law.
 */

export type Unit = 'jours' | 'semaines' | 'mois' | 'ans'

export interface DeadlineStep {
  date: string
  reason: string
}

export interface Deadline {
  /** The date the period ends, before any extension. */
  nominal: string
  /** The last day to act. */
  end: string
  steps: DeadlineStep[]
}

const DAY = 86_400_000
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

export const toIso = (t: number) => new Date(t).toISOString().slice(0, 10)
export function parseIso(iso: string): number {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) throw new ToolError(`Date invalide « ${iso} » : format AAAA-MM-JJ attendu.`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function weekday(iso: string): string {
  return WEEKDAYS[new Date(parseIso(iso)).getUTCDay()]
}

/** Same day number `months` later; the last day of the month when that day doesn't exist (31 → 30). */
function addMonths(t: number, months: number): number {
  const d = new Date(t)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + months
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last))
}

/**
 * The deadline that starts on `start` (the notification, the decision, the event): the start
 * day doesn't count (art. 641); in months or years it ends on the same day number (art. 641);
 * a "délai franc" doesn't count the last day either; and an end on a Saturday, Sunday or
 * public holiday moves to the next working day (art. 642).
 */
export function computeDeadline(start: string, amount: number, unit: Unit, franc: boolean, holidays: Map<string, string>): Deadline {
  const t0 = parseIso(start)
  let t =
    unit === 'jours' ? t0 + amount * DAY : unit === 'semaines' ? t0 + amount * 7 * DAY : unit === 'mois' ? addMonths(t0, amount) : addMonths(t0, amount * 12)
  const steps: DeadlineStep[] = [{ date: toIso(t), reason: `${amount} ${unit} après le ${start} (le jour de départ ne compte pas)` }]
  if (franc) {
    t += DAY
    steps.push({ date: toIso(t), reason: 'délai franc : le dernier jour ne compte pas non plus' })
  }
  const nominal = toIso(t)
  for (;;) {
    const iso = toIso(t)
    const dow = new Date(t).getUTCDay()
    const why = dow === 6 ? 'samedi' : dow === 0 ? 'dimanche' : holidays.has(iso) ? `jour férié (${holidays.get(iso)})` : ''
    if (!why) break
    t += DAY
    steps.push({ date: toIso(t), reason: `le ${iso} est un ${why} : prorogé au jour ouvrable suivant` })
  }
  return { nominal, end: toIso(t), steps }
}

const ZONES = [
  'metropole',
  'alsace-moselle',
  'guadeloupe',
  'guyane',
  'la-reunion',
  'martinique',
  'mayotte',
  'nouvelle-caledonie',
  'polynesie-francaise',
  'saint-barthelemy',
  'saint-martin',
  'saint-pierre-et-miquelon',
  'wallis-et-futuna'
] as const

async function holidays(zone: string, years: number[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const year of years) {
    const data = await fetchJson<Record<string, string>>(`${base('calendrier')}/jours-feries/${zone}/${year}.json`, { cacheMs: 30 * 86_400_000 })
    for (const [date, name] of Object.entries(data)) out.set(date, name)
  }
  return out
}

export const delaiTools = [
  tool({
    name: 'calcul_delai',
    title: 'Calcul de délai',
    source: 'calendrier',
    readOnly: true,
    description:
      "Calcule la date limite d'un délai légal ou de procédure à partir de sa date de départ (notification, décision, réception d'un courrier), selon les règles françaises : le jour de départ ne compte pas, un délai en mois finit le même quantième, et une échéance un samedi, dimanche ou jour férié est reportée au premier jour ouvrable. Utilise regle=franc pour les délais francs (recours devant le juge administratif). Ne calcule jamais une échéance de tête : appelle cet outil.",
    input: {
      depart: z.string().describe('Date de départ AAAA-MM-JJ'),
      duree: z.number().int().min(1).max(3650),
      unite: z.enum(['jours', 'semaines', 'mois', 'ans']),
      regle: z.enum(['procedure_civile', 'franc']).default('procedure_civile'),
      zone: z.enum(ZONES).default('metropole').describe('Calendrier des jours fériés')
    },
    run: async ({ depart, duree, unite, regle, zone }) => {
      const startYear = new Date(parseIso(depart)).getUTCFullYear()
      const span = unite === 'ans' ? duree : Math.ceil(duree / (unite === 'mois' ? 12 : unite === 'semaines' ? 52 : 365))
      const years = Array.from({ length: span + 2 }, (_, i) => startYear + i)
      const d = computeDeadline(depart, duree, unite, regle === 'franc', await holidays(zone, years))
      const steps = d.steps.map((s) => `- ${s.date} (${weekday(s.date)}) : ${s.reason}`).join('\n')
      return `Date limite : **${weekday(d.end)} ${d.end}** (jusqu'à minuit).\n\n${steps}\n\nRègles : articles 640 à 642 du code de procédure civile${regle === 'franc' ? ', délai franc' : ''} · jours fériés : ${zone}. Un texte spécial peut prévoir autre chose (point de départ, mode de calcul) : vérifie-le pour la procédure en cause.`
    }
  }),

  tool({
    name: 'jours_feries',
    title: 'Jours fériés',
    source: 'calendrier',
    readOnly: true,
    description: 'Liste les jours fériés d’une année pour une zone (métropole, alsace-moselle, outre-mer).',
    input: { annee: z.number().int().min(1950).max(2100), zone: z.enum(ZONES).default('metropole') },
    run: async ({ annee, zone }) => {
      const days = await holidays(zone, [annee])
      return [...days].map(([date, name]) => `- ${weekday(date)} ${date} : ${name}`).join('\n')
    }
  })
]
