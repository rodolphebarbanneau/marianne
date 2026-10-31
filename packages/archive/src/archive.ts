import { randomBytes } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { deriveKey, LIGHT_KDF, newRecoveryKey, normalizeRecoveryKey, PASSWORD_KDF, randomKey, seal, unseal, type KdfParams } from './crypto'

/**
 * An account is one archive file, `<id>.marianne`: a SQLite database where every record and
 * every file chunk is sealed with the account's data key (AES-256-GCM). The only plaintext is
 * the `vault` row: the account id, how to show it on the lock screen, and the data key wrapped
 * by the master password and by the recovery key, so changing the password is instant and
 * nothing outside the file is needed to open it.
 *
 * Capped at 1 GiB, like a USB stick: new files are refused past the cap.
 */

export const ARCHIVE_EXT = '.marianne'
export const CAPACITY = 1024 ** 3
const CHUNK = 1024 * 1024
const FORMAT = 1

export interface ArchiveHeader {
  format: number
  id: string
  /** Shown on the lock screen: initials, a first name, or empty for the id alone. */
  display: string
  created: string
}

export interface StoredFile<M> {
  id: string
  size: number
  meta: M
}

export interface Usage {
  used: number
  capacity: number
}

export class WrongSecretError extends Error {
  constructor(what: 'password' | 'recovery') {
    super(what === 'password' ? 'Phrase de passe incorrecte.' : 'Clé de secours incorrecte.')
  }
}

export class ArchiveFullError extends Error {
  constructor() {
    super('L’archive est pleine (1 Go). Libérez de la place dans Réglages › Place et emplacement.')
  }
}

/** A document whose chunks don't all read back as they were written: one is missing, moved or altered. */
export class DamagedFileError extends Error {
  constructor() {
    super('Ce document est abîmé dans l’archive : une partie en manque ou a été modifiée.')
  }
}

/** What a chunk is sealed with: its file, its place and how many chunks the file has. */
const chunkAad = (id: string, n: number, total: number) => `chunks/${id}/${n}/of/${total}`

interface VaultRow {
  format: number
  id: string
  display: string
  created: string
  kdf: string
  salt: Uint8Array
  password_key: Uint8Array
  recovery_salt: Uint8Array
  recovery_key: Uint8Array
  check_value: Uint8Array
}

const SCHEMA = `
  CREATE TABLE vault (
    format INTEGER NOT NULL, id TEXT NOT NULL, display TEXT NOT NULL, created TEXT NOT NULL,
    kdf TEXT NOT NULL, salt BLOB NOT NULL, password_key BLOB NOT NULL,
    recovery_salt BLOB NOT NULL, recovery_key BLOB NOT NULL, check_value BLOB NOT NULL
  );
  CREATE TABLE records (kind TEXT NOT NULL, id TEXT NOT NULL, body BLOB NOT NULL, PRIMARY KEY (kind, id)) WITHOUT ROWID;
  CREATE TABLE files (id TEXT PRIMARY KEY, size INTEGER NOT NULL, meta BLOB NOT NULL) WITHOUT ROWID;
  CREATE TABLE chunks (file_id TEXT NOT NULL, n INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (file_id, n)) WITHOUT ROWID;
`

const CHECK = Buffer.from('marianne', 'utf8')
/** The key derivations every vault row records, the only ones `vaultKdf` takes back. */
const VAULT_KDF = JSON.stringify({ password: PASSWORD_KDF, recovery: LIGHT_KDF })

function connect(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  // One writer at a time, and nobody else while it's open: two Marianne on one archive would corrupt it.
  db.exec('PRAGMA journal_mode = DELETE; PRAGMA locking_mode = EXCLUSIVE; PRAGMA foreign_keys = OFF')
  return db
}

const json = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8')
const parse = <T>(buf: Buffer): T => JSON.parse(buf.toString('utf8')) as T

/** The plaintext header of an archive, without opening it; null when it isn't one. */
export function readHeader(path: string): ArchiveHeader | null {
  if (!existsSync(path)) return null
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(path, { readOnly: true })
    const row = db.prepare('SELECT format, id, display, created FROM vault LIMIT 1').get() as ArchiveHeader | undefined
    return row ? { format: row.format, id: row.id, display: row.display, created: row.created } : null
  } catch {
    return null
  } finally {
    db?.close()
  }
}

