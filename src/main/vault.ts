import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { safeStorage } from 'electron'
import type { VaultEntry, VaultEntryInput, VaultStatus } from '../shared/types'
import { log } from './log'
import { paths } from './paths'

/**
 * The keychain: logins for public-service websites and API credentials, in ~/.marianne/vault.json.
 * Usernames and passwords are encrypted with the OS keystore (Keychain on macOS, DPAPI on
 * Windows, libsecret/kwallet on Linux) through Electron's safeStorage. They are only decrypted
 * in the main process, to autofill the built-in browser or call an API: never sent to the AI.
 */

interface StoredEntry {
  id: string
  kind: VaultEntry['kind']
  label: string
  url: string
  createdAt: string
  updatedAt: string
  /** base64 of safeStorage.encryptString(JSON.stringify(Secret)). */
  secret: string
}

interface Secret {
  username: string
  password: string
}

/**
 * The site a URL belongs to: login pages often live on another subdomain than the home page
 * (www.impots.gouv.fr → cfspart.impots.gouv.fr). gouv.fr is a public suffix.
 */
export function siteOf(url: string): string {
  let host: string
  try {
    host = new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase()
  } catch {
    return ''
  }
  const labels = host.split('.')
  return labels.slice(host.endsWith('.gouv.fr') ? -3 : -2).join('.')
}

class Vault extends EventEmitter {
  private entries: StoredEntry[] = []

  load(): void {
    try {
      this.entries = (JSON.parse(readFileSync(paths.vault, 'utf8')) as { entries: StoredEntry[] }).entries ?? []
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log.error('Unreadable vault.json:', err)
      this.entries = []
    }
  }

  status(): VaultStatus {
    const available = safeStorage.isEncryptionAvailable()
    const backend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : process.platform === 'darwin' ? 'keychain' : 'dpapi'
    return { available, weak: backend === 'basic_text', backend, count: this.entries.length }
  }

  private decrypt(e: StoredEntry): Secret {
    return JSON.parse(safeStorage.decryptString(Buffer.from(e.secret, 'base64'))) as Secret
  }

  private encrypt(s: Secret): string {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Le chiffrement du système n’est pas disponible : impossible d’enregistrer un secret.')
    return safeStorage.encryptString(JSON.stringify(s)).toString('base64')
  }

  private view(e: StoredEntry): VaultEntry {
    let username = ''
    try {
      username = this.decrypt(e).username
    } catch {
      username = '(illisible sur cet ordinateur)'
    }
    return { id: e.id, kind: e.kind, label: e.label, url: e.url, username, createdAt: e.createdAt, updatedAt: e.updatedAt }
  }

  list(): VaultEntry[] {
    return this.entries.map((e) => this.view(e)).sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }

  save(input: VaultEntryInput): VaultEntry {
    const now = new Date().toISOString()
    const existing = input.id ? this.entries.find((e) => e.id === input.id) : undefined
    const password = input.password ?? (existing ? this.decrypt(existing).password : '')
    const entry: StoredEntry = {
      id: existing?.id ?? randomUUID(),
      kind: input.kind,
      label: input.label.trim() || siteOf(input.url) || 'sans nom',
      url: input.url.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      secret: this.encrypt({ username: input.username.trim(), password })
    }
    this.entries = existing ? this.entries.map((e) => (e.id === entry.id ? entry : e)) : [...this.entries, entry]
    this.persist()
    return this.view(entry)
  }

  delete(id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id)
    this.persist()
  }

  secret(id: string): Secret | null {
    const e = this.entries.find((x) => x.id === id)
    return e ? this.decrypt(e) : null
  }

  /** Logins for the site of `url`, for autofill. */
  forUrl(url: string): VaultEntry[] {
    const site = siteOf(url)
    if (!site) return []
    return this.entries.filter((e) => e.kind === 'login' && siteOf(e.url) === site).map((e) => this.view(e))
  }

  private apiEntry(service: string): StoredEntry | undefined {
    return this.entries.find((x) => x.kind === 'api' && x.url.toLowerCase().includes(service))
  }

  /** API credentials whose URL mentions `service` (e.g. "piste"): client id and secret. */
  api(service: string): Secret | null {
    const e = this.apiEntry(service)
    return e ? this.decrypt(e) : null
  }

  /** Whether API credentials for `service` are stored (without decrypting them). */
  hasApi(service: string): boolean {
    return !!this.apiEntry(service)
  }

  /** Whether a login for the site of `url` is stored (without decrypting it). */
  hasLogin(url: string): boolean {
    const site = siteOf(url)
    return !!site && this.entries.some((e) => e.kind === 'login' && siteOf(e.url) === site)
  }

  /** Every entry in clear, for a passphrase-encrypted backup only. */
  exportPlain(): Array<Omit<StoredEntry, 'secret'> & Secret> {
    return this.entries.flatMap((e) => {
      try {
        const { secret: _secret, ...rest } = e
        return [{ ...rest, ...this.decrypt(e) }]
      } catch {
        return []
      }
    })
  }

  /** Restore entries from a backup, encrypted again with this computer's keystore. */
  importPlain(entries: Array<Omit<StoredEntry, 'secret'> & Secret>): void {
    this.entries = entries.map(({ username, password, ...rest }) => ({ ...rest, secret: this.encrypt({ username, password }) }))
    this.persist()
  }

  private persist(): void {
    const tmp = paths.vault + '.tmp'
    writeFileSync(tmp, JSON.stringify({ version: 1, entries: this.entries }, null, 2), { mode: 0o600 })
    renameSync(tmp, paths.vault)
    this.emit('change')
  }
}

export const vault = new Vault()
