import type { DatabaseSync } from 'node:sqlite'
import {
  colorDistance,
  MAX_PICTURE_COLORS,
  nearestPaletteColor,
  TILE_LIMITS,
  type PaletteColor,
  type PixelArt,
  type ServiceImpl,
  type ServiceTile,
  type SyncProgress,
  type SyncStatus,
  type TileLine
} from '@marianne/sdk'
import type { HomeCommune, ServiceContext } from '@marianne/sdk/main'
import { liveMeetings, todayStreams } from './methods'
import { all, getMember, groupRecords, listGroups, meetingsBetween, one, votesOf } from './queries'
import type { ParliamentIndex } from './store'
import { addDays, parisDay } from './time'
import type { Chamber, LiveStream, Mine, ParlementMethods } from './types'

/**
 * 3615 PARLEMENT's tile on the Services page: the public ballots of the last day that had some,
 * the Assemblée's hemicycle in its groups' colours, what is broadcast now, and how the user's
 * deputy took part in that day's ballots. `tileOf` lays it out from facts, so the tests run it
 * without the index or the portals; `parlementTile` gathers them.
 */

// ---------------------------------------------------------------- groups' colours in the palette

/* Each group's colour is the palette's nearest (nearestPaletteColor, in the SDK): its hue, then the level. */

/**
 * The groups' colours (left to right), at most `max` of them: while there are more, the colour of
 * fewest seats takes, group by group, the closer colour of its neighbours. A small group then reads
 * as part of the one it sits beside.
 */
export function mergeColors(groups: Array<{ members: number; color: PaletteColor }>, max = MAX_PICTURE_COLORS): PaletteColor[] {
  const colors = groups.map((g) => g.color)
  for (;;) {
    const seats = new Map<PaletteColor, number>()
    colors.forEach((c, i) => seats.set(c, (seats.get(c) ?? 0) + groups[i].members))
    if (seats.size <= max) return colors
    // The fewest seats; between equals, the leftmost (the sort is stable, the map in order of appearance).
    const least = [...seats].sort((a, b) => a[1] - b[1])[0][0]
    const far = (other?: PaletteColor) => (other ? colorDistance(other, least) : Infinity)
    colors.forEach((c, i) => {
      if (c !== least) return
      const left = colors.slice(0, i).findLast((x) => x !== least)
      const right = colors.slice(i + 1).find((x) => x !== least)
      colors[i] = (far(left) <= far(right) ? left : right)!
    })
  }
}

// ---------------------------------------------------------------- the hemicycle

/** The picture's size: odd, so that every other cell draws a symmetric arc. */
export const HEMICYCLE = { width: 23, height: 8 } as const

/**
 * The seats of the picture, from the left end to the right: every other cell of a ring around the
 * president's desk (the middle of the bottom edge), flattened to the picture's height, in the
 * order of their bearing from it.
 */
const SEATS = (() => {
  const { width, height } = HEMICYCLE
  const seats: Array<{ x: number; y: number; bearing: number }> = []
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - width / 2
      const dy = (height - y - 0.5) * 1.38
      const d = Math.hypot(dx, dy)
      if ((x + y) % 2 === 0 && d >= 5 && d <= 11.2) seats.push({ x, y, bearing: Math.atan2(dy, dx) })
    }
  return seats.sort((a, b) => b.bearing - a.bearing || a.y - b.y)
})()

/** A colour's character in a picture: its initial, else its capital, else a digit (w: blanc). */
function keyFor(color: PaletteColor, taken: Set<string>): string {
  const initial = color === 'blanc' ? 'w' : color[0]
  return [initial, initial.toUpperCase(), ...'123456789'].find((k) => !taken.has(k))!
}

/**
 * The Assemblée's hemicycle, its groups given left to right with their members: each seat of the
 * picture goes to the group whose share of the chamber covers it, in at most eight colours
 * (mergeColors). No group (nothing synced yet): grey seats.
 */
