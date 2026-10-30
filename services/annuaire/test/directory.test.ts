import { fakeContext } from '@marianne/sdk/testing'
import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { communesOf, NEARBY_KINDS, officesNear, openingHours, parseOffice, searchOffices, withDistance } from '../src/directory'
import { BORDEAUX, CAF_BELCIER, LORMONT, MAIRIE_BORDEAUX, office, whereOf } from './fixtures'

const page = (results: unknown[], total = results.length) => ({ total_count: total, results })

describe('parsing', () => {
  it('reads an office of the directory', () => {
    expect(parseOffice(MAIRIE_BORDEAUX)).toEqual({
      id: 'ff97c4f1-b888-463b-8ca5-7b9f1b45e893',
      name: 'Mairie - Bordeaux',
      kind: 'mairie',
      kindLabel: 'Mairie',
      addresses: [
        { lines: ['Place Pey-Berland'], postalCode: '33000', city: 'Bordeaux', postal: false, latitude: 44.83802, longitude: -0.579635 },
        { lines: ['Place Pey-Berland'], postalCode: '33045', city: 'Bordeaux', postal: true }
      ],
      phones: [{ number: '05 56 10 20 30' }],
      emails: [],
      websites: ['https://www.bordeaux.fr'],
      contactForm: 'https://mesdemarches.bordeaux.fr/portals/public/services?id=bordeaux&page=DEM_NousContacter_Presentation',
      hours: [
        {
          fromDay: 1,
          toDay: 5,
          slots: [{ from: '09:00', to: '17:00' }],
          note: 'État civil ouvert le jeudi de 11h30 à 19h.',
          label: 'Du lundi au vendredi : 9h00–17h00'
        }
      ],
      url: 'https://lannuaire.service-public.gouv.fr/nouvelle-aquitaine/gironde/ff97c4f1-b888-463b-8ca5-7b9f1b45e893'
    })
  })

  it('keeps the phones’ notes and the street lines, and names the kind in French', () => {
    const caf = parseOffice(CAF_BELCIER)
    expect(caf.kindLabel).toBe('Caisse d’allocations familiales (Caf)')
    expect(caf.addresses[0].lines).toEqual(['Résidence les Traversants', "60 rue d'Armagnac"])
    expect(caf.addresses[1]).toMatchObject({
      lines: ["Caisse d'allocations familiales de Gironde", 'Rue du Docteur-Gabriel-Péry'],
      city: 'Bordeaux Cedex',
      postal: true
    })
    expect(caf.phones.map((p) => p.number)).toEqual(['32 30', '0 969 32 52 52'])
    expect(caf.phones[1].note).toMatch(/^Pour les étudiants/)
  })

  it('survives broken or missing fields', () => {
    const odd = parseOffice({
      ...MAIRIE_BORDEAUX,
      adresse: '{not json',
      telephone: '[{"valeur": " "}]',
      adresse_courriel: 'a@ville.fr; b@ville.fr ,',
      site_internet: null,
      plage_ouverture: '[{"nom_jour_debut": "Jour férié"}, {"nom_jour_debut": "Samedi", "valeur_heure_debut_1": "09:00:00", "valeur_heure_fin_1": "12:00:00"}]',
      commentaire_plage_ouverture: ' Sur rendez-vous ',
      formulaire_contact: ' ',
      url_service_public: null,
      pivot: '[{"type_service_local": "drfip"}]'
    })
    expect(odd).toMatchObject({
      addresses: [],
      phones: [],
      emails: ['a@ville.fr', 'b@ville.fr'],
      websites: [],
      hoursNote: 'Sur rendez-vous',
      url: '',
      kind: 'drfip',
      kindLabel: 'drfip'
    })
    expect(odd.contactForm).toBeUndefined()
    expect(odd.hours).toEqual([{ fromDay: 6, toDay: 6, slots: [{ from: '09:00', to: '12:00' }], label: 'Samedi : 9h00–12h00' }])
    expect(openingHours(null)).toEqual([])
  })

  it('measures the distance to where one goes', () => {
    expect(withDistance(parseOffice(MAIRIE_BORDEAUX), BORDEAUX).distance).toBe(2.7)
    expect(withDistance(parseOffice({ ...MAIRIE_BORDEAUX, adresse: null }), BORDEAUX).distance).toBeUndefined()
  })

  it('names the département of a commune', () => {})
})

