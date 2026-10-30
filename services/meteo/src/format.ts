import type { PaletteColor } from '@marianne/sdk'
import type { Intensity, RainOutlook } from './outlook'
import type { Confidence, Pollen } from './types'

/** How the screen and the tile write the weather, in French. Pure. */

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/** The weekday of a calendar date ("2026-10-30": 5), whatever the computer's time zone. */
const weekdayOf = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`).getUTCDay()

/** "jeu": the short weekday of a calendar date. */
export const weekday = (date: string) => WEEKDAYS[weekdayOf(date)].slice(0, 3)

/** "aujourd’hui", "demain", then "vendredi 30" (« 1er » for the first of a month): the days of a forecast, the first being today at the place. */
export function dayName(date: string, index: number): string {
  if (index === 0) return 'aujourd’hui'
  if (index === 1) return 'demain'
  const day = Number(date.slice(8, 10))
  return `${WEEKDAYS[weekdayOf(date)]} ${day === 1 ? '1er' : day}`
}

/** "ven. 30": a day in a narrow column. */
export function shortDay(date: string): string {
  const day = Number(date.slice(8, 10))
  return `${weekday(date)}. ${day === 1 ? '1er' : day}`
}

/** "16,6 °C", never "-0 °C". */
export function degrees(n: number, digits = 0): string {
  const rounded = Math.round(n * 10 ** digits) / 10 ** digits || 0
  return `${rounded.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} °C`
}

/** "14°", never "-0°". */
export const shortDegrees = (n: number) => `${Math.round(n) || 0}°`

/** "NO 21 km/h" */
export const wind = (from: string, speed: number) => `${from} ${Math.round(speed)} km/h`

/** "4,2 mm"; "0 mm" for a trace. */
export const millimetres = (n: number) => `${(Math.round(n * 10) / 10 || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mm`

/** "40 %" */
export const percent = (n: number) => `${Math.round(n)} %`

/** "16 h", "16 h 30": the clock of a local time ("2026-10-28T16:30", or "16:30" alone). */
export function clock(time: string): string {
  const hm = time.length > 5 ? time.slice(11, 16) : time
  const [h, m] = [Number(hm.slice(0, 2)), hm.slice(3, 5)]
  return m && m !== '00' ? `${h} h ${m}` : `${h} h`
}

/** "10 h 16": a length of daylight, from seconds. */
export function hoursLong(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

/** Minutes from one local time to another of the same place. */
export function minutesBetween(from: string, to: string): number {
  const at = (t: string) => Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10), +t.slice(11, 13), +t.slice(14, 16) || 0)
  return Math.round((at(to) - at(from)) / 60_000)
}

/** "", "demain ", "samedi ": the day of a time to come, said from now (both local times of the place). */
function dayFrom(time: string, now: string): string {
  const days = Math.round(minutesBetween(`${now.slice(0, 10)}T00:00`, `${time.slice(0, 10)}T00:00`) / 1440)
  if (days <= 0) return ''
  if (days === 1) return 'demain '
  return `${WEEKDAYS[weekdayOf(time)]} `
}

/** "vers 16 h", "demain vers 7 h": an hour to come, said from now. */
export const around = (time: string, now: string) => `${dayFrom(time, now)}vers ${clock(time)}`

/** "d’ici 19 h", "d’ici demain 17 h". */
const until = (time: string, now: string) => `d’ici ${dayFrom(time, now)}${clock(time)}`

/**
 * The rain to come, in a few words: « pluie jusqu’à 17 h 30 », « averses dans 30 min », « pluie
 * demain vers 7 h (80 %) », « pas de pluie d’ici demain 17 h ». `now`: the local time of the
 * current conditions.
 */
export function rainLine(o: RainOutlook, now: string): string {
  if (o.state === 'now') return o.at ? `${o.fall} jusqu’à ${dayFrom(o.at, now)}${clock(o.at)}` : `${o.fall} pour les prochaines heures`
  if (o.state === 'soon' && o.at) {
    const minutes = minutesBetween(now, o.at)
    return minutes <= 60 ? `${o.fall} dans ${Math.max(15, minutes)} min` : `${o.fall} dès ${clock(o.at)}`
  }
  if (o.state === 'later' && o.at) return `${o.fall} ${around(o.at, now)}${o.chance !== null ? ` (${percent(o.chance)})` : ''}`
  return o.at ? `pas de pluie ${until(o.at, now)}` : 'pas de pluie prévue'
}

export const INTENSITY_LABELS: Record<Intensity, string> = { dry: 'sec', light: 'faible', moderate: 'modérée', heavy: 'forte' }

/** A quarter's colour, by how hard it falls; snow white. Null: dry, an empty cell. */
export function intensityColor(level: Intensity, snow = false): PaletteColor | null {
  if (level === 'dry') return null
  if (snow) return 'blanc'
  return level === 'light' ? 'cyan-pale' : level === 'moderate' ? 'cyan' : 'bleu'
}

export interface Level {
  label: string
  color: PaletteColor
}

/**
 * The European air quality index in words, with the bands France's own index (ATMO) has used
 * since 2021: bon, moyen, dégradé, mauvais, très mauvais, extrêmement mauvais.
 */
export function airLevel(aqi: number): Level {
  if (aqi < 20) return { label: 'bon', color: 'cyan' }
  if (aqi < 40) return { label: 'moyen', color: 'vert' }
  if (aqi < 60) return { label: 'dégradé', color: 'jaune' }
  if (aqi < 80) return { label: 'mauvais', color: 'rouge' }
  if (aqi < 100) return { label: 'très mauvais', color: 'rouge-sombre' }
  return { label: 'extrêmement mauvais', color: 'magenta' }
}

/** The UV index in the World Health Organization's words: faible to 2, modéré to 5, élevé to 7, très élevé to 10, extrême beyond. */
export function uvLevel(uv: number): Level {
  const n = Math.round(uv)
  if (n <= 2) return { label: 'faible', color: 'vert' }
  if (n <= 5) return { label: 'modéré', color: 'jaune' }
  if (n <= 7) return { label: 'élevé', color: 'rouge-clair' }
  if (n <= 10) return { label: 'très élevé', color: 'rouge' }
  return { label: 'extrême', color: 'magenta' }
}

export const POLLEN_LABELS: Record<Pollen, string> = {
  alder: 'aulne',
  birch: 'bouleau',
  grass: 'graminées',
  mugwort: 'armoise',
  olive: 'olivier',
  ragweed: 'ambroisie'
}

export const CONFIDENCE_LABELS: Record<Confidence, string> = { high: 'bonne', medium: 'moyenne', low: 'faible' }

/** "12 à 17°", or "15°" when the scenarios agree to the degree. */
export function range(low: number, high: number): string {
  const [a, b] = [Math.round(low) || 0, Math.round(high) || 0]
  return a === b ? `${a}°` : `${a} à ${b}°`
}
