import { readManifest, type ServiceState } from '@marianne/sdk'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CatalogueEntry } from '../../src/shared/catalogue'
import { catalogueRows, recommended } from '../../src/renderer/src/pages/services/discover'
import { highlight, listings, nextSort, scoreOf, search, searchTerms, sortCatalogue, sortMine, trustRank } from '../../src/renderer/src/pages/services/model'
import { ServicesHead } from '../../src/renderer/src/pages/services/kiosk'
import { flatten } from '../../src/renderer/src/pages/services/search-view'

const state = (
  code: string,
  name: string,
  more: Partial<ServiceState> & { keywords?: string[]; description?: string; category?: string } = {}
): ServiceState => {
  const { keywords = [], description = name, category = 'daily', ...rest } = more
  return {
    manifest: readManifest({
      name: `@marianne/service-${code}`,
      version: '1.0.0',
      marianne: { code, name, description, category, keywords, hosts: [] }
    }),
    available: true,
    on: true,
    added: true,
    pinned: false,
    tools: [],
    builtIn: true,
    access: { asked: [], granted: null },
    ...rest
  }
}

const entry = (code: string, name: string, more: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  code,
  version: '1.0.0',
  name,
  description: name,
  category: 'health',
  keywords: [],
  author: 'Collectif',
  hosts: ['data.example.fr'],
  links: [],
  connections: [],
  reads: [],
  tools: [],
  sync: false,
  icon: null,
  status: 'validated',
  recommended: false,
  published: '2026-10-12',
  file: { url: `https://services.example.invalid/${code}.3615`, size: 1000, sha256: 'a'.repeat(64) },
  ...more
})

const services = [
  state('meteo', 'Météo', { pinned: true, keywords: ['pluie'], description: 'le temps de votre commune' }),
  state('parlement', 'Assemblée nationale et Sénat', { keywords: ['vote', 'député'], category: 'democracy' }),
  state('carte', 'Carte de France', { added: false, on: false })
]
const catalogue = [
  entry('pharmagarde', 'Pharmacies de garde', { recommended: true, keywords: ['pharmacie', 'nuit'] }),
  entry('boussole', 'Boussole électorale', { status: 'unvalidated', keywords: ['vote'], category: 'democracy', published: '2026-09-01' }),
  entry('eau', 'Qualité de l’eau', { published: '2026-10-20' }),
  // Listed by the catalogue, and already among the user's services: shown once, as the user's.
  entry('meteo', 'Météo de la communauté')
]
const all = listings(services, catalogue)
const byCode = (code: string) => all.find((l) => l.code === code)!

describe('what the Services page lists', () => {
  it('has the user’s services, the built-in ones not added, and the catalogue’s others', () => {
    expect(all.map((l) => l.code)).toEqual(['meteo', 'parlement', 'carte', 'pharmagarde', 'boussole', 'eau'])
    expect(byCode('meteo')).toMatchObject({ official: true, added: true, pinned: true })
    expect(byCode('carte')).toMatchObject({ official: true, added: false, recommended: true })
    expect(byCode('boussole')).toMatchObject({ official: false, trust: 'unvalidated', recommended: false })
  })

  it('ranks by trust: official, then validated, not validated, outside, withdrawn', () => {
    expect([{ official: true }, { official: false, trust: 'validated' as const }, { official: false, trust: 'outside' as const }].map(trustRank)).toEqual([
      0, 1, 3
    ])
  })

  it('recommends the official services not added, then the community’s validated ones it recommends', () => {
    expect(recommended(all).map((l) => l.code)).toEqual(['carte', 'pharmagarde'])
    // An unvalidated service is never recommended, whatever its entry says.
    expect(listings([], [entry('x', 'x', { status: 'unvalidated', recommended: true })])[0].recommended).toBe(false)
  })

  it('lists the rest of the catalogue validated first, filtered and sorted by a column', () => {
    expect(catalogueRows(all, 'all', { key: 'validation', dir: 1 }).map((l) => l.code)).toEqual(['eau', 'boussole'])
    expect(catalogueRows(all, 'unvalidated', { key: 'validation', dir: 1 }).map((l) => l.code)).toEqual(['boussole'])
    // « mis à jour »: the most recent first.
    expect(sortCatalogue(catalogueRows(all, 'all', { key: 'service', dir: 1 }), { key: 'updated', dir: 1 }).map((l) => l.code)).toEqual(['eau', 'boussole'])
  })

  it('sorts my services by a column, the same one again the other way', () => {
    const mine = all.filter((l) => l.added)
    expect(sortMine(mine, { key: 'service', dir: 1 }).map((l) => l.code)).toEqual(['meteo', 'parlement'])
    const sort = nextSort({ key: 'service', dir: 1 }, 'service')
    expect(sort).toEqual({ key: 'service', dir: -1 })
    expect(sortMine(mine, sort).map((l) => l.code)).toEqual(['parlement', 'meteo'])
    expect(nextSort(sort, 'theme')).toEqual({ key: 'theme', dir: 1 })
    expect(sortMine(mine, { key: 'pinned', dir: 1 })[0].code).toBe('meteo')
  })
})

