import { rmSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import type { Archive } from '@marianne/archive'
import type { TokenDef } from '@marianne/profile'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Turn } from '../src/main/engines'

/**
 * The chat runner, between the user's turns and a planned task's runs in the same folder: the user
 * comes first, a run leaves no trace when it gives way, and a deleted folder gets nothing back from a
 * turn that was still answering. The engines and the browser are the test's.
 */

// ~/.marianne points at a temporary folder, before paths.ts reads it.
const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-chat-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

const PLATE = 'AB-123-CD'

/** What the engines and the browser do, set by each test. */
const fake = vi.hoisted(() => ({
  order: [] as string[],
  /** A run's engine turn: by default, it answers when it is stopped. */
  run: null as null | ((turn: Turn) => Promise<void>),
  /** The user's engine turn: by default, a short answer. */
  user: null as null | ((turn: Turn) => Promise<void>),
  /** While set, the run's browser isn't ready until it resolves. */
  beginRun: null as null | Promise<void>
}))

vi.mock('electron', () => ({ app: { getVersion: () => '0', on: () => undefined, isPackaged: false } }))
vi.mock('../src/main/engines', async () => {
  const prompt = await import('../src/main/engines/prompt')
  return {
    ...prompt,
    listSkills: () => [],
    runTurn: vi.fn((_engine: string, turn: Turn) => (turn.unattended ? fake.run!(turn) : fake.user!(turn))),
    forgetTranscripts: vi.fn(() => void fake.order.push('transcripts forgotten'))
  }
})
vi.mock('../src/main/browser', async () => {
  const { EventEmitter } = await import('node:events')
  const browser = Object.assign(new EventEmitter(), {
    state: () => ({ url: '', title: '', folderId: '', controller: 'agent', visible: false, loading: false, canGoBack: false, canGoForward: false }),
    quietMs: () => Infinity,
    beginRun: vi.fn(() => fake.beginRun ?? Promise.resolve()),
    endRun: vi.fn(async () => undefined)
  })
  return { browser }
})
vi.mock('../src/main/host', () => ({ services: { instructions: () => '', taskTemplates: () => [] } }))
vi.mock('../src/main/tools', () => ({ legifranceReady: () => false }))
vi.mock('../src/main/profile/store', () => ({
  profile: { tokens: (): TokenDef[] => [{ token: 'vehicle.1.plate', label: 'plaque', value: PLATE, kind: 'id' }], get: () => ({ notes: '' }) }
}))

import { browser } from '../src/main/browser'
import { chat } from '../src/main/chat'
import { runTurn } from '../src/main/engines'
import { folders } from '../src/main/folders'
import { session } from '../src/main/session'
import { tasks, type NewTask } from '../src/main/tasks'

/** A fake archive: folders and tasks only need keyed records. */
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

const TOLLS: NewTask = {
  title: 'Péages en flux libre',
  domain: 'mobility',
  runner: 'marianne',
  origin: { kind: 'user' },
  every: { unit: 'day', n: 2 },
  everyLabel: 'tous les 2 jours',
  instruction: 'Look for unpaid passages.',
  sites: ['www.sanef.com'],
  entity: { id: 'v1', label: PLATE }
}

/** An engine turn that goes on until it is stopped, and takes a moment to go, as a CLI does. */
const untilStopped = (what: string) => (turn: Turn) =>
  new Promise<void>((_resolve, reject) =>
    turn.signal.addEventListener('abort', () =>
      setTimeout(() => {
        fake.order.push(`${what} over`)
        reject(new Error('Cancelled'))
      }, 20)
    )
  )

const answers = (text: string) => async (turn: Turn) => {
  turn.onEvent({ type: 'text', key: 'a', text })
  turn.onEvent({ type: 'done' })
}

const roles = (folderId: string) => folders.messages(folderId).map((m) => `${m.role}${m.note ? `:${m.note}` : ''}`)

beforeEach(() => {
  session.open(memoryArchive())
  fake.order = []
  fake.run = untilStopped('run')
  fake.user = answers('Voici vos passages.')
  fake.beginRun = null
  vi.mocked(runTurn).mockClear()
  vi.mocked(browser.endRun).mockClear()
})
afterEach(() => session.lock())

