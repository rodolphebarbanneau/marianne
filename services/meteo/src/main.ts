import { defineService, defineTool, ToolError, type Commune, type ServiceContext, type ServiceTool } from '@marianne/sdk/main'
import * as z from 'zod'
import { air } from './air'
import { describeForecast, describeHours, WEEK } from './describe'
import { meteoTile } from './tile'
import { trend } from './trend'
import type { MeteoMethods } from './types'
import { communeForecast, communeWeather, FORECAST_DAYS, NEXT_HOURS, placeOf } from './weather'

/** 3615 METEO: the weather of a commune, now, hour by hour over two days, and over the next 15. */

const SEARCH_LIMIT = 8

type Context = Pick<ServiceContext, 'http' | 'geo'>

const communeInput = z.string().trim().min(2).describe('The commune: name ("Bordeaux"), postal code ("33000") or INSEE code ("33063")')

/** The commune a tool was asked for, the most populated first, and the others it could be; a ToolError when none matches. */
async function findCommune(ctx: Context, text: string): Promise<{ commune: Commune; others: string }> {
  const found = await ctx.geo.findCommunes(text, 5)
  if (!found.length) throw new ToolError(`No French commune matches "${text}": give its name, postal code or INSEE code.`)
  const [commune, ...rest] = found
  const others = rest.length
    ? `\n\nOther communes matching "${text}": ${rest.map((c) => `${c.name} (INSEE ${c.code}, ${c.departmentName})`).join(', ')}; ask again with the INSEE code for one of them.`
    : ''
  return { commune, others }
}

/** A commune by INSEE code, for the screen; a French error when there is none. */
async function communeOf(ctx: Context, code: string): Promise<Commune> {
  const commune = await ctx.geo.getCommune(code)
  if (!commune) throw new Error(`Commune introuvable : ${code}`)
  return commune
}

function forecastTool(ctx: Context): ServiceTool {
  return defineTool({
    name: 'forecast',
    label: 'prévisions',
    description:
      'Weather forecast for a French commune, metropolitan or overseas: the current conditions (temperature, feels like, humidity, wind and gusts, precipitation), the rain to come, ' +
      'and the next days (7 by default, up to 15: min and max temperature, feels like, precipitation and chance of rain, wind and gusts, UV, sunrise and sunset), with the model ' +
      'of each day: Météo-France (AROME, ARPEGE) for the first days, then ECMWF. Beyond 7 days it adds the European ensemble’s likely ranges and a confidence. Also air quality, ' +
      'UV and pollen (CAMS) for the next 4 days. Cite the credit line it gives.',
    input: {
      commune: communeInput,
      days: z.number().int().min(1).max(FORECAST_DAYS).optional().describe(`How many days, today first: ${WEEK} by default, up to ${FORECAST_DAYS}`)
    },
    readOnly: true,
    run: async ({ commune: text, days = WEEK }) => {
      const { commune, others } = await findCommune(ctx, text)
      // The air and the ensemble are extras: the forecast stands without them.
      const [weather, airNow, scenarios] = await Promise.allSettled([
        communeWeather(ctx, commune),
        air(ctx.http, commune.latitude, commune.longitude),
        days > WEEK ? trend(ctx.http, commune.latitude, commune.longitude) : Promise.resolve(null)
      ])
      if (weather.status === 'rejected') throw weather.reason
      const extras = {
        days,
        air: airNow.status === 'fulfilled' ? airNow.value : null,
        trend: scenarios.status === 'fulfilled' ? scenarios.value : null
      }
      return describeForecast(weather.value, extras) + others
    }
  })
}

function hourlyTool(ctx: Context): ServiceTool {
  return defineTool({
    name: 'hourly',
    label: 'heure par heure',
    description:
      'Hour-by-hour weather for a French commune over the next hours (24 by default, up to 48): temperature, feels like, precipitation and chance of rain, wind and gusts, humidity, ' +
      'the sky; and, in metropolitan France, the precipitation of the next two hours by quarter of an hour (Météo-France AROME), for "will it rain in the next hour". Cite the credit line it gives.',
    input: {
      commune: communeInput,
      hours: z.number().int().min(1).max(NEXT_HOURS).optional().describe(`How many hours after the current one: 24 by default, up to ${NEXT_HOURS}`)
    },
    readOnly: true,
    run: async ({ commune: text, hours = 24 }) => {
      const { commune, others } = await findCommune(ctx, text)
      return describeHours(await communeWeather(ctx, commune), hours) + others
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
        async air(code) {
          const commune = await communeOf(ctx, code)
          return air(ctx.http, commune.latitude, commune.longitude)
        },
        async trend(code) {
          const commune = await communeOf(ctx, code)
          return trend(ctx.http, commune.latitude, commune.longitude)
        },
        async communes(text) {
          const term = text.trim()
          return term.length < 2 ? [] : (await ctx.geo.findCommunes(term, SEARCH_LIMIT)).map(placeOf)
        }
      },
      tools: [forecastTool(ctx), hourlyTool(ctx)],
      tile: () => meteoTile(ctx)
    }
  },
  // The weather of the next hours moves slowly; the forecast is cached 15 minutes anyway.
  tile: { everyMinutes: 30 }
})
