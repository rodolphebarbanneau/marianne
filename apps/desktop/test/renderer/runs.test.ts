import { describe, expect, it } from 'vitest'
import { foldLabel, foldRuns, nextLabel, runLabel, type ConversationRow, type QuietRun } from '../../src/renderer/src/folder/runs'
import type { ChatMessage, TaskOutcome } from '../../src/shared/types'

const at = (day: number, hour = 9) => new Date(2026, 9, day, hour).toISOString()

const user = (id: string): ChatMessage => ({ id, role: 'user', at: at(1), parts: [{ type: 'text', text: 'Vérifie mes péages.' }] })
const answer = (id: string, day: number): ChatMessage => ({ id, role: 'assistant', at: at(day), parts: [{ type: 'text', text: 'Rien.' }], status: 'done' })
const line = (id: string, day: number, outcome?: TaskOutcome): ChatMessage => ({
  id,
  role: 'system',
  at: at(day),
  parts: [{ type: 'text', text: 'tâche planifiée' }],
  note: 'task',
  outcome
})

/** A run: its line, then its answer. */
const run = (id: string, day: number, outcome?: TaskOutcome) => [line(id, day, outcome), answer(`${id}-a`, day)]

/** Each row by its ids: a message's, or the quiet runs' lines. */
const shape = (rows: ConversationRow[]) => rows.map((r) => (r.kind === 'message' ? r.message.id : r.runs.map((x) => x.line.id)))

const quiet = (...days: number[]): QuietRun[] => days.map((d) => ({ line: line(`r${d}`, d, 'nothing') }))

describe('foldRuns', () => {
  it('leaves a conversation without quiet runs as it is', () => {
    const messages = [user('u'), answer('a', 1)]
    expect(foldRuns(messages)).toEqual(messages.map((message) => ({ kind: 'message', message })))
  })

  it('folds consecutive runs that found nothing into one row, each with its answer', () => {
    const rows = foldRuns([user('u'), ...run('r1', 20, 'nothing'), ...run('r2', 22, 'nothing'), ...run('r3', 24, 'nothing')])
    expect(shape(rows)).toEqual(['u', ['r1', 'r2', 'r3']])
    const fold = rows[1]
    expect(fold.kind === 'quiet' && fold.runs.map((r) => r.answer?.id)).toEqual(['r1-a', 'r2-a', 'r3-a'])
  })

  it('keeps the first run as the key, so the row stays open as runs join it', () => {
    const before = foldRuns(run('r1', 20, 'nothing'))
    const after = foldRuns([...run('r1', 20, 'nothing'), ...run('r2', 22, 'nothing')])
    expect(before[0].kind === 'quiet' && before[0].key).toBe('r1')
    expect(after[0].kind === 'quiet' && after[0].key).toBe('r1')
  })

  it('always shows a run with another outcome, and it splits the fold', () => {
    const rows = foldRuns([...run('r1', 20, 'nothing'), ...run('r2', 22, 'found'), ...run('r3', 24, 'nothing')])
    expect(shape(rows)).toEqual([['r1'], 'r2', 'r2-a', ['r3']])
  })

  it.each(['found', 'waiting', 'failed'] as const)('shows a run that ended « %s »', (outcome) => {
    expect(shape(foldRuns(run('r', 20, outcome)))).toEqual(['r', 'r-a'])
  })

  it('shows a run in progress, which has no outcome yet', () => {
    const running: ChatMessage = { ...answer('r2-a', 22), status: 'running' }
    expect(shape(foldRuns([...run('r1', 20, 'nothing'), line('r2', 22), running]))).toEqual([['r1'], 'r2', 'r2-a'])
  })

  it('shows a reminder, a line alone', () => {
    expect(shape(foldRuns([line('r', 20, 'done')]))).toEqual(['r'])
  })

  it('lets the user’s own message split the fold', () => {
    const rows = foldRuns([...run('r1', 20, 'nothing'), user('u'), answer('a', 21), ...run('r2', 22, 'nothing')])
    expect(shape(rows)).toEqual([['r1'], 'u', 'a', ['r2']])
  })

  it('takes only an assistant’s message as a run’s answer', () => {
    const rows = foldRuns([line('r', 20, 'nothing'), user('u')])
    expect(shape(rows)).toEqual([['r'], 'u'])
    expect(rows[0].kind === 'quiet' && rows[0].runs[0].answer).toBeUndefined()
  })
})

describe('foldLabel', () => {
  it('says how many, from when to when', () => {
    expect(foldLabel(quiet(20, 22, 24, 26, 28))).toBe('▸ 5 vérifications, du 20 oct. au 28 oct. · rien à signaler')
  })

  it('reads well for one run, or several on one day', () => {
    expect(foldLabel(quiet(20))).toBe('▸ 1 vérification, le 20 oct. · rien à signaler')
    expect(foldLabel(quiet(20, 20))).toBe('▸ 2 vérifications, le 20 oct. · rien à signaler')
  })
})

describe('runLabel', () => {
  it('names the day', () => {
    expect(runLabel(quiet(20)[0])).toBe('▾ mardi 20 oct. · rien à signaler')
  })

  it('keeps a run just after midnight in its own day, where `at` may still be the day before in UTC', () => {
    expect(runLabel({ line: { ...line('r', 1), at: new Date(2026, 10, 1, 0, 30).toISOString() } })).toBe('▾ dimanche 1er nov. · rien à signaler')
  })
})

describe('nextLabel', () => {
  const NOW = new Date(2026, 9, 30, 10)

  it('names a coming day', () => {
    expect(nextLabel('2026-11-01', NOW)).toBe('dimanche 1er nov.')
  })

  it('says today on the day, and past it: it runs as soon as it can', () => {
    expect(nextLabel('2026-10-30', NOW)).toBe('aujourd’hui')
    expect(nextLabel('2026-10-26', NOW)).toBe('aujourd’hui')
  })
})
