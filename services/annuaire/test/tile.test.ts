import { readManifest } from '@marianne/sdk'
import { checkTile, fakeContext } from '@marianne/sdk/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import pkg from '../package.json'
import { parseOffice } from '../src/directory'
import { service } from '../src/main'
import { clock, duration, NO_HOME_TILE, officeTile, ofPlace, statusAt, statusText } from '../src/tile'
import type { OpeningPeriod, PublicOffice } from '../src/types'
import { BORDEAUX, CAF_BELCIER, MAIRIE_BORDEAUX, whereOf } from './fixtures'

/** Local times: Wednesday 28 October 2026, Friday 30, Sunday 1 November. */
const wednesday = (hours: number, minutes = 0) => new Date(2026, 9, 28, hours, minutes)
const friday = (hours: number, minutes = 0) => new Date(2026, 9, 30, hours, minutes)
const sunday = new Date(2026, 10, 1, 10, 0)

/** Mairie de Bordeaux: Monday to Friday, 9 h to 17 h. Caf: Monday to Friday, 8 h 30 to 12 h. */
const MAIRIE = parseOffice(MAIRIE_BORDEAUX)
const CAF = parseOffice(CAF_BELCIER)
/** An office closed for lunch, from Monday to Friday. */
const SPLIT: OpeningPeriod[] = [
  {
    fromDay: 1,
    toDay: 5,
    slots: [
      { from: '08:30', to: '12:00' },
      { from: '13:30', to: '17:00' }
    ],
    label: ''
  }
]
const withHours = (office: PublicOffice, hours: OpeningPeriod[]): PublicOffice => ({ ...office, hours })

const HOME = { code: BORDEAUX.code, name: BORDEAUX.name, postcode: '33000' }
const page = (results: unknown[]) => ({ total_count: results.length, results })
/** The directory as the tests have it: the mairie of Bordeaux and its Caf. */
function directory(url: URL) {
  const where = whereOf(url)
  if (where.includes('"caf"')) return page([CAF_BELCIER])
  if (where.includes('"mairie"') && where.includes('33063')) return page([MAIRIE_BORDEAUX])
  return page([])
}

describe('what the tile says of opening hours', () => {
  it('writes times, durations and the commune the French way', () => {
    expect(['17:30', '08:30', '16:00'].map(clock)).toEqual(['17 h 30', '8 h 30', '16 h'])
    expect([100, 120, 65, 25].map(duration)).toEqual(['1 h 40', '2 h', '1 h 05', '25 min'])
    expect(['Rennes', 'Angers', 'Évry', 'Le Mans', 'Les Ulis', 'La Rochelle'].map(ofPlace)).toEqual([
      'de Rennes',
      'd’Angers',
      'd’Évry',
      'du Mans',
      'des Ulis',
      'de La Rochelle'
    ])
  })

  it('knows until when an office is open, and when it opens next', () => {
    expect(statusAt(SPLIT, wednesday(11))).toEqual({ open: true, until: '12:00', last: false })
    expect(statusAt(SPLIT, wednesday(16))).toEqual({ open: true, until: '17:00', last: true })
    const at = (date: Date) => statusText(statusAt(SPLIT, date))
    expect(at(wednesday(7))).toBe('ouvre à 8 h 30')
    expect(at(wednesday(12, 30))).toBe('rouvre à 13 h 30')
    expect(at(wednesday(17))).toBe('ouvre demain à 8 h 30')
    expect(at(friday(18))).toBe('ouvre lundi à 8 h 30')
    expect(statusText(statusAt([], wednesday(10)))).toBe('horaires non précisés')
    // Sunday's hours aren't given: Monday's opening can't be told.
    expect(statusAt([...SPLIT, { fromDay: 7, toDay: 7, slots: [], note: 'sur rendez-vous', label: '' }], friday(18))).toEqual({
      open: false,
      next: null,
      reopens: false
    })
  })
})

