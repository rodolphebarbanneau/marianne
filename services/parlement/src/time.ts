/** Paris time: the Assemblée's agenda and broadcasts are in it, whatever the computer's time zone. */

const PARIS = 'Europe/Paris'

/** YYYY-MM-DD in Paris. */
export function parisDay(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** Paris' offset from UTC at that moment: "+01:00" or "+02:00". */
export function parisOffset(date: Date): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: PARIS, timeZoneName: 'longOffset' }).formatToParts(date).find((p) => p.type === 'timeZoneName')
  return name?.value.replace('GMT', '') || '+00:00'
}

/** "2026-10-28 14:00:00" (Paris) → "2026-10-28T14:00:00+01:00". */
export function parisIso(local: string): string {
  const [day, time = '00:00:00'] = local.trim().split(/[ T]/)
  const hms = time.length === 5 ? `${time}:00` : time.slice(0, 8)
  // The offset at the instant that time is in Paris: read once at the time taken as UTC, then at the instant it gives.
  const asUtc = new Date(`${day}T${hms}Z`)
  const minutes = (offset: string) => (offset.startsWith('-') ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)))
  const offset = parisOffset(new Date(asUtc.getTime() - minutes(parisOffset(asUtc)) * 60_000))
  return `${day}T${hms}${offset}`
}

/** A moment as an ISO date with the Paris offset: "2026-10-30T08:47:27+01:00". */
export function toParis(date: Date): string {
  const hms = new Intl.DateTimeFormat('en-GB', { timeZone: PARIS, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(date)
  return `${parisDay(date)}T${hms}${parisOffset(date)}`
}

/** "vendredi 30 octobre 2026 à 08h47", as the Assemblée writes when a broadcast starts. */
export function parisDateTime(iso: string): string {
  const date = new Date(iso)
  const day = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  return `${day} à ${parisTime(iso).replace(':', 'h')}`
}

/**
 * Whether a moment is still to come. Compared as instants: the agenda's times carry the Paris
 * offset ("15:00:00+01:00") and the clock's are UTC ("14:30:00.000Z"), and as text they don't sort
 * by time.
 */
export const isAhead = (iso: string, now = Date.now()): boolean => Date.parse(iso) > now

/** A day (YYYY-MM-DD) moved by a number of days. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** "14:30", Paris time, of an ISO date. */
export function parisTime(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/** "1:02:15", "4:05": a position in a video. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** "4:05" or "1:02:15" → ms; NaN when it isn't a position. */
export function parseClock(text: string): number {
  const parts = text.trim().split(':')
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return NaN
  return parts.reduce((total, p) => total * 60 + Number(p), 0) * 1000
}
