import { ToolError, type ServiceTool } from '@marianne/sdk/main'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { service } from '../src/main'
import type { Forecast, Place } from '../src/types'
import { fakeContext } from './context'
import { BORDEAUX, BORDEAUX_SAINT_CLAIR, FIXTURE } from './fixtures'

const setup = (communes = [BORDEAUX, BORDEAUX_SAINT_CLAIR]) => {
  const { ctx, urls } = fakeContext(() => FIXTURE, communes)
  const runtime = service.activate(ctx)
  const tool = runtime.tools?.find((t) => t.name === 'forecast') as ServiceTool
  // As Marianne's MCP server does: the arguments are parsed with the tool's input first.
  const run = (args: unknown) => tool.run(z.object(tool.input).parse(args), {})
  return { runtime, run, urls }
}

describe('meteo_forecast', () => {
  it('gives the current conditions and each day with its model, and the credit', async () => {
    const { run, urls } = setup([BORDEAUX])
    const text = await run({ commune: ' 33063 ' })
    expect(urls).toHaveLength(1)
    const url = new URL(urls[0])
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      latitude: '44.862',
      longitude: '-0.585',
      models: 'meteofrance_seamless,ecmwf_ifs025',
      timezone: 'auto',
      forecast_days: '7'
    })
    expect(text).toContain('## Weather in Bordeaux (INSEE 33063, Gironde)')
    expect(text).toContain("At the commune's centre (44.84, -0.58, elevation 22 m)")
    expect(text).toContain(
      '**Now** (2026-10-28 17:45): 16.6 °C, feels like 14.4 °C · Ciel dégagé · humidity 56 % · wind from NE 10 km/h, gusts 19 km/h · precipitation 0 mm'
    )
    expect(text).toContain('| Wed 2026-10-28 | Couvert | 9 | 17.7 | 0 | 2 % | N 11 | 21 | 07:34 | 17:56 | Météo-France (AROME, ARPEGE) |')
    expect(text).toContain('| Fri 2026-10-30 | Averses | 6.1 | 15.8 | 2.3 | 60 % | NW 12 | 25 | 07:37 | 17:53 | ECMWF IFS |')
    expect(text).not.toContain('2026-10-31')
    expect(text).toContain(
      'Credit (cite it): Prévisions Météo-France (AROME, ARPEGE) et CEPMMT, via Open-Meteo (CC BY 4.0) · https://open-meteo.com/en/docs/meteofrance-api'
    )
    expect(text).not.toContain('Other communes')
  })

  it('takes the most populated match and names the others', async () => {
    const text = await setup().run({ commune: 'Bordeaux' })
    expect(text).toContain('## Weather in Bordeaux (INSEE 33063, Gironde)')
    expect(text).toContain('Other communes matching "Bordeaux": Bordeaux-Saint-Clair (INSEE 76117, Seine-Maritime)')
  })

  it('tells the model when no commune matches', async () => {
    const { run, urls } = setup()
    const failure = run({ commune: 'Atlantis' })
    await expect(failure).rejects.toBeInstanceOf(ToolError)
    await expect(failure).rejects.toThrow('No French commune matches "Atlantis"')
    expect(urls).toHaveLength(0)
  })

  it('refuses an argument too short to search', () => {
    expect(() => setup().run({ commune: ' a ' })).toThrow()
  })
})

describe('methods', () => {
  it('forecast: the weather of a commune by INSEE code, with the commune', async () => {
    const forecast = (await setup().runtime.methods.forecast('33063')) as Forecast
    expect(forecast.commune).toEqual({ code: '33063', name: 'Bordeaux', postalCodes: BORDEAUX.postalCodes, department: '33', departmentName: 'Gironde' })
    expect(forecast.days).toHaveLength(3)
    expect(forecast.now?.temperature).toBe(16.6)
  })

  it('forecast: a French error for an unknown commune', async () => {
    await expect(Promise.resolve(setup().runtime.methods.forecast('99999'))).rejects.toThrow('Commune introuvable : 99999')
  })

  it('communes: matches as places, nothing for less than two characters', async () => {
    const { runtime } = setup()
    expect(((await runtime.methods.communes('bordeaux')) as Place[]).map((p) => p.code)).toEqual(['33063', '76117'])
    expect(await runtime.methods.communes(' b ')).toEqual([])
  })
})
