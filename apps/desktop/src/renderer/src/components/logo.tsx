import { useId } from 'react'
import { usePixelRatio } from '../lib/pixel-ratio'

/**
 * Marianne's mark, as the app icons draw it (scripts/generate-icons.mjs): a mosaic "M" (Videotex
 * blocks) in the French colours, blue left stem, white V, red right stem, on a navy tile with a faint
 * dot matrix. Laid out the same way, on the screen's own pixels, so it stays sharp at any size. The
 * tile is square here, like the app's panels; the icons keep the rounded one the systems expect.
 */

const GLYPH = ['W.....W', 'WW...WW', 'W.W.W.W', 'W..W..W', 'W.....W', 'W.....W']
/** A narrower "M" for tiles too small to give the full one 2px blocks and a margin (16px). */
const SMALL_GLYPH = ['W...W', 'WW.WW', 'W.W.W', 'W...W', 'W...W']
const TILE = '#0a0f2e'
const DOT = '#1b2560'
const WHITE = '#f2f4ff'
const BLUE = '#5b78ff'
const RED = '#ff4757'

export function Logo({ size }: { size: number }) {
  const dots = useId()
  // Laid out in screen pixels: at 125 %, a 96px logo is 120 of them, and blocks laid out in CSS
  // pixels (9 × 1.25) would round unevenly, a 1px gap on one side of the V and 2px on the other.
  const ratio = usePixelRatio()
  const n = Math.round(size * ratio)
  const glyph = 2 * GLYPH[0].length <= n * 0.75 ? GLYPH : SMALL_GLYPH
  const cols = glyph[0].length
  const rows = glyph.length
  const block = Math.max(2, Math.floor((n * 0.66) / cols))
  const gap = block >= 6 ? Math.max(1, Math.round(block * 0.1)) : 0
  // Exactly centered: the last block's gap left out, and an odd margin taken from the middle column
  // and the bottom row, one pixel each (see the script).
  const trimX = (n - (block * cols - gap)) % 2
  const trimY = (n - (block * rows - gap)) % 2
  const ox = (n - (block * cols - gap - trimX)) / 2
  const oy = (n - (block * rows - gap - trimY)) / 2
  const mid = (cols - 1) / 2
  const pitch = Math.max(4, Math.round(n / 64))
  const m = Math.round(n * 0.04)
  const tile = { x: m, y: m, width: n - 2 * m, height: n - 2 * m }
  return (
    <svg className="logo" width={n / ratio} height={n / ratio} viewBox={`0 0 ${n} ${n}`} aria-hidden>
      <rect {...tile} fill={TILE} />
      {n >= 96 && (
        <>
          <pattern id={dots} width={pitch} height={pitch} patternUnits="userSpaceOnUse">
            <rect x={pitch >> 1} y={pitch >> 1} width={1} height={1} fill={DOT} shapeRendering="crispEdges" />
          </pattern>
          <rect {...tile} fill={`url(#${dots})`} />
        </>
      )}
      <g shapeRendering="crispEdges">
        {glyph.flatMap((row, y) =>
          [...row].map((c, x) =>
            c === 'W' ? (
              <rect
                key={`${x}.${y}`}
                x={ox + x * block - (x > mid ? trimX : 0)}
                y={oy + y * block}
                width={block - gap - (x === mid ? trimX : 0)}
                height={block - gap - (y === rows - 1 ? trimY : 0)}
                fill={x === 0 ? BLUE : x === cols - 1 ? RED : WHITE}
              />
            ) : null
          )
        )}
      </g>
    </svg>
  )
}
