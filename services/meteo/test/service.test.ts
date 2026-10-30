import { ToolError, type Commune, type ServiceTool } from '@marianne/sdk/main'
import { fakeContext } from '@marianne/sdk/testing'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import pkg from '../package.json'
import { AIR_CREDIT, CREDIT, TREND_CREDIT } from '../src/credits'
import { service } from '../src/main'
import type { AirQuality, Forecast, Place, Trend } from '../src/types'
import { answer, BORDEAUX, BORDEAUX_SAINT_CLAIR, FORT_DE_FRANCE } from './fixtures'

const setup = (communes: Commune[] = [BORDEAUX, BORDEAUX_SAINT_CLAIR], reply: (url: URL) => unknown = answer) => {
  const { ctx, urls } = fakeContext(pkg, { answer: reply, communes })
  const runtime = service.activate(ctx)
  const tool = (name: string) => {
    const t = runtime.tools?.find((x) => x.name === name) as ServiceTool
    // As Marianne's MCP server does: the arguments are parsed with the tool's input first.
    return (args: unknown) => t.run(z.object(t.input).parse(args), {})
  }
  return { runtime, forecast: tool('forecast'), hourly: tool('hourly'), urls }
}

describe('meteo_forecast', () => {
  it('gives the conditions, the rain to come, a week with its models and UV, the air, and the credits', async () => {
    const { forecast, urls } = setup([BORDEAUX])
    const text = await forecast({ commune: ' 33063 ' })
    // The forecast and the air; the ensemble only past a week.
    expect(urls.map((u) => u.hostname)).toEqual(['api.open-meteo.com', 'air-quality-api.open-meteo.com'])
    expect(Object.fromEntries(urls[0].searchParams)).toMatchObject({ latitude: '44.862', longitude: '-0.585', models: 'meteofrance_seamless,ecmwf_ifs025' })
    expect(text).toContain('## Weather in Bordeaux (INSEE 33063, Gironde)')
    expect(text).toContain("At the commune's centre (44.84, -0.58, elevation 22 m)")
    expect(text).toContain(
      '**Now** (2026-10-28 17:45): 16.6 °C, feels like 14.4 °C · Ciel dégagé · humidity 56 % · wind from NE 10 km/h, gusts 19 km/h · precipitation 0 mm'
    )
    expect(text).toContain('**Rain outlook** (AROME 15-minute run, then hourly): rain from 2026-10-28 18:15')
    expect(text).toContain('| Wed 2026-10-28 | Couvert | 9 | 17.7 | 7 to 16 | 4.1 | 85 % | N 18 | 45 | 3.3 | 07:34 | 17:56 | Météo-France (AROME, ARPEGE) |')
    expect(text).toContain('| Fri 2026-10-30 | Averses | 6.1 | 15.8 | 4 to 14 | 2.3 | 60 % | NW 12 | 25 |  | 07:37 | 17:53 | ECMWF IFS |')
    expect(text).not.toContain('likely max')
    expect(text).toContain('Now (2026-10-28 17:00) · European air quality index 49 (dégradé) · UV 0.3 (faible)')
    expect(text).toContain('| Wed 2026-10-28 | 55 (dégradé) | 3.3 (modéré) | grass 12 |')
    expect(text).toContain('| Thu 2026-10-29 | 25 (moyen) | 2.1 (faible) | none |')
    expect(text).toContain(`Credit (cite it): ${CREDIT} · ${AIR_CREDIT} · https://open-meteo.com/`)
    expect(text).not.toContain('Other communes')
  })

  it('past a week, adds where the ensemble’s runs fall and how sure it is', async () => {
    const { forecast, urls } = setup([BORDEAUX])
    const text = await forecast({ commune: 'Bordeaux', days: 15 })
    expect(urls.map((u) => u.hostname)).toContain('ensemble-api.open-meteo.com')
    expect(text).toContain('| likely min °C | likely max °C | rainy runs | confidence |')
    expect(text).toContain('| 9 to 9 | 17 to 18 | 0 % | high |')
    expect(text).toContain('| 3 to 9 | 11 to 20 | 40 % | low |')
    expect(text).toContain("Beyond about 7 days this is a trend, not a forecast: give the likely ranges (8 of the ensemble's 5 runs in 10 fall within them)")
    expect(text).toContain(`Credit (cite it): ${CREDIT} · ${TREND_CREDIT} · ${AIR_CREDIT}`)
  })

  it('stands without the air or the ensemble, and fails without the forecast', async () => {
    const broken = (host: string) => (url: URL) => {
      if (url.hostname === host) throw new Error('HTTP 503')
      return answer(url)
    }
    const noAir = await setup([BORDEAUX], broken('air-quality-api.open-meteo.com')).forecast({ commune: 'Bordeaux', days: 10 })
    expect(noAir).toContain('## Weather in Bordeaux')
    expect(noAir).not.toContain('Air quality')
    const noTrend = await setup([BORDEAUX], broken('ensemble-api.open-meteo.com')).forecast({ commune: 'Bordeaux', days: 10 })
    expect(noTrend).toContain("(The ensemble's ranges could not be read.)")
    await expect(setup([BORDEAUX], broken('api.open-meteo.com')).forecast({ commune: 'Bordeaux' })).rejects.toThrow('HTTP 503')
  })

  it('takes the most populated match and names the others', async () => {
    const text = await setup().forecast({ commune: 'Bordeaux' })
    expect(text).toContain('## Weather in Bordeaux (INSEE 33063, Gironde)')
    expect(text).toContain('Other communes matching "Bordeaux": Bordeaux-Saint-Clair (INSEE 76117, Seine-Maritime)')
  })

  it('tells the model when no commune matches, and refuses what can’t be searched', async () => {
    const { forecast, urls } = setup()
    const failure = forecast({ commune: 'Atlantis' })
    await expect(failure).rejects.toBeInstanceOf(ToolError)
    await expect(failure).rejects.toThrow('No French commune matches "Atlantis"')
    expect(urls).toHaveLength(0)
    expect(() => setup().forecast({ commune: ' a ' })).toThrow()
    expect(() => setup().forecast({ commune: 'Bordeaux', days: 16 })).toThrow()
  })
})

