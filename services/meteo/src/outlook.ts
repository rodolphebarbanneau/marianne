import { fallWord } from './sky'
import type { WeatherDay, WeatherHour, WeatherNow, WeatherQuarter } from './types'

/**
 * What is coming from the sky: rain now and until when, rain within the next two hours (AROME's
 * quarters of an hour, Météo-France's « pluie dans l'heure » in spirit), else the next rainy hour of
 * the day ahead. Pure: the tile says it in a line, the screen in a sentence, the tools to the model.
 */

/** A quarter of an hour with less than this (mm) is dry: 0.2 mm an hour. */
export const WET_QUARTER = 0.05
/** An hour with less than this (mm) is dry. */
export const WET_HOUR = 0.2
/** How far the outlook looks, in hours. */
export const LOOK_AHEAD_HOURS = 24

export type Intensity = 'dry' | 'light' | 'moderate' | 'heavy'

/** How hard it falls in a quarter of an hour (mm), by the rate it means: light under 2.5 mm an hour, heavy from 7.6, the usual thresholds. */
export function intensity(mm: number): Intensity {
  const rate = mm * 4
  if (mm < WET_QUARTER) return 'dry'
  if (rate < 2.5) return 'light'
  if (rate < 7.6) return 'moderate'
  return 'heavy'
}

export type Fall = NonNullable<ReturnType<typeof fallWord>>

export interface RainOutlook {
  /** It falls now; it will within the quarters; it will within the day ahead; it won't. */
  state: 'now' | 'soon' | 'later' | 'dry'
  /** What falls, « pluie » when the sky's code doesn't say. */
  fall: Fall
  /** Local time: when it stops (now; null when not within what is forecast), when it starts (soon, later), until when it stays dry (dry). */
  at: string | null
  /** The European model's chance of rain for the hour it starts (later). */
  chance: number | null
}

const fallOf = (code: number): Fall => fallWord(code) ?? 'pluie'

export function rainOutlook(now: WeatherNow | null, quarters: WeatherQuarter[], hours: WeatherHour[]): RainOutlook {
  const wetQuarter = (q: WeatherQuarter) => q.precipitation >= WET_QUARTER
  const wetHour = (h: WeatherHour) => h.precipitation >= WET_HOUR
  const ahead = hours.slice(0, LOOK_AHEAD_HOURS)
  const last = quarters[quarters.length - 1]
  // An hour that starts before the last quarter is told by the quarters, AROME's finer run.
  const after = (h: WeatherHour) => !last || h.time >= last.time

  const falling = quarters.length ? wetQuarter(quarters[0]) : !!now && (now.precipitation >= WET_QUARTER || fallWord(now.code) !== null)
  if (falling) {
    const fall = fallOf(quarters.length ? quarters[0].code : (now?.code ?? 0))
    // Wet through the quarters: the first dry hour after them.
    const stop = quarters.find((q) => !wetQuarter(q))?.time ?? ahead.find((h) => (!last || h.time > last.time) && !wetHour(h))?.time
    return { state: 'now', fall, at: stop ?? null, chance: null }
  }
  const soon = quarters.find(wetQuarter)
  if (soon) return { state: 'soon', fall: fallOf(soon.code), at: soon.time, chance: null }
  const later = ahead.find((h) => after(h) && wetHour(h))
  if (later) return { state: 'later', fall: fallOf(later.code), at: later.time, chance: later.precipitationChance }
  return { state: 'dry', fall: 'pluie', at: ahead[ahead.length - 1]?.time ?? null, chance: null }
}

/**
 * The day worth telling about: today until its sunset, then tomorrow, whose figures matter more by
 * then. `now`: a local time of the place.
 */
export function dayAhead(now: string, days: WeatherDay[]): { day: WeatherDay; tomorrow: boolean } | null {
  const [today, next] = days
  if (!today) return null
  const evening = !!now && !!today.sunset && !!next && now.slice(0, 10) === today.date && now.slice(11, 16) >= today.sunset
  return evening ? { day: next, tomorrow: true } : { day: today, tomorrow: false }
}
