import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

/**
 * What an open session may do with the archive's secrets: a new password without the old one only
 * after the recovery key opened it, a new recovery key only with the password. Real archives, in a
 * temporary folder; Electron's keystore isn't reached (no PIN here).
 */

// ~/.marianne points at a temporary folder, before paths.ts reads it.
const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-account-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
const folder = mkdtempSync(join(root, 'archives-'))
afterAll(() => {
  session.lock('quit')
  rmSync(root, { recursive: true, force: true })
})

vi.mock('electron', () => ({ app: { getVersion: () => '0' }, safeStorage: {} }))

import { accounts } from '../src/main/account'
import { configStore } from '../src/main/config'
import { session } from '../src/main/session'

const PASSWORD = 'Kq7#-mZ2!-pR4w-Tx9%-bN3e'
const NEXT = 'Bb8&-cC9*-dD2+-eE3=-fF4?-gG5@'

describe('the account’s secrets', () => {
  it('renews the recovery key with the password only, and resets the password only after the recovery key', async () => {
    configStore.update({ archiveFolder: folder })
    const { recoveryKey, state } = await accounts.create({ password: PASSWORD, display: '' })
    const id = state.account!.id
    expect(session.unlockedWith).toBe('created')

    // An open session alone doesn't make a recovery key, nor a password without the old one.
    await expect(accounts.renewRecoveryKey()).rejects.toThrow('Phrase de passe incorrecte')
    await expect(accounts.renewRecoveryKey('not the password')).rejects.toThrow('Phrase de passe incorrecte')
    await expect(accounts.resetPassword(NEXT)).rejects.toThrow('clé de secours')
    const renewed = await accounts.renewRecoveryKey(PASSWORD)
    accounts.lock()

    // The old recovery key stopped working; the new one opens the archive, for one new password.
    await expect(accounts.unlock(id, { recoveryKey })).rejects.toThrow('Clé de secours incorrecte')
    await accounts.unlock(id, { recoveryKey: renewed })
    expect(session.unlockedWith).toBe('recovery')
    await accounts.resetPassword(NEXT)
    await expect(accounts.resetPassword(PASSWORD)).rejects.toThrow('clé de secours')
    accounts.lock()

    // Opened by the password, the session can't reset it either.
    await accounts.unlock(id, { password: NEXT })
    expect(session.unlockedWith).toBe('password')
    await expect(accounts.resetPassword(PASSWORD)).rejects.toThrow('clé de secours')
  }, 60_000)
})
