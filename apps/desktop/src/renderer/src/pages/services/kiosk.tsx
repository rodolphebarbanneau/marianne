import { forwardRef, type KeyboardEvent } from 'react'
import { usePixelRatio } from '@marianne/sdk/view'

/**
 * The kiosk's head: QUEL SERVICE ?, the 3615 bar (a code or words: the one search of the page),
 * ENVOI, and a Minitel waiting beside them. While one types, 3615 and the bar's frame light up
 * together.
 */

/** A Minitel 1 in pixels: its screen reads 3615 and waits, its keyboard folded under it. */
const ART = (() => {
  const W = 31
  const H = 23
  const g = Array.from({ length: H }, () => Array<string>(W).fill('.'))
  const fill = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = c
  }
  const frame = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let x = x0; x <= x1; x++) g[y0][x] = g[y1][x] = c
    for (let y = y0; y <= y1; y++) g[y][x0] = g[y][x1] = c
  }
  fill(4, 0, 26, 14, 'b')
  frame(4, 0, 26, 14, 'o')
  g[0][4] = g[0][26] = g[14][4] = g[14][26] = '.'
  fill(6, 2, 24, 12, 'd')
  fill(7, 3, 23, 11, 's')
  const DIGITS: Record<string, string[]> = {
    3: ['yyy', '..y', 'yyy', '..y', 'yyy'],
    6: ['yyy', 'y..', 'yyy', 'y.y', 'yyy'],
    1: ['.y.', 'yy.', '.y.', '.y.', 'yyy'],
    5: ['yyy', 'y..', 'yyy', '..y', 'yyy']
  }
  ;['3', '6', '1', '5'].forEach((d, i) => DIGITS[d].forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && (g[4 + y][8 + i * 4 + x] = ch))))
  g[10][8] = g[10][9] = 'c'
  for (let x = 11; x <= 19; x += 2) g[10][x] = 'g'
  fill(6, 13, 8, 13, 'h')
  g[13][24] = 'v'
  fill(13, 15, 17, 15, 'o')
  fill(1, 16, 29, 20, 'b')
  frame(1, 16, 29, 20, 'o')
  g[16][1] = g[16][29] = '.'
  for (let x = 3; x <= 21; x += 2) g[17][x] = 'k'
  for (let x = 4; x <= 22; x += 2) g[18][x] = 'k'
  fill(8, 19, 18, 19, 'k')
  g[17][25] = g[17][26] = 'v'
  g[18][25] = g[18][26] = 'c'
  g[19][25] = g[19][26] = 'r'
  fill(2, 21, 28, 21, 'z')
  return { W, H, rows: g }
})()

/** The colours of its parts, from the theme's tokens. */
const INK: Record<string, string> = {
  o: 'var(--muted)',
  b: 'color-mix(in srgb, var(--dim) 45%, var(--bg-raised))',
  d: 'var(--rule)',
  s: 'var(--noir)',
  y: 'var(--jaune)',
  c: 'var(--cyan)',
  g: 'var(--muted)',
  h: 'var(--fg)',
  k: 'var(--fg)',
  v: 'var(--vert)',
  r: 'var(--rouge)',
  z: 'color-mix(in srgb, var(--rule) 60%, transparent)'
}

/** In whole screen pixels, four CSS pixels a cell or as near as they allow. */
function MinitelArt() {
  const ratio = usePixelRatio()
  const cell = Math.max(1, Math.round(4 * ratio))
  const { W, H, rows } = ART
  return (
    <svg
      className="mosaic minitel-art"
      width={(W * cell) / ratio}
      height={(H * cell) / ratio}
      viewBox={`0 0 ${W * cell} ${H * cell}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {rows.flatMap((row, y) =>
        row.map((ch, x) =>
          ch === '.' ? null : (
            <rect
              key={`${x}:${y}`}
              className={y === 10 && ch === 'c' ? 'blinkcell' : undefined}
              x={x * cell}
              y={y * cell}
              width={cell}
              height={cell}
              style={{ fill: INK[ch] }}
            />
          )
        )
      )}
    </svg>
  )
}

export const KioskHead = forwardRef<
  HTMLInputElement,
  { query: string; onQuery: (query: string) => void; onEnvoi: () => void; onKey: (e: KeyboardEvent<HTMLInputElement>) => void }
>(function KioskHead({ query, onQuery, onEnvoi, onKey }, ref) {
  return (
    <div className="kiosk-head">
      <div>
        <span className="ask" id="kiosk-ask">
          QUEL SERVICE ?
        </span>
        <div className="codebar">
          <span className="pre" aria-hidden>
            3615
          </span>
          <label className="cfield">
            <input
              ref={ref}
              value={query}
              maxLength={40}
              spellCheck={false}
              autoComplete="off"
              placeholder="un code ou un mot"
              aria-labelledby="kiosk-ask"
              aria-describedby="kiosk-3615"
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={onKey}
            />
            <span className="cursor" aria-hidden />
          </label>
          <span id="kiosk-3615" hidden>
            3615 : tapez un code (METEO) ou des mots (pharmacie, vote)
          </span>
          <button className="envoi" onClick={onEnvoi}>
            ENVOI ↵
          </button>
        </div>
      </div>
      <MinitelArt />
    </div>
  )
})
