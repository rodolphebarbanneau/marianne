import { describe, expect, it } from 'vitest'
import { dueOf, leftText, paid, tripDeadlines, tripSummary, unpaid } from '../src/schedule'
import { clock, duration, fromParisInput, parisInput, parisIso, parseMoment, when } from '../src/time'
import type { Trip } from '../src/types'

/** 28 October 2026, 14:30 in Paris (winter time since the 25th). */
const PASSAGE = '2026-10-28T13:30:00.000Z'
const trip = (patch: Partial<Trip> = {}): Trip => ({ id: 't1', vehicleId: 'v1', network: 'a13-a14', at: PASSAGE, ...patch })
const at = (iso: string) => new Date(iso)

describe('Paris time', () => {
  it('writes a moment with its Paris offset, winter or summer', () => {
    expect(parisIso(at(PASSAGE))).toBe('2026-10-28T14:30:00+01:00')
    expect(parisIso(at('2026-07-14T08:00:00Z'))).toBe('2026-07-14T10:00:00+02:00')
    // Late in the evening in Paris is already the next day in Paris, not in UTC.
    expect(parisIso(at('2026-10-30T23:30:00Z'))).toBe('2026-10-31T00:30:00+01:00')
  })

  it('reads a date and time field in Paris time, across the changes of time', () => {
    expect(fromParisInput('2026-10-28T14:30')?.toISOString()).toBe(PASSAGE)
    expect(fromParisInput('2026-07-14T10:00')?.toISOString()).toBe('2026-07-14T08:00:00.000Z')
    expect(fromParisInput('2026-03-29T03:30')?.toISOString()).toBe('2026-03-29T01:30:00.000Z')
    expect(parisInput(at(PASSAGE))).toBe('2026-10-28T14:30')
    for (const wrong of ['', '2026-10-28', '2026-02-30T10:00', '2026-10-28T25:00', '28/10/2026 14:30']) expect(fromParisInput(wrong), wrong).toBeNull()
  })

  it('takes ISO moments with an offset, and Paris time without one', () => {
    expect(parseMoment('2026-10-28T13:30:00Z')?.toISOString()).toBe(PASSAGE)
    expect(parseMoment('2026-10-28T14:30:00+01:00')?.toISOString()).toBe(PASSAGE)
    expect(parseMoment('2026-10-28 14:30')?.toISOString()).toBe(PASSAGE)
    for (const wrong of ['hier', '2026-10-28', '2026-10-28T14:30+0100']) expect(parseMoment(wrong), wrong).toBeNull()
  })

  it('says times and durations in French', () => {
    expect(when(at(PASSAGE))).toBe('le 28/10 à 14 h 30')
    expect(clock(at('2026-10-31T17:00:00Z'))).toBe('18 h')
    expect(duration(2 * 86_400_000 + 5 * 3600_000 + 59_000)).toBe('2 j 5 h')
    expect(duration(3 * 3600_000 + 20 * 60_000)).toBe('3 h 20')
    expect(duration(12 * 60_000)).toBe('12 min')
  })
})

describe('what is due', () => {
  it('is the passage plus the network’s time to pay', () => {
    expect(dueOf(trip())?.toISOString()).toBe('2026-10-31T13:30:00.000Z')
    expect(dueOf(trip({ network: 'a79' }))?.toISOString()).toBe('2026-10-31T13:30:00.000Z')
    expect(dueOf(trip({ network: 'gone' }))).toBeNull()
  })

  it('lists the unpaid trips soonest first, the paid ones last paid first', () => {
    const trips = [
      trip({ id: 'late', at: '2026-10-27T08:00:00.000Z' }),
      trip({ id: 'gone', network: 'gone' }),
      trip({ id: 'paid', paidAt: '2026-10-28T15:00:00.000Z' }),
      trip({ id: 'soon', at: '2026-10-26T08:00:00.000Z' }),
      trip({ id: 'paid-before', paidAt: '2026-10-20T15:00:00.000Z' })
    ]
    expect(unpaid(trips).map((t) => t.id)).toEqual(['soon', 'late', 'gone'])
    expect(paid(trips).map((t) => t.id)).toEqual(['paid', 'paid-before'])
  })

  it('tells the time left, or since when the deadline has passed', () => {
    const due = dueOf(trip())!
    expect(leftText(due, at('2026-10-28T15:00:00Z'))).toBe('reste 2 j 22 h')
    expect(leftText(due, at('2026-10-31T13:00:00Z'))).toBe('reste 30 min')
    expect(leftText(due, at('2026-10-31T14:00:00Z'))).toBe('délai dépassé depuis le 31/10 à 14 h 30')
  })
})

describe('deadlines', () => {
  it('one per unpaid trip of a known network, due in Paris time, opening the trip', () => {
    const deadlines = tripDeadlines([trip(), trip({ id: 't2', paidAt: '2026-10-28T15:00:00.000Z' }), trip({ id: 't3', network: 'gone' })])
    expect(deadlines).toEqual([
      {
        id: 't1',
        domain: 'mobility',
        title: 'Péage A13-A14 : trajet du 28/10 à payer',
        due: '2026-10-31T14:30:00+01:00',
        detail: 'sur www.sanef.com (Sanef), jamais depuis un lien reçu par SMS',
        params: { trip: 't1' }
      }
    ])
  })

  it('dates a passage late in the evening by its Paris day', () => {
    const [deadline] = tripDeadlines([trip({ at: '2026-10-28T23:15:00.000Z', network: 'a79' })])
    expect(deadline.title).toBe('Péage A79 : trajet du 29/10 à payer')
    expect(deadline.due).toBe('2026-11-01T00:15:00+01:00')
  })
})

describe('the Mobilité line', () => {
  it('says nothing when nothing is left to pay', () => {
    expect(tripSummary([], at(PASSAGE))).toBeNull()
    expect(tripSummary([trip({ paidAt: PASSAGE })], at(PASSAGE))).toBeNull()
  })

  it('counts the trips to pay and gives the first deadline: soon, then urgent under 24 hours', () => {
    expect(tripSummary([trip()], at('2026-10-28T15:00:00Z'))).toEqual({
      text: '1 trajet à payer · avant le 31/10 à 14 h 30',
      detail: 'sur le site officiel de la société d’autoroute, jamais depuis un lien reçu par SMS',
      urgency: 'soon',
      params: { trip: 't1' }
    })
    const two = [trip(), trip({ id: 't0', at: '2026-10-27T17:00:00.000Z', network: 'a79' })]
    expect(tripSummary(two, at('2026-10-30T12:00:00Z'))).toMatchObject({
      text: '2 trajets à payer · le premier avant le 30/10 à 18 h',
      urgency: 'urgent',
      params: { trip: 't0' }
    })
  })

  it('says so when the deadline has passed', () => {
    expect(tripSummary([trip()], at('2026-11-01T09:00:00Z'))).toEqual({
      text: '1 trajet à payer · délai dépassé depuis le 31/10 à 14 h 30',
      detail: 'passé le délai, un avis de paiement peut suivre par courrier : payez sans attendre sur le site officiel',
      urgency: 'urgent',
      params: { trip: 't1' }
    })
  })
})
