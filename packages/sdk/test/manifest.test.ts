import { describe, expect, it } from 'vitest'
import { allowedUrl, departmentOf, foldText, ManifestError, readManifest, serviceCode, serviceMatches, sortServices, type ServiceManifest } from '../src/index'

const pkg = (marianne: Record<string, unknown>, name = '@marianne/service-meteo') => ({
  name,
  version: '1.0.0',
  author: { name: 'Marianne' },
  marianne: { code: 'meteo', name: 'Météo', description: 'le temps', category: 'daily', hosts: ['api.open-meteo.com'], ...marianne }
})

describe('readManifest', () => {
  it('reads a service package', () => {
    const m = readManifest(pkg({ keywords: ['pluie'], connections: ['geo'] }))
    expect(m).toMatchObject({
      id: 'meteo',
      package: '@marianne/service-meteo',
      version: '1.0.0',
      author: 'Marianne',
      keywords: ['pluie'],
      connections: ['geo'],
      links: []
    })
    expect(serviceCode(m)).toBe('METEO')
  })

  it('refuses codes with accents or capitals, and names that disagree with the code', () => {
    expect(() => readManifest(pkg({ code: 'météo' }, '@marianne/service-météo'))).toThrow(ManifestError)
    expect(() => readManifest(pkg({ code: 'Meteo' }, '@marianne/service-Meteo'))).toThrow(/lowercase/)
    expect(() => readManifest(pkg({}, '@marianne/service-weather'))).toThrow(/@marianne\/service-meteo/)
  })

  it('checks the category, the hosts and the links', () => {
    expect(() => readManifest(pkg({ category: 'weather' }))).toThrow(/category/)
    expect(() => readManifest(pkg({ hosts: ['https://api.open-meteo.com'] }))).toThrow(/hosts/)
    expect(() => readManifest(pkg({ links: ['http://example.fr/'] }))).toThrow(/https/)
    expect(() => readManifest({ name: '@marianne/service-x', version: '1' })).toThrow(/marianne/)
  })

  it('reads the domains and the profile fields asked for, with what they are for', () => {
    const m = readManifest(pkg({ domains: ['mobility'], permissions: { profile: ['vehicles.plate'], purpose: 'retrouver vos passages' } }))
    expect(m.domains).toEqual(['mobility'])
    expect(m.permissions).toEqual({ profile: ['vehicles.plate'], purpose: 'retrouver vos passages' })
    expect(readManifest(pkg({})).permissions).toEqual({ profile: [], purpose: '' })
  })

  it('refuses unknown domains and profile fields, and fields without a purpose', () => {
    expect(() => readManifest(pkg({ domains: ['transport'] }))).toThrow(/domain/)
    expect(() => readManifest(pkg({ permissions: { profile: ['person.nir'], purpose: 'x' } }))).toThrow(/profile field/)
    expect(() => readManifest(pkg({ permissions: { profile: ['vehicles.plate'], purpose: ' ' } }))).toThrow(/purpose/)
  })
})

describe('departmentOf', () => {
  it('reads the département of an INSEE code, overseas and Corsica included', () => {
    expect(['33063', '2A004', '97411', '01001'].map(departmentOf)).toEqual(['33', '2A', '974', '01'])
  })
})

describe('allowedUrl', () => {
  const m = { hosts: ['api.open-meteo.com'] }
  it('allows https to a declared host only', () => {
    expect(allowedUrl(m, 'https://api.open-meteo.com/v1/forecast?x=1')).toBe(true)
    expect(allowedUrl(m, 'http://api.open-meteo.com/v1')).toBe(false)
    expect(allowedUrl(m, 'https://evil.open-meteo.com/')).toBe(false)
    expect(allowedUrl(m, 'https://api.open-meteo.com.evil.fr/')).toBe(false)
    expect(allowedUrl(m, 'not a url')).toBe(false)
  })
})

describe('search and order', () => {
  const manifest = (id: string, name: string, category: ServiceManifest['category'], keywords: string[] = []): ServiceManifest => ({
    id,
    package: `@marianne/service-${id}`,
    version: '1.0.0',
    author: '',
    name,
    description: '',
    category,
    keywords,
    connections: [],
    hosts: [],
    links: [],
    domains: [],
    permissions: { profile: [], purpose: '' }
  })
  const meteo = manifest('meteo', 'Météo', 'daily', ['pluie'])
  const carte = manifest('carte', 'Carte de France', 'territory')
  const annuaire = manifest('annuaire', 'Annuaire', 'administration')

  it('finds a service by code, name or keyword, accents and case aside', () => {
    expect(foldText('Météo')).toBe('meteo')
    expect(serviceMatches(meteo, 'MÉTÉO')).toBe(true)
    expect(serviceMatches(meteo, 'pluie')).toBe(true)
    expect(serviceMatches(meteo, 'carte')).toBe(false)
    expect(serviceMatches(meteo, '  ')).toBe(true)
  })

  it('puts starred services first, then follows the categories', () => {
    const list = [
      { manifest: carte, starred: false },
      { manifest: meteo, starred: false },
      { manifest: annuaire, starred: true }
    ]
    expect(sortServices(list).map((s) => s.manifest.id)).toEqual(['annuaire', 'meteo', 'carte'])
  })
})
