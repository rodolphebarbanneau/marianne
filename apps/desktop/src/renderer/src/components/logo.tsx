/**
 * Marianne's mark, as the app icons draw it (scripts/generate-icons.mjs): a mosaic "M" (Videotex
 * blocks) above a blue-white-red bar, on a navy tile. Laid out on whole pixels the same way: small
 * sizes drop the gap between blocks, which would blur the strokes.
 */

const GLYPH = ['W.....W', 'WW...WW', 'W.W.W.W', 'W..W..W', 'W.....W', 'W.....W']
const COLS = GLYPH[0].length
const ROWS = GLYPH.length
const TILE = '#0a0f2e'
const WHITE = '#f2f4ff'
const BLUE = '#3d5afe'
const RED = '#ff4757'

export function Logo({ size = 24 }: { size?: number }) {
  const block = Math.max(2, Math.floor((size * 0.6) / COLS))
  const gap = block >= 6 ? Math.max(1, Math.round(block * 0.1)) : 0
  const width = block * COLS
  const barHeight = Math.max(1, Math.round(block * 0.75))
  const ox = Math.floor((size - width) / 2)
  const oy = Math.floor((size - (block * ROWS + block + barHeight)) / 2)
  const barY = oy + block * ROWS + block
  const third = Math.round(width / 3)
  const margin = size * 0.04
  return (
    <svg className="logo" width={size} height={size} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" aria-hidden>
      <rect x={margin} y={margin} width={size - 2 * margin} height={size - 2 * margin} rx={size * 0.18} fill={TILE} shapeRendering="geometricPrecision" />
      {GLYPH.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === 'W' ? <rect key={`${x}.${y}`} x={ox + x * block} y={oy + y * block} width={block - gap} height={block - gap} fill={WHITE} /> : null
        )
      )}
      <rect x={ox} y={barY} width={third} height={barHeight} fill={BLUE} />
      <rect x={ox + third} y={barY} width={width - 2 * third} height={barHeight} fill={WHITE} />
      <rect x={ox + width - third} y={barY} width={third} height={barHeight} fill={RED} />
    </svg>
  )
}
