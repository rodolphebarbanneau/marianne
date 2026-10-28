import type { OpeningPeriod } from './types'

/** Opening hours: pure, shared by both sides. Days are numbered 1 (Monday) to 7 (Sunday). */

export const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** The day of a date, 1 = Monday, in the computer's time zone. */
export const dayOfWeek = (date: Date) => ((date.getDay() + 6) % 7) + 1

/** "08:30" → "8h30". */
export const spoken = (time: string) => time.replace(/^0(?=\d)/, '').replace(':', 'h')

const slotsText = (slots: OpeningPeriod['slots'], format: (time: string) => string) => slots.map((s) => `${format(s.from)}–${format(s.to)}`).join(', ')

/** French: "Du lundi au vendredi : 8h30–12h00, 13h30–15h00". */
export function periodLabel(from: number, to: number, slots: OpeningPeriod['slots']): string {
  const days = from === to ? DAYS[from - 1].replace(/^./, (c) => c.toUpperCase()) : `Du ${DAYS[from - 1]} au ${DAYS[to - 1]}`
  return `${days} : ${slots.length ? slotsText(slots, spoken) : 'horaires non précisés'}`
}

/** English, for the model: "Mon–Fri 08:30–12:00, 13:30–15:00 (note)". */
export function periodText(p: OpeningPeriod): string {
  const days = p.fromDay === p.toDay ? DAYS_EN[p.fromDay - 1] : `${DAYS_EN[p.fromDay - 1]}–${DAYS_EN[p.toDay - 1]}`
  return `${days} ${p.slots.length ? slotsText(p.slots, (t) => t) : 'hours not given'}${p.note ? ` (${p.note})` : ''}`
}

const covers = (p: OpeningPeriod, day: number) => day >= p.fromDay && day <= p.toDay

/**
 * The opening slots of a date's day, in order: empty when the office is closed that day; null
 * when its hours are unknown (none given, or a period of that day without times).
 */
export function dayHours(hours: OpeningPeriod[], date: Date): OpeningPeriod['slots'] | null {
  if (!hours.length) return null
  const periods = hours.filter((p) => covers(p, dayOfWeek(date)))
  if (periods.some((p) => !p.slots.length)) return null
  return periods.flatMap((p) => p.slots).sort((a, b) => a.from.localeCompare(b.from))
}

/** Whether the opening hours include this moment (in the computer's time zone). */
export function openAt(hours: OpeningPeriod[], date: Date): boolean {
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return hours.some((p) => covers(p, dayOfWeek(date)) && p.slots.some((s) => time >= s.from && time < s.to))
}

/** French: "8h30–12h00, 13h30–17h00". */
export const daySlotsLabel = (slots: OpeningPeriod['slots']) => slotsText(slots, spoken)