export function hemicyclePicture(groups: Array<{ members: number; color: PaletteColor }>): PixelArt {
  const colors = mergeColors(groups)
  const total = groups.reduce((sum, g) => sum + g.members, 0)
  const grid = Array.from({ length: HEMICYCLE.height }, () => Array<string>(HEMICYCLE.width).fill('.'))
  const palette: Record<string, PaletteColor> = {}
  const keys = new Map<PaletteColor, string>()
  let group = 0
  let reached = groups[0]?.members ?? 0
  SEATS.forEach((seat, i) => {
    let color: PaletteColor = 'gris'
    if (total) {
      // The seat's middle, in members from the left end.
      const middle = ((i + 0.5) * total) / SEATS.length
      while (middle >= reached && group < groups.length - 1) reached += groups[++group].members
      color = colors[group]
    }
    if (!keys.has(color)) {
      const key = keyFor(color, new Set(keys.values()))
      keys.set(color, key)
      palette[key] = color
    }
    grid[seat.y][seat.x] = keys.get(color)!
  })
  return { palette, pixels: grid.map((row) => row.join('')) }
}

// ---------------------------------------------------------------- words

/** A text held to `max` characters, cut after a word with "…" (Marianne would cut it anywhere). */
export function fit(text: string, max: number): string {
  const chars = [...text.replace(/\s+/g, ' ').trim()]
  if (chars.length <= max) return chars.join('')
  const head = chars.slice(0, max - 1).join('')
  const words = chars[max - 1] === ' ' ? head : head.replace(/\s+\S*$/, '')
  return `${(words || head).replace(/[\s,;:·–-]+$/, '')}…`
}

/** "Commission des finances" → "commission des finances"; an acronym stays as it is. */
const lowerFirst = (text: string) => (/^\p{Lu}\p{Ll}/u.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text)

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** A day seen from today: "aujourd’hui", "hier", "le 1er octobre", "le 21 juillet 2025". */
export function dayWords(day: string, today: string): string {
  if (day === today) return 'aujourd’hui'
  if (day === addDays(today, -1)) return 'hier'
  const [year, month, date] = day.split('-').map(Number)
  return `le ${date === 1 ? '1er' : date} ${MONTHS[month - 1]}${day.slice(0, 4) === today.slice(0, 4) ? '' : ` ${year}`}`
}

// ---------------------------------------------------------------- what is broadcast now

