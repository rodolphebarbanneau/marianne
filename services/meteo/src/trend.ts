import { query, type ServiceHttp } from '@marianne/sdk/main'
import { TREND_CREDIT } from './credits'
import type { Confidence, Spread, Trend, TrendDay } from './types'
import { FORECAST_DAYS, has, num } from './weather'

/**
 * The days to come as the European model's scenarios see them: Open-Meteo's ensemble API (free, no
 * key), ECMWF IFS at 0.25°, its control run and 50 others started from slightly different states.
 * Where most of them fall says how sure a figure is: beyond about a week they part, and a single
 * figure would claim more than the model knows.
 */

const API = 'https://ensemble-api.open-meteo.com/v1/ensemble'

/** A day with less than this (mm) is dry, as the chance of rain counts it. */
const RAINY_DAY = 1
/** Fewer scenarios than this say nothing of a spread. */
const FEWEST = 3

type Value = number | string | null
export interface RawEnsemble {
  daily?: Record<string, Value[]>
}

export const trendUrl = (latitude: number, longitude: number) =>
  `${API}${query({
    latitude: latitude.toFixed(3),
    longitude: longitude.toFixed(3),
    models: 'ecmwf_ifs025',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    timezone: 'auto',
    forecast_days: FORECAST_DAYS
  })}`

/** The value below which a share `p` of sorted values fall, read between the two nearest. */
export function quantile(sorted: number[], p: number): number {
  const at = (sorted.length - 1) * p
  const [lo, hi] = [Math.floor(at), Math.ceil(at)]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo)
}

const tenth = (n: number) => Math.round(n * 10) / 10

/** Eight scenarios in ten between `low` and `high`. */
export function spreadOf(values: number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b)
  return { low: tenth(quantile(sorted, 0.1)), mid: tenth(quantile(sorted, 0.5)), high: tenth(quantile(sorted, 0.9)) }
}

/**
 * How far the scenarios agree on a day: on the afternoon's temperature (within 3 degrees, 6) and on
 * whether it rains (a share of rainy scenarios between three and seven in ten is no answer).
 */
export function confidenceOf(max: Spread, rain: number): Confidence {
  const spread = max.high - max.low
  if (spread > 6) return 'low'
  if (spread > 3 || (rain > 0.3 && rain < 0.7)) return 'medium'
  return 'high'
}

/** Every run of a variable: the control (`temperature_2m_max`) and the members (`temperature_2m_max_member01`…). */
const runs = (daily: Record<string, Value[]>, key: string) =>
  Object.entries(daily)
    .filter(([name]) => name === key || new RegExp(`^${key}_member\\d+$`).test(name))
    .map(([, values]) => values)

export function mapTrend(raw: RawEnsemble): Trend {
  const daily = raw.daily ?? {}
  const [maxes, mins, rains] = [runs(daily, 'temperature_2m_max'), runs(daily, 'temperature_2m_min'), runs(daily, 'precipitation_sum')]
  const on = (all: Value[][], i: number) =>
    all
      .map((values) => values[i])
      .filter(has)
      .map(num)
  const days = ((daily.time ?? []) as string[]).flatMap((date, i): TrendDay[] => {
    const [max, min, rain] = [on(maxes, i), on(mins, i), on(rains, i)]
    if (max.length < FEWEST || min.length < FEWEST) return []
    const share = rain.length ? Math.round((rain.filter((mm) => mm >= RAINY_DAY).length / rain.length) * 100) / 100 : 0
    const high = spreadOf(max)
    return [{ date, max: high, min: spreadOf(min), rain: share, confidence: confidenceOf(high, share) }]
  })
  return { members: on(maxes, 0).length, days, credit: TREND_CREDIT }
}

/** The scenarios at a place; they come four times a day, so they are kept an hour. */
export async function trend(http: Pick<ServiceHttp, 'json'>, latitude: number, longitude: number): Promise<Trend> {
  return mapTrend(await http.json<RawEnsemble>(trendUrl(latitude, longitude), { cacheMs: 60 * 60_000 }))
}
