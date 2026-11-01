import { today } from '@marianne/profile'
import type { TaskEvery, TaskOutcome, TaskRun, TaskTemplate } from '@shared/types'
import { dayLabel, hourOf, shortDate, weekdayOf } from '../../lib/demarches'

/** What the planned tasks' cards and sheets compute, without React. */

/** A task or a template, as the user tells it from another: its entity beside its title. */
export const withEntity = (t: { title: string; entity?: { label: string } }) => (t.entity ? `${t.title} · ${t.entity.label}` : t.title)

/** A task's next day, in a card: "dim. 1er nov."; on the day or past it, it runs as soon as it can. */
export const nextShort = (next: string, now = new Date()) => (next <= today(now) ? 'aujourd’hui' : dayLabel(next, now, `${weekdayOf(next).slice(0, 3)}.`))

/** When a run was: "vendredi 30 oct. à 8 h 02". `at` is in UTC, and a run just after midnight belongs to its own day. */
export function runWhen(at: string): string {
  const day = today(new Date(at))
  return `${weekdayOf(day)} ${shortDate(day)}${hourOf(at)}`
}

const OUTCOME_WORDS: Record<TaskOutcome, string> = { nothing: 'rien trouvé', found: 'trouvé', waiting: 'vous attend', failed: 'échec', done: 'rappel fait' }

/** What a run says on its card: its own words, or what its outcome means. */
export const runLine = (run: TaskRun) => [run.due && 'rattrapée', run.text ?? OUTCOME_WORDS[run.outcome]].filter(Boolean).join(' · ')

/** A line of what Marianne may do, the sites it names set apart: they go on the sheet as chips. */
export function hostParts(line: string, sites: string[]): Array<{ text: string; host: boolean }> {
  if (!sites.length) return [{ text: line, host: false }]
  const hosts = new RegExp(`(${sites.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`)
  return line
    .split(hosts)
    .filter(Boolean)
    .map((text) => ({ text, host: sites.includes(text) }))
}

/** The rhythms a task can be given once it exists: a template's own aren't stored with it. */
export const RHYTHMS: TaskEvery[] = [
  { unit: 'day', n: 1 },
  { unit: 'day', n: 2 },
  { unit: 'week', n: 1 },
  { unit: 'month', n: 1 },
  { unit: 'month', n: 3 },
  { unit: 'month', n: 6 },
  { unit: 'year', n: 1 }
]

export const sameEvery = (a: TaskEvery, b: TaskEvery) => a.unit === b.unit && a.n === b.n

/** The rhythms offered for a task: its own comes first when it isn't among them. */
export const rhythmChoices = (current: TaskEvery) => (RHYTHMS.some((r) => sameEvery(r, current)) ? RHYTHMS : [current, ...RHYTHMS])

/** What a task's card says of its follow-up, as the task_propose card does: « si elle trouve quelque chose : payer maintenant ». */
export const followUpLine = (t: { followUp?: { label: string } }) => (t.followUp ? [`si elle trouve quelque chose : ${t.followUp.label}`] : [])

/** What an entity's card says of a task proposed and not taken: the service's words, or its title. */
export const notPlanned = (t: TaskTemplate) => t.unplanned ?? `${t.title} : non planifiée`