/** Texts whose names are long and whose acronyms everyone uses. */
const ACRONYMS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/projet de loi de financement (rectificative )?de la sécurité sociale pour (?:l['’]année )?(\d{4})/i, (m) => `PLF${m[1] ? 'R' : ''}SS ${m[2]}`],
  [/projet de loi de finances (rectificative )?pour (?:l['’]année )?(\d{4})/i, (m) => `PLF${m[1] ? 'R' : ''} ${m[2]}`]
]

/** What an item of the agenda is about, in a few words: "PLF 2027", "questions au Gouvernement"… */
export function shortSubject(item: string): string {
  for (const [pattern, name] of ACRONYMS) {
    const m = item.match(pattern)
    if (m) return name(m)
  }
  return lowerFirst(
    item
      .replace(/\s*\(n[°o][^)]*\)/gi, '')
      .replace(/^(?:suite de la )?discussion (?:du |de la |des |de l['’]|d['’])?/i, '')
      .trim()
  )
}

const NAMES_A_TEXT = /\b(?:projet|proposition) de loi\b/i

/**
 * A broadcast in a few words: at the Assemblée, the text its sitting debates (the first of the
 * items of the meeting it shows that names one, else the first), or its committee; the Sénat's,
 * the Sénat.
 */
export function streamLabel(stream: LiveStream, items: string[] = []): string {
  if (stream.chamber === 'se') return 'Sénat'
  if (stream.organ && stream.organ !== 'Séance publique') return lowerFirst(stream.organ.split(',')[0].trim())
  const said = [...items, stream.title, stream.subject].flatMap((t) => t.split(' ; ').map((s) => s.trim())).filter(Boolean)
  const subject = said.find((t) => NAMES_A_TEXT.test(t)) ?? said[0]
  return subject ? shortSubject(subject) : 'séance publique'
}

/** "2 directs · PLF 2027, Sénat": the broadcasts now, each name once; null when none. */
export function liveLine(labels: string[]): TileLine | null {
  if (!labels.length) return null
  const text = `${labels.length} ${labels.length > 1 ? 'directs' : 'direct'} · ${[...new Set(labels)].join(', ')}`
  return { text: fit(text, TILE_LIMITS.line), tone: 'live' }
}

// ---------------------------------------------------------------- the tile

/** The user's deputy as the tile shows them: their votes in a day's public ballots at the Assemblée. */
export interface DeputyVotes {
  female: boolean
  voted: number
  total: number
  day: string
}

/** What the tile is made of, as the index, the user's address and the portals give it. */
export interface TileFacts {
  today: string
  /** From the index; null before the first sync (or after a schema change, until the next one). */
  index: {
    /** The Assemblée's groups, left to right, with their members and colour (#rrggbb). */
    groups: Array<{ members: number; color: string }>
    /** The last day with public ballots up to today, in both chambers, and how many; null: none indexed. */
    ballots: { day: string; count: number } | null
  } | null
  sync: SyncStatus
  /** The broadcasts now, in a few words each (streamLabel). */
  live: string[]
  /** No address in the profile, an address that doesn't say which constituency, or the deputy's votes; null: none to show. */
  deputy: DeputyVotes | 'no-address' | 'unsure' | null
}

const progressWords = (p: SyncProgress) =>
  `${p.phase === 'download' ? 'téléchargement' : 'indexation'}${p.label ? ` : ${p.label}` : p.total ? ` : ${p.done} / ${p.total}` : ''}`

function deputyLine(deputy: TileFacts['deputy'], today: string, figureDay = ''): TileLine | null {
  if (deputy === 'no-address') return { text: 'votre député·e : renseignez votre adresse', tone: 'dim' }
  if (deputy === 'unsure') return { text: 'votre député·e : complétez votre adresse', tone: 'dim' }
  if (!deputy) return null
  // Another day than the figure's (it had ballots at the Sénat only): which one.
  const when = deputy.day === figureDay ? '' : ` ${dayWords(deputy.day, today)}`
  return { text: `${deputy.female ? 'votre députée' : 'votre député'} : ${deputy.voted} / ${deputy.total} ${deputy.total > 1 ? 'votes' : 'vote'}${when}` }
}

/**
 * The tile from its facts: the figure of the last day's public ballots (today's, else the last
 * day's, said in its unit), the hemicycle, the broadcasts now and the user's deputy. Before the
 * first sync, what is coming, in a grey hemicycle. Opening it shows the ballots of that day.
 */
export function tileOf(facts: TileFacts): ServiceTile {
  const live = liveLine(facts.live)
  if (!facts.index) {
    const { running, error } = facts.sync
    const state = running ? progressWords(running) : error ? 'le dernier téléchargement a échoué' : 'à télécharger depuis le service'
    return {
      title: running ? 'données en cours de téléchargement' : 'données pas encore téléchargées',
      visual: { kind: 'pixels', ...hemicyclePicture([]) },
      lines: [...(live ? [live] : []), { text: fit(state, TILE_LIMITS.line), tone: 'dim' }]
    }
  }
  const { ballots, groups } = facts.index
  const lines = [live, deputyLine(facts.deputy, facts.today, ballots?.day)].filter((l): l is TileLine => !!l)
  return {
    ...(ballots
      ? { value: { text: String(ballots.count), unit: `${ballots.count > 1 ? 'scrutins' : 'scrutin'} ${dayWords(ballots.day, facts.today)}` } }
      : { title: 'aucun scrutin public pour l’instant' }),
    visual: { kind: 'pixels', ...hemicyclePicture(groups.map((g) => ({ members: g.members, color: nearestPaletteColor(g.color) }))) },
    ...(lines.length ? { lines } : {}),
    // The Ballots tab opens on the last day with ballots: the figure's.
    params: { tab: 'ballots' }
  }
}

// ---------------------------------------------------------------- from the index and the portals

/** A day's public ballots: the Assemblée's (by key), and how many at the Sénat. */
export interface BallotDay {
  day: string
  an: number[]
  se: number
}

/** The last day with public ballots up to `upTo`, in both chambers or one; null: none indexed. */
export function ballotDay(db: DatabaseSync, upTo: string, chamber?: Chamber): BallotDay | null {
  const day = chamber
    ? one<{ day: string | null }>(db, 'select max(date) as day from ballots where date <= ? and chamber = ?', upTo, chamber)?.day
    : one<{ day: string | null }>(db, 'select max(date) as day from ballots where date <= ?', upTo)?.day
  if (!day) return null
  const rows = all<{ chamber: Chamber; key: number }>(db, 'select chamber, key from ballots where date = ?', day)
  return { day, an: rows.filter((r) => r.chamber === 'an').map((r) => r.key), se: rows.filter((r) => r.chamber === 'se').length }
}

/**
 * The user's deputy and their votes in the Assemblée's public ballots of the figure's day (else
 * its last day with some): the ballots the figure counts, which opening the tile shows, and the
 * day the screen's "vos élus" shows them for. A week would mix sittings of every kind; a day says
 * whether they were there. A vote by proxy counts; a non-voting member (presiding) doesn't.
 */
export function deputyVotes(db: DatabaseSync, mine: Mine, figure: BallotDay | null, today: string): TileFacts['deputy'] {
  if (!mine.exact) return mine.deputies.length > 1 ? 'unsure' : null
  const deputy = mine.deputies[0]
  const row = getMember(db, 'an', deputy.id)
  const ballots = figure?.an.length ? figure : ballotDay(db, today, 'an')
  if (!row || !ballots?.an.length) return null
  const voted = votesOf(db, 'an', ballots.an, [row.key]).filter((v) => v.position !== 'nonVoting').length
  return { female: deputy.female, voted, total: ballots.an.length, day: ballots.day }
}

/** How long the portals may take to say what is broadcast: past it, the tile goes without (Marianne waits 10 s for a tile). */
const LIVE_WAIT_MS = 5000

/** A promise's value, or `fallback` past `ms`. */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([promise, new Promise<T>((resolve) => (timer = setTimeout(() => resolve(fallback), ms)))]).finally(() => clearTimeout(timer))
}

/** The tile, from the index, the user's address and the portals; without the index or the network, what can be said. */
export async function parlementTile(ctx: ServiceContext, index: ParliamentIndex, methods: ServiceImpl<ParlementMethods>): Promise<ServiceTile> {
  const today = parisDay()
  const home: HomeCommune | null = ctx.home()
  const [streams, mine] = await Promise.all([
    within(todayStreams(ctx), LIVE_WAIT_MS, []).then((found) => found.filter((s) => s.live)),
    home && index.open()
      ? Promise.resolve()
          .then(() => methods.mine())
          .catch((err: unknown) => {
            ctx.log.warn('tile, the user’s deputy:', (err as Error).message)
            return null
          })
      : null
  ])
  // Taken after the waits: a sync that ended meanwhile reopened it.
  const db = index.open()
  const meetings = db ? meetingsBetween(db, today, today) : []
  // The meeting each broadcast shows, for its agenda (the Assemblée's API names the day's first sitting all day).
  const items = new Map([...liveMeetings(meetings, streams)].map(([id, s]) => [s, meetings.find((m) => m.id === id)?.items ?? []]))
  const live = streams.map((s) => streamLabel(s, items.get(s)))
  if (!db) return tileOf({ today, index: null, sync: ctx.sync.status(), live, deputy: null })
  const figure = ballotDay(db, today)
  const raw = groupRecords(db)
  return tileOf({
    today,
    index: {
      groups: listGroups(db, 'an').map((g) => ({ members: g.members, color: raw.get(`an:${g.id}`)?.color ?? '' })),
      ballots: figure ? { day: figure.day, count: figure.an.length + figure.se } : null
    },
    sync: ctx.sync.status(),
    live,
    deputy: !home ? 'no-address' : mine ? deputyVotes(db, mine, figure, today) : null
  })
}
