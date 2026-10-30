import { isPaletteColor, pictureProblems, PICTURE_SIZE, type PaletteColor, type PixelArt } from './palette'

/**
 * A service's tile: what it shows on the Services page when the user pins it. The service returns
 * data (`tile()` on its main side); Marianne lays it out, the same way and at the same size for
 * every service, as she does its line on a domain's dashboard. Marianne draws the head (the icon,
 * the code and the name, the grip to move it) and the foot (« communauté », how fresh the tile is,
 * the action's button); the service fills the body: a figure or a title, one picture, two lines.
 *
 * Limits are Marianne's: a text too long is cut with « … », extra lines, bars and blocks are
 * dropped, a part that isn't right is left out. A tile never grows. `checkTile` (in
 * @marianne/sdk/testing) says, in a service's tests, what Marianne would cut.
 */

/** How a line reads: `live` is something happening now (a blinking red dot before it). */
export type Tone = 'normal' | 'dim' | 'accent' | 'ok' | 'bad' | 'live'
export const TONES: readonly Tone[] = ['normal', 'dim', 'accent', 'ok', 'bad', 'live']

export type TileParams = Record<string, string | number>

export interface TileLine {
  text: string
  tone?: Tone
}

/** A bar: its value (its height, against the others'), a short label under it ("jeu"), the value as read ("14°"), its colour. */
export interface TileBar {
  value: number
  label?: string
  text?: string
  color?: PaletteColor
}

/** A block: its colour, or null for an empty one (a day without collection), and a short label under it ("me"). */
export interface TileBlock {
  color: PaletteColor | null
  label?: string
}

/**
 * One small picture, of four kinds:
 * - `bars`: up to 7 bars (the week's temperatures), drawn between `range` (default: 0, or the
 *   lowest value if below, to the highest);
 * - `blocks`: up to 16 square blocks in a row (the week's collections);
 * - `gauge`: a bar filled from 0 to 1, with a line under it;
 * - `pixels`: a picture in the palette, up to 24 × 8 (the hemicycle of 3615 PARLEMENT).
 */
export type TileVisual =
  | { kind: 'bars'; bars: TileBar[]; range?: [number, number] }
  | { kind: 'blocks'; blocks: TileBlock[] }
  | { kind: 'gauge'; value: number; label?: string; color?: PaletteColor }
  | ({ kind: 'pixels' } & PixelArt)

export interface ServiceTile {
  /** The figure ("12°") and what it is ("Rennes · averses à 16 h"). */
  value?: { text: string; unit?: string }
  /** Instead of a figure: one line ("Mairie de Rennes"). With a figure, the title is left out. */
  title?: string
  visual?: TileVisual
  /** Under the picture, two at most. */
  lines?: TileLine[]
  /** 'urgent' frames the tile in yellow (a toll to pay before tomorrow). */
  urgency?: 'none' | 'soon' | 'urgent'
  /** One button: opening the service with these params ("payer"). */
  action?: { label: string; params?: TileParams }
  /** What opening the tile shows (a click anywhere but the button). */
  params?: TileParams
}

/** What a tile may hold, in characters and in parts. */
export const TILE_LIMITS = {
  value: 6,
  unit: 40,
  title: 40,
  lines: 2,
  line: 60,
  action: 16,
  bars: 7,
  barLabel: 4,
  barText: 5,
  blocks: 16,
  blockLabel: 3,
  gaugeLabel: 60
} as const

/** How often Marianne asks a service's tile again while the Services page shows, in minutes: its choice, 15 by default, 5 at least. */
export const tileMinutes = (every?: number) => Math.max(5, typeof every === 'number' && Number.isFinite(every) ? every : 15)

const ELLIPSIS = '…'

/**
 * A text cut to `max` characters, the last one an ellipsis; spaces gathered: what Marianne does to
 * a text too long. A service that would rather choose what to cut (a commune's name, not its
 * weather) cuts that part itself with it.
 */
