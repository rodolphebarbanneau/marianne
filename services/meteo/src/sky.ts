import type { PaletteColor, PixelArt } from '@marianne/sdk'

/**
 * The sky, from a WMO weather code: its French label, its kind, its colour in the palette and its
 * picture. Pure and shared: the main side writes the labels for the engines and the tile, the view
 * draws the pictures.
 */

/** WMO weather codes, in French. */
export const WMO_LABELS: Record<number, string> = {
  0: 'Ciel dégagé',
  1: 'Plutôt dégagé',
  2: 'Partiellement nuageux',
  3: 'Couvert',
  45: 'Brouillard',
  48: 'Brouillard givrant',
  51: 'Bruine légère',
  53: 'Bruine',
  55: 'Bruine dense',
  56: 'Bruine verglaçante',
  57: 'Bruine verglaçante dense',
  61: 'Pluie faible',
  63: 'Pluie',
  65: 'Pluie forte',
  66: 'Pluie verglaçante',
  67: 'Pluie verglaçante forte',
  71: 'Neige faible',
  73: 'Neige',
  75: 'Neige forte',
  77: 'Grains de neige',
  80: 'Averses',
  81: 'Averses modérées',
  82: 'Averses violentes',
  85: 'Averses de neige',
  86: 'Fortes averses de neige',
  95: 'Orage',
  96: 'Orage avec grêle',
  99: 'Orage avec forte grêle'
}

export const weatherLabel = (code: number) => WMO_LABELS[code] ?? 'Temps indéterminé'

/** The kinds of sky the screen draws and the tile colours. */
export type Sky = 'clear' | 'partly' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'showers' | 'snow' | 'storm'

export const isSnow = (code: number) => (code >= 71 && code <= 77) || code === 85 || code === 86

export function skyOf(code: number): Sky {
  if (code <= 1) return 'clear'
  if (code === 2) return 'partly'
  if (code === 45 || code === 48) return 'fog'
  if (isSnow(code)) return 'snow'
  if (code >= 95) return 'storm'
  if (code >= 80) return 'showers'
  if (code >= 61) return 'rain'
  if (code >= 51) return 'drizzle'
  return 'overcast'
}

/** What falls, in a word (« averses »); null for a dry sky. */
export function fallWord(code: number): 'bruine' | 'pluie' | 'averses' | 'neige' | 'orage' | null {
  const sky = skyOf(code)
  if (sky === 'drizzle') return 'bruine'
  if (sky === 'rain') return 'pluie'
  if (sky === 'showers') return 'averses'
  if (sky === 'snow') return 'neige'
  if (sky === 'storm') return 'orage'
  return null
}

/**
 * A day's colour on the tile, from its WMO code: yellow when the sun shows (clear to partly cloudy),
 * light grey for overcast and fog, cyan for rain of any kind, white for snow, magenta for a storm.
 */
export function skyColor(code: number): PaletteColor {
  const sky = skyOf(code)
  if (sky === 'clear' || sky === 'partly') return 'jaune'
  if (sky === 'overcast' || sky === 'fog') return 'gris-clair'
  if (sky === 'snow') return 'blanc'
  if (sky === 'storm') return 'magenta'
  return 'cyan'
}

/** Which of the eight compass points a direction is closest to. */
const point = (degrees: number) => Math.round((((degrees % 360) + 360) % 360) / 45) % 8

/** The compass point the wind blows from, in French ("NO"). */
export const compass = (degrees: number) => ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][point(degrees)]

/** The same in English ("NW"), for the model. */
export const compassEn = (degrees: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][point(degrees)]

// ---------------------------------------------------------------- pictures

/*
 * Eight by eight, as the service's icon, in the palette's names so that they follow the theme
 * (« Minitel 1 » included). Characters, glyphs or emoji would be drawn by whatever font the system
 * has, some in colour: a mosaic is the same everywhere.
 */

const CLOUD = ['...ww...', '..wwww..', '.wwwwwww', 'wwwwwwww', '.gggggg.']

const SUN: PixelArt = {
  palette: { j: 'jaune' },
  pixels: ['...jj...', '.j....j.', '..jjjj..', 'j.jjjj.j', 'j.jjjj.j', '..jjjj..', '.j....j.', '...jj...']
}

const MOON: PixelArt = {
  palette: { b: 'jaune-pale' },
  pixels: ['...bbb..', '..bb....', '.bb.....', '.bb.....', '.bb.....', '.bb.....', '..bb....', '...bbb..']
}

const PARTLY_DAY: PixelArt = {
  palette: { j: 'jaune', w: 'blanc', g: 'gris-clair' },
  pixels: ['j..j....', '.jjj....', 'jjjjww..', '.jjwwww.', '..wwwwww', '.wwwwwww', '..gggggg', '........']
}

const PARTLY_NIGHT: PixelArt = {
  palette: { b: 'jaune-pale', w: 'blanc', g: 'gris-clair' },
  pixels: ['.bb.....', 'bb......', 'bb..ww..', 'bb.wwww.', '.bwwwwww', '.wwwwwww', '..gggggg', '........']
}

const OVERCAST: PixelArt = {
  palette: { w: 'blanc', g: 'gris-clair' },
  pixels: ['........', '...ww...', '..wwww..', '.wwwwwww', 'wwwwwwww', 'wwwwwwww', '.gggggg.', '........']
}

const FOG: PixelArt = {
  palette: { g: 'gris-clair' },
  pixels: ['........', 'gggggg..', '........', '..gggggg', '........', 'gggggg..', '........', '..gggggg']
}

const DRIZZLE: PixelArt = { palette: { w: 'blanc', g: 'gris-clair', c: 'cyan-clair' }, pixels: [...CLOUD, '..c...c.', '........', '....c...'] }

const RAIN: PixelArt = { palette: { w: 'blanc', g: 'gris-clair', c: 'cyan' }, pixels: [...CLOUD, '.c..c..c', 'c..c..c.', '........'] }

const SHOWERS: PixelArt = {
  palette: { j: 'jaune', w: 'blanc', g: 'gris-clair', c: 'cyan' },
  pixels: ['j..ww...', '.jwwww..', 'jwwwwwww', 'wwwwwwww', '.gggggg.', '.c..c..c', 'c..c..c.', '........']
}

const SNOW: PixelArt = { palette: { w: 'blanc', g: 'gris-clair' }, pixels: [...CLOUD, '.w...w..', 'www.www.', '.w...w..'] }

const STORM: PixelArt = { palette: { w: 'blanc', g: 'gris-clair', j: 'jaune' }, pixels: [...CLOUD, '....j...', '...jjj..', '...j....'] }

/** The picture of a sky, by day or by night (the moon for a clear night; no sun behind a night's showers). */
export function skyPicture(code: number, isDay = true): PixelArt {
  switch (skyOf(code)) {
    case 'clear':
      return isDay ? SUN : MOON
    case 'partly':
      return isDay ? PARTLY_DAY : PARTLY_NIGHT
    case 'fog':
      return FOG
    case 'drizzle':
      return DRIZZLE
    case 'rain':
      return RAIN
    case 'showers':
      return isDay ? SHOWERS : RAIN
    case 'snow':
      return SNOW
    case 'storm':
      return STORM
    default:
      return OVERCAST
  }
}
