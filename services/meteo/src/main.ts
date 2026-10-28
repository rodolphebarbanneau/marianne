import { defineService, defineTool, ToolError, type ServiceContext, type ServiceTool } from '@marianne/sdk/main'
import * as z from 'zod'
import type { MeteoMethods } from './types'
import { communeForecast, communeWeather, describeForecast, placeOf } from './weather'

/** 3615 METEO: the weather of a commune, now and over the next seven days. */

const SEARCH_LIMIT = 8

function forecastTool(ctx: Pick<ServiceContext, 'http' | 'geo'>): ServiceTool {
  return defineTool({
    name: 'forecast',
    label: 'prévisions',
    description:
      'Weather forecast for a French commune, metropolitan or overseas: the current conditions (temperature, feels like, humidity, wind and gusts, precipitation) and the next 7 days ' +
      '(min and max temperature, precipitation and chance of rain, wind and gusts, sunrise and sunset), with the model used each day: Météo-France (AROME, ARPEGE) for the first days, ' +
      'then ECMWF. Cite the credit line it gives.',
    input: { commune: z.string().trim().min(2).describe('The commune: name ("Bordeaux"), postal code ("33000") or INSEE code ("33063")') },
    readOnly: true,
    run: async ({ commune }) => {
      const found = await ctx.geo.findCommunes(commune, 5)
      if (!found.length) throw new ToolError(`No French commune matches "${commune}": give its name, postal code or INSEE code.`)
      const [first, ...others] = found
      const text = describeForecast(await communeWeather(ctx, first))
      if (!others.length) return text
      return `${text}\n\nOther communes matching "${commune}": ${others.map((c) => `${c.name} (INSEE ${c.code}, ${c.departmentName})`).join(', ')}; ask again with the INSEE code for one of them.`
    }
  })
}

export const service = defineService<MeteoMethods>({
  activate(ctx) {
    return {
      methods: {
        async forecast(code) {
          const forecast = await communeForecast(ctx, code)
          if (!forecast) throw new Error(`Commune introuvable : ${code}`)
          return forecast
        },
        async communes(text) {
          const term = text.trim()
          return term.length < 2 ? [] : (await ctx.geo.findCommunes(term, SEARCH_LIMIT)).map(placeOf)
        }
      },
      tools: [forecastTool(ctx)]
    }
  }
})
