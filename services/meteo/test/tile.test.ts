import { readManifest } from '@marianne/sdk'
import { checkTile, fakeContext } from '@marianne/sdk/testing'
import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { service } from '../src/main'
import { coming, dayColor, NO_HOME_TILE, shortDegrees, unitOf, weatherTile, weekday } from '../src/tile'
import type { WeatherNow } from '../src/types'
import { mapWeather } from '../src/weather'
import { BORDEAUX, FIXTURE } from './fixtures'

const HOME = { code: BORDEAUX.code, name: BORDEAUX.name, postcode: '33000' }

/** The conditions at 17:45, with a WMO code. */
const now = (code: number, label = 'Ciel dégagé'): WeatherNow => ({ ...mapWeather(FIXTURE).now!, code, label })
/** The hours from 18:00 on, with these codes. */
const hours = (...codes: number[]) => codes.map((code, i) => ({ time: `2026-10-28T${18 + i}:00`, code }))

describe('what the tile says of the weather', () => {
  it('names the days, writes the degrees, colours the days by their weather', () => {
    expect(['2026-10-28', '2026-10-29', '2026-11-01'].map(weekday)).toEqual(['mer', 'jeu', 'dim'])
    expect([16.6, 15.4, -0.3, -2.6].map(shortDegrees)).toEqual(['17°', '15°', '0°', '-3°'])
    expect([0, 2, 3, 45, 51, 61, 71, 80, 86, 95].map(dayColor)).toEqual([
      'jaune',
      'jaune',
      'gris-clair',
      'gris-clair',
      'cyan',
      'cyan',
      'blanc',
      'cyan',
      'blanc',
      'cyan'
    ])
  })

  it('tells what starts, or stops, in the next hours, else the weather now', () => {
    expect(coming(now(0), hours(0, 3, 80))).toBe('averses à 20 h')
    expect(coming(now(61, 'Pluie faible'), hours(61, 63, 2))).toBe('pluie jusqu’à 20 h')
    expect(coming(now(61, 'Pluie faible'), hours(61, 63, 63))).toBe('pluie faible')
    expect(coming(now(3, 'Couvert'), hours(3, 3))).toBe('couvert')
    expect(coming(now(1), [{ time: '2026-10-29T07:00', code: 73 }])).toBe('neige demain à 7 h')
    expect(coming(now(45, 'Brouillard'), [{ time: '2026-10-29T10:00', code: 1 }])).toBe('brouillard jusqu’à demain 10 h')
  })

  it('cuts a long commune’s name rather than what is coming', () => {
    expect(unitOf('Bordeaux', 'averses à 16 h')).toBe('Bordeaux · averses à 16 h')
    const unit = unitOf('Saint-Rémy-en-Bouzemont-Saint-Genest-et-Isson', 'averses à 16 h')
    expect(unit).toBe('Saint-Rémy-en-Bouzemon… · averses à 16 h')
    expect([...unit]).toHaveLength(40)
  })
})

describe('the tile', () => {
  it('shows the temperature, what is coming, the next days and the wind', () => {
    expect(checkTile(weatherTile('Bordeaux', mapWeather(FIXTURE)))).toEqual({
      value: { text: '17°', unit: 'Bordeaux · averses à 20 h' },
      visual: {
        kind: 'bars',
        bars: [
          { value: 17.7, label: 'mer', text: '18°', color: 'gris-clair' },
          { value: 16.1, label: 'jeu', text: '16°', color: 'cyan' },
          { value: 15.8, label: 'ven', text: '16°', color: 'cyan' }
        ]
      },
      lines: [{ text: 'vent 10 km/h, rafales 19', tone: 'dim' }]
    })
  })

  it('keeps five days at most, and names the commune without current conditions', () => {
    const w = mapWeather(FIXTURE)
    const week = { ...w, now: null, days: Array.from({ length: 7 }, (_, i) => ({ ...w.days[0], date: `2026-11-0${i + 1}` })) }
    const tile = checkTile(weatherTile('Bordeaux', week))
    expect(tile?.title).toBe('Bordeaux')
    expect(tile?.visual?.kind === 'bars' && tile.visual.bars.map((b) => b.label)).toEqual(['dim', 'lun', 'mar', 'mer', 'jeu'])
    expect(tile?.lines).toEqual([{ text: 'vent 11 km/h, rafales 21', tone: 'dim' }])
    expect(weatherTile('Bordeaux', { ...w, now: null, days: [] })).toBeNull()
  })

  it('is the user’s commune’s, asked as the screen asks it', async () => {
    const { ctx, urls } = fakeContext(pkg, { answer: () => FIXTURE, communes: [BORDEAUX], home: HOME })
    const tile = checkTile(await service.activate(ctx).tile!())
    expect(tile?.value).toEqual({ text: '17°', unit: 'Bordeaux · averses à 20 h' })
    expect(urls).toHaveLength(1)
    expect(Object.fromEntries(urls[0].searchParams)).toMatchObject({ latitude: '44.862', longitude: '-0.585', hourly: 'weather_code' })
  })

  it('asks for an address without one, and reaches no host', async () => {
    const { ctx, urls } = fakeContext(pkg, { answer: () => FIXTURE, communes: [BORDEAUX] })
    expect(checkTile(await service.activate(ctx).tile!())).toEqual(NO_HOME_TILE)
    expect(urls).toHaveLength(0)
  })

  it('is the default tile for a commune Marianne doesn’t know, and fails when the forecast does', async () => {
    const unknown = fakeContext(pkg, { answer: () => FIXTURE, communes: [], home: HOME })
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

  it('is asked every 30 minutes', () => {
    expect(service.tile).toEqual({ everyMinutes: 30 })
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
