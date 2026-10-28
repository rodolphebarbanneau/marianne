import { useMemo } from 'react'

/**
 * Videotex mosaic graphics: each character cell of a Minitel screen splits into 2 × 3 blocks.
 * A bitmap (one string per row, one character per block) is drawn as an SVG of blocks with a
 * hairline gap, like the "disjoint" mosaic mode. Characters name colors; '.' is empty.
 */

const COLORS: Record<string, string> = {
  B: 'var(--bleu)',
  R: 'var(--rouge)',
  M: 'var(--magenta)',
  G: 'var(--vert)',
  C: 'var(--cyan)',
  Y: 'var(--jaune)',
  W: 'var(--blanc)',
  '#': 'currentColor'
}

/** Block proportions of a Minitel cell (8 × 10 pixels, 2 × 3 blocks): a little wider than tall. */
const BLOCK_W = 6
const BLOCK_H = 5

export function Mosaic({ rows, scale = 1, gap = 0.6, title }: { rows: string[]; scale?: number; gap?: number; title?: string }) {
  const rects = useMemo(() => {
    const out: Array<{ x: number; y: number; fill: string }> = []
    rows.forEach((row, y) => [...row].forEach((ch, x) => COLORS[ch] && out.push({ x, y, fill: COLORS[ch] })))
    return out
  }, [rows])
  const width = Math.max(...rows.map((r) => r.length)) * BLOCK_W
  const height = rows.length * BLOCK_H
  return (
    <svg
      className="mosaic"
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x * BLOCK_W} y={r.y * BLOCK_H} width={BLOCK_W - gap} height={BLOCK_H - gap} fill={r.fill} />
      ))}
    </svg>
  )
}

/** 5 × 7 letters for mosaic banners. */
const GLYPHS: Record<string, string[]> = {
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  ' ': ['...', '...', '...', '...', '...', '...', '...']
}

/** A word in mosaic letters, `color` being a mosaic color letter (W, Y, C…). */
export function mosaicText(text: string, color = 'W'): string[] {
  const rows = Array.from({ length: 7 }, () => '')
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' ']
    g.forEach((line, i) => (rows[i] += line.replace(/#/g, color) + '.'))
  }
  return rows
}

/** The blue-white-red bar under the logo. */
export function tricolor(width: number, height = 2): string[] {
  const third = Math.floor(width / 3)
  const line = 'B'.repeat(third) + 'W'.repeat(width - 2 * third) + 'R'.repeat(third)
  return Array.from({ length: height }, () => line)
}

/** The small "M" mark of the title bar. */
export const MARK = ['W...W', 'WW.WW', 'W.W.W', 'W...W', 'W...W', '.....', 'BBWRR']
