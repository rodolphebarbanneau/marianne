/**
 * Paris time: the agendas and calendars of public life are in it, whatever the computer's
 * time zone.
 */

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
  return `${day}T${hms}${parisOffset(new Date(`${day}T${hms}Z`))}`
}

/** The day after a YYYY-MM-DD. */
export function nextDay(day: string, days = 1): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/** "lundi 2 novembre", "1er novembre": a YYYY-MM-DD in French. */
export function frenchDay(day: string, weekday = false): string {
  const d = new Date(`${day}T12:00:00Z`)
  const date = d.getUTCDate()
  return `${weekday ? `${WEEKDAYS[d.getUTCDay()]} ` : ''}${date === 1 ? '1er' : date} ${MONTHS[d.getUTCMonth()]}`
}

/** Month number (1–12) of a French month name, full or abbreviated ("janv.", "févr", "août"). */
export function frenchMonth(word: string): number {
  const w = word.toLowerCase().normalize('NFD').replace(/[̀-ͯ.]/g, '')
  if (w.length < 3) return 0
  return MONTHS.findIndex((m) => m.normalize('NFD').replace(/[̀-ͯ]/g, '').startsWith(w)) + 1
}

/** "28 octobre 2026", "1er nov. 2026" → YYYY-MM-DD; empty when it isn't a date. */
export function parseFrenchDate(text: string, year?: number): string {
  const m = text.match(/(\d{1,2})(?:er)?\s+(\p{L}+)\.?(?:\s+(\d{4}))?/u)
  if (!m) return ''
  const month = frenchMonth(m[2])
  const y = m[3] ? Number(m[3]) : year
  if (!month || !y) return ''
  return `${y}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}
