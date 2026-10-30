import { describe, expect, it } from 'vitest'
import {
  airLevel,
  around,
  clock,
  dayName,
  degrees,
  hoursLong,
  intensityColor,
  millimetres,
  minutesBetween,
  percent,
  range,
  shortDay,
  shortDegrees,
  uvLevel,
  weekday,
  wind
} from '../src/format'

describe('format', () => {
  it('names the days of a forecast in French', () => {
    expect(dayName('2026-10-28', 0)).toBe('aujourd’hui')
    expect(dayName('2026-10-29', 1)).toBe('demain')
    expect(dayName('2026-10-30', 2)).toBe('vendredi 30')
    expect(dayName('2026-11-01', 4)).toBe('dimanche 1er')
    expect(['2026-10-28', '2026-10-29', '2026-11-01'].map(weekday)).toEqual(['mer', 'jeu', 'dim'])
    expect([shortDay('2026-10-31T00:00'), shortDay('2026-11-01')]).toEqual(['sam. 31', 'dim. 1er'])
  })

  it('writes temperatures, wind, rain and shares the French way', () => {
    expect(degrees(16.64, 1)).toBe('16,6 °C')
    expect(degrees(17.7)).toBe('18 °C')
    expect(degrees(-0.3)).toBe('0 °C')
    expect(degrees(-2.6)).toBe('-3 °C')
    expect([16.6, 15.4, -0.3, -2.6].map(shortDegrees)).toEqual(['17°', '15°', '0°', '-3°'])
    expect(wind('NO', 21.3)).toBe('NO 21 km/h')
    expect([4.25, 0, 0.04].map(millimetres)).toEqual(['4,3 mm', '0 mm', '0 mm'])
    expect(percent(84.6)).toBe('85 %')
    expect([range(12.4, 16.6), range(15.2, 15.4), range(-0.4, 2)]).toEqual(['12 à 17°', '15°', '0 à 2°'])
  })

  it('writes times as the French clock does, and counts the minutes between them', () => {
    expect([clock('2026-10-28T16:30'), clock('2026-10-28T07:00'), clock('07:34')]).toEqual(['16 h 30', '7 h', '7 h 34'])
    expect(hoursLong(37320)).toBe('10 h 22')
    expect(minutesBetween('2026-10-28T17:45', '2026-10-28T18:15')).toBe(30)
    expect(minutesBetween('2026-10-28T23:45', '2026-10-29T00:15')).toBe(30)
    expect(around('2026-10-28T20:00', '2026-10-28T17:45')).toBe('vers 20 h')
    expect(around('2026-10-29T07:00', '2026-10-28T17:45')).toBe('demain vers 7 h')
    expect(around('2026-10-30T09:00', '2026-10-28T17:45')).toBe('vendredi vers 9 h')
  })

  it('says the air, the UV and the rain’s strength in words and colours', () => {
    expect([5, 25, 49, 65, 90, 120].map((n) => airLevel(n).label)).toEqual(['bon', 'moyen', 'dégradé', 'mauvais', 'très mauvais', 'extrêmement mauvais'])
    expect([0.3, 3.3, 6.4, 8, 11.2].map((n) => uvLevel(n).label)).toEqual(['faible', 'modéré', 'élevé', 'très élevé', 'extrême'])
    expect(uvLevel(2.4).color).toBe('vert')
    expect([intensityColor('dry'), intensityColor('light'), intensityColor('moderate'), intensityColor('heavy'), intensityColor('light', true)]).toEqual([
      null,
      'cyan-pale',
      'cyan',
      'bleu',
      'blanc'
    ])
  })
})
