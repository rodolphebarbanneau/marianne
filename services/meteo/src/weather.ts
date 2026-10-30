import { query, table, type Commune, type ServiceGeo, type ServiceHttp } from '@marianne/sdk/main'
import type { Forecast, Place, Weather, WeatherDay, WeatherHour, WeatherNow } from './types'

/**
 * Météo: the Open-Meteo forecast API (free, no key). Météo-France's models (AROME, ARPEGE,
 * "meteofrance_seamless") cover the first four days; the European model (ECMWF IFS) the rest of
 * the week, and the chance of rain, which Météo-France's models don't give.
 */

/** What the forecasts need of the service's context. */
export interface WeatherContext {
  http: Pick<ServiceHttp, 'json'>
  geo: Pick<ServiceGeo, 'getCommune'>
}

const API = 'https://api.open-meteo.com/v1/forecast'
const FRANCE = 'meteofrance_seamless'
const EUROPE = 'ecmwf_ifs025'

export const CREDIT = 'Prévisions Météo-France (AROME, ARPEGE) et CEPMMT, via Open-Meteo (CC BY 4.0)'
export const SOURCE_URL = 'https://open-meteo.com/en/docs/meteofrance-api'

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
const DAILY = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'wind_direction_10m_dominant',
  'sunrise',
  'sunset'
]
const HOURLY = ['weather_code']
/** The hours kept after the current one. */
const NEXT_HOURS = 24

/** WMO weather codes, in French. */
export const WMO_LABELS: Record<number, string> = {
  0: 'Ciel dégagé',
  1: 'Plutôt dégagé',
  2: 'Partiellement nuageux',
  3: 'Couvert',
  45: 'Brouillard',
  48: 'Brouillard givrant',
  51: 'Bruine légère',
  53: 'Bruine',
  55: 'Bruine dense',
  56: 'Bruine verglaçante',
  57: 'Bruine verglaçante dense',
  61: 'Pluie faible',
  63: 'Pluie',
  65: 'Pluie forte',
  66: 'Pluie verglaçante',
  67: 'Pluie verglaçante forte',
  71: 'Neige faible',
  73: 'Neige',
  75: 'Neige forte',
  77: 'Grains de neige',
  80: 'Averses',
  81: 'Averses modérées',
  82: 'Averses violentes',
  85: 'Averses de neige',
  86: 'Fortes averses de neige',
  95: 'Orage',
  96: 'Orage avec grêle',
  99: 'Orage avec forte grêle'
}

export const weatherLabel = (code: number) => WMO_LABELS[code] ?? 'Temps indéterminé'

/** Which of the eight compass points a direction is closest to. */
const point = (degrees: number) => Math.round((((degrees % 360) + 360) % 360) / 45) % 8

/** The compass point the wind blows from, in French ("NO"). */
export const compass = (degrees: number) => ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][point(degrees)]

/** The same in English ("NW"), for the model. */
const compassEn = (degrees: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][point(degrees)]

type Value = number | string | null
export interface RawForecast {
  latitude: number
  longitude: number
  elevation: number
  current?: Record<string, Value>
  daily?: Record<string, Value[]>
  hourly?: Record<string, Value[]>
}

const num = (v: Value | undefined) => (typeof v === 'number' ? v : Number(v) || 0)
const has = (v: Value | undefined): v is number | string => v !== null && v !== undefined

/** With several models, Open-Meteo suffixes each variable with the model's name. */
const series = (daily: Record<string, Value[]>, key: string, model: string) => daily[`${key}_${model}`] ?? daily[key]

export function mapWeather(raw: RawForecast): Weather {
  const c = raw.current
  const current = (key: string) => c?.[`${key}_${FRANCE}`] ?? c?.[key] ?? c?.[`${key}_${EUROPE}`]
  const now: WeatherNow | null =
    c && has(current('temperature_2m'))
      ? {
          time: String(c.time ?? ''),
          temperature: num(current('temperature_2m')),
          feelsLike: num(current('apparent_temperature')),
          humidity: num(current('relative_humidity_2m')),
          precipitation: num(current('precipitation')),
          code: num(current('weather_code')),
          label: weatherLabel(num(current('weather_code'))),
          windSpeed: num(current('wind_speed_10m')),
          windGusts: num(current('wind_gusts_10m')),
          windDirection: num(current('wind_direction_10m')),
          windFrom: compass(num(current('wind_direction_10m'))),
          isDay: num(current('is_day')) === 1
        }
      : null
  const daily = raw.daily ?? {}
  const days = ((daily.time ?? []) as string[]).flatMap((date, i): WeatherDay[] => {
    // One model per day, so that the figures of a day agree; Météo-France when it has the day.
    const model = has(series(daily, 'temperature_2m_max', FRANCE)?.[i]) ? FRANCE : EUROPE
    const get = (key: string) => series(daily, key, model)?.[i]
    if (!has(get('temperature_2m_max'))) return []
    const chance = get('precipitation_probability_max') ?? series(daily, 'precipitation_probability_max', EUROPE)?.[i]
    const code = num(get('weather_code'))
    return [
      {
        date,
        code,
        label: weatherLabel(code),
        min: num(get('temperature_2m_min')),
        max: num(get('temperature_2m_max')),
        precipitation: num(get('precipitation_sum')),
        precipitationChance: has(chance) ? num(chance) : null,
        windSpeed: num(get('wind_speed_10m_max')),
        windGusts: num(get('wind_gusts_10m_max')),
        windDirection: num(get('wind_direction_10m_dominant')),
        windFrom: compass(num(get('wind_direction_10m_dominant'))),
        sunrise: String(get('sunrise') ?? '').slice(11, 16),
        sunset: String(get('sunset') ?? '').slice(11, 16),
        model: model === FRANCE ? 'meteofrance' : 'ecmwf'
      }
    ]
  })
  const hourly = raw.hourly ?? {}
  // Local times of the same form: the current hour, which holds `now.time` ("17:00" before "17:45"), is left out.
  const after = now?.time ?? ''
  const hours = ((hourly.time ?? []) as string[])
    .flatMap((time, i): WeatherHour[] => {
      const code = series(hourly, 'weather_code', FRANCE)?.[i] ?? series(hourly, 'weather_code', EUROPE)?.[i]
      return time > after && has(code) ? [{ time, code: num(code) }] : []
    })
    .slice(0, NEXT_HOURS)
  return { latitude: raw.latitude, longitude: raw.longitude, elevation: raw.elevation, now, days, hours, credit: CREDIT }
}

