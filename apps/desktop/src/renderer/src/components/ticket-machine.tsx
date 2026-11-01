import { usePixelRatio } from '@marianne/sdk/view'

/**
 * The ticket machine: to Démarches what the Minitel is to Services, on its grid (27 × 27 cells of
 * 2 px) and in its language. A machine with a tricolour band, a screen pointing down at the slot,
 * a green button. At rest the slot blinks; a number typed prints a ticket showing it, and on a
 * domain's page the ticket stays out, as if the user held it.
 */

const screen = (g: string) => `....bll${g}uub....`

const ART = [
  '.....lllllllllllllllll.....',
  '....nnnnnnnnnnnnnnnnnnn....',
  '....BBBBBBWWWWWWWrrrrrr....',
  '....BBBBBBWWWWWWWrrrrrr....',
  '....blnnnnnnnnnnnnnnnub....',
  '....blmsssssssssssssnub....',
  screen('sssssssssssss'),
  screen('sscccccccccss'),
  screen('ssscccccccsss'),
  screen('sssscccccssss'),
  screen('ssssscccsssss'),
  screen('sssssscssssss'),
  '....blmsssssssssssssnub....',
  '....bbnnnnnnnnnnnnnnnbb....',
  '....blnnnnnnnnnnnnnnnub....',
  '....blnnnnnnnnnnnvvnnub....',
  '....blnnnnnnnnnnnvvnnub....',
  '....blnnnsssssssssnnnub....',
  ...Array<string>(5).fill('....blnnnnnnnnnnnnnnnub....'),
  '....bbnnnnnnnnnnnnnnnbb....',
  '...nnnnnnnnnnnnnnnnnnnnn...',
  '..lllllllllllllllllllllll..',
  '.zzzzzzzzzzzzzzzzzzzzzzzzz.'
]

/** The ticket, over the machine: white, with a torn edge. */
const TICKET = ['WWWWWWWWW', 'WWWWWWWWW', 'WWWWWWWWW', 'WWWWWWWWW', 'WWWWWWWWW', 'WWWWWWWWW', 'WWWWWWWWW', 'W.W.W.W.W']
const TICKET_AT = { x: 9, y: 18 }
/** Its two digits, 3 × 5 cells. */
const NUMBER_AT = { x: 10, y: 19 }
/** The cells of the slot that blink at rest. */
const SLOT = { y: 17, xs: [12, 13, 14] }

const DIGITS: Record<string, string[]> = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '001', '001', '001'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111']
}

/** The colours of its parts, from the theme's tokens: Minitel 1 turns it grey with everything else. */
const INK: Record<string, string> = {
  l: 'color-mix(in srgb, var(--dim) 75%, var(--bg-raised))',
  m: 'color-mix(in srgb, var(--dim) 60%, var(--bg-raised))',
  b: 'color-mix(in srgb, var(--dim) 45%, var(--bg-raised))',
  n: 'color-mix(in srgb, var(--dim) 26%, var(--bg-raised))',
  u: 'color-mix(in srgb, var(--dim) 14%, var(--bg-raised))',
  s: 'var(--noir)',
  y: 'var(--jaune)',
  c: 'var(--cyan)',
  v: 'var(--vert)',
  r: 'var(--rouge)',
  z: 'color-mix(in srgb, var(--rule) 60%, transparent)',
  B: 'var(--bleu)',
  W: 'var(--blanc)'
}

interface Cell {
  x: number
  y: number
  ink: string
  blink?: boolean
}

/** The cells drawn over the machine: the slot waiting, or the ticket and its number. */
export function ticketCells(number: number | null): Cell[] {
  if (number === null) return SLOT.xs.map((x) => ({ x, y: SLOT.y, ink: 'y', blink: true }))
  const paper = TICKET.flatMap((row, dy) => [...row].flatMap((ink, dx) => (ink === '.' ? [] : [{ x: TICKET_AT.x + dx, y: TICKET_AT.y + dy, ink }])))
  const digits = [...String(number).padStart(2, '0').slice(-2)].flatMap((digit, i) =>
    DIGITS[digit].flatMap((row, dy) => [...row].flatMap((on, dx) => (on === '1' ? [{ x: NUMBER_AT.x + i * 4 + dx, y: NUMBER_AT.y + dy, ink: 's' }] : [])))
  )
  return [...paper, ...digits]
}

/** In whole screen pixels, two CSS pixels a cell or as near as they allow: the size of the head's lines, not taller. */
export function TicketMachine({ number }: { number: number | null }) {
  const ratio = usePixelRatio()
  const cell = Math.max(1, Math.round(2 * ratio))
  const W = ART[0].length
  const H = ART.length
  const rect = (x: number, y: number, ink: string, blink = false) => (
    <rect
      key={`${x}:${y}:${ink}`}
      className={blink ? 'blinkcell' : undefined}
      x={x * cell}
      y={y * cell}
      width={cell}
      height={cell}
      style={{ fill: INK[ink] }}
    />
  )
  return (
    <svg
      className="mosaic minitel-art"
      width={(W * cell) / ratio}
      height={(H * cell) / ratio}
      viewBox={`0 0 ${W * cell} ${H * cell}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {ART.flatMap((row, y) => [...row].map((ink, x) => (ink === '.' ? null : rect(x, y, ink))))}
      {ticketCells(number).map((c) => rect(c.x, c.y, c.ink, c.blink))}
    </svg>
  )
}

export { ART as TICKET_MACHINE_ART }
