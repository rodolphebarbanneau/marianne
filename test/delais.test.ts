import { describe, expect, it } from 'vitest'
import { computeDeadline, weekday } from '../src/main/tools/delais'

const holidays = new Map([
  ['2026-11-11', '11 novembre'],
  ['2026-12-25', 'Jour de Noël'],
  ['2027-01-01', '1er janvier']
])

describe('computeDeadline', () => {
  it('does not count the starting day', () => {
    // Notified Monday 2 November 2026, 15 days: ends Tuesday 17 November.
    expect(computeDeadline('2026-11-02', 15, 'jours', false, holidays).end).toBe('2026-11-17')
  })

  it('ends a month deadline on the same day number, or the last day of a shorter month', () => {
    expect(computeDeadline('2026-03-16', 2, 'mois', false, holidays).nominal).toBe('2026-05-16')
    expect(computeDeadline('2027-01-31', 1, 'mois', false, holidays).nominal).toBe('2027-02-28')
    expect(computeDeadline('2026-08-31', 2, 'mois', false, holidays).nominal).toBe('2026-10-31')
  })

  it('moves a weekend end to the next working day', () => {
    // 2026-10-31 is a Saturday: Monday 2 November.
    const d = computeDeadline('2026-08-31', 2, 'mois', false, holidays)
    expect(weekday('2026-10-31')).toBe('samedi')
    expect(d.end).toBe('2026-11-02')
    expect(d.steps.map((s) => s.date)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02'])
  })

  it('moves a public holiday end, then any weekend after it', () => {
    // 25 December 2026 is a Friday: Monday 28 December.
    expect(computeDeadline('2026-12-10', 15, 'jours', false, holidays).end).toBe('2026-12-28')
    // 11 November 2026 is a Wednesday: Thursday 12.
    expect(computeDeadline('2026-10-28', 2, 'semaines', false, holidays).end).toBe('2026-11-12')
  })

  it('adds the last day for a délai franc', () => {
    // Notified 3 March, two-month délai franc: until 4 May (a Tuesday).
    const d = computeDeadline('2026-03-03', 2, 'mois', true, holidays)
    expect(d.nominal).toBe('2026-05-04')
    expect(d.end).toBe('2026-05-04')
  })

  it('handles years and leap days', () => {
    expect(computeDeadline('2024-02-29', 1, 'ans', false, new Map()).nominal).toBe('2025-02-28')
  })
})
