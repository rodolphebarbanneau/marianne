/**
 * Paris time: the tolls are French, so passages and deadlines are told in Paris time, whatever
 * the computer's time zone. Pure, for both sides.
 */

const PARIS = 'Europe/Paris'
const MINUTE = 60_000

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: PARIS,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})

interface Local {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
}

function local(date: Date): Local {
  const parts = Object.fromEntries(PARTS.formatToParts(date).map((p) => [p.type, p.value]))
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second }
}

/** Paris' offset from UTC at that moment, in minutes (60 or 120). */
function offsetMinutes(date: Date): number {
  const l = local(date)
  const asUtc = Date.UTC(Number(l.year), Number(l.month) - 1, Number(l.day), Number(l.hour), Number(l.minute), Number(l.second))
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / MINUTE)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-10-31T14:30:00+01:00": the moment in Paris time, its date being the Paris day. */
export function parisIso(date: Date): string {
  const l = local(date)
  const offset = offsetMinutes(date)
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  return `${l.year}-${l.month}-${l.day}T${l.hour}:${l.minute}:${l.second}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** "2026-10-28T14:30", as a date and time field holds it, in Paris time. */
export function parisInput(date: Date): string {
  const l = local(date)
  return `${l.year}-${l.month}-${l.day}T${l.hour}:${l.minute}`
}

/** A date and time field's value ("2026-10-28T14:30"), read in Paris time; null when it isn't one. */
export function fromParisInput(value: string): Date | null {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const [year, month, day, hour, minute, second] = m.slice(1).map((x) => Number(x ?? 0))
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  const d = new Date(asUtc)
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day || d.getUTCHours() !== hour || d.getUTCMinutes() !== minute)
    return null
  // The offset of the moment itself, found again from a first guess (the hours around a change of time).
  const guess = asUtc - offsetMinutes(new Date(asUtc)) * MINUTE
  return new Date(asUtc - offsetMinutes(new Date(guess)) * MINUTE)
}

/** A moment: ISO with its offset ("2026-10-28T13:30:00Z", "…+01:00"), or a date and time without one, read in Paris time. */
export function parseMoment(text: string): Date | null {
  const s = text.trim().replace(' ', 'T')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(s)) return fromParisInput(s)
  const date = new Date(s)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "28/10" */
export function shortDay(date: Date): string {
  const l = local(date)
  return `${l.day}/${l.month}`
}

/** "14 h 30", "18 h" */
export function clock(date: Date): string {
  const l = local(date)
  return `${Number(l.hour)} h${l.minute === '00' ? '' : ` ${l.minute}`}`
}

/** "le 28/10 à 14 h 30" */
export const when = (date: Date) => `le ${shortDay(date)} à ${clock(date)}`

/** "2026-10-28 14:30": for the engines. */
export function stamp(date: Date): string {
  const l = local(date)
  return `${l.year}-${l.month}-${l.day} ${l.hour}:${l.minute}`
}

/** A duration in French, to the minute: "2 j 5 h", "3 h 20", "12 min". */
export function duration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / MINUTE))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days) return `${days} j${hours ? ` ${hours} h` : ''}`
  if (hours) return `${hours} h${minutes % 60 ? ` ${pad(minutes % 60)}` : ''}`
  return `${minutes} min`
}

/** The same in English, for the engines: "2 d 5 h", "3 h 20 min", "12 min". */
export function durationEn(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / MINUTE))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days) return `${days} d${hours ? ` ${hours} h` : ''}`
  if (hours) return `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
  return `${minutes} min`
}
