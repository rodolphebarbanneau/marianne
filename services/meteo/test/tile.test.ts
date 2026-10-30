import { readManifest } from '@marianne/sdk'
import { checkTile, fakeContext } from '@marianne/sdk/testing'
import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { service } from '../src/main'
import { barLabel, dayTileLine, NO_HOME_TILE, rainTileLine, unitOf, weatherTile } from '../src/tile'
import type { Weather, WeatherHour } from '../src/types'
import { mapWeather } from '../src/weather'
import { answer, BORDEAUX, FIXTURE } from './fixtures'

const HOME = { code: BORDEAUX.code, name: BORDEAUX.name, postcode: '33000' }
const W = mapWeather(FIXTURE)

/** The forecast at another time of the same day. */
const at = (time: string): Weather => ({ ...W, now: { ...W.now!, time: `2026-10-28T${time}` } })
/** The next hours, with one of them changed. */
const withHour = (i: number, change: Partial<WeatherHour>): Weather => ({ ...W, hours: W.hours.map((h, j) => (j === i ? { ...h, ...change } : h)) })

describe('what the tile says', () => {
  it('labels today, then the weekdays', () => {
    expect(['2026-10-28', '2026-10-29', '2026-11-01'].map(barLabel)).toEqual(['auj.', 'jeu', 'dim'])
  })

  it('cuts a long commune’s name rather than the sky', () => {
    expect(unitOf('Bordeaux', 'averses')).toBe('Bordeaux · averses')
    const unit = unitOf('Saint-Rémy-en-Bouzemont-Saint-Genest-et-Isson', 'partiellement nuageux')
    expect(unit).toBe('Saint-Rémy-en-B… · partiellement nuageux')
    expect([...unit]).toHaveLength(40)
  })

  it('tells the rain to come, in yellow when it is within two hours', () => {
    expect(rainTileLine(W)).toEqual({ text: 'pluie dans 30 min', tone: 'accent' })
    const dry = { ...W, quarters: W.quarters.map((q) => ({ ...q, precipitation: 0 })) }
    expect(rainTileLine(dry)).toEqual({ text: 'pluie vers 20 h (85 %)' })
    expect(rainTileLine({ ...W, now: null })).toBeNull()
  })

  it('gives the day’s low and high, tomorrow’s after sunset, with notable gusts', () => {
    expect(dayTileLine(W)).toEqual({ text: 'aujourd’hui 9° / 18°', tone: 'dim' })
    expect(dayTileLine(at('18:30'))).toEqual({ text: 'demain 8° / 16° · rafales 52 km/h', tone: 'dim' })
  })

  it('warns of strong gusts, frost and heat in the next 24 hours instead', () => {
    expect(dayTileLine(withHour(2, { windGusts: 84.6 }))).toEqual({ text: 'rafales jusqu’à 85 km/h vers 20 h', tone: 'accent' })
    expect(dayTileLine(withHour(4, { time: '2026-10-29T06:00', temperature: -2.4 }))).toEqual({ text: 'gelée : -2° demain vers 6 h', tone: 'accent' })
    expect(dayTileLine(withHour(0, { temperature: 36.2 }))).toEqual({ text: 'forte chaleur : 36° vers 18 h', tone: 'accent' })
  })
})

describe('the tile', () => {
  it('shows the temperature and the sky, the week from its coldest low, the rain to come and the day', () => {
    expect(checkTile(weatherTile('Bordeaux', W))).toEqual({
      value: { text: '17°', unit: 'Bordeaux · ciel dégagé' },
      visual: {
        kind: 'bars',
        bars: [
          { value: 17.7, label: 'auj.', text: '18°', color: 'gris-clair' },
          { value: 16.1, label: 'jeu', text: '16°', color: 'cyan' },
          { value: 15.8, label: 'ven', text: '16°', color: 'cyan' }
        ],
        range: [6, 18]
      },
      lines: [
        { text: 'pluie dans 30 min', tone: 'accent' },
        { text: 'aujourd’hui 9° / 18°', tone: 'dim' }
      ]
    })
  })

  it('keeps seven days at most, names the commune without current conditions, and draws no range of nothing', () => {
    const week = { ...W, now: null, days: Array.from({ length: 9 }, (_, i) => ({ ...W.days[0], date: `2026-11-0${i + 1}`, min: 10, max: 10 })) }
    const tile = checkTile(weatherTile('Bordeaux', week))
    expect(tile?.title).toBe('Bordeaux')
    expect(tile?.visual?.kind === 'bars' && tile.visual.bars.map((b) => b.label)).toEqual(['auj.', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'])
    expect(tile?.visual?.kind === 'bars' && tile.visual.range).toBeUndefined()
    expect(tile?.lines).toEqual([{ text: 'aujourd’hui 10° / 10°', tone: 'dim' }])
    expect(weatherTile('Bordeaux', { ...W, now: null, days: [] })).toBeNull()
  })

  it('stays within Marianne’s limits whatever the weather says', () => {
    const long = { ...W, now: { ...W.now!, code: 99, label: 'Orage avec forte grêle', temperature: -12.4 } }
    expect(() =>
      checkTile(weatherTile('Saint-Rémy-en-Bouzemont-Saint-Genest-et-Isson', withHour(1, { windGusts: 112, time: '2026-10-29T15:00' })))
    ).not.toThrow()
    expect(checkTile(weatherTile('Saint-Rémy-en-Bouzemont-Saint-Genest-et-Isson', long))?.value).toEqual({
      text: '-12°',
      unit: 'Saint-Rémy-en-… · orage avec forte grêle'
    })
  })

  it('is the user’s commune’s, asked as the screen asks it, and nothing else', async () => {
    const { ctx, urls } = fakeContext(pkg, { answer, communes: [BORDEAUX], home: HOME })
    const tile = checkTile(await service.activate(ctx).tile!())
    expect(tile?.value).toEqual({ text: '17°', unit: 'Bordeaux · ciel dégagé' })
    expect(urls.map((u) => u.hostname)).toEqual(['api.open-meteo.com'])
    expect(Object.fromEntries(urls[0].searchParams)).toMatchObject({ latitude: '44.862', longitude: '-0.585', forecast_days: '15' })
  })

  it('asks for an address without one, and reaches no host', async () => {
    const { ctx, urls } = fakeContext(pkg, { answer, communes: [BORDEAUX] })
    expect(checkTile(await service.activate(ctx).tile!())).toEqual(NO_HOME_TILE)
    expect(urls).toHaveLength(0)
  })

  it('is the default tile for a commune Marianne doesn’t know, and fails when the forecast does', async () => {
    const unknown = fakeContext(pkg, { answer, communes: [], home: HOME })
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
  it('has its icon, its four tabs, its search, and declares the tools its main side lends', () => {
    const manifest = readManifest(pkg)
    expect(manifest.icon).toEqual(pkg.marianne.icon)
    expect(manifest.tabs.map((t) => t.id)).toEqual(['today', 'hours', 'week', 'trend'])
    expect(manifest.search?.placeholder).toBeTruthy()
    expect(manifest.hosts).toEqual(['api.open-meteo.com', 'air-quality-api.open-meteo.com', 'ensemble-api.open-meteo.com'])
    const { ctx } = fakeContext(pkg)
    expect(manifest.tools).toEqual(service.activate(ctx).tools?.map((t) => ({ name: t.name, label: t.label })))
  })
})