export function cutText(text: string, max: number): string {
  // Never more of it than could be kept: a text of a hundred million characters is cut before it is split.
  const chars = [
    ...text
      .slice(0, Math.max(0, max) * 4 + 16)
      .replace(/\s+/g, ' ')
      .trim()
  ]
  return chars.length <= max
    ? chars.join('')
    : `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}${ELLIPSIS}`
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** What a tile becomes once Marianne has held it to its limits, and what she had to cut or leave out (English, for the log and the tests). */
export interface ReadTile {
  tile: ServiceTile | null
  problems: string[]
}

/**
 * The tile Marianne shows from what a service's `tile()` returned: every part checked, every text
 * held to its length, extra parts dropped. Never throws: what isn't right is left out and said in
 * `problems`. Null (or nothing usable): the service's default tile, its name and description.
 */
export function readTile(raw: unknown): ReadTile {
  const problems: string[] = []
  if (raw === null || raw === undefined) return { tile: null, problems }
  if (!isRecord(raw)) return { tile: null, problems: ['tile() must return an object, or null'] }

  const text = (value: unknown, max: number, what: string): string | undefined => {
    if (value === undefined) return undefined
    if (typeof value !== 'string' || !value.trim()) {
      problems.push(`${what} must be a non-empty string`)
      return undefined
    }
    const out = cutText(value, max)
    if (out !== value.replace(/\s+/g, ' ').trim()) problems.push(`${what} is cut to ${max} characters: "${out}"`)
    return out
  }
  const params = (value: unknown, what: string): TileParams | undefined => {
    if (value === undefined) return undefined
    if (!isRecord(value) || !Object.values(value).every((v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) {
      problems.push(`${what} must map names to strings or numbers`)
      return undefined
    }
    return { ...(value as TileParams) }
  }
  const color = (value: unknown, what: string): PaletteColor | undefined => {
    if (value === undefined) return undefined
    if (isPaletteColor(value)) return value
    problems.push(`${what}: "${String(value)}" is not a colour of the palette`)
    return undefined
  }
  const most = <T>(list: T[], max: number, what: string): T[] => {
    if (list.length > max) problems.push(`${what}: ${list.length} given, ${max} at most, the others are left out`)
    return list.slice(0, max)
  }

  const tile: ServiceTile = {}

  if (raw.value !== undefined) {
    if (!isRecord(raw.value)) problems.push('value must be { text, unit? }')
    else {
      const figure = text(raw.value.text, TILE_LIMITS.value, 'value.text')
      const unit = text(raw.value.unit, TILE_LIMITS.unit, 'value.unit')
      if (figure) tile.value = unit ? { text: figure, unit } : { text: figure }
    }
  }
  if (raw.title !== undefined) {
    if (tile.value) problems.push('title is left out: the tile shows its value')
    else {
      const title = text(raw.title, TILE_LIMITS.title, 'title')
      if (title) tile.title = title
    }
  }

  if (raw.visual !== undefined) {
    const v = raw.visual
    const kind = isRecord(v) ? v.kind : undefined
    if (!isRecord(v)) problems.push('visual must be an object with a kind')
    else if (kind === 'bars') {
      if (!Array.isArray(v.bars)) problems.push('visual.bars must be a list')
      else {
        const bars = most(v.bars, TILE_LIMITS.bars, 'visual.bars').flatMap((b, i): TileBar[] => {
          if (!isRecord(b) || typeof b.value !== 'number' || !Number.isFinite(b.value)) {
            problems.push(`visual.bars[${i}] needs a finite value`)
            return []
          }
          const bar: TileBar = { value: b.value }
          const label = text(b.label, TILE_LIMITS.barLabel, `visual.bars[${i}].label`)
          const shown = text(b.text, TILE_LIMITS.barText, `visual.bars[${i}].text`)
          const c = color(b.color, `visual.bars[${i}].color`)
          if (label) bar.label = label
          if (shown) bar.text = shown
          if (c) bar.color = c
          return [bar]
        })
        let range: [number, number] | undefined
        if (v.range !== undefined) {
          const r = v.range
          if (Array.isArray(r) && r.length === 2 && r.every((n) => typeof n === 'number' && Number.isFinite(n)) && r[0] < r[1]) range = [r[0], r[1]]
          else problems.push('visual.range must be [low, high], low below high')
        }
        if (bars.length) tile.visual = { kind: 'bars', bars, ...(range ? { range } : {}) }
        else problems.push('visual.bars has no bar: the picture is left out')
      }
    } else if (kind === 'blocks') {
      if (!Array.isArray(v.blocks)) problems.push('visual.blocks must be a list')
      else {
        const blocks = most(v.blocks, TILE_LIMITS.blocks, 'visual.blocks').flatMap((b, i): TileBlock[] => {
          if (!isRecord(b) || (b.color !== null && !isPaletteColor(b.color))) {
            problems.push(`visual.blocks[${i}].color must be a colour of the palette, or null`)
            return []
          }
          const label = text(b.label, TILE_LIMITS.blockLabel, `visual.blocks[${i}].label`)
          return [{ color: b.color as PaletteColor | null, ...(label ? { label } : {}) }]
        })
        if (blocks.length) tile.visual = { kind: 'blocks', blocks }
        else problems.push('visual.blocks has no block: the picture is left out')
      }
    } else if (kind === 'gauge') {
      if (typeof v.value !== 'number' || !Number.isFinite(v.value)) problems.push('visual.value (gauge) must be a number from 0 to 1')
      else {
        if (v.value < 0 || v.value > 1) problems.push('visual.value (gauge) is held between 0 and 1')
        const label = text(v.label, TILE_LIMITS.gaugeLabel, 'visual.label')
        const c = color(v.color, 'visual.color')
        tile.visual = { kind: 'gauge', value: Math.max(0, Math.min(1, v.value)), ...(label ? { label } : {}), ...(c ? { color: c } : {}) }
      }
    } else if (kind === 'pixels') {
      const wrong = pictureProblems(v, PICTURE_SIZE)
      if (wrong.length) problems.push(...wrong.map((p) => `visual (pixels): ${p}`))
      else tile.visual = { kind: 'pixels', palette: { ...(v.palette as Record<string, PaletteColor>) }, pixels: [...(v.pixels as string[])] }
    } else problems.push(`visual.kind "${String(kind)}" is not one of bars, blocks, gauge, pixels`)
  }

  if (raw.lines !== undefined) {
    if (!Array.isArray(raw.lines)) problems.push('lines must be a list')
    else {
      const lines = most(raw.lines, TILE_LIMITS.lines, 'lines').flatMap((l, i): TileLine[] => {
        if (!isRecord(l)) {
          problems.push(`lines[${i}] must be { text, tone? }`)
          return []
        }
        const t = text(l.text, TILE_LIMITS.line, `lines[${i}].text`)
        if (!t) return []
        if (l.tone !== undefined && !(TONES as readonly unknown[]).includes(l.tone))
          problems.push(`lines[${i}].tone "${String(l.tone)}" is not one of ${TONES.join(', ')}`)
        const tone = (TONES as readonly unknown[]).includes(l.tone) ? (l.tone as Tone) : undefined
        return [{ text: t, ...(tone && tone !== 'normal' ? { tone } : {}) }]
      })
      if (lines.length) tile.lines = lines
    }
  }

  if (raw.urgency !== undefined) {
    if (raw.urgency === 'none' || raw.urgency === 'soon' || raw.urgency === 'urgent') {
      if (raw.urgency !== 'none') tile.urgency = raw.urgency
    } else problems.push(`urgency "${String(raw.urgency)}" is not one of none, soon, urgent`)
  }

  if (raw.action !== undefined) {
    if (!isRecord(raw.action)) problems.push('action must be { label, params? }')
    else {
      const label = text(raw.action.label, TILE_LIMITS.action, 'action.label')
      const p = params(raw.action.params, 'action.params')
      if (label) tile.action = { label, ...(p ? { params: p } : {}) }
    }
  }
  const p = params(raw.params, 'params')
  if (p) tile.params = p

  if (!tile.value && !tile.title && !tile.visual && !tile.lines) {
    problems.push('the tile shows nothing (no value, title, visual or line): the default tile is shown')
    return { tile: null, problems }
  }
  return { tile, problems }
}
