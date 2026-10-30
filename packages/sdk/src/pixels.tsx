import { useEffect, useState } from 'react'
import { ICON_SIZE, NEUTRAL_ICON, paletteValue, pictureCells, pictureSize, type PixelArt } from './palette'

/**
 * Pictures in the Marianne palette, drawn the same way everywhere: a service's icon (in its tile,
 * its row, its card), its tile's picture, and whatever mosaic a service's own screen draws.
 *
 * They are laid out in screen pixels: every cell the same number of them, every gap too. A grid
 * of CSS pixels would put some edges between two screen pixels (at 125 %, a 3px cell is 3.75 of
 * them) and draw one column wider than the others.
 */

/** Screen pixels per CSS pixel, kept current (another display, a zoom). */
export function usePixelRatio(): number {
  const [ratio, setRatio] = useState(() => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1))
  useEffect(() => {
    const query = matchMedia(`(resolution: ${ratio}dppx)`)
    const update = () => setRatio(window.devicePixelRatio || 1)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [ratio])
  return ratio
}

/** A cell's pitch and the square painted in it, in screen pixels: a gap of at least one when there is one. */
function measure(cell: number, gap: number, ratio: number) {
  const pitch = Math.max(1, Math.round(cell * ratio))
  const space = gap > 0 ? Math.min(pitch - 1, Math.max(1, Math.round(gap * ratio))) : 0
  return { pitch, square: pitch - space, space }
}

/**
 * A picture of the palette, as big as `cell` (CSS pixels per cell of the grid, gaps included)
 * allows in whole screen pixels. `gap`: the dark line between cells (Minitel mosaics have one).
 */
export function Pixels({ art, cell = 4, gap = 1, label, className }: { art: PixelArt; cell?: number; gap?: number; label?: string; className?: string }) {
  const ratio = usePixelRatio()
  const { pitch, square, space } = measure(cell, gap, ratio)
  const { width, height } = pictureSize(art)
  const w = Math.max(1, width * pitch - space)
  const h = Math.max(1, height * pitch - space)
  return (
    <svg
      className={`mosaic${className ? ` ${className}` : ''}`}
      width={w / ratio}
      height={h / ratio}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {pictureCells(art).map(({ x, y, color }) => (
        <rect key={`${x}:${y}`} x={x * pitch} y={y * pitch} width={square} height={square} style={{ fill: paletteValue(color) }} />
      ))}
    </svg>
  )
}

/** The sizes an icon is shown at: in a row or a tile's head, on a card, in a dialog. */
export const ICON_CELLS = { small: 3, medium: 4, large: 7 } as const

/**
 * A service's icon in its box: the sunken ground and a frame, the 8 × 8 picture in the middle
 * (a neutral frame without one). Everything in whole screen pixels, the frame as thick as the
 * window's other lines.
 */
export function ServiceIcon({ icon, size = 'small', label }: { icon: PixelArt | null; size?: keyof typeof ICON_CELLS; label?: string }) {
  const ratio = usePixelRatio()
  const art = icon ?? NEUTRAL_ICON
  const { pitch, square, space } = measure(ICON_CELLS[size], 1, ratio)
  const frame = Math.max(1, Math.round(ratio))
  // The padding around the picture: about a sixth of its side, as the Services page was drawn.
  const pad = Math.round(ICON_SIZE * pitch * 0.18)
  const inner = ICON_SIZE * pitch - space
  const n = inner + 2 * (pad + frame)
  const at = frame + pad
  return (
    <svg
      className={`service-icon ${size}`}
      width={n / ratio}
      height={n / ratio}
      viewBox={`0 0 ${n} ${n}`}
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect className="frame" width={n} height={n} />
      <rect className="ground" x={frame} y={frame} width={n - 2 * frame} height={n - 2 * frame} />
      {pictureCells(art).map(({ x, y, color }) => (
        <rect key={`${x}:${y}`} x={at + x * pitch} y={at + y * pitch} width={square} height={square} style={{ fill: paletteValue(color) }} />
      ))}
    </svg>
  )
}