export async function createArchive(
  path: string,
  options: { id: string; display: string; password: string }
): Promise<{ archive: Archive; recoveryKey: string }> {
  if (existsSync(path)) throw new Error('Une archive existe déjà à cet endroit.')
  const dek = randomKey()
  const salt = randomBytes(16)
  const recoverySalt = randomBytes(16)
  const recoveryKey = newRecoveryKey()
  const [passwordKey, recoveryWrap] = await Promise.all([
    deriveKey(options.password, salt, PASSWORD_KDF),
    deriveKey(normalizeRecoveryKey(recoveryKey), recoverySalt, LIGHT_KDF)
  ])
  const db = connect(path)
  // Must come before the first table: freed pages are given back to the file.
  db.exec('PRAGMA auto_vacuum = INCREMENTAL')
  db.exec(SCHEMA)
  const header: ArchiveHeader = { format: FORMAT, id: options.id, display: options.display, created: new Date().toISOString() }
  db.prepare('INSERT INTO vault VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    header.format,
    header.id,
    header.display,
    header.created,
    VAULT_KDF,
    salt,
    seal(passwordKey, dek, 'vault/password'),
    recoverySalt,
    seal(recoveryWrap, dek, 'vault/recovery'),
    seal(dek, CHECK, 'vault/check')
  )
  return { archive: new Archive(db, dek, header, path), recoveryKey }
}

function vaultRow(db: DatabaseSync): VaultRow {
  const row = db.prepare('SELECT * FROM vault LIMIT 1').get() as VaultRow | undefined
  if (!row) throw new Error('Ce fichier n’est pas une archive Marianne.')
  if (row.format > FORMAT) throw new Error('Cette archive vient d’une version plus récente de Marianne.')
  return row
}

const sameKdf = (a: unknown, b: KdfParams) => {
  const x = a as Partial<KdfParams> | null
  return !!x && typeof x === 'object' && x.N === b.N && x.r === b.r && x.p === b.p
}

/**
 * The key derivations of the vault row, which is plaintext: anyone can write a `.marianne` file whose
 * scrypt asks for gigabytes (N = 2²⁴) and hand it over. Only the parameters Marianne writes are taken.
 */
function vaultKdf(row: VaultRow): { password: KdfParams; recovery: KdfParams } {
  let kdf: { password?: unknown; recovery?: unknown } | null
  try {
    kdf = JSON.parse(row.kdf) as { password?: unknown; recovery?: unknown } | null
  } catch {
    // Unreadable: refused below, like unknown parameters.
    kdf = null
  }
  if (!kdf || typeof kdf !== 'object' || !sameKdf(kdf.password, PASSWORD_KDF) || !sameKdf(kdf.recovery, LIGHT_KDF))
    throw new Error('Cette archive n’est pas chiffrée comme Marianne le fait : elle est peut-être abîmée.')
  return { password: PASSWORD_KDF, recovery: LIGHT_KDF }
}

async function unwrap(path: string, secret: string, which: 'password' | 'recovery'): Promise<Archive> {
  const db = connect(path)
  try {
    const row = vaultRow(db)
    const kdf = vaultKdf(row)
    const key =
      which === 'password' ? await deriveKey(secret, row.salt, kdf.password) : await deriveKey(normalizeRecoveryKey(secret), row.recovery_salt, kdf.recovery)
    let dek: Buffer
    try {
      dek = unseal(key, which === 'password' ? row.password_key : row.recovery_key, `vault/${which}`)
    } catch {
      throw new WrongSecretError(which)
    }
    return new Archive(db, dek, { format: row.format, id: row.id, display: row.display, created: row.created }, path)
  } catch (err) {
    db.close()
    throw err
  }
}

export const unlockArchive = (path: string, password: string) => unwrap(path, password, 'password')
export const recoverArchive = (path: string, recoveryKey: string) => unwrap(path, recoveryKey, 'recovery')

/** Open with a data key kept elsewhere (the PIN on this computer). Throws when it isn't this archive's. */
export function openArchive(path: string, dek: Buffer): Archive {
  const db = connect(path)
  try {
    const row = vaultRow(db)
    try {
      unseal(dek, row.check_value, 'vault/check')
    } catch {
      throw new Error('La clé ne correspond pas à cette archive.')
    }
    return new Archive(db, Buffer.from(dek), { format: row.format, id: row.id, display: row.display, created: row.created }, path)
  } catch (err) {
    db.close()
    throw err
  }
}

