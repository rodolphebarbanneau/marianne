import { describe, expect, it } from 'vitest'
import { dayHours, dayOfWeek, daySlotsLabel, openAt, periodLabel, periodText, spoken } from '../src/hours'
import type { OpeningPeriod } from '../src/types'

/** Wednesday 28 October 2026, local time. */
const wednesday = (hours: number, minutes = 0) => new Date(2026, 9, 28, hours, minutes)
const sunday = new Date(2026, 10, 1, 10, 0)

const WEEK: OpeningPeriod[] = [
  {
    fromDay: 1,
    toDay: 5,
    slots: [
      { from: '13:30', to: '17:00' },
      { from: '08:30', to: '12:00' }
    ],
    label: ''
  },
  { fromDay: 6, toDay: 6, slots: [{ from: '09:00', to: '12:00' }], label: '' }
]

describe('hours', () => {
  it('numbers the days from Monday', () => {
    expect(dayOfWeek(wednesday(10))).toBe(3)
    expect(dayOfWeek(sunday)).toBe(7)
  })

  it('says the hours in French, and in English for the model', () => {
    expect(spoken('08:30')).toBe('8h30')
    expect(spoken('12:00')).toBe('12h00')
    expect(periodLabel(1, 5, [{ from: '08:30', to: '12:00' }])).toBe('Du lundi au vendredi : 8h30–12h00')
    expect(periodLabel(6, 6, [])).toBe('Samedi : horaires non précisés')
    expect(periodText({ fromDay: 1, toDay: 5, slots: [{ from: '08:30', to: '12:00' }], note: 'sur rendez-vous', label: '' })).toBe(
      'Mon–Fri 08:30–12:00 (sur rendez-vous)'
    )
    expect(periodText({ fromDay: 7, toDay: 7, slots: [], label: '' })).toBe('Sun hours not given')
  })

  it('gives the slots of the day, closed days empty, unknown hours null', () => {
    expect(dayHours(WEEK, wednesday(10))).toEqual([
      { from: '08:30', to: '12:00' },
      { from: '13:30', to: '17:00' }
    ])
    expect(daySlotsLabel(dayHours(WEEK, wednesday(10))!)).toBe('8h30–12h00, 13h30–17h00')
    expect(dayHours(WEEK, sunday)).toEqual([])
    expect(dayHours([], sunday)).toBeNull()
    expect(dayHours([{ fromDay: 1, toDay: 7, slots: [], note: 'sur rendez-vous', label: '' }], sunday)).toBeNull()
  })

  it('knows whether an office is open at a moment', () => {
    expect(openAt(WEEK, wednesday(8, 30))).toBe(true)
    expect(openAt(WEEK, wednesday(12))).toBe(false)
    expect(openAt(WEEK, wednesday(16, 59))).toBe(true)
    expect(openAt(WEEK, wednesday(17))).toBe(false)
    expect(openAt(WEEK, sunday)).toBe(false)
    expect(openAt([], wednesday(10))).toBe(false)
  })
})