describe('the tile', () => {
  afterEach(() => void vi.useRealTimers())

  it('shows the mairie open, how much of its day has gone, and the Caf', () => {
    expect(checkTile(officeTile('Bordeaux', MAIRIE, CAF, wednesday(15, 20)))).toEqual({
      title: 'Mairie de Bordeaux',
      visual: { kind: 'gauge', value: 0.79, label: 'la journée : 1 h 40 avant la fermeture', color: 'vert' },
      lines: [
        { text: '● ouverte jusqu’à 17 h', tone: 'ok' },
        { text: 'Caf : ouvre demain à 8 h 30', tone: 'dim' }
      ]
    })
  })

  it('tells a pause and the hours of the day while it is closed', () => {
    const office = withHours(MAIRIE, SPLIT)
    expect(checkTile(officeTile('Bordeaux', office, undefined, wednesday(11)))?.visual).toEqual({
      kind: 'gauge',
      value: 0.36,
      label: 'la journée : 1 h avant la pause',
      color: 'vert'
    })
    expect(checkTile(officeTile('Bordeaux', office, undefined, wednesday(12, 30)))).toEqual({
      title: 'Mairie de Bordeaux',
      visual: { kind: 'gauge', value: 0.5, label: 'la journée : 8 h 30–12 h, 13 h 30–17 h', color: 'gris' },
      lines: [{ text: 'fermée · rouvre à 13 h 30', tone: 'dim' }]
    })
  })

  it('tells when it opens again after its day, and on a day it is closed', () => {
    expect(checkTile(officeTile('Bordeaux', MAIRIE, CAF, friday(18)))).toEqual({
      title: 'Mairie de Bordeaux',
      visual: { kind: 'gauge', value: 1, label: 'la journée : 9 h–17 h', color: 'gris' },
      lines: [
        { text: 'fermée · ouvre lundi à 9 h', tone: 'dim' },
        { text: 'Caf : ouvre lundi à 8 h 30', tone: 'dim' }
      ]
    })
    expect(checkTile(officeTile('Le Mans', MAIRIE, undefined, sunday))).toEqual({
      title: 'Mairie du Mans',
      visual: { kind: 'gauge', value: 0, label: 'fermée aujourd’hui', color: 'gris' },
      lines: [{ text: 'fermée · ouvre demain à 9 h', tone: 'dim' }]
    })
  })

  it('says so when the hours are not given, or the mairie not found', () => {
    expect(checkTile(officeTile('Bordeaux', withHours(MAIRIE, []), undefined, wednesday(10)))).toEqual({
      title: 'Mairie de Bordeaux',
      lines: [{ text: 'horaires non précisés', tone: 'dim' }]
    })
    expect(checkTile(officeTile('Bordeaux', undefined, CAF, wednesday(10)))).toEqual({
      title: 'Mairie de Bordeaux',
      lines: [
        { text: 'introuvable dans l’annuaire', tone: 'dim' },
        { text: 'Caf : ouverte jusqu’à 12 h', tone: 'dim' }
      ]
    })
  })

  it('is the user’s commune’s, asked as the screen asks the offices near it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(wednesday(15, 20))
    const { ctx, urls } = fakeContext(pkg, { answer: directory, communes: [BORDEAUX], home: HOME })
    const tile = checkTile(await service.activate(ctx).tile!())
    expect(tile).toEqual(checkTile(officeTile('Bordeaux', MAIRIE, CAF, wednesday(15, 20))))
    expect(urls.map((u) => [whereOf(u).match(/"(mairie|caf)"/)?.[1], u.searchParams.get('limit')])).toEqual([
      ['mairie', '2'],
      ['caf', '2']
    ])
  })

  it('asks for an address without one, and reaches no host', async () => {
    const { ctx, urls } = fakeContext(pkg, { answer: directory, communes: [BORDEAUX] })
    expect(checkTile(await service.activate(ctx).tile!())).toEqual(NO_HOME_TILE)
    expect(urls).toHaveLength(0)
  })

  it('is the default tile for a commune Marianne doesn’t know, and fails when the directory does', async () => {
    const unknown = fakeContext(pkg, { answer: directory, communes: [], home: HOME })
    expect(await service.activate(unknown.ctx).tile!()).toBeNull()
    const offline = fakeContext(pkg, {
      answer: () => {
        throw new Error('HTTP 503')
      },
      communes: [BORDEAUX],
      home: HOME
    })
    // Marianne keeps the last tile.
    await expect(service.activate(offline.ctx).tile!()).rejects.toThrow('HTTP 503')
  })

  it('fails when the directory doesn’t answer for the mairie, rather than saying it isn’t listed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(wednesday(10))
    const noMairie = fakeContext(pkg, {
      answer: (url) => {
        if (whereOf(url).includes('"mairie"')) throw new Error('HTTP 502')
        return directory(url)
      },
      communes: [BORDEAUX],
      home: HOME
    })
    await expect(service.activate(noMairie.ctx).tile!()).rejects.toThrow('HTTP 502')
    // Without the Caf, the mairie's tile still comes, without its line.
    const noCaf = fakeContext(pkg, {
      answer: (url) => {
        if (whereOf(url).includes('"caf"')) throw new Error('HTTP 502')
        return directory(url)
      },
      communes: [BORDEAUX],
      home: HOME
    })
    expect(checkTile(await service.activate(noCaf.ctx).tile!())).toEqual(checkTile(officeTile('Bordeaux', MAIRIE, undefined, wednesday(10))))
  })

  it('is asked every 5 minutes', () => {
    expect(service.tile).toEqual({ everyMinutes: 5 })
  })
})

describe('the manifest', () => {
  it('has its icon and declares the tools its main side lends', () => {
    const manifest = readManifest(pkg)
    expect(manifest.icon).toEqual(pkg.marianne.icon)
    const { ctx } = fakeContext(pkg)
    expect(manifest.tools).toEqual(service.activate(ctx).tools?.map((t) => ({ name: t.name, label: t.label })))
  })
})
