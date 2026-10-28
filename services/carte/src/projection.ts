import type { MapFit, MapView } from './types'

/** From longitude and latitude to a map's coordinates: pure, shared by both sides. */

/** Lambert-93 (EPSG:2154, GRS80 ellipsoid): metres east and north. */
export function lambert93(lon: number, lat: number): [number, number] {
  const e = 0.0818191910428158
  const rad = Math.PI / 180
  const t = (phi: number) => Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi)), e / 2)
  const m = (phi: number) => Math.cos(phi) / Math.sqrt(1 - e * e * Math.sin(phi) ** 2)
  const [phi1, phi2, phi0] = [44 * rad, 49 * rad, 46.5 * rad]
  const n = (Math.log(m(phi1)) - Math.log(m(phi2))) / (Math.log(t(phi1)) - Math.log(t(phi2)))
  const k = (6378137 * m(phi1)) / (n * Math.pow(t(phi1), n))
  const rho = k * Math.pow(t(lat * rad), n)
  const theta = n * (lon - 3) * rad
  return [700000 + rho * Math.sin(theta), 6600000 + k * Math.pow(t(phi0), n) - rho * Math.cos(theta)]
}

/** A point in a frame's SVG coordinates. */
export function projectPoint(fit: MapFit, lon: number, lat: number): [number, number] {
  const [x, y] = fit.kind === 'lambert93' ? lambert93(lon, lat) : [lon * Math.cos(((fit.lat0 ?? 0) * Math.PI) / 180), lat]
  return [x * fit.scale + fit.dx, fit.dy - y * fit.scale]
}

/** A point on a map view (an inset when it falls overseas); null when the view doesn't show it. */
export function projectOnMap(view: MapView, lon: number, lat: number): [number, number] | null {
  const inside = (b: number[]) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]
  const frame = view.frames.find((f) => f.box && inside(f.bounds)) ?? view.frames.find((f) => !f.box && inside(f.bounds))
  return frame ? projectPoint(frame.fit, lon, lat) : null
}

/** A code to sort départements in the INSEE order, Corsica's 2A and 2B in the place of 20: compare with numeric collation. */
export const departmentOrder = (code: string) => code.replace(/^2([AB])/i, '20$1')
