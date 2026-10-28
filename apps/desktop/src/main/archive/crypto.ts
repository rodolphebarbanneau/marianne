import { createCipheriv, createDecipheriv, randomBytes, scrypt, type ScryptOptions } from 'node:crypto'

/**
 * AES-256-GCM for everything in an archive. A sealed value is [12-byte IV][16-byte tag][ciphertext];
 * its associated data names where it belongs (a record, a file chunk), so values can't be moved
 * around inside the archive without failing to open.
 */

const IV = 12
const TAG = 16

export function seal(key: Buffer, plain: Uint8Array, aad: string): Buffer {
  const iv = randomBytes(IV)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body])
}

/** Throws when the value was altered, moved, or the key is wrong. */
export function unseal(key: Buffer, sealed: Uint8Array, aad: string): Buffer {
  const data = Buffer.from(sealed.buffer, sealed.byteOffset, sealed.byteLength)
  if (data.length < IV + TAG) throw new Error('Données chiffrées tronquées')
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, IV))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(data.subarray(IV, IV + TAG))
  return Buffer.concat([decipher.update(data.subarray(IV + TAG)), decipher.final()])
}

export interface KdfParams {
  N: number
  r: number
  p: number
}

/** The master password: memory-hard and slow on purpose (256 MiB, about a second). */
export const PASSWORD_KDF: KdfParams = { N: 2 ** 18, r: 8, p: 1 }
/** The recovery key and the PIN (which also needs the computer's keystore): lighter. */
export const LIGHT_KDF: KdfParams = { N: 2 ** 16, r: 8, p: 1 }

export function deriveKey(secret: string, salt: Uint8Array, params: KdfParams): Promise<Buffer> {
  const options: ScryptOptions = { ...params, maxmem: 256 * params.N * params.r }
  return new Promise((resolve, reject) => scrypt(secret.normalize('NFC'), salt, 32, options, (err, key) => (err ? reject(err) : resolve(key))))
}

export const randomKey = (): Buffer => randomBytes(32)

/** Crockford base32: no I, L, O, U. */
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** 25 characters (125 bits) in groups of 5, to print or copy once. */
export function newRecoveryKey(): string {
  const bytes = randomBytes(25)
  const chars = [...bytes].map((b) => BASE32[b % 32]).join('')
  return chars.match(/.{5}/g)!.join('-')
}

/** Accept the recovery key however it was typed: spaces, dashes, lowercase, O for 0, I or L for 1. */
export function normalizeRecoveryKey(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
}
