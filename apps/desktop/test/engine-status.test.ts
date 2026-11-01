import { rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Checking an engine: whether its CLI is there, its version, whether the user is signed in. Codex's
 * CLI takes seconds to start on Windows, and the lock screen waits for these checks before opening
 * the application: they run side by side, a check under way answers everyone who asks meanwhile,
 * and the version is read again only when the CLI's file changes.
 */

const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-engine-status-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** What the test's CLIs were asked, and the answers they hold back until released. */
const cli = vi.hoisted(() => {
  const state = {
    calls: [] as string[],
    held: [] as Array<() => void>,
    hold: false,
    answer<T>(what: string, value: T): Promise<T> {
      state.calls.push(what)
      if (!state.hold) return Promise.resolve(value)
      return new Promise((resolve) => state.held.push(() => resolve(value)))
    },
    release(): void {
      for (const go of state.held.splice(0)) go()
    },
    engine: (id: string) => ({
      candidates: () => [],
      site: '',
      login: [],
      keyVars: [],
      account: () => state.answer(`${id} account`, { loggedIn: true, account: `${id}@exemple.fr` })
    })
  }
  return state
})
const release = () => cli.release()

vi.mock('../src/main/engines/claude', () => ({ claude: cli.engine('claude') }))
vi.mock('../src/main/engines/codex', () => ({ codex: cli.engine('codex') }))
vi.mock('../src/main/engines/vibe', () => ({ vibe: cli.engine('vibe') }))
vi.mock('../src/main/engines/cli', () => ({
  findCli: (id: string) => require('node:path').join(process.env.MARIANNE_HOME!, `${id}.exe`),
  expandHome: (p: string) => p,
  openInTerminal: async () => undefined
}))
vi.mock('../src/main/aside', () => ({
  runAside: (cmd: string, args: string[]) =>
    cli.answer(`${require('node:path').basename(cmd, '.exe')} ${args.join(' ')}`, { code: 0, stdout: '1.0.0\n', stderr: '' })
}))
vi.mock('../src/main/content', () => ({ content: { get: () => ({ sites: [] }), on: () => undefined } }))

import { engineStatus, warmEngines } from '../src/main/engines'
import { configStore } from '../src/main/config'

const exe = (id: string) => join(root, `${id}.exe`)
for (const id of ['claude', 'codex', 'vibe']) writeFileSync(exe(id), 'binary')
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
/** A change of the engine's folder drops what was known of it, as a change of the user's would. */
let flips = 0
const forget = (id: 'claude' | 'codex' | 'vibe') => configStore.update({ engines: { [id]: { home: `home-${++flips}` } } })

beforeEach(() => {
  release()
  cli.hold = false
  cli.calls = []
})

describe('checking an engine', () => {
  it('reads the version and the sign-in side by side', async () => {
    cli.hold = true
    const status = engineStatus('codex', true)
    await tick()
    // Both started, neither answered yet.
    expect(cli.calls).toEqual(['codex --version', 'codex account'])
    release()
    expect(await status).toMatchObject({ found: true, version: '1.0.0', loggedIn: true, account: 'codex@exemple.fr' })
  })

  it('answers whoever asks during a check with that check, not another', async () => {
    cli.hold = true
    const first = engineStatus('claude', true)
    const second = engineStatus('claude')
    await tick()
    release()
    expect(await second).toBe(await first)
    expect(cli.calls.filter((c) => c === 'claude account')).toHaveLength(1)
    // Then from what it found, without starting the CLI.
    await engineStatus('claude')
    expect(cli.calls.filter((c) => c === 'claude account')).toHaveLength(1)
  })

  it('reads the version again only when the CLI’s file changes, or when asked to', async () => {
    await engineStatus('vibe', true)
    forget('vibe')
    await engineStatus('vibe')
    expect(cli.calls.filter((c) => c === 'vibe --version')).toHaveLength(1)
    expect(cli.calls.filter((c) => c === 'vibe account')).toHaveLength(2)
    utimesSync(exe('vibe'), new Date(), new Date(Date.now() + 60_000))
    forget('vibe')
    await engineStatus('vibe')
    expect(cli.calls.filter((c) => c === 'vibe --version')).toHaveLength(2)
    await engineStatus('vibe', true)
    expect(cli.calls.filter((c) => c === 'vibe --version')).toHaveLength(3)
  })

  it('does not keep a check that started on settings changed since', async () => {
    cli.hold = true
    const old = engineStatus('codex', true)
    await tick()
    forget('codex')
    release()
    await old
    cli.hold = false
    await engineStatus('codex')
    expect(cli.calls.filter((c) => c === 'codex account')).toHaveLength(2)
  })
})

describe('warming the engines up', () => {
  it('checks the enabled ones, all at once', async () => {
    configStore.update({ engines: { claude: { enabled: true }, codex: { enabled: true }, vibe: { enabled: false } } })
    forget('claude')
    forget('codex')
    forget('vibe')
    cli.hold = true
    warmEngines()
    await tick()
    expect(cli.calls.filter((c) => c.endsWith('account')).sort()).toEqual(['claude account', 'codex account'])
    release()
  })
})
