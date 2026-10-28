import { table } from '@marianne/sdk/main'
import { departmentOrder } from './projection'
import type { CommuneProfile } from './territory'
import type { CommuneFigures, DepartmentFigures } from './types'

/** The figures as the model reads them: compact Markdown, with the source to cite. */

export const SOURCE = 'Source: Insee (legal populations) and IGN (areas), via the Découpage administratif API: https://geo.api.gouv.fr/decoupage-administratif'

const LARGEST = 5

const n = (v: number, digits = 0) => v.toLocaleString('en-US', { maximumFractionDigits: digits })

export function describeCommune(c: CommuneProfile, others: CommuneProfile[] = []): string {
  const lines = [
    `## ${c.name} (INSEE ${c.code})`,
    [c.departmentName && `${c.departmentName} (${c.department})`, c.region, c.postalCodes.length && `postal codes ${c.postalCodes.join(', ')}`]
      .filter(Boolean)
      .join(' · '),
    '',
    table(['population', 'area km²', 'inhabitants per km²'], [[n(c.population), n(c.area, 2), n(c.density, 1)]])
  ]
  if (others.length)
    lines.push(
      '',
      `Other communes matching: ${others.map((o) => `${o.name} (INSEE ${o.code}, ${o.departmentName})`).join(', ')}; ask again with the INSEE code for one of them.`
    )
  lines.push('', SOURCE)
  return lines.join('\n')
}

export function describeDepartment(d: DepartmentFigures, communes: CommuneFigures[]): string {
  const largest = [...communes].sort((a, b) => b.population - a.population).slice(0, LARGEST)
  return [
    `## ${d.name} (${d.code})${d.region ? `, ${d.region}` : ''}`,
    '',
    table(['population', 'area km²', 'inhabitants per km²', 'communes'], [[n(d.population), n(d.area), n(d.density, 1), n(d.communes)]]),
    '',
    'Most populated communes:',
    '',
    table(
      ['commune', 'INSEE code', 'population', 'area km²', 'inhabitants per km²'],
      largest.map((c) => [c.name, c.code, n(c.population), n(c.area, 2), n(c.density, 1)])
    ),
    '',
    SOURCE
  ].join('\n')
}

export function describeFrance(departments: DepartmentFigures[]): string {
  const population = departments.reduce((sum, d) => sum + d.population, 0)
  const area = departments.reduce((sum, d) => sum + d.area, 0)
  const communes = departments.reduce((sum, d) => sum + d.communes, 0)
  const rows = [...departments].sort((a, b) => departmentOrder(a.code).localeCompare(departmentOrder(b.code), 'en', { numeric: true }))
  return [
    `## France: ${departments.length} départements`,
    '',
    table(['population', 'area km²', 'inhabitants per km²', 'communes'], [[n(population), n(area), n(area ? population / area : 0, 1), n(communes)]]),
    '',
    table(
      ['département', 'code', 'region', 'population', 'area km²', 'inhabitants per km²', 'communes'],
      rows.map((d) => [d.name, d.code, d.region, n(d.population), n(d.area), n(d.density, 1), n(d.communes)])
    ),
    '',
    SOURCE
  ].join('\n')
}
