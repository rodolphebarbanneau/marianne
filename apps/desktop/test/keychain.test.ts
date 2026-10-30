import type { Archive } from '@marianne/archive'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { keychain, loginFits, siteOf } from '../src/main/keychain'
import { session } from '../src/main/session'

/** Where a saved login may fill a form: its own host and what is under it, never its neighbours on a shared domain. */

function memoryArchive(): Archive {
  const records = new Map<string, Map<string, unknown>>()
  const of = (kind: string) => records.get(kind) ?? records.set(kind, new Map()).get(kind)!
  return {
    get: (kind: string, id: string) => structuredClone(of(kind).get(id) ?? null),
    put: (kind: string, id: string, value: unknown) => void of(kind).set(id, structuredClone(value)),
    remove: (kind: string, id: string) => void of(kind).delete(id),
    list: (kind: string) => [...of(kind).values()].map((v) => structuredClone(v)),
    close: () => undefined
  } as unknown as Archive
}

beforeEach(() => session.open(memoryArchive()))
afterEach(() => session.lock())

describe('a saved login', () => {
  it('fills on its site’s sign-in beside the home page, « www.x » standing for x', () => {
    expect(loginFits('https://www.impots.gouv.fr', 'https://cfspart.impots.gouv.fr/LoginAccess')).toBe(true)
    expect(loginFits('https://www.impots.gouv.fr', 'https://www.impots.gouv.fr/accueil')).toBe(true)
    expect(loginFits('www.ameli.fr', 'https://assure.ameli.fr/')).toBe(true)
    expect(loginFits('https://mdphenligne.cnsa.fr', 'https://mdphenligne.cnsa.fr/connexion')).toBe(true)
  })

  it('never on another owner of a shared domain, nor a host that only ends the same', () => {
    expect(loginFits('https://x.asso.fr', 'https://evil.asso.fr/')).toBe(false)
    expect(loginFits('https://mairie.github.io', 'https://evil.github.io/')).toBe(false)
    expect(loginFits('https://mdphenligne.cnsa.fr', 'https://www.cnsa.fr/')).toBe(false)
    expect(loginFits('https://www.ameli.fr', 'https://evilameli.fr/')).toBe(false)
    expect(loginFits('https://www.ameli.fr', 'https://ameli.fr.evil.example/')).toBe(false)
    expect(loginFits('', 'https://www.ameli.fr/')).toBe(false)
    expect(loginFits('https://www.ameli.fr', 'not a url')).toBe(false)
  })

  it('is offered where it fits, and its password masked on its whole site', () => {
    keychain.save({ kind: 'login', label: 'Mon asso', url: 'https://x.asso.fr', username: 'camille', password: 'secret-1' })
    expect(siteOf('https://evil.asso.fr/')).toBe(siteOf('https://x.asso.fr/'))
    expect(keychain.forUrl('https://evil.asso.fr/login').map((e) => e.label)).toEqual([])
    expect(keychain.hasLogin('https://evil.asso.fr/')).toBe(false)
    expect(keychain.forUrl('https://x.asso.fr/login').map((e) => e.label)).toEqual(['Mon asso'])
    expect(keychain.ofSite('https://evil.asso.fr/').map((e) => e.label)).toEqual(['Mon asso'])
  })
})