describe('a run and the user’s message, in the same folder', () => {
  it('the message interrupts the run, and is kept: the run leaves nothing behind', async () => {
    const task = tasks.create(TOLLS)
    const ticking = tasks.tick()
    await vi.waitFor(() => expect(runTurn).toHaveBeenCalledTimes(1))
    await chat.send({ folderId: task.folderId, text: 'Et mes péages ?', attachments: [] })
    await ticking
    await vi.waitFor(() => expect(chat.running(task.folderId)).toBe(false))
    expect(roles(task.folderId)).toEqual(['user', 'assistant'])
    expect(folders.messages(task.folderId)[0].parts).toEqual([{ type: 'text', text: 'Et mes péages ?' }])
    // Interrupted, the run is still due, and its browser was given back before the user's turn went on.
    expect(tasks.get(task.id)).toMatchObject({ runs: [], next: task.next })
    expect(browser.endRun).toHaveBeenCalled()
    expect(fake.order).toEqual(['run over'])
  })

  it('a message sent while the run’s browser gets ready interrupts it: no turn beside the user’s', async () => {
    const task = tasks.create(TOLLS)
    let ready!: () => void
    fake.beginRun = new Promise<void>((resolve) => (ready = resolve))
    const ticking = tasks.tick()
    await vi.waitFor(() => expect(browser.beginRun).toHaveBeenCalled())
    const sending = chat.send({ folderId: task.folderId, text: 'Et mes péages ?', attachments: [] })
    // The user's turn waits for the run to give way.
    await new Promise((r) => setTimeout(r, 10))
    expect(runTurn).not.toHaveBeenCalled()
    ready()
    await sending
    await ticking
    await vi.waitFor(() => expect(chat.running(task.folderId)).toBe(false))
    expect(vi.mocked(runTurn).mock.calls.map(([, turn]) => turn.unattended)).toEqual([false])
    expect(browser.endRun).toHaveBeenCalled()
    expect(roles(task.folderId)).toEqual(['user', 'assistant'])
  })

  it('a run that ends writes its lines once, its plate given to the engine as a token', async () => {
    fake.run = answers('Aucun passage.')
    const task = tasks.create(TOLLS)
    await tasks.tick()
    const [, turn] = vi.mocked(runTurn).mock.calls[0]
    expect(turn.message).toContain('It is about: [[vehicle.1.plate]].')
    expect(turn.message).not.toContain(PLATE)
    expect(roles(task.folderId)).toEqual(['system:task', 'assistant'])
    expect(folders.messages(task.folderId)[0].outcome).toBe('found')
  })
})

describe('an engine that isn’t signed in', () => {
  it('leaves its error, and a card that leads to « se connecter » in Réglages › Moteurs', async () => {
    fake.user = async (turn) => turn.onEvent({ type: 'done', error: 'Claude Code n’est pas connecté (Not logged in).', signIn: true })
    const folderId = await chat.send({ text: 'Ma taxe foncière ?', attachments: [] })
    await vi.waitFor(() => expect(chat.running(folderId)).toBe(false))
    const answer = folders.messages(folderId).at(-1)!
    expect(answer).toMatchObject({ status: 'error', error: 'Claude Code n’est pas connecté (Not logged in).' })
    expect(answer.parts).toContainEqual(
      expect.objectContaining({ type: 'setup', page: 'engines', action: 'ouvrir Réglages › Moteurs', reason: expect.stringContaining('Claude Code') })
    )
  })

  it('a failure of another kind leaves no such card', async () => {
    fake.user = async (turn) => turn.onEvent({ type: 'done', error: 'Claude Code a échoué : overloaded' })
    const folderId = await chat.send({ text: 'Ma taxe foncière ?', attachments: [] })
    await vi.waitFor(() => expect(chat.running(folderId)).toBe(false))
    expect(
      folders
        .messages(folderId)
        .at(-1)!
        .parts.some((p) => p.type === 'setup')
    ).toBe(false)
  })
})

describe('a folder deleted while Marianne answers', () => {
  it('waits for the turn to end, then leaves nothing of it', async () => {
    fake.user = untilStopped('turn')
    const folderId = await chat.send({ text: 'Ma taxe foncière ?', attachments: [] })
    expect(chat.running(folderId)).toBe(true)
    await chat.deleteFolder(folderId)
    expect(fake.order).toEqual(['turn over', 'transcripts forgotten'])
    expect(folders.get(folderId)).toBeNull()
    expect(session.archive.get('messages', folderId)).toBeNull()
  })

  it('a run in it gives way first, and its task goes with it', async () => {
    const task = tasks.create(TOLLS)
    const ticking = tasks.tick()
    await vi.waitFor(() => expect(runTurn).toHaveBeenCalledTimes(1))
    await chat.deleteFolder(task.folderId)
    await ticking
    expect(fake.order).toEqual(['run over', 'transcripts forgotten'])
    expect(tasks.list()).toEqual([])
    expect(session.archive.get('messages', task.folderId)).toBeNull()
  })
})

// The browser's 'taken' (the user reached for it) interrupts a run as a message does.
describe('the user reaching for the browser', () => {
  it('interrupts the run, which leaves nothing', async () => {
    const task = tasks.create(TOLLS)
    const ticking = tasks.tick()
    await vi.waitFor(() => expect(runTurn).toHaveBeenCalledTimes(1))
    ;(browser as unknown as EventEmitter).emit('taken')
    await ticking
    expect(roles(task.folderId)).toEqual([])
    expect(tasks.get(task.id)?.runs).toEqual([])
  })
})
