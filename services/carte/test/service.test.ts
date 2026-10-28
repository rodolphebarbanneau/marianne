import { ToolError, type ServiceTool } from '@marianne/sdk/main'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { service } from '../src/main'
import { sumDepartments, Territory, toCommuneFigures, toCommuneProfile } from '../src/territory'
import type { CommuneFigures, DepartmentFigures, MapView } from '../src/types'
import { fakeContext } from './context'
import { ALL_COMMUNES, BORDEAUX, BORDEAUX_SAINT_CLAIR, DEPARTMENTS, GIRONDE_COMMUNES } from './fixtures'

/** geo.api.gouv.fr as the tests have it. */
function geoApi(url: URL): unknown {
  const p = Object.fromEntries(url.searchParams)
  switch (url.pathname) {
    case '/communes':
      if (p.nom)
        return [BORDEAUX, BORDEAUX_SAINT_CLAIR].filter(
          (c) => c.nom.toLowerCase().startsWith(p.nom.toLowerCase()) && (!p.codeDepartement || c.codeDepartement === p.codeDepartement)
        )
      if (p.codePostal)
        return GIRONDE_COMMUNES.filter((c) => c.codesPostaux?.includes(p.codePostal)).map((c) => ({
          ...c,
          departement: BORDEAUX.departement,
          region: BORDEAUX.region
        }))
      if (p.code) return p.code === BORDEAUX.code ? [BORDEAUX] : []
      return ALL_COMMUNES
    case '/departements':
      return DEPARTMENTS
    case '/departements/33':
      return DEPARTMENTS[1]
    case '/departements/33/communes':
      return p.format === 'geojson'
        ? {
            type: 'FeatureCollection',
            features: GIRONDE_COMMUNES.map((c, i) => ({
              properties: { nom: c.nom, code: c.code, centre: c.centre },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [-1 + i * 0.3, 44.5],
                    [-0.8 + i * 0.3, 44.5],
                    [-0.8 + i * 0.3, 44.9],
                    [-1 + i * 0.3, 44.9],
                    [-1 + i * 0.3, 44.5]
                  ]
                ]
              }
            }))
          }
        : GIRONDE_COMMUNES
    default:
      throw new Error(`HTTP 404 de geo.api.gouv.fr (${url.pathname})`)
  }
}

const setup = (answer: (url: URL) => unknown = geoApi) => {
  const { ctx, urls } = fakeContext(answer)
  const runtime = service.activate(ctx)
  const tool = runtime.tools?.find((t) => t.name === 'figures') as ServiceTool
  // As Marianne's MCP server does: the arguments are parsed with the tool's input first.
  const run = (args: unknown) => tool.run(z.object(tool.input).parse(args), {})
  return { runtime, run, urls }
}

describe('figures', () => {
  it('projects a commune: km² from hectares, inhabitants per km²', () => {
    expect(toCommuneFigures(BORDEAUX)).toEqual({
      code: '33063',
      name: 'Bordeaux',
      department: '33',
      postalCodes: ['33000', '33100', '33200', '33300', '33800'],
      population: 267991,
      area: 49.77,
      density: 5384.6,
      longitude: -0.5848,
      latitude: 44.8624
    })
    expect(toCommuneProfile(BORDEAUX)).toMatchObject({ departmentName: 'Gironde', region: 'Nouvelle-Aquitaine' })
    expect(toCommuneFigures({ nom: 'Vide', code: '55039' })).toMatchObject({ population: 0, area: 0, density: 0, postalCodes: [], department: '' })
  })

  it('sums each département from its communes', () => {
    expect(sumDepartments(ALL_COMMUNES, [...DEPARTMENTS, { nom: 'Mayotte', code: '976' }])).toEqual([
      { code: '01', name: 'Ain', region: 'Auvergne-Rhône-Alpes', population: 1000, area: 20, density: 50, communes: 2 },
      { code: '33', name: 'Gironde', region: 'Nouvelle-Aquitaine', population: 346176, area: 96.2, density: 3598.5, communes: 3 },
      { code: '976', name: 'Mayotte', region: '', population: 0, area: 0, density: 0, communes: 0 }
    ])
  })

  it('computes the national figures once, and again after a failure', async () => {
    let fail = true
    const { ctx, urls } = fakeContext((url) => {
      if (fail && url.pathname === '/communes') throw new Error('HTTP 503 de geo.api.gouv.fr')
      return geoApi(url)
    })
    const territory = new Territory(ctx.http)
    await expect(territory.departmentFigures()).rejects.toThrow('503')
    fail = false
    const [first, second] = await Promise.all([territory.departmentFigures(), territory.departmentFigures()])
    expect(second).toBe(first)
    expect(await territory.departmentFigures()).toBe(first)
    expect(urls.filter((u) => u.pathname === '/communes')).toHaveLength(2)
    expect(urls.find((u) => u.pathname === '/departements')?.searchParams.get('fields')).toBe('nom,code,region')
  })

  it('finds communes by postal code, most populated first, else by INSEE code', async () => {
    const { ctx, urls } = fakeContext(geoApi)
    const territory = new Territory(ctx.http)
    expect((await territory.findCommunes('33000')).map((c) => c.code)).toEqual(['33063'])
    expect((await territory.findCommunes('33063')).map((c) => c.code)).toEqual(['33063'])
    expect(urls.map((u) => [...u.searchParams.keys()].filter((k) => ['codePostal', 'code', 'nom'].includes(k)))).toEqual([
      ['codePostal'],
      ['codePostal'],
      ['code']
    ])
    await territory.findCommunes('bordeaux', '33')
    expect(urls.at(-1)?.searchParams.get('codeDepartement')).toBe('33')
  })
})

