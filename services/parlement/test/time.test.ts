import { describe, expect, it } from 'vitest'
import { parisIso } from '../src/time'

describe('Paris times', () => {
  it('take the offset in force at that instant, the nights the clocks change included', () => {
    expect(parisIso('2026-10-28 14:00')).toBe('2026-10-28T14:00:00+01:00')
    expect(parisIso('2026-07-01 12:00:00')).toBe('2026-07-01T12:00:00+02:00')
    // 29 March 2026: 02:00 becomes 03:00.
    expect(parisIso('2026-03-29 01:30')).toBe('2026-03-29T01:30:00+01:00')
    expect(parisIso('2026-03-29 03:30')).toBe('2026-03-29T03:30:00+02:00')
  })
})
