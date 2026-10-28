import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { KeychainEntry, KeychainInput } from '../shared/types'
import { session } from './archive/session'

/**
 * The keychain: logins for public-service websites and API credentials, inside the account's
 * archive like everything personal. Secrets are only read in the main process, to fill a login
 * form in the built-in browser or to call an API: never sent to an engine.
 */

const KIND = 'keychain'

interface StoredEntry extends KeychainEntry {
  password: string
  createdAt: string
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
  return host
    .split('.')
    .slice(host.endsWith('.gouv.fr') ? -3 : -2)
    .join('.')
}

const view = ({ password: _password, createdAt: _createdAt, ...entry }: StoredEntry): KeychainEntry => entry

class Keychain extends EventEmitter {
  private all(): StoredEntry[] {
    return session.archive.list<StoredEntry>(KIND)
  }

  list(): KeychainEntry[] {
    return this.all()
      .map(view)
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }

  save(input: KeychainInput): KeychainEntry {
    const at = new Date().toISOString()
    const existing = input.id ? session.archive.get<StoredEntry>(KIND, input.id) : null
    const entry: StoredEntry = {
      id: existing?.id ?? randomUUID(),
      kind: input.kind,
      label: input.label.trim() || siteOf(input.url) || 'sans nom',
      url: input.url.trim(),
      username: input.username.trim(),
      password: input.password ?? existing?.password ?? '',
      createdAt: existing?.createdAt ?? at,
      updatedAt: at
    }
    session.archive.put(KIND, entry.id, entry)
    this.emit('change')
    return view(entry)
  }

  remove(id: string): void {
    session.archive.remove(KIND, id)
    this.emit('change')
  }

  secret(id: string): { username: string; password: string } | null {
    const entry = session.archive.get<StoredEntry>(KIND, id)
    return entry ? { username: entry.username, password: entry.password } : null
  }

  /** Logins for the site of `url`, for autofill. */
  forUrl(url: string): KeychainEntry[] {
    const site = siteOf(url)
    return site
      ? this.all()
          .filter((e) => e.kind === 'login' && siteOf(e.url) === site)
          .map(view)
      : []
  }

  hasLogin(url: string): boolean {
    return this.forUrl(url).length > 0
  }

  /** API credentials whose URL mentions `service` (e.g. "piste"): client id and secret. */
  api(service: string): { username: string; password: string } | null {
    const entry = this.all().find((e) => e.kind === 'api' && e.url.toLowerCase().includes(service))
    return entry ? { username: entry.username, password: entry.password } : null
  }

  hasApi(service: string): boolean {
    return session.maybe ? this.api(service) !== null : false
  }
}

export const keychain = new Keychain()