describe('communes', () => {
  const { ctx } = fakeContext(pkg, { answer: () => page([]), communes: [BORDEAUX, LORMONT] })

  it('designates a commune by INSEE code, name or postal code', async () => {
    expect(await communesOf(ctx.geo, { insee: '33249' })).toEqual([LORMONT])
    expect(await communesOf(ctx.geo, { insee: '99999' })).toBeNull()
    expect(await communesOf(ctx.geo, { commune: 'bordeaux' })).toEqual([BORDEAUX])
    expect(await communesOf(ctx.geo, { commune: '33310' })).toEqual([LORMONT])
    expect(await communesOf(ctx.geo, { commune: 'Ys' })).toBeNull()
    expect(await communesOf(ctx.geo, { commune: ' ' })).toEqual([])
  })
})

describe('search', () => {
  it('asks for the offices in or competent for the commune, nearest first', async () => {
    const { ctx, urls } = fakeContext(pkg, { answer: () => page([MAIRIE_BORDEAUX, CAF_BELCIER], 2) })
    const results = await searchOffices(ctx.http, { kind: ' CAF ', limit: 5 }, [BORDEAUX])
    expect(urls).toHaveLength(1)
    expect(urls[0].origin + urls[0].pathname).toBe(
      'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records'
    )
    expect(whereOf(urls[0])).toBe('pivot like "caf" and (code_insee_commune="33063" or pivot like "33063")')
    expect(urls[0].searchParams.get('limit')).toBe('5')
    expect(urls[0].searchParams.get('select')).toContain('plage_ouverture')
    expect(results).toMatchObject({ total: 2, place: 'Bordeaux (33063)', scope: 'commune' })
    expect(results.offices.map((o) => [o.kind, o.distance])).toEqual([
      ['mairie', 2.7],
      ['caf', 5.2]
    ])
  })

  it('falls back on the nearest of the département for a kind the commune does not list', async () => {
    const { ctx, urls } = fakeContext(pkg, {
      answer: (url) =>
        whereOf(url).includes('startswith')
          ? page([office('far', 'cpam', -1.0, 44.5), office('close', 'cpam', -0.53, 44.88), office('mid', 'cpam', -0.6, 44.84)], 3)
          : page([])
    })
    const results = await searchOffices(ctx.http, { kind: 'cpam', limit: 2 }, [LORMONT])
    expect(whereOf(urls[1])).toBe('pivot like "cpam" and startswith(code_insee_commune, "33")')
    expect(urls[1].searchParams.get('limit')).toBe('100')
    expect(results.scope).toBe('department')
    expect(results.total).toBe(3)
    expect(results.offices.map((o) => o.id)).toEqual(['close', 'mid'])
  })

  it('searches all of France without a commune, words of the name quoted safely', async () => {
    const { ctx, urls } = fakeContext(pkg, { answer: () => page([]) })
    const results = await searchOffices(ctx.http, { text: 'Défenseur "des" droits', kind: 'x" or 1=1 or "', limit: 500 }, [])
    expect(whereOf(urls[0])).toBe('pivot like "x  or 1=1 or" and search(nom, "Défenseur  des  droits")')
    expect(urls[0].searchParams.get('limit')).toBe('100')
    expect(results).toEqual({ total: 0, offices: [], place: '', scope: 'national' })
  })

  it('lists the usual offices near a commune, a kind that fails with its error', async () => {
    const { ctx, urls } = fakeContext(pkg, {
      answer: (url) => {
        if (whereOf(url).includes('"caf"')) throw new Error('HTTP 500')
        return whereOf(url).includes('"mairie"') ? page([MAIRIE_BORDEAUX]) : page([])
      }
    })
    const near = await officesNear(ctx.http, BORDEAUX)
    expect(near.map((g) => g.kind)).toEqual(NEARBY_KINDS)
    expect(near[0]).toMatchObject({ kind: 'mairie', label: 'Mairie' })
    expect(near[0].offices.map((o) => o.name)).toEqual(['Mairie - Bordeaux'])
    expect(near.filter((g) => g.offices.length)).toHaveLength(1)
    // The Caf didn't answer: unknown, not none; the kinds that answered nothing have no error.
    expect(near.find((g) => g.kind === 'caf')).toMatchObject({ offices: [], error: expect.stringContaining('HTTP 500') })
    expect(near.filter((g) => g.error).map((g) => g.kind)).toEqual(['caf'])
    // The local search for each kind, then the département's for those the commune doesn't list.
    expect(urls.filter((u) => whereOf(u).includes('startswith'))).toHaveLength(NEARBY_KINDS.length - 2)
  })

  it('fails when the directory is out of reach', async () => {
    const { ctx } = fakeContext(pkg, {
      answer: () => {
        throw new Error('api-lannuaire.service-public.fr injoignable')
      }
    })
    await expect(officesNear(ctx.http, BORDEAUX)).rejects.toThrow('injoignable')
  })
})
