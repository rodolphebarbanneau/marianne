import { query, type Commune, type ServiceGeo, type ServiceHttp } from '@marianne/sdk/main'
import { CREDIT } from './credits'
import { compass, weatherLabel } from './sky'
import type { Forecast, Model, Place, Weather, WeatherDay, WeatherHour, WeatherNow, WeatherQuarter } from './types'

/**
 * Météo: the Open-Meteo forecast API (free, no key, CC BY 4.0), asked for two models at once.
 * Météo-France's ("meteofrance_seamless": AROME at 1.5 to 2.5 km for two days, ARPEGE up to four,
 * AROME's 15-minute run for the next hours) while they cover the time; the European model (ECMWF IFS
 * at 0.25°) after, up to 15 days, and for the chance of rain, which Météo-France's models don't give.
 * One request for everything the screen, the tile and the tools show, so they share its cache.
 */

/** What the forecasts need of the service's context. */
export interface WeatherContext {
  http: Pick<ServiceHttp, 'json'>
  geo: Pick<ServiceGeo, 'getCommune'>
}

const API = 'https://api.open-meteo.com/v1/forecast'
const FRANCE = 'meteofrance_seamless'
const EUROPE = 'ecmwf_ifs025'

/** Today and the next 14 days: as far as the European model goes. */
export const FORECAST_DAYS = 15
/** The hours kept after the current one. */
export const NEXT_HOURS = 48
/** The quarters of an hour kept, the current one first: two hours. */
export const NEXT_QUARTERS = 8

const CURRENT = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'is_day'
]
const QUARTERLY = ['precipitation', 'weather_code']
const HOURLY = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation',
  'precipitation_probability',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'is_day'
]
const DAILY = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_min',
  'precipitation_sum',
  'precipitation_hours',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'wind_direction_10m_dominant',
  'sunrise',
  'sunset',
  'daylight_duration'
]

type Value = number | string | null
export interface RawForecast {
  latitude: number
  longitude: number
  elevation: number
  current?: Record<string, Value>
  minutely_15?: Record<string, Value[]>
  hourly?: Record<string, Value[]>
  daily?: Record<string, Value[]>
}

export const num = (v: Value | undefined) => (typeof v === 'number' ? v : Number(v) || 0)
export const has = (v: Value | undefined): v is number | string => v !== null && v !== undefined

/** With several models, Open-Meteo suffixes each variable with the model's name; with one, it doesn't. */
const series = (block: Record<string, Value[]>, key: string, model: string) => block[`${key}_${model}`] ?? block[key]

const modelOf = (model: string): Model => (model === FRANCE ? 'meteofrance' : 'ecmwf')

function mapNow(c: Record<string, Value> | undefined): WeatherNow | null {
  const current = (key: string) => c?.[`${key}_${FRANCE}`] ?? c?.[key] ?? c?.[`${key}_${EUROPE}`]
  if (!c || !has(current('temperature_2m'))) return null
  const code = num(current('weather_code'))
  return {
    time: String(c.time ?? ''),
    temperature: num(current('temperature_2m')),
    feelsLike: num(current('apparent_temperature')),
    humidity: num(current('relative_humidity_2m')),
    precipitation: num(current('precipitation')),
    code,
    label: weatherLabel(code),
    windSpeed: num(current('wind_speed_10m')),
    windGusts: num(current('wind_gusts_10m')),
    windDirection: num(current('wind_direction_10m')),
    windFrom: compass(num(current('wind_direction_10m'))),
    isDay: num(current('is_day')) === 1
  }
}

/** Météo-France's quarters only: the European model's are its hours cut in four, no finer than they are. */
function mapQuarters(block: Record<string, Value[]>, from: string): WeatherQuarter[] {
  const rain = block[`precipitation_${FRANCE}`] ?? (block[`precipitation_${EUROPE}`] ? undefined : block.precipitation)
  const codes = series(block, 'weather_code', FRANCE)
  return ((block.time ?? []) as string[])
    .flatMap((time, i): WeatherQuarter[] => {
      const mm = rain?.[i]
      return time >= from.slice(0, 16) && has(mm) ? [{ time, precipitation: Math.max(0, num(mm)), code: num(codes?.[i]) }] : []
    })
    .slice(0, NEXT_QUARTERS)
}

