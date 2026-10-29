import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { accountFile, archivesIn, cloudSynced, defaultArchiveFolder, listAccounts, newAccountId, type Places } from '../src/main/archive/accounts'
import { createArchive, openArchive, readHeader, recoverArchive, unlockArchive, WrongSecretError } from '../src/main/archive/archive'
import { normalizeRecoveryKey } from '../src/main/archive/crypto'
import { PIN_ATTEMPTS, PinStore, WrongPinError, type Keystore } from '../src/main/archive/pin'

const dir = mkdtempSync(join(tmpdir(), 'marianne-archive-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const PASSWORD = 'Kq7#-mZ2!-pR4w-Tx9%-bN3e'
const fakeKeystore: Keystore = {
  available: () => true,
  encrypt: async (s) => Buffer.from(`ks:${s}`),
  decrypt: async (b) => b.toString().slice(3)
}

describe('archive', () => {
  it('keeps records and files sealed, readable only with the password or the recovery key', async () => {
    const id = newAccountId(dir)
    const file = accountFile(dir, id)
    const { archive, recoveryKey } = await createArchive(file, { id, display: 'C.', password: PASSWORD })
    archive.put('profile', 'me', { name: 'DURAND', nir: '185057800608436' })
    const big = Buffer.alloc(2.5 * 1024 * 1024, 7)
    archive.writeFile('f1', big, { name: 'avis.pdf', folder: 'x' })
    archive.close()

    expect(readHeader(file)).toMatchObject({ id, display: 'C.' })
    expect(listAccounts(dir).map((a) => a.id)).toContain(id)

    await expect(unlockArchive(file, 'wrong password')).rejects.toBeInstanceOf(WrongSecretError)
    const reopened = await unlockArchive(file, PASSWORD)
    expect(reopened.get('profile', 'me')).toEqual({ name: 'DURAND', nir: '185057800608436' })
    expect(reopened.readFile('f1').equals(big)).toBe(true)
    expect(reopened.listFiles()).toEqual([{ id: 'f1', size: big.length, meta: { name: 'avis.pdf', folder: 'x' } }])
    reopened.close()

    const recovered = await recoverArchive(file, recoveryKey.toLowerCase().replace(/-/g, ' '))
    expect(recovered.ids('profile')).toEqual(['me'])
    recovered.close()
  }, 30_000)

  it('changes the password instantly and renews the recovery key', async () => {
    const id = newAccountId(dir)
    const file = accountFile(dir, id)
    const { archive, recoveryKey } = await createArchive(file, { id, display: '', password: PASSWORD })
    await archive.changePassword('Bb8&-cC9*-dD2+-eE3=-fF4?-gG5@')
    const renewed = await archive.renewRecoveryKey()
    archive.close()
    await expect(unlockArchive(file, PASSWORD)).rejects.toBeInstanceOf(WrongSecretError)
    await expect(recoverArchive(file, recoveryKey)).rejects.toBeInstanceOf(WrongSecretError)
    ;(await unlockArchive(file, 'Bb8&-cC9*-dD2+-eE3=-fF4?-gG5@')).close()
    ;(await recoverArchive(file, renewed)).close()
  }, 30_000)

  it('gives space back when a file is removed', async () => {
    const id = newAccountId(dir)
    const { archive } = await createArchive(accountFile(dir, id), { id, display: '', password: PASSWORD })
    const before = archive.usage().used
    archive.writeFile('big', Buffer.alloc(4 * 1024 * 1024, 1), {})
    expect(archive.usage().used).toBeGreaterThan(before + 4 * 1024 * 1024)
    archive.removeFile('big')
    expect(archive.usage().used).toBeLessThan(before + 1024 * 1024)
    archive.close()
  }, 30_000)

  it('refuses a data key that is not its own', async () => {
    const id = newAccountId(dir)
    const file = accountFile(dir, id)
    const { archive } = await createArchive(file, { id, display: '', password: PASSWORD })
    const key = archive.dataKey()
    archive.close()
    expect(() => openArchive(file, Buffer.alloc(32))).toThrow()
    openArchive(file, key).close()
  }, 30_000)

  it('reads the recovery key however it was typed', () => {
    expect(normalizeRecoveryKey('k7qf2-m9xpl o4d88')).toBe('K7QF2M9XP104D88')
  })
})

describe('pin', () => {
  it('unlocks with the PIN and erases it after too many wrong tries', async () => {
    const pins = new PinStore(join(dir, 'devices'), fakeKeystore)
    const key = Buffer.alloc(32, 9)
    await pins.set('0a1b2c3d', '482916', key)
    expect(pins.has('0a1b2c3d')).toBe(true)
    expect((await pins.unlock('0a1b2c3d', '482916')).equals(key)).toBe(true)
    for (let i = 1; i < PIN_ATTEMPTS; i++) {
      await expect(pins.unlock('0a1b2c3d', '000000')).rejects.toMatchObject({ remaining: PIN_ATTEMPTS - i })
    }
    await expect(pins.unlock('0a1b2c3d', '000000')).rejects.toBeInstanceOf(WrongPinError)
    expect(pins.has('0a1b2c3d')).toBe(false)
  }, 30_000)

  it('is useless without the keystore that sealed the device secret', async () => {
    const pins = new PinStore(join(dir, 'devices'), fakeKeystore)
    await pins.set('11112222', '582047', Buffer.alloc(32, 3))
    const other = new PinStore(join(dir, 'devices'), { ...fakeKeystore, decrypt: async () => Buffer.alloc(32, 1).toString('base64') })
    await expect(other.unlock('11112222', '582047')).rejects.toBeInstanceOf(WrongPinError)
  }, 30_000)
})

describe('default archive folder', () => {
  const home = String.raw`C:\Users\camille`
  const places = (over: Partial<Places>): Places => ({
    platform: 'win32',
    home,
    documents: String.raw`C:\Users\camille\Documents`,
    env: {},
    exists: () => false,
    ...over
  })

  it('is Documents › Marianne when nothing syncs it', () => {
    expect(defaultArchiveFolder(places({}))).toBe(join(String.raw`C:\Users\camille\Documents`, 'Marianne'))
    expect(defaultArchiveFolder(places({ platform: 'linux', home: '/home/camille', documents: '/home/camille/Documents' }))).toBe(
      join('/home/camille/Documents', 'Marianne')
    )
  })

  it('stays on the computer when OneDrive syncs Documents', () => {
    const synced = places({ documents: String.raw`C:\Users\camille\OneDrive\Documents`, env: { OneDrive: String.raw`C:\Users\camille\OneDrive` } })
    expect(cloudSynced(synced.documents, synced)).toBe(true)
    expect(defaultArchiveFolder(synced)).toBe(join(home, 'Marianne'))
    // A business OneDrive ("OneDrive - Contoso"), even without the variable.
    expect(cloudSynced(String.raw`C:\Users\camille\OneDrive - Contoso\Documents`, places({}))).toBe(true)
    // Not fooled by a folder merely named like it.
    expect(cloudSynced(String.raw`C:\Users\camille\Documents`, places({ env: { OneDrive: String.raw`C:\Users\camille\OneDrive` } }))).toBe(false)
  })

  it('stays on the computer when iCloud syncs Desktop & Documents on macOS', () => {
    const mac = places({ platform: 'darwin', home: '/Users/camille', documents: '/Users/camille/Documents' })
    expect(defaultArchiveFolder(mac)).toBe(join('/Users/camille/Documents', 'Marianne'))
    const icloud = { ...mac, exists: (p: string) => p.endsWith(join('com~apple~CloudDocs', 'Documents')) }
    expect(defaultArchiveFolder(icloud)).toBe(join('/Users/camille', 'Marianne'))
  })
})

describe('archives opened from the system', () => {
  it('finds the archives on a command line, wherever they were named from', () => {
    const cwd = join(dir, 'here')
    const file = join(dir, 'cle', 'ABCD.marianne')
    const argv = ['--hidden', '--original-process-start-time=13372', 'notes.txt', 'ABCD.MARIANNE', file, pathToFileURL(file).href]
    expect(archivesIn(argv, cwd)).toEqual([join(cwd, 'ABCD.MARIANNE'), file, file])
  })

  it('finds none on a plain launch', () => {
    expect(archivesIn(['.', '--user-data-dir=/tmp/marianne'], dir)).toEqual([])
  })
})
