import type { ReactNode } from 'react'
import { usePixelRatio } from '../pixels'

/**
 * The player's icons: smooth vectors on a 20-unit grid (the gear on 16), stroked in the key's ink
 * at 1.6 with round ends; play, pause and the speaker filled (.f). 18px in the bar.
 */

const hair = { strokeWidth: 1.1 }
const speaker = <path className="f" d="M2.8 7.4h3.1l4.3-3.6v12.4l-4.3-3.6H2.8z" />
const GEAR =
  'M6.31 3.08L6.66 1.13L9.34 1.13L9.69 3.08L11.41 4.08L13.28 3.41L14.62 5.72L13.1 7.01L13.1 8.99L14.62 10.28L13.28 12.59L11.41 11.92L9.69 12.92L9.34 14.87L6.66 14.87L6.31 12.92L4.59 11.92L2.72 12.59L1.38 10.28L2.9 8.99L2.9 7.01L1.38 5.72L2.72 3.41L4.59 4.08z M8 5.8a2.2 2.2 0 1 1 0 4.4a2.2 2.2 0 1 1 0-4.4z'

const GLYPHS = {
  play: <path className="f" d="M6 3.6v12.8c0 .5.5.8.9.5l9.6-6.4c.4-.2.4-.8 0-1L6.9 3.1c-.4-.3-.9 0-.9.5z" />,
  pause: (
    <>
      <rect className="f" x="4.6" y="3.6" width="3.6" height="12.8" rx=".6" />
      <rect className="f" x="11.8" y="3.6" width="3.6" height="12.8" rx=".6" />
    </>
  ),
  sound: (
    <>
      {speaker}
      <path d="M13 7.4a3.6 3.6 0 0 1 0 5.2" />
      <path d="M15.4 5a7 7 0 0 1 0 10" />
    </>
  ),
  mute: (
    <>
      {speaker}
      <path d="M13.2 7.6l4.8 4.8M18 7.6l-4.8 4.8" />
    </>
  ),
  gear: <path d={GEAR} style={{ strokeWidth: 1.3 }} />,
  full: <path d="M3 7.6V3.4h4.2M12.8 3.4H17v4.2M17 12.4v4.2h-4.2M7.2 16.6H3v-4.2" />,
  unfull: <path d="M7.2 3v4.2H3M17 7.2h-4.2V3M12.8 17v-4.2H17M3 12.8h4.2V17" />,
  mini: (
    <>
      <rect x="2.4" y="4" width="15.2" height="12" rx="1" />
      <rect className="f" x="10" y="10" width="5.6" height="4.2" rx=".5" />
    </>
  ),
  pip: (
    <>
      <rect x="2.4" y="3.4" width="11" height="8.4" rx="1" />
      <rect className="f" x="8.6" y="9.2" width="9" height="7.4" rx=".8" />
    </>
  ),
  cut: (
    <>
      <circle cx="5.6" cy="14.6" r="2.4" />
      <circle cx="14.4" cy="14.6" r="2.4" />
      <path d="M7.3 12.9L15 3.4M12.7 12.9L5 3.4" />
    </>
  ),
  share: (
    <>
      <path d="M10 12.6V3.2M6.4 6.6L10 3l3.6 3.6" />
      <path d="M4 10.4v5.4c0 .5.3.8.8.8h10.4c.5 0 .8-.3.8-.8v-5.4" />
    </>
  ),
  quality: (
    <>
      <path d="M3 6h14M3 10h14M3 14h14" />
      <rect className="f" x="11" y="4.4" width="2.4" height="3.2" rx=".4" />
      <rect className="f" x="5.6" y="8.4" width="2.4" height="3.2" rx=".4" />
      <rect className="f" x="12.6" y="12.4" width="2.4" height="3.2" rx=".4" />
    </>
  ),
  speed: (
    <>
      <path d="M3.6 14.4a6.6 6.6 0 1 1 12.8 0" />
      <path d="M10 13.6l3.4-4.4" />
      <circle className="f" cx="10" cy="13.6" r="1.3" />
    </>
  ),
  clock: (
    <>
      <circle cx="10" cy="10" r="6.8" />
      <path d="M10 6v4.4l2.8 1.8" />
    </>
  ),
  list: (
    <>
      <path d="M7 5h10M7 10h10M7 15h10" />
      <circle className="f" cx="3.8" cy="5" r="1.1" />
      <circle className="f" cx="3.8" cy="10" r="1.1" />
      <circle className="f" cx="3.8" cy="15" r="1.1" />
    </>
  ),
  expand: (
    <>
      <path d="M11.4 3.4h5.2v5.2M16.6 3.4L10 10" />
      <path d="M8.6 4.6H4.2c-.5 0-.8.3-.8.8v10.4c0 .5.3.8.8.8h10.4c.5 0 .8-.3.8-.8v-4.4" />
    </>
  ),
  ringBack: (
    <>
      <path d="M10 3.3A6.7 6.7 0 1 1 3.3 10" style={hair} />
      <path d="M10.5 1.5L8.7 3.3l1.8 1.8" style={hair} />
    </>
  ),
  ringFwd: (
    <>
      <path d="M10 3.3A6.7 6.7 0 1 0 16.7 10" style={hair} />
      <path d="M9.5 1.5l1.8 1.8-1.8 1.8" style={hair} />
    </>
  ),
  chevBack: <path d="M9.4 5L4.4 10l5 5M15.4 5l-5 5 5 5" />,
  chevFwd: <path d="M4.6 5l5 5-5 5M10.6 5l5 5-5 5" />,
  close: <path d="M5 5l10 10M15 5L5 15" />,
  dot: <circle className="f" cx="10" cy="10" r="5" />,
  grip: (
    <>
      <circle className="f" cx="7" cy="5" r="1.3" />
      <circle className="f" cx="13" cy="5" r="1.3" />
      <circle className="f" cx="7" cy="10" r="1.3" />
      <circle className="f" cx="13" cy="10" r="1.3" />
      <circle className="f" cx="7" cy="15" r="1.3" />
      <circle className="f" cx="13" cy="15" r="1.3" />
    </>
  )
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof GLYPHS

/** An icon, `size` CSS pixels square (18 in the bar). */
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const box = name === 'gear' ? 16 : 20
  return (
    <svg className="mp-ic" width={size} height={size} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
      {GLYPHS[name]}
    </svg>
  )
}

