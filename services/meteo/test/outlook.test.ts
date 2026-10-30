import { describe, expect, it } from 'vitest'
import { rainLine } from '../src/format'
import { dayAhead, intensity, rainOutlook } from '../src/outlook'
import type { WeatherHour, WeatherNow, WeatherQuarter } from '../src/types'
import { mapWeather } from '../src/weather'
import { FIXTURE } from './fixtures'

const forecast = mapWeather(FIXTURE)
const NOW = forecast.now as WeatherNow

/** A quarter of 28 October, its mm and its code (rain when wet). */
const q = (time: string, mm: number, code = mm ? 61 : 0): WeatherQuarter => ({ time: `2026-10-28T${time}`, precipitation: mm, code })
/** An hour at a local time, its mm, code and chance of rain. */
const h = (time: string, mm: number, code = mm ? 61 : 0, chance: number | null = null): WeatherHour => ({
  ...forecast.hours[0],
  time,
  precipitation: mm,
  code,
  precipitationChance: chance
})
const DRY_QUARTERS = ['17:45', '18:00', '18:15', '18:30', '18:45', '19:00', '19:15', '19:30'].map((t) => q(t, 0))

/** The outlook in the tile's words, at 17:45. */
const said = (quarters: WeatherQuarter[], hours: WeatherHour[], now: WeatherNow = NOW) => rainLine(rainOutlook(now, quarters, hours), now.time)

describe('the rain to come', () => {
  it('says how hard a quarter falls, by the rate it means', () => {
    expect([0, 0.04, 0.05, 0.6, 1, 2].map(intensity)).toEqual(['dry', 'dry', 'light', 'light', 'moderate', 'heavy'])
  })

  it('counts the minutes to the rain of the next hour, from the quarters', () => {
    expect(rainOutlook(NOW, forecast.quarters, forecast.hours)).toEqual({ state: 'soon', fall: 'pluie', at: '2026-10-28T18:15', chance: null })
    expect(said(forecast.quarters, forecast.hours)).toBe('pluie dans 30 min')
    const storm = [q('17:45', 0), q('18:00', 1.2, 95)]
    expect(said(storm, [])).toBe('orage dans 15 min')
    const later = [...DRY_QUARTERS.slice(0, 5), q('19:00', 0.4), q('19:15', 0.2), q('19:30', 0)]
    expect(said(later, [])).toBe('pluie dès 19 h')
  })

  it('says until when it falls: within the quarters, else the first dry hour after them', () => {
    expect(said([q('17:45', 0.3), q('18:00', 0.2), q('18:15', 0)], [])).toBe('pluie jusqu’à 18 h 15')
    const wet = DRY_QUARTERS.map((x) => ({ ...x, precipitation: 0.4, code: 80 }))
    // 19:00 is the quarters' to tell; 20:00, the first hour after them, is wet; 21:00 is dry.
    const hours = [h('2026-10-28T18:00', 1), h('2026-10-28T19:00', 0), h('2026-10-28T20:00', 1.1), h('2026-10-28T21:00', 0)]
    expect(said(wet, hours)).toBe('averses jusqu’à 21 h')
    expect(said(wet, hours.slice(0, 3))).toBe('averses pour les prochaines heures')
  })

  it('without quarters (overseas), reads the conditions now and the hours', () => {
    const raining = { ...NOW, precipitation: 0.2, code: 61 }
    expect(said([], [h('2026-10-28T18:00', 0.6), h('2026-10-28T19:00', 0)], raining)).toBe('pluie jusqu’à 19 h')
    expect(said([], [h('2026-10-28T18:00', 0), h('2026-10-28T19:00', 2.4, 63, 80)])).toBe('pluie vers 19 h (80 %)')
  })

  it('names the next rainy hour of the day ahead, from the quarters’ end, with its chance', () => {
    const hours = [h('2026-10-28T18:00', 0), h('2026-10-28T19:00', 0.5), h('2026-10-28T20:00', 0.8, 80, 70)]
    expect(said(DRY_QUARTERS, hours)).toBe('averses vers 20 h (70 %)')
    expect(said(DRY_QUARTERS, [h('2026-10-29T07:00', 1.4, 73)])).toBe('neige demain vers 7 h')
  })

  it('says how long it stays dry', () => {
    const day = Array.from({ length: 30 }, (_, i) => h(`2026-10-${i < 6 ? 28 : 29}T${String((18 + i) % 24).padStart(2, '0')}:00`, 0))
    expect(rainOutlook(NOW, DRY_QUARTERS, day)).toEqual({ state: 'dry', fall: 'pluie', at: '2026-10-29T17:00', chance: null })
    expect(said(DRY_QUARTERS, day)).toBe('pas de pluie d’ici demain 17 h')
    expect(said(DRY_QUARTERS, [])).toBe('pas de pluie prévue')
  })
})

describe('the day ahead', () => {
  it('is today until its sunset, then tomorrow', () => {
    const at = (time: string) => dayAhead(`2026-10-28T${time}`, forecast.days)
    expect([at('17:45'), at('17:56'), at('23:10')].map((d) => [d?.day.date, d?.tomorrow])).toEqual([
      ['2026-10-28', false],
      ['2026-10-29', true],
      ['2026-10-29', true]
    ])
    // Without a time or a tomorrow, today; without days, nothing.
    expect(dayAhead('', forecast.days)?.day.date).toBe('2026-10-28')
    expect(dayAhead('2026-10-28T23:10', forecast.days.slice(0, 1))?.tomorrow).toBe(false)
    expect(dayAhead('2026-10-28T12:00', [])).toBeNull()
  })
})