describe('meteo_hourly', () => {
  it('gives the quarters of the next two hours, then the hours asked', async () => {
    const { hourly, urls } = setup([BORDEAUX])
    const text = await hourly({ commune: 'Bordeaux', hours: 3 })
    expect(urls.map((u) => u.hostname)).toEqual(['api.open-meteo.com'])
    expect(text).toContain('## Weather by the hour in Bordeaux (INSEE 33063, Gironde)')
    expect(text).toContain('**Next two hours, every 15 minutes** (Météo-France AROME):')
    expect(text).toContain('| 2026-10-28 18:15 | 0.1 | light |')
    expect(text).toContain('| 2026-10-28 18:45 | 2.2 | heavy |')
    expect(text).toContain('| 2026-10-28 20:00 | Pluie | 14.2 | 12.1 | 3.1 | 85 % | SW 18 | 45 | 85 | Météo-France (AROME, ARPEGE) |')
    expect(text).not.toContain('2026-10-28 21:00 |')
    expect(text).toContain(`Credit (cite it): ${CREDIT}`)
  })

  it('says overseas that the 15-minute run doesn’t reach it', async () => {
    const text = await setup([FORT_DE_FRANCE]).hourly({ commune: 'Fort-de-France' })
    expect(text).toContain('No 15-minute forecast here')
    expect(text).toContain('**Rain outlook** (hourly; no 15-minute run here)')
  })

  it('refuses more hours than it has', () => {
    expect(() => setup().hourly({ commune: 'Bordeaux', hours: 49 })).toThrow()
  })
})

describe('methods', () => {
  it('forecast: the weather of a commune by INSEE code, with the commune', async () => {
    const forecast = (await setup().runtime.methods.forecast('33063')) as Forecast
    expect(forecast.commune).toEqual({ code: '33063', name: 'Bordeaux', postalCodes: BORDEAUX.postalCodes, department: '33', departmentName: 'Gironde' })
    expect(forecast.days).toHaveLength(3)
    expect(forecast.hours).toHaveLength(5)
    expect(forecast.quarters).toHaveLength(8)
    expect(forecast.now?.temperature).toBe(16.6)
  })

  it('air and trend: the commune’s, at its centre', async () => {
    const { runtime, urls } = setup()
    const air = (await runtime.methods.air('33063')) as AirQuality
    expect(air.days.map((d) => d.date)).toEqual(['2026-10-28', '2026-10-29'])
    const trend = (await runtime.methods.trend('33063')) as Trend
    expect(trend.days[2].confidence).toBe('low')
    expect(urls.map((u) => [u.hostname, u.searchParams.get('latitude')])).toEqual([
      ['air-quality-api.open-meteo.com', '44.862'],
      ['ensemble-api.open-meteo.com', '44.862']
    ])
  })

  it('a French error for an unknown commune', async () => {
    const { runtime } = setup()
    for (const method of ['forecast', 'air', 'trend'] as const)
      await expect(Promise.resolve(runtime.methods[method]('99999'))).rejects.toThrow('Commune introuvable : 99999')
  })

  it('communes: matches as places, nothing for less than two characters', async () => {
    const { runtime } = setup()
    expect(((await runtime.methods.communes('bordeaux')) as Place[]).map((p) => p.code)).toEqual(['33063', '76117'])
    expect(await runtime.methods.communes(' b ')).toEqual([])
  })
})
