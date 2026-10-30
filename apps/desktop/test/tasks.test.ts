import { rmSync } from 'node:fs'
import { Archive } from '@marianne/archive'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { folders, redoFrom } from '../src/main/folders'
import { session } from '../src/main/session'
import { tasks, type NewTask, type TaskTurnEnd } from '../src/main/tasks'
import { taskMessage } from '../src/main/engines/prompt'
import { addEvery, dayOf, dayStart, everyLabel, nextDay } from '../src/shared/tasks'
import type { ChatMessage, PlannedTask } from '../src/shared/types'

// ~/.marianne points at a temporary folder, before paths.ts reads it.
const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-tasks-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** A fake archive: tasks and folders only need keyed records. */
function memoryArchive(): Archive {
  const records = new Map<string, Map<string, unknown>>()
  const of = (kind: string) => records.get(kind) ?? records.set(kind, new Map()).get(kind)!
  return {
    get: (kind: string, id: string) => structuredClone(of(kind).get(id) ?? null),
    put: (kind: string, id: string, value: unknown) => void of(kind).set(id, structuredClone(value)),
    remove: (kind: string, id: string) => void of(kind).delete(id),
    list: (kind: string) => [...of(kind).values()].map((v) => structuredClone(v)),
    close: () => undefined
  } as unknown as Archive
}

/** Friday 30 October 2026. */
const FRIDAY = new Date(2026, 9, 30, 9, 0)
const TOLLS: NewTask = {
  title: 'Péages en flux libre',
  domain: 'mobility',
  runner: 'marianne',
  origin: { kind: 'service', service: 'peage', template: 'tolls:v1' },
  every: { unit: 'day', n: 2 },
  everyLabel: 'tous les 2 jours',
  instruction: 'Look for unpaid passages.',
  sites: ['www.sanef.com', 'paiement.aliae.com']
}
const REMINDER: NewTask = {
  title: 'Points du permis',
  domain: 'mobility',
  runner: 'remind',
  origin: { kind: 'user' },
  every: { unit: 'month', n: 6 },
  everyLabel: 'tous les 6 mois'
}

let ran: string[]
let turn: (task: PlannedTask) => Promise<TaskTurnEnd>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FRIDAY)
  session.open(memoryArchive())
  ran = []
  turn = () => Promise.resolve({ outcome: 'nothing', text: 'rien' })
  tasks.isBusy = () => false
  tasks.runTurn = (task) => (ran.push(task.title), turn(task))
  tasks.addLine = () => undefined
})
afterEach(() => {
  session.lock()
  vi.useRealTimers()
})

describe('the calendar', () => {
  it('counts days and weeks, and keeps a month’s end within a shorter month', () => {
    expect(addEvery('2026-10-30', { unit: 'day', n: 2 })).toBe('2026-11-01')
    expect(addEvery('2026-10-30', { unit: 'week', n: 1 })).toBe('2026-11-06')
    expect(addEvery('2027-01-31', { unit: 'month', n: 1 })).toBe('2027-02-28')
    expect(addEvery('2024-02-29', { unit: 'year', n: 1 })).toBe('2025-02-28')
  })

  it('counts days from the run, so a late run moves the rhythm with it', () => {
    expect(nextDay({ next: '2026-10-24', every: { unit: 'day', n: 2 } }, '2026-10-25')).toBe('2026-10-27')
  })

  it('keeps a month’s or year’s day, whatever the delay', () => {
    expect(nextDay({ next: '2026-01-01', every: { unit: 'month', n: 3 } }, '2026-08-15')).toBe('2026-10-01')
    expect(nextDay({ next: '2026-08-31', every: { unit: 'year', n: 1 } }, '2026-08-31')).toBe('2027-08-31')
  })

  it('says the rhythm in French', () => {
    expect(everyLabel({ unit: 'day', n: 1 })).toBe('chaque jour')
    expect(everyLabel({ unit: 'year', n: 1 })).toBe('chaque année')
    expect(everyLabel({ unit: 'day', n: 2 })).toBe('tous les 2 jours')
    expect(everyLabel({ unit: 'week', n: 2 })).toBe('toutes les 2 semaines')
    expect(everyLabel({ unit: 'month', n: 3 })).toBe('tous les 3 mois')
  })
})

