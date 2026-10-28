import * as z from 'zod'
import { fetchJson, query } from '../http'
import { base, plural, table, tool, ToolError } from './tool'

/** Address suggestions from the national address base (number and street, commune, insee code). */
export async function searchAddress(q: string) {
  if (q.trim().length < 4) return []
  const data = await fetchJson<{ features: Array<{ properties: Record<string, string>; geometry: { coordinates: [number, number] } }> }>(
    `${base('adresse')}/search${query({ q, limit: 6, autocomplete: 1 })}`,
    { cacheMs: 600_000 }
  )
  return (data.features ?? []).map((f) => ({
    label: f.properties.label,
    rue: f.properties.name ?? '',
    codePostal: f.properties.postcode ?? '',
    commune: f.properties.city ?? '',
    codeInsee: f.properties.citycode ?? '',
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1]
  }))
}

interface Commune {
  nom: string
  code: string
  codesPostaux: string[]
  codeDepartement: string
  codeRegion?: string
  population?: number
  departement?: { nom: string }
  region?: { nom: string }
  epci?: { nom: string }
}

/** Communes matching a name, a postal code or an INSEE code (5 digits: postal code first). */
export async function findCommunes(term: string, limit = 5): Promise<Commune[]> {
  const fields = 'nom,code,codesPostaux,codeDepartement,population,departement,region,epci'
  const t = term.trim()
  const get = (params: Record<string, string | number>) =>
    fetchJson<Commune[]>(`${base('geo')}/communes${query({ ...params, fields, limit, boost: 'population' })}`, { cacheMs: 86_400_000 })
  if (/^\d[\dAB]\d{3}$/i.test(t)) {
    const byPostal = await get({ codePostal: t })
    if (byPostal.length) return byPostal
    return get({ code: t.toUpperCase() })
  }
  return get({ nom: t })
}

export const geoTools = [
  tool({
    name: 'communes',
    title: 'Découpage administratif · communes',
    source: 'geo',
    readOnly: true,
    description:
      'Trouve une commune par nom, code postal ou code insee : codes officiels (insee, postaux), département, région, intercommunalité, population. Utile avant les outils qui demandent un code insee (simulation_openfisca, annuaire_administration).',
    input: { recherche: z.string().min(2).describe('Nom de commune, code postal ou code insee') },
    run: async ({ recherche }) => {
      const list = await findCommunes(recherche, 8)
      if (!list.length) throw new ToolError(`Aucune commune pour « ${recherche} ».`)
      return `${plural(list.length, 'commune')} :\n\n${table(
        ['commune', 'code insee', 'codes postaux', 'département', 'région', 'intercommunalité', 'population'],
        list.map((c) => [
          c.nom,
          c.code,
          c.codesPostaux.join(', '),
          `${c.departement?.nom ?? ''} (${c.codeDepartement})`,
          c.region?.nom ?? '',
          c.epci?.nom ?? '',
          c.population ?? ''
        ])
      )}`
    }
  }),

  tool({
    name: 'adresses',
    title: 'Base adresse nationale',
    source: 'adresse',
    readOnly: true,
    description:
      'Recherche ou normalise une adresse postale française (base adresse nationale) : libellé officiel, code postal, commune, code insee, coordonnées.',
    input: { adresse: z.string().min(3), limite: z.number().int().min(1).max(10).default(5) },
    run: async ({ adresse, limite }, ctx) => {
      const data = await fetchJson<{ features: Array<{ properties: Record<string, string | number>; geometry: { coordinates: [number, number] } }> }>(
        `${base('adresse')}/search${query({ q: adresse, limit: limite })}`
      )
      if (!data.features?.length) throw new ToolError(`Adresse introuvable : « ${adresse} ».`)
      return table(
        ['adresse', 'code postal', 'commune', 'code insee', 'score', 'lon, lat'],
        data.features.map((f) => [
          f.properties.label,
          f.properties.postcode,
          f.properties.city,
          f.properties.citycode,
          Number(f.properties.score).toFixed(2),
          // The user's own address: the neighbourhood (about 1 km), not the house.
          f.geometry.coordinates.map((c) => c.toFixed(ctx.resolved ? 2 : 5)).join(', ')
        ])
      )
    }
  })
]
