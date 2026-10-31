import { rmSync } from 'node:fs'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { Turn } from '../src/main/engines'

/**
 * An API key the environment sets for an engine (ANTHROPIC_API_KEY…): the CLI would take it ahead
 * of the user's own sign-in, and bill it per use. Marianne leaves it out of its runs when the engine
 * has a sign-in of its own, unless the user chose the key; with nothing else, the key is used. The
 * engine is the test's: its sign-in, and the environment its runs get.
 */

const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-engine-keys-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** What the test's Claude says of its own sign-in, and what it was given. */
const engine = vi.hoisted(() => ({
  loggedIn: true as boolean,
  accountEnv: null as NodeJS.ProcessEnv | null,
  turnEnv: null as NodeJS.ProcessEnv | null
}))

vi.mock('../src/main/engines/claude', () => ({
  claude: {
    candidates: () => [],
    site: '',
    login: [],
    keyVars: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
    keyCompanions: ['ANTHROPIC_BASE_URL'],
    account: async (_cli: string, env: NodeJS.ProcessEnv) => {
      engine.accountEnv = env
      return engine.loggedIn ? { loggedIn: true, account: 'vous@exemple.fr · max' } : { loggedIn: false }
    },
    models: async () => [],
    turn: async (t: { env: NodeJS.ProcessEnv }) => void (engine.turnEnv = t.env),
    transcript: () => null,
    transcriptRoot: () => ''
  }
}))
vi.mock('../src/main/engines/codex', () => ({ codex: { candidates: () => [], site: '', login: [], keyVars: [] } }))
vi.mock('../src/main/engines/vibe', () => ({ vibe: { candidates: () => [], site: '', login: [], keyVars: [] } }))
vi.mock('../src/main/engines/cli', () => ({ findCli: () => 'claude', expandHome: (p: string) => p, openInTerminal: async () => undefined }))
vi.mock('../src/main/aside', () => ({ runAside: async () => ({ code: 0, stdout: '2.1.316 (Claude Code)', stderr: '' }) }))
vi.mock('../src/main/content', () => ({ content: { get: () => ({ sites: [] }), on: () => undefined } }))

import { engineLights, engineStatus, runTurn, withoutEnvKey } from '../src/main/engines'
import { configStore } from '../src/main/config'

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

const KEYS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL']

afterEach(() => {
  for (const k of KEYS) delete process.env[k]
  engine.loggedIn = true
  configStore.update({ engines: { claude: { useEnvKey: false } } })
})

describe('an API key in the environment', () => {
  it('is left out of the runs when the engine has a sign-in of its own', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-0000'
    process.env.ANTHROPIC_BASE_URL = 'https://proxy.exemple.fr'
    const status = await engineStatus('claude', true)
    expect(status.envKey).toEqual({ name: 'ANTHROPIC_API_KEY', login: true, used: false })
    expect(status.account).toBe('vous@exemple.fr · max')
    // The sign-in is read without the key, which the CLI would otherwise report instead.
    expect(engine.accountEnv?.ANTHROPIC_API_KEY).toBeUndefined()
    await runTurn('claude', turn())
    expect(engine.turnEnv?.ANTHROPIC_API_KEY).toBeUndefined()
    // The key's endpoint goes with it: the subscription signs in at Anthropic's.
    expect(engine.turnEnv?.ANTHROPIC_BASE_URL).toBeUndefined()
    expect((await engineLights())[0]).toMatchObject({ id: 'claude', ok: true, envKey: false })
  })

  it('is used when the user chose it', async () => {
    process.env.ANTHROPIC_AUTH_TOKEN = 'token-test'
    configStore.update({ engines: { claude: { useEnvKey: true } } })
    const status = await engineStatus('claude')
    expect(status.envKey).toEqual({ name: 'ANTHROPIC_AUTH_TOKEN', login: true, used: true })
    expect(status.account).toBe('clé de la variable ANTHROPIC_AUTH_TOKEN')
    await runTurn('claude', turn())
    expect(engine.turnEnv?.ANTHROPIC_AUTH_TOKEN).toBe('token-test')
    expect((await engineLights())[0]).toMatchObject({ envKey: true })
  })

  it('is used when it is all the engine has', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-0000'
    engine.loggedIn = false
    const status = await engineStatus('claude', true)
    expect(status).toMatchObject({ loggedIn: true, envKey: { name: 'ANTHROPIC_API_KEY', login: false, used: true } })
    await runTurn('claude', turn())
    expect(engine.turnEnv?.ANTHROPIC_API_KEY).toBe('sk-ant-test-0000')
  })

  it('changes nothing when there is none, or an empty one', async () => {
    process.env.ANTHROPIC_API_KEY = ' '
    const status = await engineStatus('claude', true)
    expect(status.envKey).toBeUndefined()
    expect(status).toMatchObject({ loggedIn: true, account: 'vous@exemple.fr · max' })
  })

  it.runIf(process.platform === 'win32')('is found whatever the case of its name, as Windows reads it', () => {
    expect(withoutEnvKey('claude', { anthropic_api_key: 'sk', Path: 'C:\\' })).toEqual({ Path: 'C:\\' })
  })
})
