import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { Dossier } from '../shared/dossier'
import type { Config, DeepPartial } from '../shared/types'
import { configStore } from './config'
import { passphraseKey, readSealed, resetVaultKey, seal, unseal, writeSealed } from './crypto'
import { dossier } from './dossier/store'
import { paths } from './paths'
import { vault } from './vault'

/**
 * Backups: the personal file, its documents, the conversations and the keychain, re-encrypted
 * under a passphrase, in one file. The vault key is tied to this computer's keystore; a backup is
 * how the data moves to another computer or survives a reinstall.
 *
 * Format: "MARIANNE1" + 16-byte salt + sealed(zip).
 */

const MAGIC = Buffer.from('MARIANNE1')
const SALT = 16

export async function exportBackup(passphrase: string, dest: string): Promise<void> {
  if (passphrase.length < 10) throw new Error('Choisissez une phrase de passe d’au moins 10 caractères.')
  const files: Record<string, Uint8Array> = {}
  files['dossier.json'] = strToU8(JSON.stringify(dossier.get()))
  for (const meta of dossier.get().documents) {
    const f = join(paths.documents, `${meta.id}.bin`)
    if (existsSync(f)) files[`documents/${meta.id}`] = readSealed(f)
  }
  for (const name of readdirSync(paths.conversations).filter((n) => n.endsWith('.enc'))) {
    files[`conversations/${name.replace(/\.enc$/, '.json')}`] = readSealed(join(paths.conversations, name))
  }
  files['trousseau.json'] = strToU8(JSON.stringify(vault.exportPlain()))
  if (existsSync(paths.config)) files['config.json'] = readFileSync(paths.config)
  const salt = randomBytes(SALT)
  const sealed = seal(passphraseKey(passphrase, salt), Buffer.from(zipSync(files, { level: 6 })))
  await writeFile(dest, Buffer.concat([MAGIC, salt, sealed]), { mode: 0o600 })
}

/** Restore everything from a backup, re-encrypted with a fresh key of this computer. */
export async function importBackup(passphrase: string, src: string): Promise<void> {
  const buf = await readFile(src)
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Ce fichier n’est pas une sauvegarde de Marianne.')
  const salt = buf.subarray(MAGIC.length, MAGIC.length + SALT)
  let zip: Buffer
  try {
    zip = unseal(passphraseKey(passphrase, salt), buf.subarray(MAGIC.length + SALT))
  } catch {
    throw new Error('Phrase de passe incorrecte, ou sauvegarde abîmée.')
  }
  const files = unzipSync(new Uint8Array(zip))
  if (!files['dossier.json']) throw new Error('Sauvegarde incomplète : le dossier manque.')
  const restored = JSON.parse(strFromU8(files['dossier.json'])) as Dossier
  // Entries by kind, file names only (never a path out of their folder).
  const entries = (dir: string) =>
    Object.entries(files)
      .filter(([name]) => name.startsWith(`${dir}/`))
      .map(([name, data]) => [name.slice(dir.length + 1), data] as const)
      .filter(([name]) => /^[\w.-]+$/.test(name) && !name.startsWith('.'))

  const documents = entries('documents').map(([name, data]) => [`${name}.bin`, data] as const)
  const conversations = entries('conversations').map(([name, data]) => [name.replace(/\.json$/, '.enc'), data] as const)
  const keychain = files['trousseau.json'] ? JSON.parse(strFromU8(files['trousseau.json'])) : null
  const config = files['config.json'] ? (JSON.parse(strFromU8(files['config.json'])) as DeepPartial<Config>) : null

  // A new key, and the file first: should anything fail after, the dossier opens with it.
  resetVaultKey()
  dossier.replace(restored)
  for (const [name, data] of documents) writeSealed(join(paths.documents, name), Buffer.from(data))
  for (const [name, data] of conversations) writeSealed(join(paths.conversations, name), Buffer.from(data))
  if (keychain) vault.importPlain(keychain)
  if (config) {
    // Where the agent CLIs are installed belongs to this computer, not to the backup.
    const current = configStore.get().agent
    config.agent = {
      ...config.agent,
      claudeCode: { ...config.agent?.claudeCode, path: current.claudeCode.path },
      codex: { ...config.agent?.codex, path: current.codex.path }
    }
    await writeFile(paths.config, JSON.stringify(config, null, 2))
  }
  // The backup replaces the documents and conversations: the others are encrypted with the old
  // key, unreadable now.
  const restoredNames = new Set([...documents, ...conversations].map(([name]) => name))
  for (const dir of [paths.documents, paths.conversations])
    for (const name of readdirSync(dir)) if (/\.(bin|enc)$/.test(name) && !restoredNames.has(name)) rmSync(join(dir, name), { force: true })
  rmSync(`${paths.keys}.old`, { force: true })
}
