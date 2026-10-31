import { rmSync } from 'node:fs'
import type { Archive } from '@marianne/archive'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Turn } from '../src/main/engines'

/**
 * A lock while an engine answers: the CLI being stopped may still write its transcript, in clear,
 * after the scratch folders were wiped. Once the turns running at the lock are over, everything is
 * wiped again. The engines are the test's.
 */

// ~/.marianne points at a temporary folder, before paths.ts reads it.
const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-engines-lock-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** The engine turn under way ends when the test says so. */
const engine = vi.hoisted(() => ({ end: null as null | (() => void), sweep: (_home: string) => undefined as void }))

vi.mock('../src/main/engines/claude', () => ({
  claude: {
    candidates: () => [],
    site: 'claude.com/claude-code',
    login: [],
    keyVars: [],
    account: async () => ({}),
    models: async () => [],
    turn: () => new Promise<void>((resolve) => (engine.end = resolve)),
    transcript: () => null,
    transcriptRoot: () => '',
    sweep: vi.fn((home: string) => engine.sweep(home))
  }
}))
vi.mock('../src/main/engines/codex', () => ({ codex: { candidates: () => [], site: '', login: [], keyVars: [] } }))
vi.mock('../src/main/engines/vibe', () => ({ vibe: { candidates: () => [], site: '', login: [], keyVars: [] } }))
vi.mock('../src/main/engines/cli', () => ({ findCli: () => 'claude', expandHome: (p: string) => p, openInTerminal: async () => undefined }))
vi.mock('../src/main/aside', () => ({ runAside: async () => ({ code: 0, stdout: '', stderr: '' }) }))
vi.mock('../src/main/content', () => ({ content: { get: () => ({ sites: [] }), on: () => undefined } }))

import { claude } from '../src/main/engines/claude'
import { runTurn } from '../src/main/engines'
import { session } from '../src/main/session'

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

const turn = (): Turn => ({
  folderId: 'f1',
  message: 'Bonjour',
  system: '',
  resume: false,
  web: 'off',
  signal: new AbortController().signal,
  timeoutMs: 60_000,
  waitedMs: () => 0,
  onEvent: () => undefined
})

const sweeps = () => vi.mocked(claude.sweep!).mock.calls.length

beforeEach(() => {
  session.open(memoryArchive())
  vi.mocked(claude.sweep!).mockClear()
})

describe('a lock during a turn', () => {
  it('wipes at once, and again once the turn is over', async () => {
    const running = runTurn('claude', turn())
    await vi.waitFor(() => expect(engine.end).not.toBeNull())
    session.lock()
    expect(sweeps()).toBe(1)
    engine.end!()
    await running
    await vi.waitFor(() => expect(sweeps()).toBe(2))
  })

  it('not again if the account was opened meanwhile: its own turns work there', async () => {
    engine.end = null
    const running = runTurn('claude', turn())
    await vi.waitFor(() => expect(engine.end).not.toBeNull())
    session.lock()
    session.open(memoryArchive())
    engine.end!()
    await running
    await new Promise((r) => setTimeout(r, 10))
    expect(sweeps()).toBe(1)
    session.lock()
  })

  it('without a turn, wipes once', () => {
    session.lock()
    expect(sweeps()).toBe(1)
  })
})
