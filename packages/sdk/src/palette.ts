/**
 * The Marianne palette, and the pictures drawn with it: a service's icon, the picture on its tile.
 *
 * A picture is a grid of named colours, never an image file: nothing to decode or check, one look
 * for every service, and it follows the theme. The palette has six Videotex hues at four levels,
 * four greys and black, 29 colours tied to Marianne's tokens (« Minitel 1 » turns them into
 * greys). Marianne's stylesheet defines each one as `--palette-<name>`; a service's own styles may
 * use those variables too.
 *
 * A grid is written as rows of characters: `.` is transparent, any other character is a key of its
 * `palette`, which names the colour. Icons are 8 × 8, exactly; a tile's picture is up to 24 × 8.
 */

export const PALETTE_HUES = ['bleu', 'rouge', 'magenta', 'vert', 'cyan', 'jaune'] as const
export type PaletteHue = (typeof PALETTE_HUES)[number]

/** From the darkest to the palest; the bare hue is the token itself (`--bleu`). */
export const PALETTE_LEVELS = ['sombre', 'base', 'clair', 'pale'] as const

export const PALETTE_GREYS = ['gris-sombre', 'gris', 'gris-clair', 'blanc', 'noir'] as const

export type PaletteColor = PaletteHue | `${PaletteHue}-${'sombre' | 'clair' | 'pale'}` | (typeof PALETTE_GREYS)[number]

/** The 29 colours, by name: each hue at its four levels, then the greys and black. */
export const PALETTE: readonly PaletteColor[] = [
  ...PALETTE_HUES.flatMap((h) => PALETTE_LEVELS.map((l) => (l === 'base' ? h : (`${h}-${l}` as PaletteColor)))),
  ...PALETTE_GREYS
]

export const isPaletteColor = (value: unknown): value is PaletteColor => typeof value === 'string' && (PALETTE as readonly string[]).includes(value)

/** The CSS value of a colour of the palette, as Marianne's stylesheet defines it. */
export const paletteValue = (color: PaletteColor) => `var(--palette-${color})`

// ---------------------------------------------------------------- matching a data's own colours

/**
 * The default theme's tokens the palette is mixed from (Marianne's stylesheet, `:root`), for a
 * service whose data has colours of its own (a political group's) to find the palette's nearest.
 * The app's tests check that they are the stylesheet's.
 */
export const PALETTE_TOKENS = {
  bleu: '#3d5afe',
  rouge: '#ff4757',
  magenta: '#ff5ad9',
  vert: '#45f08a',
  cyan: '#45e3ff',
  jaune: '#ffd23f',
  noir: '#05071a',
  blanc: '#eef1ff',
  rule: '#1d2763',
  muted: '#3f4985',
  dim: '#8089c4'
} as const

/** How each level mixes its hue, as the stylesheet's `color-mix(in srgb, …)`: with black or white, and the hue's share. */
export const PALETTE_MIX = { sombre: ['noir', 0.55], clair: ['blanc', 0.62], pale: ['blanc', 0.3] } as const

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/** Each colour of the palette as the default theme draws it (#rrggbb). */
export const PALETTE_REFERENCE: Record<PaletteColor, string> = (() => {
  const out = {} as Record<PaletteColor, string>
  for (const h of PALETTE_HUES) {
    out[h] = PALETTE_TOKENS[h]
    for (const [level, [other, share]] of Object.entries(PALETTE_MIX)) {
      const a = channels(PALETTE_TOKENS[h])
      const b = channels(PALETTE_TOKENS[other])
      out[`${h}-${level}` as PaletteColor] = toHex(a.map((v, i) => share * v + (1 - share) * b[i]))
    }
  }
  return Object.assign(out, {
    'gris-sombre': PALETTE_TOKENS.rule,
    gris: PALETTE_TOKENS.muted,
    'gris-clair': PALETTE_TOKENS.dim,
    blanc: PALETTE_TOKENS.blanc,
    noir: PALETTE_TOKENS.noir
  })
})()

type Lab = [number, number, number]

/** CIE Lab (D65) of a colour (#rrggbb): distances there follow the eye's. */
function lab(hex: string): Lab {
  const [r, g, b] = channels(hex).map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

const HEX = /^#[0-9a-f]{6}$/i

/** How far apart two colours (#rrggbb) are to the eye (ΔE in CIE Lab); two of the palette's by their names. */
export function colorDistance(a: string, b: string): number {
  const ca = lab(isPaletteColor(a) ? PALETTE_REFERENCE[a] : a)
  const cb = lab(isPaletteColor(b) ? PALETTE_REFERENCE[b] : b)
  return Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2])
}

/** The greys a data colour may take: the darker ones would sink into the dark ground of a tile or a row. */
const DATA_GREYS: PaletteColor[] = ['gris', 'gris-clair', 'blanc']

/** Below this chroma (in Lab), a colour is a grey. */
const GREY_CHROMA = 12

/**
 * The palette's colour for a colour of the service's data (#rrggbb, a political group's): the
 * nearest of the six hues first, by its bearing, then the nearest of that hue's four levels; a
 * colour without hue takes the nearest of the light greys. The plain nearest colour would turn a
 * dark navy grey. Not a #rrggbb colour: `gris-clair`.
 */
