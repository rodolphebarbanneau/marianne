import { foldText } from '@marianne/sdk'
import departements from './departements.json'
import { projectPoint } from './projection'
import type { MapFit, MapFrame, MapShape, MapView } from './types'

/**
 * Carte de France: SVG-ready shapes. The départements come from a bundled file
 * (departements.json, 95 KB: Etalab's 1 000 m contours, simplified once more border by border so
 * that neighbours still meet); the communes of a département from geo.api.gouv.fr (territory.ts).
 * Metropolitan France is drawn in Lambert-93, the overseas départements in insets on the left.
 */

type Point = [number, number]
type Polygon = Point[][]

export interface BundledDepartment {
  code: string
  name: string
  /** INSEE region code. */
  region: string
  /** Rings as "lon,lat lon,lat …", outer ring first. */
  polygons: string[][]
}

/** A commune of geo.api.gouv.fr's GeoJSON (format=geojson, geometry=contour). */
export interface CommuneFeature {
  properties: { nom: string; code: string; centre?: { coordinates: Point } }
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Polygon | Polygon[] } | null
}

export const CREDIT = 'Contours : Etalab, IGN · chiffres : Insee via geo.api.gouv.fr'
const HEIGHT = 1000
const INSET = 150
const GAP = 30

/** The 101 départements, from the bundled contours. */
export const DEPARTMENTS: ReadonlyArray<BundledDepartment> = (departements as { departments: BundledDepartment[] }).departments

/** A département's code as the APIs write it ("1" → "01", "2a" → "2A"); null when there is no such département. */
export function departmentCode(input: string): string | null {
  const raw = input.trim().toUpperCase()
  const code = /^\d$/.test(raw) ? `0${raw}` : raw
  return DEPARTMENTS.some((d) => d.code === code) ? code : null
}

/** Lowercase words without accents: "Côtes-d'Armor" is "cotes d armor". */
const words = (s: string) =>
  foldText(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** The départements a code or a name designates: one, several when the name is partial ("Corse"), none. */
export function findDepartments(text: string): BundledDepartment[] {
  const code = departmentCode(text)
  if (code) return DEPARTMENTS.filter((d) => d.code === code)
  const key = words(text)
  if (!key) return []
  const exact = DEPARTMENTS.filter((d) => words(d.name) === key)
  return exact.length ? exact : DEPARTMENTS.filter((d) => words(d.name).includes(key))
}

export const parseRing = (ring: string): Point[] => ring.split(' ').map((p) => p.split(',').map(Number) as Point)

const isOverseas = (code: string) => code.startsWith('97')

function bounds(points: Point[]): [number, number, number, number] {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [lon, lat] of points) [w, s, e, n] = [Math.min(w, lon), Math.min(s, lat), Math.max(e, lon), Math.max(n, lat)]
  return [w, s, e, n]
}

/** The fit that puts these points inside a box [x, y, width, height], centred, proportions kept. */
export function fitPoints(kind: MapFit['kind'], points: Point[], box: [number, number, number, number], lat0?: number): MapFit {
  const unit: MapFit = { kind, scale: 1, dx: 0, dy: 0, ...(lat0 !== undefined ? { lat0 } : {}) }
  const raw = points.map(([lon, lat]) => projectPoint(unit, lon, lat))
  const [minX, minY, maxX, maxY] = bounds(raw)
  const scale = Math.min(box[2] / (maxX - minX || 1), box[3] / (maxY - minY || 1))
  return {
    ...unit,
    scale,
    dx: box[0] + (box[2] - (maxX - minX) * scale) / 2 - minX * scale,
    // projectPoint gives y = dy - north * scale, and raw y is -north.
    dy: box[1] + (box[3] - (maxY - minY) * scale) / 2 - minY * scale
  }
}

/** Lambert-93 in the metropole; overseas, a local projection around the middle latitude. */
function fitFor(code: string, points: Point[], box: [number, number, number, number]): MapFit {
  if (!isOverseas(code)) return fitPoints('lambert93', points, box)
  const [, south, , north] = bounds(points)
  return fitPoints('local', points, box, (south + north) / 2)
}

/** SVG path data of rings already in view coordinates. */
const ringsPath = (rings: Point[][]) => rings.map((ring) => ring.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z').join('')

/** SVG path data of polygons (holes included: draw with fill-rule evenodd). */
export function svgPath(polygons: Polygon[], fit: MapFit): string {
  return ringsPath(polygons.flatMap((poly) => poly.map((ring) => ring.map(([lon, lat]) => projectPoint(fit, lon, lat)))))
}

/** Area-weighted centroid of the largest outer ring: where a label sits best. */
function anchor(polygons: Polygon[], fit: MapFit): [number, number] {
  let best: [number, number] = [0, 0]
  let bestArea = 0
  for (const [outer] of polygons) {
    const pts = outer.map(([lon, lat]) => projectPoint(fit, lon, lat))
    let a = 0
    let cx = 0
    let cy = 0
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[(i + 1) % pts.length]
      const cross = x1 * y2 - x2 * y1
      a += cross
      cx += (x1 + x2) * cross
      cy += (y1 + y2) * cross
    }
    if (a && Math.abs(a) > bestArea) {
      bestArea = Math.abs(a)
      best = [cx / (3 * a), cy / (3 * a)]
    }
  }
  return [Math.round(best[0] * 10) / 10, Math.round(best[1] * 10) / 10]
}

