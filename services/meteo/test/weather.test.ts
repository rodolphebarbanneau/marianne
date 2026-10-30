import { describe, expect, it } from 'vitest'
import { airUrl, mapAir } from '../src/air'
import { confidenceOf, mapTrend, quantile, spreadOf, trendUrl } from '../src/trend'
import { communeWeather, forecastUrl, inArome, mapWeather } from '../src/weather'
import { AIR_FIXTURE, BORDEAUX, ENSEMBLE_FIXTURE, FIXTURE, FORT_DE_FRANCE } from './fixtures'

const params = (url: string) => Object.fromEntries(new URL(url).searchParams)

describe('the forecast', () => {
  it('maps the current conditions', () => {
    expect(mapWeather(FIXTURE).now).toEqual({
      time: '2026-10-28T17:45',
      temperature: 16.6,
      feelsLike: 14.4,
      humidity: 56,
      precipitation: 0,
      code: 0,
      label: 'Ciel dégagé',
      windSpeed: 9.7,
      windGusts: 18.7,
      windDirection: 42,
      windFrom: 'NE',
      isDay: true
    })
  })

  it('keeps Météo-France’s quarters from the current one, not the European model’s hours cut in four', () => {
    const { quarters } = mapWeather(FIXTURE)
    expect(quarters.map((q) => [q.time.slice(11), q.precipitation, q.code])).toEqual([
      ['17:45', 0, 0],
      ['18:00', 0, 0],
      ['18:15', 0.1, 61],
      ['18:30', 0.5, 63],
      ['18:45', 2.2, 65],
      ['19:00', 0.3, 61],
      ['19:15', 0, 3],
      ['19:30', 0, 3]
    ])
    const europeOnly = {
      ...FIXTURE,
      minutely_15: { time: FIXTURE.minutely_15.time, precipitation_ecmwf_ifs025: FIXTURE.minutely_15.precipitation_ecmwf_ifs025 }
    }
    expect(mapWeather(europeOnly).quarters).toEqual([])
  })

  it('keeps the hours after the current one, from Météo-France while it has them, with the European chance of rain', () => {
    const { hours } = mapWeather(FIXTURE)
    expect(hours.map((h) => [h.time.slice(11), h.model])).toEqual([
      ['18:00', 'meteofrance'],
      ['19:00', 'meteofrance'],
      ['20:00', 'meteofrance'],
      ['21:00', 'meteofrance'],
      ['22:00', 'ecmwf']
    ])
    expect(hours[2]).toEqual({
      time: '2026-10-28T20:00',
      code: 63,
      temperature: 14.2,
      feelsLike: 12.1,
      precipitation: 3.1,
      precipitationChance: 85,
      humidity: 85,
      windSpeed: 18.4,
      windGusts: 45,
      windDirection: 240,
      windFrom: 'SO',
      isDay: false,
      model: 'meteofrance'
    })
    expect(hours[4]).toMatchObject({ temperature: 12.6, code: 61, precipitationChance: 40, model: 'ecmwf' })
  })

  it('takes Météo-France while it covers the day, then the European model, and skips days without a forecast', () => {
    const { days, elevation } = mapWeather(FIXTURE)
    expect(elevation).toBe(22)
    expect(days.map((d) => [d.date, d.model])).toEqual([
      ['2026-10-28', 'meteofrance'],
      ['2026-10-29', 'meteofrance'],
      ['2026-10-30', 'ecmwf']
    ])
    expect(days[1]).toEqual({
      date: '2026-10-29',
      code: 61,
      label: 'Pluie faible',
      min: 8.1,
      max: 16.1,
      feelsLikeMin: 5.8,
      feelsLikeMax: 13.2,
      precipitation: 4.2,
      precipitationHours: 6,
      // Météo-France gives no chance of rain: the European model's.
      precipitationChance: 85,
      windSpeed: 21.3,
      windGusts: 52,
      windDirection: 250,
      windFrom: 'O',
      sunrise: '07:36',
      sunset: '17:55',
      daylight: 37140,
      model: 'meteofrance'
    })
    expect(days[2]).toMatchObject({ code: 80, label: 'Averses', min: 6.1, max: 15.8, precipitationChance: 60, windFrom: 'NO' })
  })

  it('reads a single model answer too, and has neither conditions nor quarters when they are missing', () => {
    const single = mapWeather({
      latitude: 0,
      longitude: 0,
      elevation: 0,
      daily: { time: ['2026-10-28'], weather_code: [45], temperature_2m_max: [12], temperature_2m_min: [5], sunrise: ['2026-10-28T07:00'] }
    })
    expect(single.now).toBeNull()
    expect(single.quarters).toEqual([])
    expect(single.hours).toEqual([])
    expect(single.days[0]).toMatchObject({ label: 'Brouillard', max: 12, min: 5, precipitationChance: null, sunrise: '07:00' })
  })

  it('asks the two models for 15 days, 48 hours after the current one and two hours of quarters, in the place’s time', () => {
    const url = forecastUrl(44.8624, -0.5848)
    expect(url.startsWith('https://api.open-meteo.com/v1/forecast?')).toBe(true)
    expect(params(url)).toMatchObject({
      latitude: '44.862',
      longitude: '-0.585',
      models: 'meteofrance_seamless,ecmwf_ifs025',
      minutely_15: 'precipitation,weather_code',
      timezone: 'auto',
      forecast_minutely_15: '8',
      forecast_hours: '49',
      forecast_days: '15'
    })
  })

  it('keeps the quarters where AROME’s 15-minute run reaches: metropolitan France and Corsica', async () => {
    expect(['33', '2A', '2B', '971', '976'].map(inArome)).toEqual([true, true, true, false, false])
    const http = { json: async <T>() => FIXTURE as T }
    expect((await communeWeather({ http }, BORDEAUX)).quarters).toHaveLength(8)
    const overseas = await communeWeather({ http }, FORT_DE_FRANCE)
    expect(overseas.quarters).toEqual([])
    expect(overseas.commune).toEqual({ code: '97209', name: 'Fort-de-France', postalCodes: ['97200'], department: '972', departmentName: 'Martinique' })
  })
})

