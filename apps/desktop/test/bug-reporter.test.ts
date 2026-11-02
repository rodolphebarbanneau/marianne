import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A report prepared in the app, open or locked: open, the log's end comes scrubbed of the profile's
 * identifiers; locked, they can't be read, so the log stays out and no engine runs. The log, the
 * profile and the engines are the test's (invented values).
 */

// ~/.marianne points at a temporary folder, before paths.ts reads it.
const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-bug-reporter-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

const state = vi.hoisted(() => ({ unlocked: true }))

vi.mock('electron', () => ({ app: { getVersion: () => '0.1.0', isPackaged: true, getLocale: () => 'fr' } }))
vi.mock('../src/main/session', () => ({
  session: {
    get unlocked() {
      return state.unlocked
    }
  }
}))
vi.mock('../src/main/profile/store', () => ({
  profile: { tokens: () => [{ token: 'address', label: 'adresse', value: '12 rue des Tilleuls', kind: 'text' }] }
}))
vi.mock('../src/main/cards', () => ({ cards: { numbers: () => [] } }))
vi.mock('../src/main/folders', () => ({ folders: { get: () => null, messages: () => [] } }))
vi.mock('../src/main/engines', () => ({
  engineStatus: async () => ({ found: true, loggedIn: true, version: '1.0' }),
  runTurn: vi.fn(async () => undefined)
}))

import { LOCKED_LOG, prepareBugReport } from '../src/main/bug-reporter'
import { runTurn } from '../src/main/engines'
import { paths } from '../src/main/paths'

beforeEach(() => {
  state.unlocked = true
  vi.mocked(runTurn).mockClear()
  mkdirSync(paths.logs, { recursive: true })
  const line = (text: string) => `2026-11-02T10:00:00.000Z [warn] ${text}`
  writeFileSync(join(paths.logs, 'marianne.log'), [line('first, cut'), line('[3615 BONJOUR] no answer for 12 rue des Tilleuls'), ''].join('\n'))
})

describe('a bug report', () => {
  it('has the log’s end, scrubbed of the profile’s identifiers, when the archive is open', async () => {
    const report = await prepareBugReport({ description: 'La tuile reste vide.', screen: 'services', errors: [], analyze: false })
    expect(report.diagnostics).toContain('[3615 BONJOUR] no answer for')
    expect(report.diagnostics).not.toContain('12 rue des Tilleuls')
    expect(report.diagnostics).not.toContain(LOCKED_LOG)
  })

  it('leaves the log out, and runs no engine, from the lock screen', async () => {
    state.unlocked = false
    const report = await prepareBugReport({ description: 'Je ne peux pas ouvrir mon compte.', screen: 'lock screen', errors: [], analyze: true })
    expect(report.diagnostics).toContain(LOCKED_LOG)
    expect(report.diagnostics).not.toContain('no answer for')
    expect(report.diagnostics).not.toContain('Tilleuls')
    expect(report.analyzedBy).toBeNull()
    expect(runTurn).not.toHaveBeenCalled()
  })
})