/** "10" in pixels, five rows high, as the ±10 s ring holds it. */
const TEN = ['.X.XXX', 'XX.X.X', '.X.X.X', '.X.X.X', '.X.XXX']

/** Pixel glyphs in whole screen pixels (as the SDK's Pixels draws), `cell` CSS pixels each. */
export function Digits({ rows = TEN, cell = 1.25 }: { rows?: readonly string[]; cell?: number }) {
  const ratio = usePixelRatio()
  const pitch = Math.max(1, Math.round(cell * ratio))
  const w = Math.max(...rows.map((r) => r.length))
  return (
    <svg
      className="mp-digits"
      width={(w * pitch) / ratio}
      height={(rows.length * pitch) / ratio}
      viewBox={`0 0 ${w * pitch} ${rows.length * pitch}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
    >
      {rows.flatMap((r, y) => [...r].map((c, x) => (c === 'X' ? <rect key={`${x}:${y}`} x={x * pitch} y={y * pitch} width={pitch} height={pitch} /> : null)))}
    </svg>
  )
}

/** −10 s / +10 s: the thin ring arrow, the seconds in pixels in it. 24px. */
export function SkipIcon({ dir, size = 24 }: { dir: -1 | 1; size?: number }) {
  return (
    <span className="mp-skip">
      <Icon name={dir < 0 ? 'ringBack' : 'ringFwd'} size={size} />
      <Digits />
    </span>
  )
}