export class Archive {
  private closed = false

  constructor(
    private readonly db: DatabaseSync,
    private readonly dek: Buffer,
    public header: ArchiveHeader,
    readonly path: string
  ) {}

  get id(): string {
    return this.header.id
  }

  /** The data key, to wrap it for the PIN on this computer. A copy: the caller may wipe it. */
  dataKey(): Buffer {
    return Buffer.from(this.dek)
  }

  // ---------- records: small JSON values ----------

  get<T>(kind: string, id: string): T | null {
    const row = this.db.prepare('SELECT body FROM records WHERE kind = ? AND id = ?').get(kind, id) as { body: Uint8Array } | undefined
    return row ? parse<T>(unseal(this.dek, row.body, `records/${kind}/${id}`)) : null
  }

  put(kind: string, id: string, value: unknown): void {
    this.db.prepare('INSERT OR REPLACE INTO records (kind, id, body) VALUES (?, ?, ?)').run(kind, id, seal(this.dek, json(value), `records/${kind}/${id}`))
  }

  remove(kind: string, id: string): void {
    this.db.prepare('DELETE FROM records WHERE kind = ? AND id = ?').run(kind, id)
  }

  ids(kind: string): string[] {
    return (this.db.prepare('SELECT id FROM records WHERE kind = ?').all(kind) as Array<{ id: string }>).map((r) => r.id)
  }

  list<T>(kind: string): T[] {
    const rows = this.db.prepare('SELECT id, body FROM records WHERE kind = ?').all(kind) as Array<{ id: string; body: Uint8Array }>
    return rows.map((r) => parse<T>(unseal(this.dek, r.body, `records/${kind}/${r.id}`)))
  }

  // ---------- files: documents, in 1 MiB chunks ----------
  // Each chunk is sealed with its place and with the number of chunks of its file: one taken out of
  // the archive (a document's last ones, which would leave it shorter but readable) makes the file
  // unreadable rather than wrong.

  writeFile<M>(id: string, data: Uint8Array, meta: M): void {
    const previous = this.db.prepare('SELECT size FROM files WHERE id = ?').get(id) as { size: number } | undefined
    if (this.usage().used - (previous?.size ?? 0) + data.byteLength > CAPACITY) throw new ArchiveFullError()
    this.transaction(() => {
      this.db.prepare('DELETE FROM chunks WHERE file_id = ?').run(id)
      const insert = this.db.prepare('INSERT INTO chunks (file_id, n, data) VALUES (?, ?, ?)')
      const total = Math.max(1, Math.ceil(data.byteLength / CHUNK))
      for (let n = 0; n < total; n++) insert.run(id, n, seal(this.dek, data.subarray(n * CHUNK, (n + 1) * CHUNK), chunkAad(id, n, total)))
      this.db.prepare('INSERT OR REPLACE INTO files (id, size, meta) VALUES (?, ?, ?)').run(id, data.byteLength, seal(this.dek, json(meta), `files/${id}`))
    })
  }

  readFile(id: string): Buffer {
    const rows = this.db.prepare('SELECT n, data FROM chunks WHERE file_id = ? ORDER BY n').all(id) as Array<{ n: number; data: Uint8Array }>
    if (!rows.length) throw new Error('Fichier introuvable dans l’archive.')
    if (rows.some((r, i) => r.n !== i)) throw new DamagedFileError()
    try {
      return Buffer.concat(rows.map((r) => unseal(this.dek, r.data, chunkAad(id, r.n, rows.length))))
    } catch {
      // Sealed before the count was (0.1.0-alpha.2 and earlier): its chunks are checked one by one,
      // and the whole against the size the archive keeps of it.
      let data: Buffer
      try {
        data = Buffer.concat(rows.map((r) => unseal(this.dek, r.data, `chunks/${id}/${r.n}`)))
      } catch {
        throw new DamagedFileError()
      }
      const size = (this.db.prepare('SELECT size FROM files WHERE id = ?').get(id) as { size: number } | undefined)?.size
      if (size !== data.byteLength) throw new DamagedFileError()
      return data
    }
  }

