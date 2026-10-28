import { describe, expect, it } from 'vitest'
import { dayName, degrees, millimetres, weatherGlyph, wind } from '../src/format'

describe('format', () => {
  it('draws a sign for each kind of weather', () => {
    const codes = [0, 1, 2, 3, 45, 48, 51, 61, 66, 71, 77, 80, 85, 95, 99]
    expect(codes.map((code) => weatherGlyph(code)).join(' ')).toBe('☀ ☀ ⛅ ☁ ≡ ≡ ☂ ☂ ☂ ❄ ❄ ☂ ❄ ⚡ ⚡')
    expect(weatherGlyph(0, false)).toBe('☾')
  })

  it('names the days of a forecast in French', () => {
    expect(dayName('2026-10-28', 0)).toBe('aujourd’hui')
    expect(dayName('2026-10-29', 1)).toBe('demain')
    expect(dayName('2026-10-30', 2)).toBe('vendredi 30')
  })

  it('writes temperatures, wind and rain the French way', () => {
    expect(degrees(16.64, 1)).toBe('16,6 °C')
    expect(degrees(17.7)).toBe('18 °C')
    expect(degrees(-0.3)).toBe('0 °C')
    expect(degrees(-2.6)).toBe('-3 °C')
    expect(wind('NO', 21.3)).toBe('NO 21 km/h')
    expect(millimetres(4.25)).toBe('4,3 mm')
    expect(millimetres(0)).toBe('0 mm')
  })
})
