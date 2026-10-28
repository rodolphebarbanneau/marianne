import { ToolError, type ServiceTool } from '@marianne/sdk/main'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { service } from '../src/main'
import type { NearbyOffices, OfficeKind, OfficeResults } from '../src/types'
import { fakeContext, whereOf } from './context'
import { BORDEAUX, CAF_BELCIER, LORMONT, MAIRIE_BORDEAUX } from './fixtures'

const page = (results: unknown[], total = results.length) => ({ total_count: total, results })

/** The directory as the tests have it: the Caf of Bordeaux, its mairie, nothing else. */
function directory(url: URL) {
  const where = whereOf(url)
  if (where.includes('"caf"')) return page([CAF_BELCIER], where.includes('33063') ? 3 : 120)
  if (where.includes('"mairie"') && where.includes('33063')) return page([MAIRIE_BORDEAUX])
  return page([])
}

const setup = (answer: (url: URL) => unknown = directory) => {
  const { ctx, urls } = fakeContext(answer, [BORDEAUX, LORMONT])
  const runtime = service.activate(ctx)
  const tool = runtime.tools?.find((t) => t.name === 'find_office') as ServiceTool
  // As Marianne's MCP server does: the arguments are parsed with the tool's input first.
  const run = (args: unknown) => tool.run(z.object(tool.input).parse(args), {})
  return { runtime, tool, run, urls }
}

describe('annuaire_find_office', () => {
  it('takes a kind, a commune, words of the name and a limit', () => {
    const { tool } = setup()
    expect(Object.keys(tool.input)).toEqual(['kind', 'commune', 'text', 'limit'])
    expect(tool.description).toContain('ccas (Centre communal d’action sociale (CCAS))')
  })

  it('gives the offices with their contact details, hours and page', async () => {
    const { run, urls } = setup()
    const text = await run({ kind: 'caf', commune: 'Bordeaux' })
    expect(urls[0].searchParams.get('limit')).toBe('5')
    expect(text).toBe(
      [
        '3 offices in or for Bordeaux (33063), the first 1 shown:',
        '',
        "### Caisse d'allocations familiales (Caf) de Gironde - accueil de Bordeaux - Belcier",
        'caf (Caisse d’allocations familiales (Caf)) · 5.2 km away',
        "- Address: Résidence les Traversants, 60 rue d'Armagnac, 33800 Bordeaux",
        "- Postal address: Caisse d'allocations familiales de Gironde, Rue du Docteur-Gabriel-Péry, 33078 Bordeaux Cedex",
        '- Phone: 32 30 (Du lundi au vendredi de 9h à 16h. Service gratuit + prix d’un appel); 0 969 32 52 52 (Pour les étudiants. Du lundi au vendredi de 9h à 19h30. Service gratuit + prix d’un appel)',
        '- Hours: Mon–Fri 08:30–12:00 (Accueil ouvert uniquement sur rendez-vous.)',
        '- Website: https://www.caf.fr',
        '- Contact form: https://www.caf.fr/allocataires/ma-caf-recherche',
        '- Official page: https://lannuaire.service-public.gouv.fr/nouvelle-aquitaine/gironde/e913dcc2-e004-4ab9-8a59-9017a337ce7d',
        '',
        'Source: Annuaire de l’administration (DILA), https://lannuaire.service-public.gouv.fr'
      ].join('\n')
    )
  })

  it('searches all of France without a commune', async () => {
    const text = await setup().run({ kind: 'caf', limit: 1 })
    expect(text).toMatch(/^120 offices in all of France, the first 1 shown:/)
  })

  it('tells the model what is missing or not found', async () => {
    const { run } = setup()
    await expect(run({})).rejects.toThrow('Give at least a kind of office, a commune or words of the name.')
    await expect(run({ commune: 'Atlantis' })).rejects.toBeInstanceOf(ToolError)
    await expect(run({ kind: 'ccas', commune: 'Lormont' })).rejects.toThrow(/^No office found of kind "ccas" for Lormont \(33249\)\. Some offices/)
  })
})

describe('methods', () => {
  it('lists the kinds of offices', async () => {
    const kinds = (await setup().runtime.methods.kinds()) as OfficeKind[]
    expect(kinds.find((k) => k.id === 'maison_handicapees')).toEqual({
      id: 'maison_handicapees',
      label: 'Maison départementale des personnes handicapées (MDPH)',
      short: 'MDPH'
    })
  })

  it('searches by INSEE code or commune, in French when it cannot', async () => {
    const { runtime } = setup()
    const results = (await runtime.methods.search({ kind: 'caf', insee: '33063' })) as OfficeResults
    expect(results).toMatchObject({ place: 'Bordeaux (33063)', scope: 'commune', total: 3 })
    await expect(async () => runtime.methods.search({})).rejects.toThrow('Indiquez un type de service, une commune ou une recherche.')
    await expect(async () => runtime.methods.search({ insee: ' ', commune: 'Ys' })).rejects.toThrow('Commune introuvable : « Ys ».')
  })

  it('gives the usual offices near a commune', async () => {
    const { runtime } = setup()
    const near = (await runtime.methods.near('33063')) as NearbyOffices[]
    expect(near.filter((g) => g.offices.length).map((g) => g.kind)).toEqual(['mairie', 'caf'])
    await expect(async () => runtime.methods.near('99999')).rejects.toThrow('Commune introuvable : 99999')
  })
})
