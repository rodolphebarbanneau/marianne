import { describe, expect, it } from 'vitest'
import { hostOf, isSharedHost, siteOf } from '../src/shared/hosts'

/** Sites by the Public Suffix List: what the keychain, the consents and a planned task's sites group by. */

describe('the site of an address', () => {
  it('is its registrable domain, whichever subdomain', () => {
    expect(siteOf('https://cfspart.impots.gouv.fr/LoginAccess')).toBe('impots.gouv.fr')
    expect(siteOf('https://www.impots.gouv.fr/')).toBe('impots.gouv.fr')
    expect(siteOf('https://assure.ameli.fr/')).toBe('ameli.fr')
    expect(siteOf('www.ameli.fr')).toBe('ameli.fr')
    expect(siteOf('https://www.bbc.co.uk/')).toBe('bbc.co.uk')
  })

  it('is one owner’s under a public suffix or a hosting service', () => {
    expect(siteOf('https://x.asso.fr/')).toBe('x.asso.fr')
    expect(siteOf('https://evil.asso.fr/')).not.toBe(siteOf('https://x.asso.fr/'))
    expect(siteOf('https://www.mairie.github.io/')).toBe('mairie.github.io')
    expect(siteOf('https://evil.github.io/')).not.toBe(siteOf('https://mairie.github.io/'))
    // Hosts the list leaves out: one more label is the site.
    expect(siteOf('https://mapage.free.fr/a')).toBe('mapage.free.fr')
    expect(siteOf('https://a.b.free.fr/')).toBe('b.free.fr')
    expect(siteOf('https://www.free.fr/')).toBe('free.fr')
    expect(siteOf('https://free.fr/')).toBe('free.fr')
  })

  it('is the host itself for an address, localhost or a suffix, and nothing for what is not a URL', () => {
    expect(siteOf('http://127.0.0.1:8080/')).toBe('127.0.0.1')
    expect(siteOf('http://localhost:3000/')).toBe('localhost')
    expect(siteOf('https://github.io/')).toBe('github.io')
    expect(siteOf('not a url')).toBe('')
    expect(siteOf('')).toBe('')
    expect(hostOf('HTTPS://WWW.Ameli.FR/x')).toBe('www.ameli.fr')
  })
})

describe('a shared host', () => {
  it('is a public suffix, a hosting service, or one the list leaves out, « www. » or not', () => {
    for (const host of ['gouv.fr', 'asso.fr', 'github.io', 'www.github.io', 'pages.dev', 'blogspot.com', 'free.fr', 'ovh.net', 'wordpress.com', 'fr'])
      expect(isSharedHost(host), host).toBe(true)
  })

  it('is never one site', () => {
    for (const host of ['www.impots.gouv.fr', 'impots.gouv.fr', 'x.asso.fr', 'mairie.github.io', 'mapage.free.fr', 'www.ameli.fr'])
      expect(isSharedHost(host), host).toBe(false)
  })
})
