import * as z from 'zod'
import { fetchJson } from '../http'
import { base, tool, ToolError } from './tool'

/**
 * Legal deadlines, computed rather than left to the model: the French rules on how a time limit
 * runs (code de procédure civile, articles 640 to 642), and the "délai franc" of administrative law.
 */

export type Unit = 'days' | 'weeks' | 'months' | 'years'

export interface DeadlineStep {
  date: string
  reason: string
}

export interface LegalDeadline {
  /** The date the period ends, before any extension. */
  nominal: string
  /** The last day to act. */
  end: string
  steps: DeadlineStep[]
}

const DAY = 86_400_000
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const toIso = (t: number) => new Date(t).toISOString().slice(0, 10)

function parseIso(iso: string): number {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) throw new ToolError(`Invalid date « ${iso} »: YYYY-MM-DD expected.`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export const weekday = (iso: string) => WEEKDAYS[new Date(parseIso(iso)).getUTCDay()]

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
 * a délai franc (`clear`) doesn't count the last day either; and an end on a Saturday, Sunday
 * or public holiday moves to the next working day (art. 642).
 */
export function computeDeadline(start: string, amount: number, unit: Unit, clear: boolean, holidays: Map<string, string>): LegalDeadline {
  const t0 = parseIso(start)
  let t = unit === 'days' ? t0 + amount * DAY : unit === 'weeks' ? t0 + amount * 7 * DAY : addMonths(t0, unit === 'months' ? amount : amount * 12)
  const steps: DeadlineStep[] = [{ date: toIso(t), reason: `${amount} ${unit} after ${start} (the starting day doesn't count)` }]
  if (clear) {
    t += DAY
    steps.push({ date: toIso(t), reason: "délai franc: the last day doesn't count either" })
  }
  const nominal = toIso(t)
  for (;;) {
    const iso = toIso(t)
    const dow = new Date(t).getUTCDay()
    const why = dow === 6 ? 'a Saturday' : dow === 0 ? 'a Sunday' : holidays.has(iso) ? `a public holiday (${holidays.get(iso)})` : ''
    if (!why) break
    t += DAY
    steps.push({ date: toIso(t), reason: `${iso} is ${why}: extended to the next working day` })
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
    const data = await fetchJson<Record<string, string>>(`${base('calendar')}/jours-feries/${zone}/${year}.json`, { cacheMs: 30 * DAY })
    for (const [date, name] of Object.entries(data)) out.set(date, name)
  }
  return out
}

export const calendarTools = [
  tool({
    name: 'compute_deadline',
    title: 'Legal deadline',
    source: 'calendar',
    readOnly: true,
    description:
      'Computes the last day of a legal or procedural time limit from its starting date (notification, decision, receipt of a letter), by the French rules: the starting day does not count, a limit in months ends on the same day number, and an end on a Saturday, Sunday or public holiday moves to the next working day. Use rule clear_days for a délai franc (appeals before the administrative judge). Never compute a deadline in your head: call this tool.',
    input: {
      start: z.string().describe('Starting date, YYYY-MM-DD'),
      amount: z.number().int().min(1).max(3650),
      unit: z.enum(['days', 'weeks', 'months', 'years']),
      rule: z.enum(['civil_procedure', 'clear_days']).default('civil_procedure'),
      zone: z.enum(ZONES).default('metropole').describe('Public holidays of this zone')
    },
    run: async ({ start, amount, unit, rule, zone }) => {
      const startYear = new Date(parseIso(start)).getUTCFullYear()
      const span = unit === 'years' ? amount : Math.ceil(amount / (unit === 'months' ? 12 : unit === 'weeks' ? 52 : 365))
      const years = Array.from({ length: span + 2 }, (_, i) => startYear + i)
      const d = computeDeadline(start, amount, unit, rule === 'clear_days', await holidays(zone, years))
      const steps = d.steps.map((s) => `- ${s.date} (${weekday(s.date)}): ${s.reason}`).join('\n')
      return `Last day: **${weekday(d.end)} ${d.end}** (until midnight).\n\n${steps}\n\nRules: articles 640 to 642 of the code de procédure civile${rule === 'clear_days' ? ', délai franc' : ''} · public holidays: ${zone}. A specific text may set otherwise (starting point, way of counting): check it for the procedure at hand.`
    }
  }),

  tool({
    name: 'public_holidays',
    title: 'Public holidays',
    source: 'calendar',
    readOnly: true,
    description: 'The public holidays of a year in a zone (metropole, alsace-moselle, overseas).',
    input: { year: z.number().int().min(1950).max(2100), zone: z.enum(ZONES).default('metropole') },
    run: async ({ year, zone }) => {
      const days = await holidays(zone, [year])
      return [...days].map(([date, name]) => `- ${weekday(date)} ${date}: ${name}`).join('\n')
    }
  })
]
