import { readManifest } from '@marianne/sdk'
import { checkTile, fakeContext } from '@marianne/sdk/testing'
import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { service } from '../src/main'
import { toCommuneProfile } from '../src/territory'
import { communeTile, franceTile, rankOf, shortPopulation } from '../src/tile'
import { ALL_COMMUNES, BORDEAUX, DEPARTMENTS, GIRONDE_COMMUNES } from './fixtures'

const HOME = { code: BORDEAUX.code, name: BORDEAUX.nom, postcode: '33000' }

/** geo.api.gouv.fr as the tile asks it: a commune by code, a département's communes, France's. */
function geoApi(url: URL): unknown {
  const code = url.searchParams.get('code')
  if (url.pathname === '/communes') return code ? (code === BORDEAUX.code ? [BORDEAUX] : []) : ALL_COMMUNES
  if (url.pathname === '/departements') return DEPARTMENTS
  if (url.pathname === '/departements/33/communes') return GIRONDE_COMMUNES
  throw new Error(`HTTP 404 de geo.api.gouv.fr (${url.pathname})`)
}

const setup = (answer: (url: URL) => unknown = geoApi, home: typeof HOME | null = HOME) => {
  const { ctx, urls } = fakeContext(pkg, { answer, home })
  return { tile: service.activate(ctx).tile!, urls }
}

describe('what the tile says of a territory', () => {
  it('writes a population in six characters at most, exact while it fits', () => {
    const shown = [0, 9850, 99_999, 100_000, 223_400, 999_499, 999_500, 1_100_000, 2_133_111, 68_373_433].map(shortPopulation)
    expect(shown).toEqual(['0', '9 850', '99 999', '100 k', '223 k', '999 k', '1 M', '1,1 M', '2,1 M', '68,4 M'])
    for (const text of shown) expect([...text].length).toBeLessThanOrEqual(6)
  })

  it('ranks a commune by population in its département, ties sharing a rank', () => {
    expect(
      rankOf(
        '33063',
        GIRONDE_COMMUNES.map((c) => ({ code: c.code, population: c.population ?? 0 }))
      )
    ).toEqual({ rank: 1, of: 3 })
    const tied = [
      { code: 'a', population: 10 },
      { code: 'b', population: 5 },
      { code: 'c', population: 5 }
    ]
    expect(['a', 'b', 'c', 'x'].map((code) => rankOf(code, tied))).toEqual([{ rank: 1, of: 3 }, { rank: 2, of: 3 }, { rank: 2, of: 3 }, null])
  })
})

describe('the tile', () => {
  it('shows the user’s commune: population, density and area, département and rank', () => {
    expect(checkTile(communeTile(toCommuneProfile(BORDEAUX), { rank: 1, of: 535 }))).toEqual({
      value: { text: '268 k', unit: 'habitants · Bordeaux' },
      lines: [{ text: 'densité 5 385 hab./km² · 49,77 km²' }, { text: 'Gironde (33) · 1re de ses 535 communes', tone: 'dim' }]
    })
    const village = { ...toCommuneProfile(BORDEAUX), name: 'Saint-Rémy-en-Bouzemont-Saint-Genest-et-Isson', population: 1, density: 0.1, area: 12.5 }
    expect(checkTile(communeTile(village, { rank: 12, of: 535 }))).toEqual({
      value: { text: '1', unit: 'habitant · Saint-Rémy-en-Bouzemont-Sain…' },
      lines: [{ text: 'densité 0,1 hab./km² · 12,5 km²' }, { text: 'Gironde (33) · 12e de ses 535 communes', tone: 'dim' }]
    })
    // Paris is a département of one commune: no rank.
    const paris = {
      ...toCommuneProfile(BORDEAUX),
      name: 'Paris',
      department: '75',
      departmentName: 'Paris',
      population: 2_113_705,
      density: 20_046,
      area: 105.4
    }
    expect(checkTile(communeTile(paris, { rank: 1, of: 1 }))?.lines?.[1]).toEqual({ text: 'Paris (75)', tone: 'dim' })
  })

  it('shows France’s figures without an address, and says where to give it', () => {
    expect(checkTile(franceTile([{ code: '00', name: 'France', region: '', population: 68_373_433, area: 632_734, density: 0, communes: 34_875 }]))).toEqual({
      value: { text: '68,4 M', unit: 'habitants · France' },
      lines: [{ text: 'densité 108 hab./km² · 34 875 communes' }, { text: 'votre commune ? votre adresse dans Réglages › Identité', tone: 'dim' }]
    })
    expect(franceTile([])).toBeNull()
  })

  it('is the user’s commune’s, its rank from the screen’s request for the département', async () => {
    const { tile, urls } = setup()
    expect(checkTile(await tile())).toEqual({
      value: { text: '268 k', unit: 'habitants · Bordeaux' },
      lines: [{ text: 'densité 5 385 hab./km² · 49,77 km²' }, { text: 'Gironde (33) · 1re de ses 3 communes', tone: 'dim' }]
    })
    expect(urls.map((u) => u.pathname)).toEqual(['/communes', '/departements/33/communes'])
    expect(urls[0].searchParams.get('code')).toBe('33063')
  })

  it('leaves the rank out when the département can’t be had, and fails when the commune can’t', async () => {
    const noDepartment = setup((url) => (url.pathname.startsWith('/departements/') ? Promise.reject(new Error('HTTP 503')) : geoApi(url)))
    expect(checkTile(await noDepartment.tile())?.lines?.[1]).toEqual({ text: 'Gironde (33)', tone: 'dim' })
    const offline = setup(() => {
      throw new Error('HTTP 503')
    })
    // Marianne keeps the last tile.
    await expect(offline.tile()).rejects.toThrow('HTTP 503')
  })

  it('is France’s without an address, and the default tile for a commune the API doesn’t know', async () => {
    const france = checkTile(await setup(geoApi, null).tile())
    expect(france?.value).toEqual({ text: '347 k', unit: 'habitants · France' })
    expect(france?.lines?.[0]).toEqual({ text: 'densité 2 988 hab./km² · 5 communes' })
    expect(await setup(geoApi, { ...HOME, code: '99999' }).tile()).toBeNull()
  })

  it('is asked once a day', () => {
    expect(service.tile).toEqual({ everyMinutes: 1440 })
  })
})

describe('the manifest', () => {
  it('has its icon and declares the tools its main side lends', () => {
    const manifest = readManifest(pkg)
    expect(manifest.icon).toEqual(pkg.marianne.icon)
    const { ctx } = fakeContext(pkg)
    expect(manifest.tools).toEqual(service.activate(ctx).tools?.map((t) => ({ name: t.name, label: t.label })))
  })
})