describe('carte_figures', () => {
  it('gives a commune, and the other communes of that name', async () => {
    const text = await setup().run({ commune: 'Bordeaux' })
    expect(text).toBe(
      [
        '## Bordeaux (INSEE 33063)',
        'Gironde (33) · Nouvelle-Aquitaine · postal codes 33000, 33100, 33200, 33300, 33800',
        '',
        '| population | area km² | inhabitants per km² |',
        '| --- | --- | --- |',
        '| 267,991 | 49.77 | 5,384.6 |',
        '',
        'Other communes matching: Bordeaux-Saint-Clair (INSEE 76117, Seine-Maritime); ask again with the INSEE code for one of them.',
        '',
        'Source: Insee (legal populations) and IGN (areas), via the Découpage administratif API: https://geo.api.gouv.fr/decoupage-administratif'
      ].join('\n')
    )
  })

  it('looks for a commune in the département given', async () => {
    const { run, urls } = setup()
    const text = await run({ commune: 'Bordeaux', department: 'gironde' })
    expect(urls[0].searchParams.get('codeDepartement')).toBe('33')
    expect(text).not.toContain('Other communes')
  })

  it('gives a département by name: its figures and its most populated communes', async () => {
    const text = await setup().run({ department: 'Gironde' })
    expect(text).toContain('## Gironde (33), Nouvelle-Aquitaine')
    expect(text).toContain('| population | area km² | inhabitants per km² | communes |\n| --- | --- | --- | --- |\n| 346,176 | 96 | 3,598.5 | 3 |')
    expect(text).toContain(
      '| Bordeaux | 33063 | 267,991 | 49.77 | 5,384.6 |\n| Pessac | 33318 | 66,760 | 38.83 | 1,719.3 |\n| Arcachon | 33009 | 11,425 | 7.6 | 1,503.3 |'
    )
  })

  it('gives France and every département with neither', async () => {
    const text = await setup().run({})
    expect(text).toContain('## France: 2 départements')
    expect(text).toContain('| 347,176 | 116 | 2,987.7 | 5 |')
    expect(text).toContain('| Ain | 01 | Auvergne-Rhône-Alpes | 1,000 | 20 | 50 | 2 |\n| Gironde | 33 | Nouvelle-Aquitaine | 346,176 | 96 | 3,598.5 | 3 |')
  })

  it('tells the model what it could not find', async () => {
    const { run } = setup()
    await expect(run({ department: 'Corse' })).rejects.toThrow(
      '"Corse" matches several départements: Corse-du-Sud (2A), Haute-Corse (2B). Give one of these codes.'
    )
    await expect(run({ department: 'Atlantide' })).rejects.toBeInstanceOf(ToolError)
    await expect(run({ commune: 'Ys', department: '33' })).rejects.toThrow('No commune matches "Ys" in Gironde (33)')
  })
})

describe('methods', () => {
  it('draws France without the network, and a département from its communes', async () => {
    const { runtime, urls } = setup()
    const france = (await runtime.methods.france()) as MapView
    expect(france.shapes).toHaveLength(101)
    expect(urls).toHaveLength(0)
    const gironde = (await runtime.methods.department('33')) as MapView
    expect(gironde.shapes.map((s) => s.code)).toEqual(['33318', '33063', '33009'])
    expect(Object.fromEntries(urls[0].searchParams)).toEqual({ fields: 'nom,code,centre', format: 'geojson', geometry: 'contour' })
  })

  it('gives the figures of the départements and of the communes', async () => {
    const { runtime } = setup()
    expect(((await runtime.methods.departmentFigures()) as DepartmentFigures[]).map((d) => d.code)).toEqual(['01', '33'])
    expect(((await runtime.methods.communeFigures(' 33 ')) as CommuneFigures[]).map((c) => c.area)).toEqual([38.83, 49.77, 7.6])
  })

  it('refuses an unknown département, in French', async () => {
    const { runtime, urls } = setup()
    await expect(async () => runtime.methods.department('99')).rejects.toThrow('Département inconnu : 99')
    await expect(async () => runtime.methods.communeFigures('20')).rejects.toThrow('Département inconnu : 20')
    expect(urls).toHaveLength(0)
  })
})
