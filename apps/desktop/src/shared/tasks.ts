import type { TaskEvery } from '@marianne/sdk'
import type { ChatMessage } from './types'

/**
 * The calendar of planned tasks. A task has a day and no time of day: the archive locks after a
 * few minutes without use and a task only runs unlocked, so it runs at the first opening of its
 * day, or the first after it. Days are local "YYYY-MM-DD" strings, compared as text. And the line
 * of a run where a task's follow-up is offered, the same for the window and the main process.
 */

const pad = (n: number) => String(n).padStart(2, '0')

/** A date as a local day. */
export const dayOf = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The local midnight a day starts at, as ISO: a folder asleep until then wakes on that day. */
export const dayStart = (day: string) => new Date(`${day}T00:00:00`).toISOString()

/** `every` after `day`. A month's end stays within the shorter month: 31 January, 28 February. */
export function addEvery(day: string, every: TaskEvery): string {
  const [y, m, d] = day.split('-').map(Number)
  if (every.unit === 'day' || every.unit === 'week') return dayOf(new Date(y, m - 1, d + every.n * (every.unit === 'week' ? 7 : 1)))
  const months = every.n * (every.unit === 'year' ? 12 : 1)
  const last = new Date(y, m - 1 + months + 1, 0).getDate()
  return dayOf(new Date(y, m - 1 + months, Math.min(d, last)))
}

/**
 * The day after a run on `today`. Days and weeks count from the run: late, the rhythm moves with
 * it. Months and years keep their day (a quarter's first, a yearly date), whatever the delay.
 */
export function nextDay(task: { next: string; anchor?: string; every: TaskEvery }, today: string): string {
  if (task.every.unit === 'day' || task.every.unit === 'week') return addEvery(today, task.every)
  // From the day it started, not the last one: the 31st comes back after a short month.
  const from = task.anchor ?? task.next
  let k = 1
  let next = addEvery(from, task.every)
  while (next <= today) next = addEvery(from, { ...task.every, n: task.every.n * ++k })
  return next
}

const UNITS = { day: ['jour', 'jours'], week: ['semaine', 'semaines'], month: ['mois', 'mois'], year: ['an', 'ans'] } as const

/** "chaque jour", "tous les 2 jours", "toutes les 2 semaines", "tous les 3 mois". */
export function everyLabel({ unit, n }: TaskEvery): string {
  if (n === 1) return unit === 'year' ? 'chaque année' : `chaque ${UNITS[unit][0]}`
  return `${unit === 'week' ? 'toutes' : 'tous'} les ${n} ${UNITS[unit][1]}`
}

/**
 * The line of a run whose follow-up a task's folder offers (« payer maintenant »): the last run's
 * line, when that run found something and no follow-up was started after it. Null otherwise. The
 * window puts the button there, and the main process takes a click for that line only: an older
 * finding may have been dealt with since.
 */
export function followUpLine(messages: ChatMessage[]): ChatMessage | null {
  const at = messages.findLastIndex((m) => m.note === 'task')
  const line = messages[at]
  if (!line || line.outcome !== 'found') return null
  return messages.slice(at + 1).some((m) => m.followUp) ? null : line
}
