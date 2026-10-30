/** Paris time: the feeds' hours are read as the user reads a French paper, whatever the computer's time zone. */

const PARIS = 'Europe/Paris'

const parts = (iso: string, options: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, ...options }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]))

/** YYYY-MM-DD in Paris. */
export function parisDay(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** A day (YYYY-MM-DD) moved by a number of days. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** "10:37", Paris time: the lists' column. */
export function clock(iso: string): string {
  const p = parts(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${p.hour}:${p.minute}`
}

/** "10 h 37", "9 h": a time in a sentence. */
export function hour(iso: string): string {
  const p = parts(iso, { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
  return p.minute === '00' ? `${Number(p.hour)} h` : `${Number(p.hour)} h ${p.minute}`
}

/** The hour of the day in Paris, 0 to 23. */
export function hourOf(iso: string): number {
  return Number(parts(iso, { hour: '2-digit', hourCycle: 'h23' }).hour)
}

/** "ven. 30": the band's short day. */
export function shortDay(iso: string): string {
  const p = parts(iso, { weekday: 'short', day: 'numeric' })
  return `${p.weekday} ${p.day}`
}

/** "vendredi 30 octobre". */
export function longDay(iso: string): string {
  const p = parts(iso, { weekday: 'long', day: 'numeric', month: 'long' })
  return `${p.weekday} ${p.day} ${p.month}`
}

/** "mercredi 28", of a calendar day (YYYY-MM-DD). */
export function dayName(day: string): string {
  const p = parts(`${day}T12:00:00Z`, { weekday: 'long', day: 'numeric' })
  return `${p.weekday} ${p.day}`
}

/** "1 H 40", "25 MIN": from the first title to the last, as the subject's figures write it. */
export function span(fromIso: string, toIso: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000))
  if (minutes < 60) return `${minutes} MIN`
  return `${Math.floor(minutes / 60)} H ${String(minutes % 60).padStart(2, '0')}`
}
