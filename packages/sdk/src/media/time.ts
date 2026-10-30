/** How a player writes a moment: the video's time, or the clock of the room (the hémicycle's). */

/** A video over an hour long writes every position as h:mm:ss. */
const HOUR = 3_600_000

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * A position in the video: 1:02:03, or 2:03 in a video shorter than an hour. `total`: the
 * video's length, so that every position of a long one has its hours (0:02:03).
 */
export function videoTime(ms: number, total = ms): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (total >= HOUR) return `${h}:${pad(m)}:${pad(s % 60)}`
  return `${h ? `${h}:${pad(m)}` : m}:${pad(s % 60)}`
}

/** A length: 1:39, 2:14:10. */
export const duration = (ms: number) => videoTime(ms, 0)

/** How far behind the live edge: −2:14:10. */
export const delay = (ms: number) => `−${duration(ms)}`

/** The hémicycle's clock is Paris's, wherever the user is. */
const PARIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })

/** The time of day in Paris at a unix ms, in seconds since midnight. */
function parisSeconds(unixMs: number): number {
  const parts = Object.fromEntries(PARIS.formatToParts(new Date(unixMs)).map((p) => [p.type, p.value]))
  return Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)
}

/** The clock at a unix ms, Paris time: 14:17:30, or 14:17 without the seconds. */
export function clockTime(unixMs: number, seconds = true): string {
  const s = parisSeconds(unixMs)
  const hm = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}`
  return seconds ? `${hm}:${pad(s % 60)}` : hm
}

export type TimeMode = 'video' | 'heure'

/**
 * The way a player writes its moments: the clock when the user chose it and the video says when
 * it began (`clockStart`, unix ms of position 0), the video's time otherwise.
 */
export function timeWriter(mode: TimeMode, clockStart: number | undefined, total: number) {
  if (mode === 'heure' && clockStart !== undefined) return (ms: number, seconds = true) => clockTime(clockStart + ms, seconds)
  return (ms: number) => videoTime(ms, total)
}

/**
 * A moment the user typed back into a position, ms: 1:02:03, 2:03 or 45 (seconds) of the video;
 * in the clock's mode (`clockStart` given), 14:17:30 or 14:17, the moment of the room's clock
 * nearest after the video's start (a sitting may go past midnight). Null when it reads as neither.
 */
export function readTime(text: string, clockStart?: number): number | null {
  const m = /^\s*(\d{1,4})(?::(\d{1,2}))?(?::(\d{1,2}))?(?:[.,](\d{1,3}))?\s*$/.exec(text)
  if (!m) return null
  const parts = [m[1], m[2], m[3]].filter((p): p is string => p !== undefined).map(Number)
  const frac = m[4] ? Number(`0.${m[4]}`) : 0
  if (parts.slice(1).some((p) => p > 59)) return null
  if (clockStart !== undefined) {
    if (parts.length < 2 || parts[0] > 23) return null
    const target = parts[0] * 3600 + parts[1] * 60 + (parts[2] ?? 0)
    const start = Math.floor(clockStart / 1000)
    // From the start, forward: an hour before it still reads as before (a time typed a little early).
    let diff = target - parisSeconds(start * 1000)
    if (diff < -3600) diff += 86_400
    return Math.max(0, Math.round((start + diff + frac) * 1000 - clockStart))
  }
  const seconds = parts.reduce((acc, p) => acc * 60 + p, 0)
  return Math.round((seconds + frac) * 1000)
}

/** The speeds offered, slowest first. */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

/** 1.5 → "1,5×". */
export const speedLabel = (rate: number) => `${String(rate).replace('.', ',')}×`

/** The next speed up (+1) or down (−1) from the current one, kept within the list. */
export function nextSpeed(rate: number, step: 1 | -1): number {
  const i = SPEEDS.findIndex((s) => s >= rate - 1e-6)
  const at = i < 0 ? SPEEDS.length - 1 : SPEEDS[i] > rate + 1e-6 && step > 0 ? i - 1 : i
  return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, at + step))]
}
