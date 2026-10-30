import { describe, expect, it } from 'vitest'
import { compass, mapWeather, weatherLabel } from '../src/weather'
import { FIXTURE } from './fixtures'

describe('weather', () => {
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
      precipitation: 4.2,
      // Météo-France gives no chance of rain: the European model's.
      precipitationChance: 85,
      windSpeed: 21.3,
      windGusts: 45,
      windDirection: 250,
      windFrom: 'O',
      sunrise: '07:36',
      sunset: '17:55',
      model: 'meteofrance'
    })
    expect(days[2]).toMatchObject({ code: 80, label: 'Averses', min: 6.1, max: 15.8, precipitationChance: 60, windFrom: 'NO' })
  })

  it('keeps the hours after the current one, from Météo-France while it has them', () => {
    expect(mapWeather(FIXTURE).hours).toEqual([
      { time: '2026-10-28T18:00', code: 0 },
      { time: '2026-10-28T19:00', code: 3 },
      { time: '2026-10-28T20:00', code: 80 },
      { time: '2026-10-28T21:00', code: 61 }
    ])
  })

  it('reads a single model answer too, and has no current conditions when they are missing', () => {
    const single = mapWeather({
      latitude: 0,
      longitude: 0,
      elevation: 0,
      daily: { time: ['2026-10-28'], weather_code: [45], temperature_2m_max: [12], temperature_2m_min: [5], sunrise: ['2026-10-28T07:00'] }
    })
    expect(single.now).toBeNull()
    expect(single.hours).toEqual([])
    expect(single.days[0]).toMatchObject({ label: 'Brouillard', max: 12, min: 5, precipitationChance: null, sunrise: '07:00' })
  })

  it('names codes and wind directions in French', () => {
    expect(weatherLabel(95)).toBe('Orage')
    expect(weatherLabel(42)).toBe('Temps indéterminé')
    expect([0, 44, 90, 180, 225, 270, 337, 359, -45].map(compass)).toEqual(['N', 'NE', 'E', 'S', 'SO', 'O', 'NO', 'N', 'NO'])
  })
})
