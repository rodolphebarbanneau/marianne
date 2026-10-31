import { describe, expect, it } from 'vitest'
import { addressUrl } from '../../src/shared/address'
import { webHost } from '../../src/renderer/src/lib/address'

describe('the browser bar', () => {
  it('opens an address as it is, and a site’s name on https', () => {
    expect(addressUrl('https://www.impots.gouv.fr/accueil')).toBe('https://www.impots.gouv.fr/accueil')
    expect(addressUrl('  ants.gouv.fr/vos-demarches ')).toBe('https://ants.gouv.fr/vos-demarches')
  })

  it('searches service-public.gouv.fr for anything else, as its placeholder says', () => {
    expect(addressUrl('carte grise')).toBe('https://www.service-public.gouv.fr/particuliers/recherche?keyword=carte%20grise')
  })

  it('opens nothing for nothing typed', () => {
    expect(addressUrl('   ')).toBeNull()
  })
})

describe('an image’s host', () => {
  it('is the host of a web address, and nothing for an address that doesn’t parse', () => {
    expect(webHost('https://images.example.fr/a.png')).toBe('images.example.fr')
    expect(webHost('http://')).toBe('')
    expect(webHost('data:image/png;base64,AAAA')).toBe('')
    expect(webHost(undefined)).toBe('')
  })
})
