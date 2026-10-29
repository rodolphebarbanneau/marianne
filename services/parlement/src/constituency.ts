/**
 * Which constituency (circonscription législative) an address is in: its commune says it, but for
 * the 125 communes split between several (Paris, Marseille, Lyon, Toulouse, Bordeaux…), where the
 * address's coordinates fall in their contours. Both come from data.gouv.fr: the list of polling
 * stations with their constituency (2024), and the constituencies' contours drawn from them.
 */

export const POLLING_STATIONS =
  'https://static.data.gouv.fr/resources/liste-des-bureaux-de-vote-associes-a-leur-circonscription-legislative/20240612-133914/bureaux-de-vote-circonscriptions.csv'
export const CONTOURS =
  'https://static.data.gouv.fr/resources/contours-geographiques-des-circonscriptions-legislatives/20240613-191506/circonscriptions-legislatives-p20.geojson'

/** The letters these files give overseas départements and collectivities, as the Assemblée numbers them. */
const OVERSEAS: Record<string, string> = {
  ZA: '971',
  ZB: '972',
  ZC: '973',
  ZD: '974',
  ZS: '975',
  ZM: '976',
  ZX: '977',
  ZW: '986',
  ZP: '987',
  ZN: '988',
  ZZ: '099'
}

/** "ZA" → "971", "01" → "01": the département as the Assemblée's open data writes it (numDepartement). */
export const assemblyDepartment = (code: string) => OVERSEAS[code.toUpperCase()] ?? code.toUpperCase()

/** "0104" → "4", "ZA01" → "1": the constituency's number in its département (numCirco). */
export const constituencyNumber = (code: string) => String(Number(code.slice(-2)))

/** The arrondissements of Paris, Lyon and Marseille are one commune each in the polling stations' list. */
export function communeOf(insee: string): string {
  if (/^751(0[1-9]|1\d|20)$/.test(insee)) return '75056'
  if (/^6938[1-9]$/.test(insee)) return '69123'
  if (/^132(0[1-9]|1[0-6])$/.test(insee)) return '13055'
  return insee
}

export interface CommuneConstituency {
  commune: string
  department: string
  constituency: string
}

/** The cells of a CSV line: a cell in quotes may hold commas, and doubled quotes. */
export function csvCells(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      cells.push(cell)
      cell = ''
    } else cell += c
  }
  cells.push(cell)
  return cells
}

/** The constituencies of each commune, from the polling stations' CSV (one row per station). */
export function parsePollingStations(csv: string): CommuneConstituency[] {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/)
  const head = lines[0].split(',')
  const at = (name: string) => head.indexOf(name)
  const [dep, circo, commune] = [at('codeDepartement'), at('codeCirconscription'), at('codeCommune')]
  if (dep < 0 || circo < 0 || commune < 0) throw new Error('The polling stations’ list has changed shape')
  const seen = new Set<string>()
  const rows: CommuneConstituency[] = []
  for (const line of lines.slice(1)) {
    const cells = csvCells(line)
    if (cells.length < head.length) continue
    const row = { commune: cells[commune], department: assemblyDepartment(cells[dep]), constituency: constituencyNumber(cells[circo]) }
    const key = `${row.commune}|${row.department}|${row.constituency}`
    if (!row.commune || seen.has(key)) continue
    seen.add(key)
    rows.push(row)
  }
  return rows
}

type Ring = Array<[number, number]>
/** A multipolygon's polygons, each its outer ring then its holes. */
export type Geometry = Ring[][]

export interface Contour {
  department: string
  constituency: string
  bbox: [number, number, number, number]
  geometry: Geometry
}

/** The contours of the constituencies asked for (department|constituency), from the GeoJSON (WGS84). */
export function parseContours(geojson: unknown, wanted: Set<string>): Contour[] {
  const features = (geojson as { features?: Array<{ properties?: Record<string, string>; geometry?: { type: string; coordinates: unknown } }> })?.features
  if (!Array.isArray(features)) throw new Error('The constituencies’ contours have changed shape')
  return features.flatMap((f): Contour[] => {
    const p = f.properties ?? {}
    const department = assemblyDepartment(String(p.codeDepartement ?? ''))
    const constituency = constituencyNumber(String(p.codeCirconscription ?? ''))
    if (!wanted.has(`${department}|${constituency}`) || !f.geometry) return []
    const round = (ring: number[][]): Ring => ring.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5])
    const polygons =
      f.geometry.type === 'Polygon'
        ? [(f.geometry.coordinates as number[][][]).map(round)]
        : f.geometry.type === 'MultiPolygon'
          ? (f.geometry.coordinates as number[][][][]).map((poly) => poly.map(round))
          : []
    if (!polygons.length) return []
    const points = polygons.flatMap((poly) => poly[0])
    const xs = points.map((pt) => pt[0])
    const ys = points.map((pt) => pt[1])
    return [{ department, constituency, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], geometry: polygons }]
  })
}

/** Whether a point is in a ring (ray casting). */
function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Whether a point (longitude, latitude) is in a contour: in one of its polygons, not in one of their holes. */
export function contains(geometry: Geometry, longitude: number, latitude: number): boolean {
  return geometry.some(([outer, ...holes]) => inRing(longitude, latitude, outer) && !holes.some((h) => inRing(longitude, latitude, h)))
}