function mapHours(block: Record<string, Value[]>, after: string): WeatherHour[] {
  return ((block.time ?? []) as string[])
    .flatMap((time, i): WeatherHour[] => {
      // Local times of the same form: the current hour, which holds the conditions' time ("17:00" before "17:45"), is left out.
      if (time <= after) return []
      const model = has(series(block, 'temperature_2m', FRANCE)?.[i]) ? FRANCE : EUROPE
      const get = (key: string) => series(block, key, model)?.[i]
      if (!has(get('temperature_2m'))) return []
      const chance = get('precipitation_probability') ?? series(block, 'precipitation_probability', EUROPE)?.[i]
      return [
        {
          time,
          code: num(get('weather_code')),
          temperature: num(get('temperature_2m')),
          feelsLike: num(get('apparent_temperature')),
          precipitation: Math.max(0, num(get('precipitation'))),
          precipitationChance: has(chance) ? num(chance) : null,
          humidity: num(get('relative_humidity_2m')),
          windSpeed: num(get('wind_speed_10m')),
          windGusts: num(get('wind_gusts_10m')),
          windDirection: num(get('wind_direction_10m')),
          windFrom: compass(num(get('wind_direction_10m'))),
          isDay: num(get('is_day')) === 1,
          model: modelOf(model)
        }
      ]
    })
    .slice(0, NEXT_HOURS)
}

function mapDays(block: Record<string, Value[]>): WeatherDay[] {
  return ((block.time ?? []) as string[]).flatMap((date, i): WeatherDay[] => {
    // One model per day, so that the figures of a day agree; Météo-France when it has the day.
    const model = has(series(block, 'temperature_2m_max', FRANCE)?.[i]) ? FRANCE : EUROPE
    const get = (key: string) => series(block, key, model)?.[i]
    if (!has(get('temperature_2m_max'))) return []
    const chance = get('precipitation_probability_max') ?? series(block, 'precipitation_probability_max', EUROPE)?.[i]
    const code = num(get('weather_code'))
    return [
      {
        date,
        code,
        label: weatherLabel(code),
        min: num(get('temperature_2m_min')),
        max: num(get('temperature_2m_max')),
        feelsLikeMin: num(get('apparent_temperature_min')),
        feelsLikeMax: num(get('apparent_temperature_max')),
        precipitation: Math.max(0, num(get('precipitation_sum'))),
        precipitationHours: num(get('precipitation_hours')),
        precipitationChance: has(chance) ? num(chance) : null,
        windSpeed: num(get('wind_speed_10m_max')),
        windGusts: num(get('wind_gusts_10m_max')),
        windDirection: num(get('wind_direction_10m_dominant')),
        windFrom: compass(num(get('wind_direction_10m_dominant'))),
        sunrise: String(get('sunrise') ?? '').slice(11, 16),
        sunset: String(get('sunset') ?? '').slice(11, 16),
        daylight: num(get('daylight_duration')),
        model: modelOf(model)
      }
    ]
  })
}

export function mapWeather(raw: RawForecast): Weather {
  const now = mapNow(raw.current)
  const after = now?.time ?? ''
  return {
    latitude: raw.latitude,
    longitude: raw.longitude,
    elevation: raw.elevation,
    now,
    quarters: now ? mapQuarters(raw.minutely_15 ?? {}, now.time) : [],
    hours: mapHours(raw.hourly ?? {}, after),
    days: mapDays(raw.daily ?? {}),
    credit: CREDIT
  }
}

/** The Open-Meteo request for a place: the current conditions, the next quarters of an hour, hours and days. */
export const forecastUrl = (latitude: number, longitude: number) =>
  `${API}${query({
    latitude: latitude.toFixed(3),
    longitude: longitude.toFixed(3),
    current: CURRENT.join(','),
    minutely_15: QUARTERLY.join(','),
    hourly: HOURLY.join(','),
    daily: DAILY.join(','),
    models: `${FRANCE},${EUROPE}`,
    // Local time of the place (overseas too).
    timezone: 'auto',
    forecast_minutely_15: NEXT_QUARTERS,
    // The current hour too, which the mapping leaves out.
    forecast_hours: NEXT_HOURS + 1,
    forecast_days: FORECAST_DAYS
  })}`

/** The weather at a place. */
export async function weather(http: WeatherContext['http'], latitude: number, longitude: number): Promise<Weather> {
  return mapWeather(await http.json<RawForecast>(forecastUrl(latitude, longitude), { cacheMs: 15 * 60_000 }))
}

/**
 * AROME's 15-minute run covers metropolitan France and Corsica; overseas, Open-Meteo fills the
 * quarters from coarser hours, which say nothing of the next half hour.
 */
export const inArome = (department: string) => !department.startsWith('97')

export const placeOf = (c: Commune): Place => ({
  code: c.code,
  name: c.name,
  postalCodes: c.postalCodes,
  department: c.department,
  departmentName: c.departmentName
})

/** The weather of a commune, at its centre. */
export async function communeWeather(ctx: Pick<WeatherContext, 'http'>, commune: Commune): Promise<Forecast> {
  const w = await weather(ctx.http, commune.latitude, commune.longitude)
  return { ...w, quarters: inArome(commune.department) ? w.quarters : [], commune: placeOf(commune) }
}

/** The weather of a commune by INSEE code; null when there is no such commune. */
export async function communeForecast(ctx: WeatherContext, code: string): Promise<Forecast | null> {
  const commune = await ctx.geo.getCommune(code)
  return commune ? communeWeather(ctx, commune) : null
}
