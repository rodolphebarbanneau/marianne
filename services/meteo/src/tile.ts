import { cutText, TILE_LIMITS, type HomeCommune, type PaletteColor, type ServiceTile, type TileBar } from '@marianne/sdk/main'
import type { Weather, WeatherHour, WeatherNow } from './types'
import { weather, type WeatherContext } from './weather'

/**
 * 3615 METEO's tile on the Services page: the temperature now in the user's commune and what is
 * coming (« averses à 16 h »), the highs of the next days coloured by their weather, the wind.
 * Pure but for `meteoTile`, which asks the forecast.
 */

/** Today and the four days after. */
const DAYS_SHOWN = 5
/** Under this many characters left for the commune's name, the unit is the name alone. */
const MIN_NAME = 10

/** The tile while the profile has no address: where to give it. */
export const NO_HOME_TILE: ServiceTile = {
  title: 'votre commune ?',
  lines: [{ text: 'renseignez votre adresse dans Réglages › Identité', tone: 'dim' }]
}

const WEEKDAYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']

/** "jeu": the weekday of a calendar date, whatever the computer's time zone. */
export const weekday = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]

/** "14°", never "-0°". */
export const shortDegrees = (n: number) => `${Math.round(n) || 0}°`

const isSnow = (code: number) => (code >= 71 && code <= 77) || code === 85 || code === 86

/**
 * A day's colour, from its WMO code: yellow when the sun shows (clear to partly cloudy), white for
 * snow, cyan for rain of any kind (drizzle, showers, storms), light grey for the rest (overcast, fog).
 */
export function dayColor(code: number): PaletteColor {
  if (code <= 2) return 'jaune'
  if (isSnow(code)) return 'blanc'
  if (code >= 51) return 'cyan'
  return 'gris-clair'
}

/** The weather worth telling, in a word (« averses »); null for a dry hour, sunny or cloudy. */
export function weatherWord(code: number): string | null {
  if (code === 45 || code === 48) return 'brouillard'
  if (isSnow(code)) return 'neige'
  if (code >= 51 && code <= 57) return 'bruine'
  if (code >= 61 && code <= 67) return 'pluie'
  if (code >= 80 && code <= 82) return 'averses'
  if (code >= 95) return 'orage'
  return null
}

/** "16 h", from a local time of the place. */
const hourOf = (time: string) => `${Number(time.slice(11, 13))} h`

/**
 * What is coming in the next hours, in a few words: the weather that starts (« averses à 16 h »,
 * « neige demain à 7 h ») or stops (« pluie jusqu’à 18 h »); else the weather now (« ciel dégagé »).
 */
export function coming(now: WeatherNow, hours: WeatherHour[]): string {
  // The hours go up to the same time tomorrow.
  const tomorrow = (h: WeatherHour) => (h.time.slice(0, 10) === now.time.slice(0, 10) ? '' : 'demain ')
  const word = weatherWord(now.code)
  if (word) {
    const stop = hours.find((h) => !weatherWord(h.code))
    if (stop) return `${word} jusqu’à ${tomorrow(stop)}${hourOf(stop.time)}`
  } else {
    const start = hours.find((h) => weatherWord(h.code))
    if (start) return `${weatherWord(start.code)} ${tomorrow(start)}à ${hourOf(start.time)}`
  }
  return now.label.charAt(0).toLowerCase() + now.label.slice(1)
}

/** "Rennes · averses à 16 h": a long name is cut rather than what is coming. */
export function unitOf(name: string, event: string): string {
  const tail = ` · ${event}`
  const room = TILE_LIMITS.unit - [...tail].length
  return room >= MIN_NAME ? `${cutText(name, room)}${tail}` : cutText(name, TILE_LIMITS.unit)
}

/** The tile of a commune's weather; null without anything to show. */
export function weatherTile(name: string, w: Weather): ServiceTile | null {
  const bars = w.days.slice(0, DAYS_SHOWN).map((d): TileBar => ({ value: d.max, label: weekday(d.date), text: shortDegrees(d.max), color: dayColor(d.code) }))
  if (!w.now && !bars.length) return null
  // The wind now, else the day's strongest.
  const wind = w.now ?? w.days[0]
  return {
    ...(w.now ? { value: { text: shortDegrees(w.now.temperature), unit: unitOf(name, coming(w.now, w.hours)) } } : { title: cutText(name, TILE_LIMITS.title) }),
    ...(bars.length ? { visual: { kind: 'bars' as const, bars } } : {}),
    lines: [{ text: `vent ${Math.round(wind.windSpeed)} km/h, rafales ${Math.round(wind.windGusts)}`, tone: 'dim' }]
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
  return commune ? weatherTile(commune.name, await weather(ctx.http, commune.latitude, commune.longitude)) : null
}
