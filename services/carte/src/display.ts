import { formatNumber } from '@marianne/sdk'
import { departmentOrder } from './projection'

/** How the view shades and sorts the figures, and writes them in French. */

/** Thresholds splitting values into `classes` groups of about the same size (quantiles), lowest first. */
export function quantiles(values: number[], classes = 5): number[] {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!sorted.length) return []
  return Array.from({ length: classes - 1 }, (_, i) => sorted[Math.floor(((i + 1) * sorted.length) / classes)])
}

/** A value's class: 0 below the first threshold, thresholds.length from the last one up. */
export const classOf = (value: number, thresholds: number[]) => thresholds.filter((t) => value >= t).length

/** The density class of each place by code, and the thresholds for the legend. */
export function densityClasses(rows: Array<{ code: string; density: number }>): { classes: Record<string, number>; thresholds: number[] } {
  const thresholds = quantiles(rows.map((r) => r.density))
  return { classes: Object.fromEntries(rows.map((r) => [r.code, classOf(r.density, thresholds)])), thresholds }
}

/** The legend of the density classes: "moins de 45", "45 à 80"… "300 et plus". */
export function legend(thresholds: number[]): string[] {
  if (!thresholds.length) return []
  const f = (v: number) => formatNumber(v)
  return [
    `moins de ${f(thresholds[0])}`,
    ...thresholds.slice(1).map((t, i) => `${f(thresholds[i])} à ${f(t)}`),
    `${f(thresholds[thresholds.length - 1])} et plus`
  ]
}

export interface Sort<T> {
  key: keyof T & string
  desc: boolean
}

/** Rows sorted by a column: numbers by value, codes in the INSEE order, text in French order. */
export function sortRows<T>(rows: T[], sort: Sort<T>): T[] {
  const sign = sort.desc ? -1 : 1
  const text = (v: unknown) => (sort.key === 'code' ? departmentOrder(String(v)) : String(v))
  return [...rows].sort((a, b) => {
    const [x, y] = [a[sort.key], b[sort.key]]
    const order = typeof x === 'number' && typeof y === 'number' ? x - y : text(x).localeCompare(text(y), 'fr', { numeric: true })
    return sign * order
  })
}

export const inhabitants = (n: number) => `${formatNumber(n)} hab.`
export const squareKm = (n: number) => `${formatNumber(n, n < 100 ? 2 : 0)} km²`
export const perSquareKm = (n: number) => `${formatNumber(n, n < 100 ? 1 : 0)} hab./km²`