describe('a task', () => {
  it('comes back in a folder of its own, which knows it', () => {
    const task = tasks.create(TOLLS)
    expect(folders.get(task.folderId)).toMatchObject({ title: 'Péages en flux libre', domain: 'mobility', task: task.id })
    expect(tasks.byFolder(task.folderId)?.id).toBe(task.id)
  })

  it('takes the conversation that planned it, but a folder has one task', () => {
    const folder = folders.create({ title: 'Mes péages', engine: 'claude' })
    const task = tasks.create({ ...TOLLS, folderId: folder.id })
    expect(task.folderId).toBe(folder.id)
    expect(() => tasks.create({ ...TOLLS, folderId: folder.id })).toThrow(/déjà sa tâche/)
  })

  it('checks at once, and reminds one period away, the folder asleep until then', () => {
    expect(tasks.create(TOLLS).next).toBe('2026-10-30')
    const reminder = tasks.create(REMINDER)
    expect(reminder.next).toBe('2027-04-30')
    expect(folders.get(reminder.folderId)?.snoozedUntil).toBe(dayStart('2027-04-30'))
  })

  it('is never settled automatically: the folder keeps coming back', () => {
    const task = tasks.create(TOLLS)
    vi.setSystemTime(new Date(2026, 11, 30))
    expect(folders.list().find((f) => f.id === task.folderId)?.settledAt).toBe('')
  })

  it('leaves its folder behind when it goes, and goes with its folder', () => {
    const task = tasks.create(REMINDER)
    tasks.remove(task.id)
    expect(tasks.list()).toEqual([])
    expect(folders.get(task.folderId)).toMatchObject({ task: undefined, snoozedUntil: '' })
    const other = tasks.create(REMINDER)
    tasks.forgetFolder(other.folderId)
    expect(tasks.list()).toEqual([])
  })

  it('takes a new rhythm: the reason for the old one goes, and the next day counts from the last run', async () => {
    const task = tasks.create({ ...TOLLS, why: 'un passage se paie dans les 72 h' })
    await tasks.tick()
    const changed = tasks.update(task.id, { every: { unit: 'week', n: 1 }, everyLabel: 'chaque semaine' })
    expect(changed).toMatchObject({ next: '2026-11-06', why: undefined, everyLabel: 'chaque semaine' })
    expect(folders.get(task.folderId)?.snoozedUntil).toBe(dayStart('2026-11-06'))
  })

  it('keeps its reason and its day when only how it tells the user changes', () => {
    const task = tasks.create({ ...REMINDER, why: 'tous les 6 mois' })
    expect(tasks.update(task.id, { notify: 'always' })).toMatchObject({ next: task.next, why: 'tous les 6 mois', notify: 'always' })
  })

  it('never puts the next day in the past', async () => {
    const task = tasks.create(TOLLS)
    await tasks.tick()
    vi.setSystemTime(new Date(2026, 11, 20))
    expect(tasks.update(task.id, { every: { unit: 'day', n: 1 }, everyLabel: 'chaque jour' }).next).toBe('2026-12-20')
  })

  it('paused, files its folder away; taken up again, it sleeps until its day', () => {
    const task = tasks.create(REMINDER)
    tasks.setOn(task.id, false)
    expect(folders.get(task.folderId)?.settledAt).not.toBe('')
    tasks.setOn(task.id, true)
    expect(folders.get(task.folderId)).toMatchObject({ settledAt: '', snoozedUntil: dayStart('2027-04-30') })
  })
})