describe('the 3615 bar', () => {
  it('scores the code first, then the name, a keyword, the description, the theme or the author', () => {
    const meteo = byCode('meteo')
    expect(scoreOf(meteo, ['meteo'])?.score).toBe(100)
    expect(scoreOf(meteo, ['met'])?.score).toBe(80)
    expect(scoreOf(meteo, ['pluie'])).toEqual({ score: 35, why: 'mot-clé « pluie »' })
    expect(scoreOf(meteo, ['commune'])).toEqual({ score: 20, why: null })
    expect(scoreOf(byCode('eau'), ['sante'])).toEqual({ score: 10, why: 'thème « Santé »' })
    expect(scoreOf(byCode('eau'), ['collectif'])).toEqual({ score: 10, why: 'auteur Collectif' })
    // Every word must be found somewhere.
    expect(scoreOf(meteo, ['meteo', 'vote'])).toBeNull()
  })

  it('finds in groups ranked by trust: pinned, installed, official to add, catalogue validated, not validated', () => {
    const groups = search(all, 'vote')
    expect(groups.map((g) => [g.id, g.rows.map((r) => r.listing.code)])).toEqual([
      ['installed', ['parlement']],
      ['unvalidated', ['boussole']]
    ])
    expect(groups[0].rows[0].why).toBe('mot-clé « vote »')
    expect(flatten(search(all, 'pharmacie')).map((l) => l.code)).toEqual(['pharmagarde'])
    expect(search(all, '   ')).toEqual([])
    expect(flatten(search(all, 'Carte')).map((l) => l.code)).toEqual(['carte'])
    expect(search(all, 'Carte')[0].id).toBe('official')
  })

  it('ignores accents and case, and lights the words where they are', () => {
    expect(searchTerms(' Météo  Pluie ')).toEqual(['meteo', 'pluie'])
    expect(highlight('Qualité de l’eau', ['qualite', 'eau'])).toEqual([
      { text: 'Qualité', mark: true },
      { text: ' de l’', mark: false },
      { text: 'eau', mark: true }
    ])
    expect(highlight('Météo', [])).toEqual([{ text: 'Météo', mark: false }])
  })
})

describe('the Minitel beside the bar', () => {
  it('lights an echo of its screen for each letter typed, the next one blinking', () => {
    const head = (query: string) =>
      renderToStaticMarkup(createElement(ServicesHead, { query, onQuery: () => undefined, onEnvoi: () => undefined, onKey: () => undefined }))
    const lit = (html: string) => html.match(/fill:var\(--jaune\)/g)?.length ?? 0
    // The yellow of 3615 on its screen, then two echoes more for two letters.
    expect(lit(head('ab')) - lit(head(''))).toBe(2)
    expect(head('ab').match(/class="blinkcell"/g)).toHaveLength(1)
  })
})

describe('« 3615 » typed before a code', () => {
  it('is the kiosk’s, not a word to find', () => {
    expect(searchTerms('3615 météo')).toEqual(['meteo'])
    expect(flatten(search(all, '3615 meteo')).map((l) => l.code)).toEqual(['meteo'])
    expect(searchTerms('3615')).toEqual([])
  })
})