  fileMeta<M>(id: string): StoredFile<M> | null {
    const row = this.db.prepare('SELECT id, size, meta FROM files WHERE id = ?').get(id) as { id: string; size: number; meta: Uint8Array } | undefined
    return row ? { id: row.id, size: row.size, meta: parse<M>(unseal(this.dek, row.meta, `files/${row.id}`)) } : null
  }

  updateFileMeta<M>(id: string, meta: M): void {
    this.db.prepare('UPDATE files SET meta = ? WHERE id = ?').run(seal(this.dek, json(meta), `files/${id}`), id)
  }

  listFiles<M>(): Array<StoredFile<M>> {
    const rows = this.db.prepare('SELECT id, size, meta FROM files').all() as Array<{ id: string; size: number; meta: Uint8Array }>
    return rows.map((r) => ({ id: r.id, size: r.size, meta: parse<M>(unseal(this.dek, r.meta, `files/${r.id}`)) }))
  }

  removeFile(id: string): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM chunks WHERE file_id = ?').run(id)
      this.db.prepare('DELETE FROM files WHERE id = ?').run(id)
    })
    this.db.exec('PRAGMA incremental_vacuum')
  }

  // ---------- the account ----------

  usage(): Usage {
    const pages = (this.db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count
    const free = (this.db.prepare('PRAGMA freelist_count').get() as { freelist_count: number }).freelist_count
    const size = (this.db.prepare('PRAGMA page_size').get() as { page_size: number }).page_size
    return { used: (pages - free) * size, capacity: CAPACITY }
  }

  /** Bytes taken by records of a kind, and by files whose id starts with a prefix (sealed sizes). */
  recordBytes(kind: string): number {
    return (this.db.prepare('SELECT COALESCE(SUM(length(body)), 0) AS n FROM records WHERE kind = ?').get(kind) as { n: number }).n
  }

  fileBytes(prefix = ''): number {
    return (this.db.prepare("SELECT COALESCE(SUM(size), 0) AS n FROM files WHERE id LIKE ? || '%'").get(prefix) as { n: number }).n
  }

  /** A consistent copy of the whole archive, still encrypted: the backup. */
  copyTo(path: string): void {
    if (existsSync(path)) throw new Error('Un fichier existe déjà à cet endroit.')
    this.db.prepare('VACUUM INTO ?').run(path)
  }

  async verifyPassword(password: string): Promise<boolean> {
    if (!password) return false
    const row = vaultRow(this.db)
    try {
      unseal(await deriveKey(password, row.salt, vaultKdf(row).password), row.password_key, 'vault/password')
      return true
    } catch {
      return false
    }
  }

  async changePassword(next: string): Promise<void> {
    const salt = randomBytes(16)
    const key = await deriveKey(next, salt, PASSWORD_KDF)
    this.db.prepare('UPDATE vault SET salt = ?, password_key = ?, kdf = ?').run(salt, seal(key, this.dek, 'vault/password'), VAULT_KDF)
  }

  /**
   * A new recovery key; the previous one stops working. It opens the archive for good, so the
   * password is asked again: an open session, or a PIN, isn't enough to mint one.
   */
  async renewRecoveryKey(password: string): Promise<string> {
    if (!(await this.verifyPassword(password))) throw new WrongSecretError('password')
    const recoveryKey = newRecoveryKey()
    const salt = randomBytes(16)
    const key = await deriveKey(normalizeRecoveryKey(recoveryKey), salt, LIGHT_KDF)
    // The parameters the key was wrapped with go in the same statement: a recovery key and its kdf never disagree.
    this.db.prepare('UPDATE vault SET recovery_salt = ?, recovery_key = ?, kdf = ?').run(salt, seal(key, this.dek, 'vault/recovery'), VAULT_KDF)
    return recoveryKey
  }

  setDisplay(display: string): void {
    this.db.prepare('UPDATE vault SET display = ?').run(display)
    this.header = { ...this.header, display }
  }

  transaction(fn: () => void): void {
    this.db.exec('BEGIN')
    try {
      fn()
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  /** Size of the archive file on disk. */
  fileSize(): number {
    return statSync(this.path).size
  }

  /** Close the database and wipe the data key from memory. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.dek.fill(0)
    this.db.close()
  }
}