describe('the air', () => {
  it('gives each day’s worst index and highest UV, and the pollens in the air', () => {
    const a = mapAir(AIR_FIXTURE)
    expect(a).toMatchObject({ time: '2026-10-28T17:00', aqi: 49, uv: 0.3 })
    expect(a.days).toEqual([
      { date: '2026-10-28', aqi: 55, uv: 3.3, pollen: { grass: 12 } },
      // Under a grain per m³, a pollen is not in the air; one the model doesn't give, not either.
      { date: '2026-10-29', aqi: 25, uv: 2.1, pollen: {} }
    ])
    expect(a.credit).toContain('Copernicus (CAMS)')
  })

  it('reads an empty answer as nothing known', () => {
    expect(mapAir({})).toMatchObject({ time: '', aqi: null, uv: null, days: [] })
  })

  it('asks four days of the index, the UV and six pollens', () => {
    const url = airUrl(44.8624, -0.5848)
    expect(url.startsWith('https://air-quality-api.open-meteo.com/v1/air-quality?')).toBe(true)
    expect(params(url)).toMatchObject({
      current: 'european_aqi,uv_index',
      hourly: 'european_aqi,uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen',
      forecast_days: '4'
    })
  })
})

describe('the scenarios', () => {
  it('reads a share of sorted values between the two nearest', () => {
    expect(quantile([10, 20, 30, 40, 50], 0.5)).toBeCloseTo(30)
    expect(quantile([10, 20, 30, 40, 50], 0.1)).toBeCloseTo(14)
    expect(quantile([10, 20, 30, 40, 50], 0.9)).toBeCloseTo(46)
    expect(spreadOf([21, 10, 15, 19, 12])).toEqual({ low: 10.8, mid: 15, high: 20.2 })
  })

  it('is sure when the scenarios agree on the temperature and on the rain', () => {
    const tight = { low: 15, mid: 16, high: 17.5 }
    expect(confidenceOf(tight, 0)).toBe('high')
    expect(confidenceOf(tight, 0.9)).toBe('high')
    expect(confidenceOf(tight, 0.5)).toBe('medium')
    expect(confidenceOf({ low: 13, mid: 16, high: 18 }, 0)).toBe('medium')
    expect(confidenceOf({ low: 10, mid: 15, high: 20 }, 0)).toBe('low')
  })

  it('gives each day where eight runs in ten fall, the share of rainy runs and the confidence', () => {
    const t = mapTrend(ENSEMBLE_FIXTURE)
    expect(t.members).toBe(5)
    expect(t.days).toEqual([
      { date: '2026-10-28', max: { low: 16.7, mid: 17, high: 17.8 }, min: { low: 8.7, mid: 9, high: 9.3 }, rain: 0, confidence: 'high' },
      { date: '2026-10-29', max: { low: 14.4, mid: 16, high: 16.8 }, min: { low: 7.2, mid: 8, high: 8.6 }, rain: 0.8, confidence: 'high' },
      { date: '2026-10-30', max: { low: 10.8, mid: 15, high: 20.2 }, min: { low: 3.4, mid: 6, high: 8.6 }, rain: 0.4, confidence: 'low' }
    ])
  })

  it('leaves out a day with too few runs, and asks 15 days of the European ensemble', () => {
    expect(mapTrend({ daily: { time: ['2026-10-28'], temperature_2m_max: [17], temperature_2m_min: [9] } }).days).toEqual([])
    expect(params(trendUrl(44.8624, -0.5848))).toMatchObject({
      models: 'ecmwf_ifs025',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
      forecast_days: '15'
    })
    expect(trendUrl(0, 0).startsWith('https://ensemble-api.open-meteo.com/v1/ensemble?')).toBe(true)
  })
})
