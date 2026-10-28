import { query, type ServiceHttp } from '@marianne/sdk/main'
import { communeView, type CommuneFeature } from './map'
import type { CommuneFigures, DepartmentFigures, MapView } from './types'

/**
 * The communes and their figures, from the Découpage administratif API (geo.api.gouv.fr):
 * Insee's legal populations, IGN's areas (in hectares), the contours of the communes. A
 * département's figures are its communes' summed.
 */

export const GEO_API = 'https://geo.api.gouv.fr'
const DAY = 86_400_000

export interface RawCommune {
  nom: string
  code: string
  codeDepartement?: string
  codesPostaux?: string[]
  population?: number
  /** Hectares. */
  surface?: number
  centre?: { coordinates: [number, number] }
  departement?: { code: string; nom: string }
  region?: { code: string; nom: string }
}

export interface RawDepartment {
  nom: string
  code: string
  region?: { code: string; nom: string }
}

/** A commune with the names of its département and region. */
export interface CommuneProfile extends CommuneFigures {
  departmentName: string
  region: string
}

const COMMUNE_FIELDS = 'nom,code,codeDepartement,codesPostaux,population,surface,centre'
const PROFILE_FIELDS = `${COMMUNE_FIELDS},departement,region`

/** Hectares to km², to the hundredth. */
const km2 = (hectares = 0) => Math.round(hectares) / 100
/** Inhabitants per km², to the tenth. */
const density = (population: number, area: number) => (area ? Math.round((population / area) * 10) / 10 : 0)

export function toCommuneFigures(c: RawCommune): CommuneFigures {
  const area = km2(c.surface)
  const population = c.population ?? 0
  return {
    code: c.code,
    name: c.nom,
    department: c.codeDepartement ?? '',
    postalCodes: c.codesPostaux ?? [],
    population,
    area,
    density: density(population, area),
    longitude: c.centre?.coordinates[0] ?? 0,
    latitude: c.centre?.coordinates[1] ?? 0
  }
}

export const toCommuneProfile = (c: RawCommune): CommuneProfile => ({
  ...toCommuneFigures(c),
  departmentName: c.departement?.nom ?? '',
  region: c.region?.nom ?? ''
})

/** The figures of each département, summed from its communes. */
export function sumDepartments(communes: RawCommune[], departments: RawDepartment[]): DepartmentFigures[] {
  const sums = new Map<string, { population: number; hectares: number; communes: number }>()
  for (const c of communes) {
    const key = c.codeDepartement ?? ''
    const s = sums.get(key) ?? { population: 0, hectares: 0, communes: 0 }
    s.population += c.population ?? 0
    s.hectares += c.surface ?? 0
    s.communes++
    sums.set(key, s)
  }
  return departments.map((d): DepartmentFigures => {
    const s = sums.get(d.code) ?? { population: 0, hectares: 0, communes: 0 }
    const area = km2(s.hectares)
    return {
      code: d.code,
      name: d.nom,
      region: d.region?.nom ?? '',
      population: s.population,
      area,
      density: density(s.population, area),
      communes: s.communes
    }
  })
}

/** geo.api.gouv.fr through the service's network. Départements are given by valid codes (map.ts, departmentCode). */
export class Territory {
  private national: { at: number; list: Promise<DepartmentFigures[]> } | null = null

  constructor(private readonly http: Pick<ServiceHttp, 'json'>) {}

  /** The communes of a département, drawn. Several MB from the API: cached a day. */
  async departmentMap(code: string): Promise<MapView> {
    const data = await this.http.json<{ features?: CommuneFeature[] }>(
      `${GEO_API}/departements/${code}/communes${query({ fields: 'nom,code,centre', format: 'geojson', geometry: 'contour' })}`,
      { cacheMs: DAY, timeoutMs: 60_000 }
    )
    return communeView(data.features ?? [], code)
  }

  private communes(code: string): Promise<RawCommune[]> {
    return this.http.json<RawCommune[]>(`${GEO_API}/departements/${code}/communes${query({ fields: COMMUNE_FIELDS })}`, { cacheMs: DAY })
  }

  /** Population, area, density and centre of each commune of a département. */
  async communeFigures(code: string): Promise<CommuneFigures[]> {
    return (await this.communes(code)).map(toCommuneFigures)
  }

  /** A département's figures, and its communes'. */
  async department(code: string): Promise<{ figures: DepartmentFigures; communes: CommuneFigures[] }> {
    const [communes, department] = await Promise.all([
      this.communes(code),
      this.http.json<RawDepartment>(`${GEO_API}/departements/${code}${query({ fields: 'nom,code,region' })}`, { cacheMs: DAY })
    ])
    return { figures: sumDepartments(communes, [department])[0], communes: communes.map(toCommuneFigures) }
  }

  /** Every département's figures, summed from the 35 000 communes (3 MB, not kept): computed once a day. */
  departmentFigures(): Promise<DepartmentFigures[]> {
    if (!this.national || Date.now() - this.national.at > DAY) {
      const list = this.sumNational()
      this.national = { at: Date.now(), list }
      // A failure is not kept: the next call tries again.
      list.catch(() => {
        if (this.national?.list === list) this.national = null
      })
    }
    return this.national.list
  }

  private async sumNational(): Promise<DepartmentFigures[]> {
    const [communes, departments] = await Promise.all([
      this.http.json<RawCommune[]>(`${GEO_API}/communes${query({ fields: 'code,population,surface,codeDepartement' })}`, { cacheMs: 0, timeoutMs: 60_000 }),
      this.http.json<RawDepartment[]>(`${GEO_API}/departements${query({ fields: 'nom,code,region' })}`, { cacheMs: DAY })
    ])
    return sumDepartments(communes, departments)
  }

  /**
   * Communes by name (best match first), postal code or INSEE code (most populated first),
   * within a département when one is given.
   */
  async findCommunes(text: string, department?: string, limit = 5): Promise<CommuneProfile[]> {
    const term = text.trim()
    const get = async (params: Record<string, string>) =>
      (
        await this.http.json<RawCommune[]>(
          `${GEO_API}/communes${query({ ...params, codeDepartement: department, fields: PROFILE_FIELDS, boost: 'population', limit })}`,
          {
            cacheMs: DAY
          }
        )
      ).map(toCommuneProfile)
    if (!/^\d[\dAB]\d{3}$/i.test(term)) return get({ nom: term })
    const byPostal = await get({ codePostal: term })
    return (byPostal.length ? byPostal : await get({ code: term.toUpperCase() })).sort((a, b) => b.population - a.population)
  }
}
