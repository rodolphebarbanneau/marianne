import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { deriveKey, LIGHT_KDF, seal, unseal } from './crypto'
import { writeFileAtomic } from './files'

/**
 * Quick unlock with a PIN, on one computer. After the master password opened an archive here,
 * its data key is wrapped by a key derived from the PIN *and* a device secret that only the OS
 * keystore can give back (Keychain, DPAPI, libsecret): copying the file elsewhere is useless, and
 * a few wrong PINs erase it, so the master password is needed again.
 */

export const PIN_ATTEMPTS = 5

/** The OS keystore, injected: the app gives Electron's safeStorage, the tests a fake. */
export interface Keystore {
  /** False when there is no real keystore (Linux without a keyring): no PIN then. */
  available(): boolean
  encrypt(plain: string): Promise<Buffer>
  decrypt(sealed: Buffer): Promise<string>
}

export class WrongPinError extends Error {
  constructor(readonly remaining: number) {
    super(
      remaining > 0
        ? `Code incorrect. ${remaining} essai${remaining > 1 ? 's' : ''} avant de devoir saisir la phrase de passe.`
        : 'Code incorrect. Saisissez la phrase de passe.'
    )
  }
}

interface PinFile {
  version: 1
  /** The device secret, sealed by the OS keystore (base64). */
  secret: string
  salt: string
  wrapped: string
  attempts: number
}

export class PinStore {
  constructor(
    private readonly dir: string,
    private readonly keystore: Keystore
  ) {}

  private file(accountId: string): string {
    if (!/^[\da-f]{8}$/.test(accountId)) throw new Error('Identifiant de compte invalide')
    return join(this.dir, `${accountId}.json`)
  }

  private read(accountId: string): PinFile | null {
    const file = this.file(accountId)
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as PinFile) : null
  }

  private write(accountId: string, data: PinFile): void {
    mkdirSync(this.dir, { recursive: true })
    const file = this.file(accountId)
    writeFileAtomic(file, JSON.stringify(data), { mode: 0o600 })
  }

  available(): boolean {
    return this.keystore.available()
  }

  has(accountId: string): boolean {
    return this.available() && this.read(accountId) !== null
  }

  private async key(pin: string, salt: Buffer, secret: Buffer): Promise<Buffer> {
    // The device secret is mixed in before stretching: without the keystore, the PIN alone opens nothing.
    return deriveKey(`${pin}:${secret.toString('base64')}`, salt, LIGHT_KDF)
  }

  async set(accountId: string, pin: string, dataKey: Buffer): Promise<void> {
    if (!this.available()) throw new Error('Le trousseau du système n’est pas disponible sur cet ordinateur.')
    const secret = randomBytes(32)
    const salt = randomBytes(16)
    const key = await this.key(pin, salt, secret)
    this.write(accountId, {
      version: 1,
      secret: (await this.keystore.encrypt(secret.toString('base64'))).toString('base64'),
      salt: salt.toString('base64'),
      wrapped: seal(key, dataKey, `pin/${accountId}`).toString('base64'),
      attempts: 0
    })
  }

  /** The data key, or WrongPinError; after PIN_ATTEMPTS failures the PIN is erased. */
  async unlock(accountId: string, pin: string): Promise<Buffer> {
    const data = this.read(accountId)
    if (!data) throw new WrongPinError(0)
    const secret = Buffer.from(await this.keystore.decrypt(Buffer.from(data.secret, 'base64')), 'base64')
    const key = await this.key(pin, Buffer.from(data.salt, 'base64'), secret)
    try {
      const dataKey = unseal(key, Buffer.from(data.wrapped, 'base64'), `pin/${accountId}`)
      if (data.attempts) this.write(accountId, { ...data, attempts: 0 })
      return dataKey
    } catch {
      const attempts = data.attempts + 1
      if (attempts >= PIN_ATTEMPTS) this.remove(accountId)
      else this.write(accountId, { ...data, attempts })
      throw new WrongPinError(PIN_ATTEMPTS - attempts)
    }
  }

  remove(accountId: string): void {
    rmSync(this.file(accountId), { force: true })
  }
}
