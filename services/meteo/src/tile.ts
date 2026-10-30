import { cutText, TILE_LIMITS, type HomeCommune, type ServiceTile, type TileBar, type TileLine } from '@marianne/sdk/main'
import { around, rainLine, shortDegrees, weekday } from './format'
import { dayAhead, rainOutlook } from './outlook'
import { skyColor } from './sky'
import type { Weather } from './types'
import { communeWeather, type WeatherContext } from './weather'

/**
 * 3615 METEO's tile on the Services page, read in a second: the temperature now and the sky in
 * words; the week as bars, each day's high rising from the week's coldest low so that a colder day
 * shows lower, coloured by its sky (yellow sun, grey cloud, cyan rain, white snow, magenta storm);
 * then the rain to come (« pluie dans 30 min ») and the day's low and high, or what to watch out
 * for in the next 24 hours (strong gusts, frost, heat). Pure but for `meteoTile`, which asks the
 * forecast.
 */

/** Today and the six days after: the bars a tile holds. */
const DAYS_SHOWN = TILE_LIMITS.bars
/** Under this many characters left for the commune's name, the unit is the name alone. */
const MIN_NAME = 10
/** km/h: gusts that bring down branches, worth a line. */
const STRONG_GUSTS = 70
/** km/h: gusts worth adding to the day's line. */
const NOTABLE_GUSTS = 50
/** °C: a heat worth a line. */
const HEAT = 35

/** The tile while the profile has no address: where to give it. */
export const NO_HOME_TILE: ServiceTile = {
  title: 'votre commune ?',
  lines: [{ text: 'renseignez votre adresse dans Réglages › Identité', tone: 'dim' }]
}

/** "auj." for today, then "sam", "dim": the bars' labels. */
export const barLabel = (date: string, index: number) => (index === 0 ? 'auj.' : weekday(date))

/** "Rennes · averses": a long name is cut rather than the sky. */
export function unitOf(name: string, sky: string): string {
  const tail = ` · ${sky}`
  const room = TILE_LIMITS.unit - [...tail].length
  return room >= MIN_NAME ? `${cutText(name, room)}${tail}` : cutText(name, TILE_LIMITS.unit)
}

/** The rain to come; urgent-looking only when it falls now or within the next two hours. */
export function rainTileLine(w: Weather): TileLine | null {
  if (!w.now) return null
  const o = rainOutlook(w.now, w.quarters, w.hours)
  return { text: rainLine(o, w.now.time), ...(o.state === 'now' || o.state === 'soon' ? { tone: 'accent' as const } : {}) }
}

/** What to watch out for in the next 24 hours (strong gusts, frost, heat), else the day's low and high: today's until sunset, then tomorrow's. */
export function dayTileLine(w: Weather): TileLine | null {
  const now = w.now?.time ?? w.hours[0]?.time ?? ''
  const ahead = w.hours.slice(0, 24)
  if (now && ahead.length) {
    const gusty = ahead.reduce((a, b) => (b.windGusts > a.windGusts ? b : a))
    if (gusty.windGusts >= STRONG_GUSTS) return { text: `rafales jusqu’à ${Math.round(gusty.windGusts)} km/h ${around(gusty.time, now)}`, tone: 'accent' }
    const cold = ahead.reduce((a, b) => (b.temperature < a.temperature ? b : a))
    if (cold.temperature <= 0) return { text: `gelée : ${shortDegrees(cold.temperature)} ${around(cold.time, now)}`, tone: 'accent' }
    const hot = ahead.reduce((a, b) => (b.temperature > a.temperature ? b : a))
    if (hot.temperature >= HEAT) return { text: `forte chaleur : ${shortDegrees(hot.temperature)} ${around(hot.time, now)}`, tone: 'accent' }
  }
  const told = dayAhead(now, w.days)
  if (!told) return null
  const { day, tomorrow } = told
  const gusts = day.windGusts >= NOTABLE_GUSTS ? ` · rafales ${Math.round(day.windGusts)} km/h` : ''
  return { text: `${tomorrow ? 'demain' : 'aujourd’hui'} ${shortDegrees(day.min)} / ${shortDegrees(day.max)}${gusts}`, tone: 'dim' }
}

/** The tile of a commune's weather; null without anything to show. */
export function weatherTile(name: string, w: Weather): ServiceTile | null {
  const week = w.days.slice(0, DAYS_SHOWN)
  if (!w.now && !week.length) return null
  const bars = week.map((d, i): TileBar => ({ value: d.max, label: barLabel(d.date, i), text: shortDegrees(d.max), color: skyColor(d.code) }))
  // From the week's coldest low to its warmest high: from 0, a week of 15 to 18° would draw seven equal bars.
  const low = Math.floor(Math.min(...week.map((d) => d.min)))
  const high = Math.ceil(Math.max(...week.map((d) => d.max)))
  const lines = [rainTileLine(w), dayTileLine(w)].filter((l): l is TileLine => !!l)
  return {
    ...(w.now
      ? { value: { text: shortDegrees(w.now.temperature), unit: unitOf(name, w.now.label.toLowerCase()) } }
      : { title: cutText(name, TILE_LIMITS.title) }),
    ...(bars.length ? { visual: { kind: 'bars' as const, bars, ...(low < high ? { range: [low, high] as [number, number] } : {}) } } : {}),
    ...(lines.length ? { lines } : {})
  }
}

/**
 * The tile of the user's commune, at its centre as the screen shows it (the same request, so the
 * same answer while it is cached); a commune Marianne doesn't know: the default tile.
 */
export async function meteoTile(ctx: WeatherContext & { home(): HomeCommune | null }): Promise<ServiceTile | null> {
  const home = ctx.home()
  if (!home) return NO_HOME_TILE
  const commune = await ctx.geo.getCommune(home.code)
  return commune ? weatherTile(commune.name, await communeWeather(ctx, commune)) : null
}