describe('the clock', () => {
  it('runs what is due, and sets the next day', async () => {
    const task = tasks.create(TOLLS)
    await tasks.tick()
    expect(ran).toEqual(['Péages en flux libre'])
    expect(tasks.get(task.id)).toMatchObject({ next: '2026-11-01', runs: [{ outcome: 'nothing', text: 'rien' }] })
  })

  it('leaves what isn’t due', async () => {
    tasks.create({ ...TOLLS, first: '2026-11-02' })
    await tasks.tick()
    expect(ran).toEqual([])
  })

  it('catches up at the first opening, and says so', async () => {
    const task = tasks.create({ ...TOLLS, first: '2026-10-24' })
    await tasks.tick()
    expect(tasks.get(task.id)?.runs[0].due).toBe('2026-10-24')
    expect(tasks.get(task.id)?.next).toBe('2026-11-01')
  })

  it('waits while a turn is running: there is one browser', async () => {
    tasks.create(TOLLS)
    tasks.isBusy = () => true
    await tasks.tick()
    expect(ran).toEqual([])
  })

  it('runs one at a time', async () => {
    tasks.create(TOLLS)
    tasks.create({ ...TOLLS, title: 'Autre' })
    let finish: (end: TaskTurnEnd) => void = () => undefined
    turn = () => new Promise((resolve) => (finish = resolve))
    const first = tasks.tick()
    await vi.advanceTimersByTimeAsync(0)
    expect(ran).toHaveLength(1)
    await tasks.tick()
    expect(ran).toHaveLength(1)
    finish({ outcome: 'nothing' })
    await vi.advanceTimersByTimeAsync(0)
    finish({ outcome: 'nothing' })
    await first
    expect(ran).toHaveLength(2)
  })

  it('stops spending the engine after a dozen runs in a day', async () => {
    for (let i = 0; i < 15; i++) tasks.create({ ...TOLLS, title: `Tâche ${i}` })
    await tasks.tick()
    expect(ran).toHaveLength(12)
  })

  it('keeps a reminder from costing a run', async () => {
    for (let i = 0; i < 15; i++) tasks.create({ ...TOLLS, title: `Tâche ${i}` })
    const reminder = tasks.create({ ...REMINDER, first: '2026-10-30' })
    await tasks.tick()
    expect(tasks.get(reminder.id)?.runs).toHaveLength(1)
  })

  it('does nothing locked, and keeps a run the lock interrupted due', async () => {
    const task = tasks.create(TOLLS)
    const archive = session.maybe!
    turn = async () => {
      session.lock('idle')
      return { outcome: 'found' }
    }
    await tasks.tick()
    session.open(archive)
    expect(tasks.get(task.id)).toMatchObject({ next: '2026-10-30', runs: [] })
    await expect(tasks.tick()).resolves.toBeUndefined()
  })

  it('survives a run that throws, and tells it', async () => {
    const task = tasks.create(TOLLS)
    turn = () => Promise.reject(new Error('Claude introuvable.'))
    await tasks.tick()
    expect(tasks.get(task.id)?.runs[0]).toMatchObject({ outcome: 'failed', text: 'Claude introuvable.' })
  })
})

describe('what a run leaves', () => {
  it('nothing found: the folder goes back to sleep without a word', async () => {
    const task = tasks.create(TOLLS)
    const told = vi.fn()
    tasks.on('run', told)
    await tasks.tick()
    expect(folders.get(task.folderId)).toMatchObject({ seen: true, woke: false, snoozedUntil: dayStart('2026-11-01') })
    expect(told).not.toHaveBeenCalled()
    tasks.off('run', told)
  })

  it('something found: the folder stays awake and the user is told', async () => {
    const task = tasks.create(TOLLS)
    turn = () => Promise.resolve({ outcome: 'found', text: '1 passage trouvé' })
    const told = vi.fn()
    tasks.on('run', told)
    await tasks.tick()
    expect(folders.get(task.folderId)).toMatchObject({ woke: true, seen: false, snoozedUntil: '' })
    expect(told).toHaveBeenCalledOnce()
    tasks.off('run', told)
  })

  it('« à chaque fois »: the user is told even of nothing', async () => {
    tasks.create({ ...TOLLS, notify: 'always' })
    const told = vi.fn()
    tasks.on('run', told)
    await tasks.tick()
    expect(told).toHaveBeenCalledOnce()
    tasks.off('run', told)
  })

  it('a reminder runs no engine: its folder comes back', async () => {
    const task = tasks.create({ ...REMINDER, first: '2026-10-30' })
    const lines: string[] = []
    tasks.addLine = (_f, text) => void lines.push(text)
    await tasks.tick()
    expect(ran).toEqual([])
    expect(lines[0]).toContain('rappel : Points du permis')
    expect(tasks.get(task.id)).toMatchObject({ next: '2027-04-30', runs: [{ outcome: 'done' }] })
    expect(folders.get(task.folderId)?.woke).toBe(true)
  })

  it('a folder read goes back to sleep a day later', async () => {
    const task = tasks.create(TOLLS)
    turn = () => Promise.resolve({ outcome: 'found' })
    await tasks.tick()
    folders.markSeen(task.folderId)
    vi.setSystemTime(new Date(2026, 9, 31, 12, 0))
    await tasks.tick()
    expect(folders.get(task.folderId)?.snoozedUntil).toBe(dayStart('2026-11-01'))
  })
})

