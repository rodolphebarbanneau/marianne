import { today } from '@marianne/profile'
import type { ServiceState } from '@marianne/sdk'
import { followUpLine } from '@shared/tasks'
import type { ChatMessage, PlannedTask } from '@shared/types'
import { dayLabel, followUpOffered, shortDate, weekdayOf } from '../lib/demarches'

/**
 * What a conversation shows of a planned task's runs. A task that finds nothing comes back again
 * and again: those runs fold into one line, so that what the user has to read isn't lost among
 * them. A run with anything else to say always shows, and so does one still under way.
 */

/** A run that found nothing: the line that opens it, and the answer after it. */
export interface QuietRun {
  line: ChatMessage
  answer?: ChatMessage
}

export type ConversationRow = { kind: 'message'; message: ChatMessage } | { kind: 'quiet'; key: string; runs: QuietRun[] }

const NOTHING = 'rien à signaler'

/** The local day of a message: `at` is in UTC, and a run just after midnight belongs to its own day. */
const dayOf = (run: QuietRun) => today(new Date(run.line.at))

/** The conversation as it shows: the messages, with each stretch of consecutive quiet runs as one row. */
export function foldRuns(messages: ChatMessage[]): ConversationRow[] {
  const rows: ConversationRow[] = []
  let quiet: QuietRun[] | null = null
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    if (message.note !== 'task' || message.outcome !== 'nothing') {
      quiet = null
      rows.push({ kind: 'message', message })
      continue
    }
    if (!quiet) {
      quiet = []
      rows.push({ kind: 'quiet', key: message.id, runs: quiet })
    }
    const answer = messages[i + 1]?.role === 'assistant' ? messages[++i] : undefined
    quiet.push({ line: message, answer })
  }
  return rows
}

/** "▸ 5 vérifications, du 20 oct. au 28 oct. · rien à signaler". */
export function foldLabel(runs: QuietRun[]): string {
  const from = dayOf(runs[0])
  const to = dayOf(runs[runs.length - 1])
  const days = from === to ? `le ${shortDate(from)}` : `du ${shortDate(from)} au ${shortDate(to)}`
  return `▸ ${runs.length === 1 ? '1 vérification' : `${runs.length} vérifications`}, ${days} · ${NOTHING}`
}

/** One run, unfolded: "▾ mardi 20 oct. · rien à signaler". */
export function runLabel(run: QuietRun): string {
  const day = dayOf(run)
  return `▾ ${weekdayOf(day)} ${shortDate(day)} · ${NOTHING}`
}

/** A task's next day: "dimanche 1er nov."; on the day or past it, it runs as soon as it can. */
export const nextLabel = (next: string, now = new Date()) => (next <= today(now) ? 'aujourd’hui' : dayLabel(next, now))

/**
 * The follow-up a task's folder offers (« payer maintenant »): its label, and the line of the run
 * that found something, where its button goes. Null when the task has none, is paused, or its
 * service is off; the main process checks again at the click.
 */
export function followUpOffer(
  task: PlannedTask | undefined,
  services: Array<Pick<ServiceState, 'manifest' | 'on'>>,
  messages: ChatMessage[]
): { lineId: string; label: string } | null {
  if (!task?.followUp || !followUpOffered(task, services)) return null
  const line = followUpLine(messages)
  return line ? { lineId: line.id, label: task.followUp.label } : null
}
