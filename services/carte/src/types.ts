/**
 * How longitude and latitude become SVG coordinates on a map view: Lambert-93 (the official
 * projection of metropolitan France) or, overseas, a local equirectangular projection; then
 * scaled and shifted (y grows downwards).
 */
export interface MapFit {
  kind: 'lambert93' | 'local'
  scale: number
  dx: number
  dy: number
  /** local: the reference latitude, degrees. */
  lat0?: number
}

export interface MapFrame {
  fit: MapFit
  /** Longitude and latitude bounds the frame shows: [west, south, east, north]. */
  bounds: [number, number, number, number]
  /** Overseas insets: their box on the map [x, y, width, height], and their name. */
  box?: [number, number, number, number]
  label?: string
}

/** A département or a commune, ready to draw (fill-rule evenodd: some have holes). */
export interface MapShape {
  code: string
  name: string
  /** SVG path data, in the view's coordinates. */
  path: string
  /** Where to put its label or marker (the main town for communes). */
  x: number
  y: number
}

export interface MapView {
  width: number
  height: number
  shapes: MapShape[]
  /** The metropolitan frame first, then the overseas insets. */
  frames: MapFrame[]
  /** French credit line to show. */
  credit: string
}

export interface DepartmentFigures {
  code: string
  name: string
  region: string
  population: number
  /** km² */
  area: number
  /** inhabitants per km² */
  density: number
  communes: number
}

export interface CommuneFigures {
  code: string
  name: string
  department: string
  postalCodes: string[]
  population: number
  /** km² */
  area: number
  density: number
  /** The commune's centre. */
  longitude: number
  latitude: number
}

/** What the view calls. */
export type CarteMethods = {
  /** France by département, from the bundled contours. */
  france(): MapView
  /** The communes of a département ("33", "2A", "971"), drawn. */
  department(code: string): MapView
  /** Population, area and density of every département. */
  departmentFigures(): DepartmentFigures[]
  /** Population, area and density of each commune of a département. */
  communeFigures(department: string): CommuneFigures[]
}
