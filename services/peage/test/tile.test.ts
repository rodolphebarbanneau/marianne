import { readManifest } from '@marianne/sdk'
import { checkTile, fakeContext } from '@marianne/sdk/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import pkg from '../package.json'
import { service } from '../src/main'
import { dueText, tripTile } from '../src/tile'
import type { Trip } from '../src/types'
import { GRANTED } from './fixtures'

/** 28 October 2026, 14:30 in Paris: due on the 31st at 14:30. */
const PASSAGE = '2026-10-28T13:30:00.000Z'
const trip = (patch: Partial<Trip> = {}): Trip => ({ id: 't1', vehicleId: 'v1', network: 'a13-a14', at: PASSAGE, ...patch })
const at = (iso: string) => new Date(iso)

describe('the deadline', () => {
  it('says the day in Paris time: today, tomorrow, a date, or past', () => {
    const due = at('2026-10-31T13:30:00Z')
    expect(dueText(due, at('2026-10-31T08:00:00Z'))).toBe('aujourd’hui avant 14 h 30')
    expect(dueText(due, at('2026-10-30T14:00:00Z'))).toBe('avant demain 14 h 30')
    expect(dueText(due, at('2026-10-29T14:00:00Z'))).toBe('avant le 31/10 à 14 h 30')
    // 0:30 in Paris on the 31st, still the 30th in UTC.
    expect(dueText(due, at('2026-10-30T23:30:00Z'))).toBe('aujourd’hui avant 14 h 30')
    // Tomorrow across the end of a month.
    expect(dueText(at('2026-11-01T17:00:00Z'), at('2026-10-31T20:00:00Z'))).toBe('avant demain 18 h')
    expect(dueText(due, at('2026-11-01T08:00:00Z'))).toBe('délai dépassé depuis le 31/10 à 14 h 30')
  })
})

describe('the tile', () => {
  afterEach(() => void vi.useRealTimers())

  it('counts the trips to pay, shows the first with its deadline, and opens it to pay', () => {
    const trips = [
      trip({ id: 'later', at: '2026-10-29T17:00:00.000Z' }),
      trip(),
      trip({ id: 'paid', at: '2026-10-27T08:00:00.000Z', paidAt: '2026-10-27T10:00:00.000Z' }),
      trip({ id: 'gone', network: 'gone' })
    ]
    expect(checkTile(tripTile(trips, true, at('2026-10-30T14:00:00Z')))).toEqual({
      value: { text: '2', unit: 'trajets à payer' },
      lines: [{ text: 'A13-A14 Paris–Normandie · 28/10' }, { text: 'avant demain 14 h 30', tone: 'accent' }],
      urgency: 'urgent',
      action: { label: 'payer', params: { trip: 't1' } },
      params: { trip: 't1' }
    })
  })

  it('is urgent within 24 hours, near within 48, calm before', () => {
    const urgency = (now: string) => checkTile(tripTile([trip()], true, at(now)))?.urgency
    expect(urgency('2026-11-01T08:00:00Z')).toBe('urgent')
    expect(urgency('2026-10-30T14:00:00Z')).toBe('urgent')
    expect(urgency('2026-10-29T14:00:00Z')).toBe('soon')
    expect(urgency('2026-10-28T14:00:00Z')).toBeUndefined()
    const late = checkTile(tripTile([trip()], true, at('2026-11-01T08:00:00Z')))
    expect(late?.value).toEqual({ text: '1', unit: 'trajet à payer' })
    expect(late?.lines?.[1]).toEqual({ text: 'délai dépassé depuis le 31/10 à 14 h 30', tone: 'bad' })
  })

  it('is calm with nothing to pay, and asks for the plates without them', () => {
    const now = at('2026-10-30T14:00:00Z')
    const calm = { title: 'aucun trajet à payer', lines: [{ text: 'notez vos passages en flux libre : 72 h pour payer', tone: 'dim' }] }
    expect(checkTile(tripTile([], true, now))).toEqual(calm)
    expect(checkTile(tripTile([trip({ paidAt: '2026-10-28T15:00:00.000Z' })], false, now))).toEqual(calm)
    expect(checkTile(tripTile([], false, now))).toEqual({
      title: 'vos plaques ?',
      lines: [{ text: 'accordez l’accès à vos plaques pour noter vos trajets', tone: 'dim' }]
    })
  })

  it('reads the stored trips, and reaches no host', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at('2026-10-30T14:00:00Z'))
    // Without `answer`, any request would fail.
    const { ctx } = fakeContext(pkg, { profile: GRANTED })
    const runtime = service.activate(ctx)
    expect(checkTile(await runtime.tile!())?.title).toBe('aucun trajet à payer')
    ctx.storage.set('trips', [trip()])
    expect(checkTile(await runtime.tile!())).toMatchObject({ value: { text: '1', unit: 'trajet à payer' }, urgency: 'urgent', params: { trip: 't1' } })
  })

  it('is asked every 15 minutes', () => {
    expect(service.tile).toEqual({ everyMinutes: 15 })
  })
})

describe('the manifest', () => {
  it('has its icon and declares the tools its main side lends', () => {
    const manifest = readManifest(pkg)
    expect(manifest.icon).toEqual(pkg.marianne.icon)
    const { ctx } = fakeContext(pkg, { profile: GRANTED })
    expect(manifest.tools).toEqual(service.activate(ctx).tools?.map((t) => ({ name: t.name, label: t.label })))
  })
})