/** The Open-Meteo request for the current conditions, the hours to come and the next seven days at a place. */
export const forecastUrl = (latitude: number, longitude: number) =>
  `${API}${query({
    latitude: latitude.toFixed(3),
    longitude: longitude.toFixed(3),
    current: CURRENT.join(','),
    daily: DAILY.join(','),
    hourly: HOURLY.join(','),
    models: `${FRANCE},${EUROPE}`,
    // Local time of the place (overseas too).
    timezone: 'auto',
    forecast_days: 7
  })}`

/** The current conditions and the next seven days at a place. */
export async function weather(http: WeatherContext['http'], latitude: number, longitude: number): Promise<Weather> {
  return mapWeather(await http.json<RawForecast>(forecastUrl(latitude, longitude), { cacheMs: 15 * 60_000 }))
}

export const placeOf = (c: Commune): Place => ({
  code: c.code,
  name: c.name,
  postalCodes: c.postalCodes,
  department: c.department,
  departmentName: c.departmentName
})

/** The weather of a commune, at its centre. */
export async function communeWeather(ctx: WeatherContext, commune: Commune): Promise<Forecast> {
  return { ...(await weather(ctx.http, commune.latitude, commune.longitude)), commune: placeOf(commune) }
}

/** The weather of a commune by INSEE code; null when there is no such commune. */
export async function communeForecast(ctx: WeatherContext, code: string): Promise<Forecast | null> {
  const commune = await ctx.geo.getCommune(code)
  return commune ? communeWeather(ctx, commune) : null
}

const MODELS: Record<WeatherDay['model'], string> = { meteofrance: 'Météo-France (AROME, ARPEGE)', ecmwf: 'ECMWF IFS' }

const tenth = (n: number) => String(Math.round(n * 10) / 10)
const hundredth = (n: number) => String(Math.round(n * 100) / 100)
const whole = (n: number) => String(Math.round(n))
/** "Thu 2026-10-29": the weekday of a calendar date, whatever the computer's time zone. */
const weekday = (date: string) => `${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} ${date}`

/** A forecast for the model: compact Markdown, with the model of each day and the credit to cite. */
export function describeForecast(f: Forecast): string {
  const c = f.commune
  const lines = [
    `## Weather in ${c.name} (INSEE ${c.code}${c.departmentName ? `, ${c.departmentName}` : ''})`,
    `At the commune's centre (${hundredth(f.latitude)}, ${hundredth(f.longitude)}, elevation ${whole(f.elevation)} m); local times; weather labels in French.`
  ]
  if (f.now) {
    const n = f.now
    lines.push(
      '',
      `**Now** (${n.time.replace('T', ' ')}): ${tenth(n.temperature)} °C, feels like ${tenth(n.feelsLike)} °C · ${n.label} · humidity ${whole(n.humidity)} % · ` +
        `wind from ${compassEn(n.windDirection)} ${whole(n.windSpeed)} km/h, gusts ${whole(n.windGusts)} km/h · precipitation ${tenth(n.precipitation)} mm`
    )
  }
  lines.push(
    '',
    f.days.length
      ? table(
          ['day', 'weather', 'min °C', 'max °C', 'rain mm', 'chance of rain', 'wind km/h', 'gusts km/h', 'sunrise', 'sunset', 'model'],
          f.days.map((d) => [
            weekday(d.date),
            d.label,
            tenth(d.min),
            tenth(d.max),
            tenth(d.precipitation),
            d.precipitationChance === null ? '' : `${whole(d.precipitationChance)} %`,
            `${compassEn(d.windDirection)} ${whole(d.windSpeed)}`,
            whole(d.windGusts),
            d.sunrise,
            d.sunset,
            MODELS[d.model]
          ])
        )
      : 'No daily forecast for this place.',
    '',
    `Credit (cite it): ${f.credit} · ${SOURCE_URL}`
  )
  return lines.join('\n')
}
