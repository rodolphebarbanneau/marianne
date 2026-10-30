import { query, type ServiceHttp } from '@marianne/sdk/main'
import { AIR_CREDIT } from './credits'
import type { AirDay, AirQuality, Pollen } from './types'
import { has, num } from './weather'

/**
 * Air quality, UV and pollen: Open-Meteo's air quality API (free, no key), from the Copernicus
 * Atmosphere Monitoring Service (CAMS): its European model (11 km, four days, pollen in season)
 * where it reaches, its global one elsewhere. Neither of the weather models gives the UV index.
 */

const API = 'https://air-quality-api.open-meteo.com/v1/air-quality'

/** CAMS's European model forecasts four days. */
export const AIR_DAYS = 4

/** The pollens, by the name of their variable. */
export const POLLENS: Record<Pollen, string> = {
  alder: 'alder_pollen',
  birch: 'birch_pollen',
  grass: 'grass_pollen',
  mugwort: 'mugwort_pollen',
  olive: 'olive_pollen',
  ragweed: 'ragweed_pollen'
}

/** Under one grain per m³, a pollen is not in the air. */
const POLLEN_FLOOR = 1

type Value = number | string | null
export interface RawAir {
  current?: Record<string, Value>
  hourly?: Record<string, Value[]>
}

export const airUrl = (latitude: number, longitude: number) =>
  `${API}${query({
    latitude: latitude.toFixed(3),
    longitude: longitude.toFixed(3),
    current: 'european_aqi,uv_index',
    hourly: ['european_aqi', 'uv_index', ...Object.values(POLLENS)].join(','),
    timezone: 'auto',
    forecast_days: AIR_DAYS
  })}`

/** The highest of the values given; null when none is. */
const highest = (values: Value[]) => {
  const given = values.filter(has).map(num)
  return given.length ? Math.max(...given) : null
}

export function mapAir(raw: RawAir): AirQuality {
  const hourly = raw.hourly ?? {}
  const times = (hourly.time ?? []) as string[]
  const dates = [...new Set(times.map((t) => t.slice(0, 10)))]
  const days = dates.map((date): AirDay => {
    const at = times.flatMap((t, i) => (t.startsWith(date) ? [i] : []))
    const of = (key: string) => highest(at.map((i) => hourly[key]?.[i] ?? null))
    const pollen: AirDay['pollen'] = {}
    for (const [name, key] of Object.entries(POLLENS) as Array<[Pollen, string]>) {
      const most = of(key)
      if (most !== null && most >= POLLEN_FLOOR) pollen[name] = Math.round(most)
    }
    const uv = of('uv_index')
    return { date, aqi: of('european_aqi'), uv: uv === null ? null : Math.round(uv * 10) / 10, pollen }
  })
  const c = raw.current ?? {}
  return {
    time: String(c.time ?? ''),
    aqi: has(c.european_aqi) ? num(c.european_aqi) : null,
    uv: has(c.uv_index) ? Math.round(num(c.uv_index) * 10) / 10 : null,
    days,
    credit: AIR_CREDIT
  }
}

/** The air at a place; its model moves once a day, so it is kept longer than the weather. */
export async function air(http: Pick<ServiceHttp, 'json'>, latitude: number, longitude: number): Promise<AirQuality> {
  return mapAir(await http.json<RawAir>(airUrl(latitude, longitude), { cacheMs: 30 * 60_000 }))
}