/** Douglas–Peucker on a ring already in view coordinates (for the communes' detailed contours). */
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 4) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [[ax, ay], [bx, by]] = [points[a], points[b]]
    const length = Math.hypot(bx - ax, by - ay)
    let [index, distance] = [-1, 0]
    for (let i = a + 1; i < b; i++) {
      const [x, y] = points[i]
      const d = length ? Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / length : Math.hypot(x - ax, y - ay)
      if (d > distance) [index, distance] = [i, d]
    }
    if (index >= 0 && distance > tolerance) {
      keep[index] = 1
      stack.push([a, index], [index, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

/** The national map from the bundled départements: Lambert-93 for the metropole, insets overseas. */
export function franceView(departments: ReadonlyArray<BundledDepartment>): MapView {
  const shapes = departments.map((d) => ({ ...d, polys: d.polygons.map((p) => p.map(parseRing)) }))
  const outerPoints = (list: typeof shapes) => list.flatMap((s) => s.polys.flatMap((p) => p[0]))
  const metro = shapes.filter((s) => !isOverseas(s.code))
  const metroPoints = outerPoints(metro)
  // The metropole sets the height; its width follows from Lambert-93's proportions.
  const probe = fitPoints('lambert93', metroPoints, [0, 0, 1e9, HEIGHT])
  const [left, , right] = bounds(metroPoints.map(([lon, lat]) => projectPoint(probe, lon, lat)))
  const metroWidth = Math.ceil(right - left)
  const frames: MapFrame[] = [{ fit: fitPoints('lambert93', metroPoints, [INSET + GAP, 0, metroWidth, HEIGHT]), bounds: bounds(metroPoints) }]
  const overseas = shapes.filter((s) => isOverseas(s.code))
  const step = (HEIGHT - INSET) / Math.max(1, overseas.length - 1)
  overseas.forEach((s, i) => {
    const points = outerPoints([s])
    const box: [number, number, number, number] = [0, Math.round(i * step), INSET, INSET]
    frames.push({ fit: fitFor(s.code, points, [box[0] + 8, box[1] + 8, INSET - 16, INSET - 16]), bounds: bounds(points), box, label: s.name })
  })
  const frameOf = (code: string) => (isOverseas(code) ? frames[1 + overseas.findIndex((s) => s.code === code)] : frames[0])
  return {
    width: INSET + GAP + metroWidth,
    height: HEIGHT,
    shapes: shapes.map((s): MapShape => {
      const [x, y] = anchor(s.polys, frameOf(s.code).fit)
      return { code: s.code, name: s.name, path: svgPath(s.polys, frameOf(s.code).fit), x, y }
    }),
    frames,
    credit: CREDIT
  }
}

let national: MapView | null = null

/** The map of France by département (from the bundled contours: no network). */
export function franceMap(): MapView {
  national ??= franceView(DEPARTMENTS)
  return national
}

/** A département's communes as a map of their own (longest side 1 000). */
export function communeView(features: CommuneFeature[], department: string): MapView {
  const communes = features
    .filter((f) => f.geometry)
    .map((f) => ({ f, polys: (f.geometry!.type === 'Polygon' ? [f.geometry!.coordinates] : f.geometry!.coordinates) as Polygon[] }))
  const points = communes.flatMap((c) => c.polys.flatMap((p) => p[0]))
  const square = fitFor(department, points, [0, 0, HEIGHT, HEIGHT])
  const [x0, y0, x1, y1] = bounds(points.map(([lon, lat]) => projectPoint(square, lon, lat)))
  const [width, height] = [Math.ceil(x1 - x0), Math.ceil(y1 - y0)]
  const fit = fitFor(department, points, [0, 0, width, height])
  return {
    width,
    height,
    shapes: communes.map(({ f, polys }): MapShape => {
      const rings = polys.flatMap((poly) =>
        poly.map((ring) =>
          simplify(
            ring.map(([lon, lat]) => projectPoint(fit, lon, lat)),
            0.6
          )
        )
      )
      const centre = f.properties.centre?.coordinates
      const [x, y] = centre ? projectPoint(fit, centre[0], centre[1]) : anchor(polys, fit)
      return {
        code: f.properties.code,
        name: f.properties.nom,
        path: ringsPath(rings.filter((r) => r.length > 3)),
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10
      }
    }),
    frames: [{ fit, bounds: bounds(points) }],
    credit: CREDIT
  }
}