export function nearestPaletteColor(hex: string): PaletteColor {
  if (!HEX.test(hex)) return 'gris-clair'
  const c = lab(hex)
  const nearest = (names: PaletteColor[]) => names.reduce((best, n) => (colorDistance(n, hex) < colorDistance(best, hex) ? n : best))
  if (Math.hypot(c[1], c[2]) < GREY_CHROMA) return nearest(DATA_GREYS)
  const bearing = (l: Lab) => Math.atan2(l[2], l[1])
  const turn = (a: number, b: number) => Math.min(Math.abs(a - b), 2 * Math.PI - Math.abs(a - b))
  const hue = PALETTE_HUES.reduce((best, h) =>
    turn(bearing(lab(PALETTE_REFERENCE[h])), bearing(c)) < turn(bearing(lab(PALETTE_REFERENCE[best])), bearing(c)) ? h : best
  )
  return nearest(PALETTE_LEVELS.map((l) => (l === 'base' ? hue : (`${hue}-${l}` as PaletteColor))))
}

/** A picture in the palette: rows of characters, `.` transparent, each other character a key of `palette`. */
export interface PixelArt {
  /** One character each, and the colour it stands for: { "j": "jaune", "w": "blanc" }. */
  palette: Record<string, PaletteColor>
  pixels: string[]
}

/** An icon is exactly this many pixels wide and tall, so that every icon is drawn with pixels of the same size. */
export const ICON_SIZE = 8

/** What Marianne draws for a service without an icon: a neutral frame. */
export const NEUTRAL_ICON: PixelArt = {
  palette: { g: 'gris' },
  pixels: ['gggggggg', 'g......g', 'g......g', 'g......g', 'g......g', 'g......g', 'g......g', 'gggggggg']
}

/** A tile's picture: at most this wide and this tall. */
export const PICTURE_SIZE = { width: 24, height: 8 } as const

/** At most this many colours in one picture. */
export const MAX_PICTURE_COLORS = 8

const TRANSPARENT = '.'

/**
 * What is wrong with a picture, one sentence each (English, for a manifest error or a test), none
 * when it is right. `exact`: the grid must be `width` × `height`; otherwise at most that, and at
 * least one pixel each way. Rows all have the same length; a picture shows at least one pixel.
 */
export function pictureProblems(art: unknown, size: { width: number; height: number; exact?: boolean }): string[] {
  if (typeof art !== 'object' || art === null || Array.isArray(art)) return ['must be an object with "palette" and "pixels"']
  const { palette, pixels } = art as Partial<PixelArt>
  const problems: string[] = []
  if (typeof palette !== 'object' || palette === null || Array.isArray(palette)) problems.push('"palette" must map characters to colour names')
  else {
    const keys = Object.keys(palette)
    if (!keys.length) problems.push('"palette" names no colour')
    if (keys.length > MAX_PICTURE_COLORS) problems.push(`"palette" has ${keys.length} colours: ${MAX_PICTURE_COLORS} at most`)
    for (const key of keys) {
      if ([...key].length !== 1 || key === TRANSPARENT || /\s/.test(key)) problems.push(`palette key "${key}" must be one character, other than "." and spaces`)
      else if (!isPaletteColor(palette[key]))
        problems.push(`palette key "${key}": "${String(palette[key])}" is not a colour of the palette (${PALETTE.join(', ')})`)
    }
  }
  if (!Array.isArray(pixels) || !pixels.every((row) => typeof row === 'string')) return [...problems, '"pixels" must be a list of rows (strings)']
  const { width, height, exact } = size
  const widths = new Set(pixels.map((row) => [...row].length))
  const shape = exact ? `${width} × ${height}` : `at most ${width} × ${height}`
  if (exact ? pixels.length !== height : pixels.length < 1 || pixels.length > height)
    problems.push(`"pixels" has ${pixels.length} rows: the picture is ${shape}`)
  if (widths.size > 1) problems.push('every row of "pixels" must have the same length')
  else if (pixels.length) {
    const w = [...widths][0]
    if (exact ? w !== width : w < 1 || w > width) problems.push(`rows of ${w} pixels: the picture is ${shape}`)
  }
  if (typeof palette === 'object' && palette !== null && !Array.isArray(palette)) {
    const used = new Set(pixels.flatMap((row) => [...row]))
    for (const ch of used) if (ch !== TRANSPARENT && !(ch in palette)) problems.push(`"${ch}" in "pixels" is not a key of "palette" (use "." for transparent)`)
    for (const key of Object.keys(palette)) if (!used.has(key)) problems.push(`palette key "${key}" is never used`)
    if (![...used].some((ch) => ch !== TRANSPARENT)) problems.push('the picture is empty')
  }
  return problems
}

/** The cells of a picture that are painted: their column, row and colour. */
export function pictureCells(art: PixelArt): Array<{ x: number; y: number; color: PaletteColor }> {
  const cells: Array<{ x: number; y: number; color: PaletteColor }> = []
  art.pixels.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const color = art.palette[ch]
      if (ch !== TRANSPARENT && color) cells.push({ x, y, color })
    })
  )
  return cells
}

/** A picture's size, in pixels of the grid. */
export const pictureSize = (art: PixelArt) => ({ width: Math.max(0, ...art.pixels.map((row) => [...row].length)), height: art.pixels.length })
