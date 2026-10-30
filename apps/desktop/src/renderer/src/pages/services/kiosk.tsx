import { forwardRef, type KeyboardEvent } from 'react'
import { usePixelRatio } from '@marianne/sdk/view'

/**
 * The kiosk's head: QUEL SERVICE ?, the 3615 bar (a code or words: the one search of the page),
 * ENVOI, and a Minitel waiting beside them. While one types, 3615 and the bar's frame light up
 * together, and the Minitel's screen follows the letters.
 */

/**
 * A Minitel 1 in pixels, after the real one but in Marianne's colours: a case with soft corners,
 * the screen deep in a bezel whose walls meet it on diagonals, lit on the left and dark on the
 * right, a red light over a small grille low on that side, the keyboard a drawer widening to its
 * front lip. Its screen reads 3615 and waits; a letter typed in the bar lights an e.
 */
const ART = [
  '..lllllllllllllllllllll..',
  '.nnnnnnnnnnnnnnnnnnnnnnn.',
  '.bbdddddddddddddddddddbb.',
  '.blmnssssssssssssssknuub.',
  '.bllsssssssssssssssssuub.',
  '.bllsyyysyyyssyssyyysuub.',
  '.bllsssysysssyyssysssuub.',
  '.bllsyyysyyyssyssyyysuub.',
  '.bllsssysysyssyssssysuub.',
  '.bllsyyysyyysyyysyyysuub.',
  '.bllsssssssssssssssssurb.',
  '.bllsesesesesesesesesuub.',
  '.blmnsssssssssssssssnunn.',
  '.bbnnnnnnnnnnnnnnnnnnnbb.',
  '.nnnnnnnnnnnnnnnnnnnnnnn.',
  '..mmmmmmmmmmmmmmmmmmmmm..',
  '...ddddddddddddddddddd...',
  '..nmmnmmnmmnmmnvvnnnnnn..',
  '.nnknknknknknknknnknknkn.',
  '.nnnknknknknknknnnnnnnnn.',
  '.nnnnnkkkkkkknnnnnknknkn.',
  '.lllllllllllllllllllllll.',
  'bbyyyybbbbbbbbbbbbbnnnbbb',
  '.zzzzzzzzzzzzzzzzzzzzzzz.'
]
/** The echo's first cell and how many there are, the last kept for the cursor. */
const ECHO = { x: 5, cells: 8 }

/** The colours of its parts, from the theme's tokens. */
const INK: Record<string, string> = {
  l: 'color-mix(in srgb, var(--dim) 75%, var(--bg-raised))',
  m: 'color-mix(in srgb, var(--dim) 60%, var(--bg-raised))',
  b: 'color-mix(in srgb, var(--dim) 45%, var(--bg-raised))',
  n: 'color-mix(in srgb, var(--dim) 26%, var(--bg-raised))',
  u: 'color-mix(in srgb, var(--dim) 14%, var(--bg-raised))',
  d: 'var(--rule)',
  s: 'var(--noir)',
  y: 'var(--jaune)',
  c: 'var(--cyan)',
  e: 'var(--muted)',
  k: 'var(--fg)',
  v: 'var(--vert)',
  r: 'var(--rouge)',
  z: 'color-mix(in srgb, var(--rule) 60%, transparent)'
}

/** In whole screen pixels, three CSS pixels a cell or as near as they allow. */
function MinitelArt({ typed }: { typed: number }) {
  const ratio = usePixelRatio()
  const cell = Math.max(1, Math.round(3 * ratio))
  const W = ART[0].length
  const H = ART.length
  const cursor = Math.min(typed, ECHO.cells - 1)
  return (
    <svg
      className="mosaic minitel-art"
      width={(W * cell) / ratio}
      height={(H * cell) / ratio}
      viewBox={`0 0 ${W * cell} ${H * cell}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {ART.flatMap((row, y) =>
        [...row].map((ch, x) => {
          if (ch === '.') return null
          const echo = ch === 'e' ? (x - ECHO.x) / 2 : -1
          return (
            <rect
              key={`${x}:${y}`}
              className={echo === cursor ? 'blinkcell' : undefined}
              x={x * cell}
              y={y * cell}
              width={cell}
              height={cell}
              style={{ fill: INK[ch === 'e' ? (echo < cursor ? 'y' : echo === cursor ? 'c' : 'e') : ch] }}
            />
          )
        })
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
      <MinitelArt typed={query.length} />
    </div>
  )
})
