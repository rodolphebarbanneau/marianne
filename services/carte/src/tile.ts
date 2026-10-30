import { cutText, departmentOf, formatNumber, TILE_LIMITS, type HomeCommune, type ServiceTile } from '@marianne/sdk/main'
import { perSquareKm, squareKm } from './display'
import type { CommuneProfile, Territory } from './territory'
import type { CommuneFigures, DepartmentFigures } from './types'

/**
 * 3615 CARTE's tile on the Services page: the population of the user's commune, its density and
 * area, its département and its rank there; France's figures without an address. Pure but for
 * `carteTile`, which asks geo.api.gouv.fr.
 */

/** French numbers as Marianne shows them in a tile: plain spaces for the narrow no-break ones. */
const plain = (text: string) => text.replace(/\s/g, ' ')

/** "9 850", "99 999", "223 k", "1,1 M", "68,4 M": a population in six characters at most, exact while it fits. */
export function shortPopulation(n: number): string {
  if (n < 100_000) return plain(formatNumber(n))
  if (n < 999_500) return `${Math.round(n / 1000)} k`
  return `${plain(formatNumber(Math.round(n / 100_000) / 10, 1))} M`
}

/** Its rank by population among the communes of its département (ties share one), and how many they are. */
export function rankOf(code: string, communes: Array<Pick<CommuneFigures, 'code' | 'population'>>): { rank: number; of: number } | null {
  const commune = communes.find((c) => c.code === code)
  return commune ? { rank: communes.filter((c) => c.population > commune.population).length + 1, of: communes.length } : null
}

const inhabitants = (n: number) => (n > 1 ? 'habitants' : 'habitant')

/** The tile of a commune; `rank` among its département's communes, when known. */
export function communeTile(c: CommuneProfile, rank: { rank: number; of: number } | null): ServiceTile {
  const department = `${c.departmentName} (${c.department})`
  // A département of one commune (Paris) has no rank to tell.
  const place =
    rank && rank.of > 1
      ? `${department} · ${rank.rank === 1 ? '1re' : `${plain(formatNumber(rank.rank))}e`} de ses ${plain(formatNumber(rank.of))} communes`
      : department
  return {
    value: { text: shortPopulation(c.population), unit: cutText(`${inhabitants(c.population)} · ${c.name}`, TILE_LIMITS.unit) },
    lines: [{ text: plain(`densité ${perSquareKm(c.density)} · ${squareKm(c.area)}`) }, { text: cutText(place, TILE_LIMITS.line), tone: 'dim' }]
  }
}

/** France's tile, summed from its départements, and where to give the address that would show the user's commune. */
export function franceTile(departments: DepartmentFigures[]): ServiceTile | null {
  const population = departments.reduce((sum, d) => sum + d.population, 0)
  const area = departments.reduce((sum, d) => sum + d.area, 0)
  const communes = departments.reduce((sum, d) => sum + d.communes, 0)
  if (!population || !area) return null
  return {
    value: { text: shortPopulation(population), unit: 'habitants · France' },
    lines: [
      { text: plain(`densité ${perSquareKm(population / area)} · ${formatNumber(communes)} communes`) },
      { text: 'votre commune ? votre adresse dans Réglages › Identité', tone: 'dim' }
    ]
  }
}

/**
 * The tile of the user's commune, its rank asked with the screen's request for its département's
 * communes (left out when that fails); without an address, France's. A commune geo.api.gouv.fr
 * doesn't know: the default tile.
 */
export async function carteTile(
  territory: Pick<Territory, 'commune' | 'communeFigures' | 'departmentFigures'>,
  home: HomeCommune | null
): Promise<ServiceTile | null> {
  if (!home) return franceTile(await territory.departmentFigures())
  const [commune, communes] = await Promise.all([territory.commune(home.code), territory.communeFigures(departmentOf(home.code)).catch(() => null)])
  return commune ? communeTile(commune, communes ? rankOf(commune.code, communes) : null) : null
}