describe('what a run may reach', () => {
  it('the task’s own sites, in its own folder, during its run only', async () => {
    const task = tasks.create(TOLLS)
    expect(tasks.allows(task.folderId, 'sanef.com')).toBe(false)
    const during: boolean[] = []
    turn = async () => {
      during.push(
        tasks.allows(task.folderId, 'sanef.com'),
        tasks.allows(task.folderId, 'aliae.com'),
        tasks.allows(task.folderId, 'evil.example'),
        tasks.allows('other', 'sanef.com')
      )
      return { outcome: 'nothing' }
    }
    await tasks.tick()
    expect(during).toEqual([true, true, false, false])
    expect(tasks.allows(task.folderId, 'sanef.com')).toBe(false)
  })

  it('takes the run’s own report once', async () => {
    tasks.reportRun({ outcome: 'found', text: 'x' })
    expect(tasks.takeReport()).toMatchObject({ outcome: 'found' })
    expect(tasks.takeReport()).toBeNull()
  })

  it('refuses to run now while Marianne is at work', async () => {
    const task = tasks.create(TOLLS)
    tasks.isBusy = () => true
    await expect(tasks.runNow(task.id)).rejects.toThrow(/au travail/)
  })
})

describe('redoing an answer', () => {
  const message = (role: ChatMessage['role'], note?: ChatMessage['note']): ChatMessage => ({ id: role, role, at: '', parts: [], note })

  it('starts from the user’s last message', () => {
    expect(redoFrom([message('user'), message('assistant')])).toBe(0)
  })

  it('refuses when a run came after it: redoing would wipe the run', () => {
    expect(redoFrom([message('user'), message('assistant'), message('system', 'task'), message('assistant')])).toBe(-1)
  })

  it('is not stopped by a summary line', () => {
    expect(redoFrom([message('user'), message('system', 'compacted'), message('assistant')])).toBe(0)
  })
})

describe('the message of a run', () => {
  const task = (more: Partial<PlannedTask> = {}): PlannedTask => ({
    id: 't',
    folderId: 'f',
    domain: 'mobility',
    title: 'Péages',
    runner: 'marianne',
    origin: { kind: 'user' },
    every: { unit: 'day', n: 2 },
    everyLabel: 'tous les 2 jours',
    instruction: 'Look for unpaid passages.',
    sites: ['www.sanef.com'],
    notify: 'found',
    next: dayOf(FRIDAY),
    on: true,
    runs: [],
    ...more
  })

  it('says nobody may be watching, what it may reach, and how to end', () => {
    const text = taskMessage(task())
    expect(text).toContain('Look for unpaid passages.')
    expect(text).toContain('they may not be watching')
    expect(text).toContain('www.sanef.com')
    expect(text).toContain('Never pay, sign, send')
    expect(text).toContain('task_report')
  })

  it('says when it has no site of its own', () => {
    expect(taskMessage(task({ sites: [] }))).toContain('no site of its own')
  })
})
