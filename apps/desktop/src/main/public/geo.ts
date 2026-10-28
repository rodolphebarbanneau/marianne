import { fetchJson, query } from '../http'
import { ensureEnabled, sourceUrl } from './sources'

/** Communes from the Découpage administratif API (geo.api.gouv.fr). */

export interface Commune {
  name: string
  code: string
  postalCodes: string[]
  department: string
  departmentName: string
  region: string
  population: number
  /** The commune's centre. */
  longitude: number
  latitude: number
}

interface RawCommune {
  nom: string
  code: string
  codesPostaux?: string[]
  codeDepartement?: string
  population?: number
  departement?: { nom: string }
  region?: { nom: string }
  centre?: { coordinates: [number, number] }
}

const FIELDS = 'nom,code,codesPostaux,codeDepartement,population,departement,region,centre'

const commune = (c: RawCommune): Commune => ({
  name: c.nom,
  code: c.code,
  postalCodes: c.codesPostaux ?? [],
  department: c.codeDepartement ?? '',
  departmentName: c.departement?.nom ?? '',
  region: c.region?.nom ?? '',
  population: c.population ?? 0,
  longitude: c.centre?.coordinates[0] ?? 0,
  latitude: c.centre?.coordinates[1] ?? 0
})

/** Communes matching a name, a postal code or an INSEE code (5 characters: postal code first), most populated first. */
export async function findCommunes(term: string, limit = 5): Promise<Commune[]> {
  ensureEnabled('geo')
  const t = term.trim()
  const get = (params: Record<string, string | number>) =>
    fetchJson<RawCommune[]>(`${sourceUrl('geo')}/communes${query({ ...params, fields: FIELDS, limit, boost: 'population' })}`, { cacheMs: 86_400_000 })
  if (/^\d[\dAB]\d{3}$/i.test(t)) {
    const byPostal = await get({ codePostal: t })
    if (byPostal.length) return byPostal.map(commune)
    return (await get({ code: t.toUpperCase() })).map(commune)
  }
  return (await get({ nom: t })).map(commune)
}

/** One commune by its INSEE code; null when there is none. */
export async function getCommune(code: string): Promise<Commune | null> {
  ensureEnabled('geo')
  const list = await fetchJson<RawCommune[]>(`${sourceUrl('geo')}/communes${query({ code: code.trim().toUpperCase(), fields: FIELDS })}`, {
    cacheMs: 86_400_000
  })
  return list[0] ? commune(list[0]) : null
}

/** The département of an INSEE commune code: two characters, three overseas (971…). */
export const departmentOf = (insee: string) => (/^97/.test(insee) ? insee.slice(0, 3) : insee.slice(0, 2))
