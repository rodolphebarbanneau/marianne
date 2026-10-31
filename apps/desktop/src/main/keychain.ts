import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { hostOf, siteOf } from '../shared/hosts'
import type { KeychainEntry, KeychainInput } from '../shared/types'
import { session } from './session'

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
 * Whether a login saved for `saved` may fill a form on `url`: on its own host or under it, « www.x »
 * standing for x, as its sign-in often lives beside the home page (www.impots.gouv.fr →
 * cfspart.impots.gouv.fr). Never on the rest of its registrable domain, which others may own:
 * x.asso.fr's login doesn't fill on evil.asso.fr, nor one github.io site's on another's.
 */
export function loginFits(saved: string, url: string): boolean {
  const own = hostOf(saved).replace(/^www\./, '')
  const host = hostOf(url)
  return !!own && !!host && (host === own || host.endsWith(`.${own}`))
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

  /** Logins that may fill a form on `url`, for autofill (loginFits). */
  forUrl(url: string): KeychainEntry[] {
    return this.all()
      .filter((e) => e.kind === 'login' && loginFits(e.url, url))
      .map(view)
  }

  /** Logins of the site of `url` as siteOf groups them: wider than where they fill, for masking their passwords on its pages. */
  ofSite(url: string): KeychainEntry[] {
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
