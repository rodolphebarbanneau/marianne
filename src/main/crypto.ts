import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { paths } from './paths'

/**
 * Encryption of the personal data (file, documents, conversations): AES-256-GCM with a random
 * data key. The data key is wrapped by the OS keystore (Electron safeStorage) in keys.json; a
 * backup carries the data under a key derived from a passphrase instead (scrypt).
 *
 * Sealed format: [12-byte IV][16-byte auth tag][ciphertext].
 */

const IV = 12
const TAG = 16

export function seal(key: Buffer, plain: Buffer | string): Buffer {
  const iv = randomBytes(IV)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(typeof plain === 'string' ? Buffer.from(plain, 'utf8') : plain), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body])
}

/** Throws when the data was altered or the key is wrong. */
export function unseal(key: Buffer, sealed: Buffer): Buffer {
  if (sealed.length < IV + TAG) throw new Error('Données chiffrées tronquées')
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, IV))
  decipher.setAuthTag(sealed.subarray(IV, IV + TAG))
  return Buffer.concat([decipher.update(sealed.subarray(IV + TAG)), decipher.final()])
}

/** A key from a passphrase (backups). Deliberately slow: ~0.5 s. */
export function passphraseKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase.normalize('NFC'), salt, 32, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 })
}

export class VaultLockedError extends Error {
  constructor() {
    super('Le coffre de ce dossier ne peut pas être ouvert avec le trousseau du système (réinstallation, autre compte ?). Restaurez une sauvegarde.')
  }
}

let dataKey: Buffer | null = null

/**
 * The data key: unwrapped from keys.json, or created on first use. Throws VaultLockedError when
 * the keystore can't unwrap an existing key: the data is then only recoverable from a backup.
 */
export function vaultKey(): Buffer {
  if (dataKey) return dataKey
  const { safeStorage } = require('electron') as typeof import('electron')
  if (existsSync(paths.keys)) {
    const { wrapped } = JSON.parse(readFileSync(paths.keys, 'utf8')) as { wrapped: string }
    try {
      dataKey = Buffer.from(safeStorage.decryptString(Buffer.from(wrapped, 'base64')), 'base64')
    } catch {
      throw new VaultLockedError()
    }
    return dataKey
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Le chiffrement du système n’est pas disponible : le coffre ne peut pas être créé.')
  const key = randomBytes(32)
  const tmp = `${paths.keys}.tmp`
  writeFileSync(tmp, JSON.stringify({ version: 1, wrapped: safeStorage.encryptString(key.toString('base64')).toString('base64') }), { mode: 0o600 })
  renameSync(tmp, paths.keys)
  dataKey = key
  return key
}

/** Replace the data key (restoring a backup made on another computer re-encrypts with a new one). */
export function resetVaultKey(): Buffer {
  dataKey = null
  if (existsSync(paths.keys)) renameSync(paths.keys, `${paths.keys}.old`)
  return vaultKey()
}

/** Write `data` encrypted with the vault key, atomically. */
export function writeSealed(file: string, data: Buffer | string): void {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, seal(vaultKey(), data), { mode: 0o600 })
  renameSync(tmp, file)
}

export function readSealed(file: string): Buffer {
  return unseal(vaultKey(), readFileSync(file))
}
