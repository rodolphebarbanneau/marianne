import { table } from '@marianne/sdk/main'
import { AIR_CREDIT, SOURCE_URL, TREND_CREDIT } from './credits'
import { airLevel, uvLevel } from './format'
import { intensity, rainOutlook, type Fall } from './outlook'
import { compassEn, weatherLabel } from './sky'
import type { AirQuality, Forecast, Model, Pollen, Trend } from './types'

/** What the tools tell the engines: compact Markdown, in English, with the model behind each figure and the credits to cite. */

/** Beyond this many days, a day is a trend. */
export const WEEK = 7

const MODELS: Record<Model, string> = { meteofrance: 'Météo-France (AROME, ARPEGE)', ecmwf: 'ECMWF IFS' }
const FALLS: Record<Fall, string> = { bruine: 'drizzle', pluie: 'rain', averses: 'showers', neige: 'snow', orage: 'thunderstorm' }

const tenth = (n: number) => String(Math.round(n * 10) / 10)
const hundredth = (n: number) => String(Math.round(n * 100) / 100)
const whole = (n: number) => String(Math.round(n) || 0)
const local = (time: string) => time.replace('T', ' ')
/** "Thu 2026-10-29": the weekday of a calendar date, whatever the computer's time zone. */
const weekday = (date: string) => `${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} ${date}`

function head(f: Forecast, what: string): string[] {
  const c = f.commune
  const lines = [
    `## ${what} in ${c.name} (INSEE ${c.code}${c.departmentName ? `, ${c.departmentName}` : ''})`,
    `At the commune's centre (${hundredth(f.latitude)}, ${hundredth(f.longitude)}, elevation ${whole(f.elevation)} m); local times; weather labels in French.`
  ]
  if (f.now) {
    const n = f.now
    lines.push(
      '',
      `**Now** (${local(n.time)}): ${tenth(n.temperature)} °C, feels like ${tenth(n.feelsLike)} °C · ${n.label} · humidity ${whole(n.humidity)} % · ` +
        `wind from ${compassEn(n.windDirection)} ${whole(n.windSpeed)} km/h, gusts ${whole(n.windGusts)} km/h · precipitation ${tenth(n.precipitation)} mm`
    )
  }
  return lines
}

/** The rain to come, in one line: rain now and until when, within the quarters, within the day ahead, or none. */
function outlookLine(f: Forecast): string {
  const o = rainOutlook(f.now, f.quarters, f.hours)
  const source = f.quarters.length ? 'AROME 15-minute run, then hourly' : 'hourly; no 15-minute run here'
  const what = FALLS[o.fall]
  const text =
    o.state === 'now'
      ? `${what} now${o.at ? `, until ${local(o.at)}` : ', for the next hours'}`
      : o.state === 'soon'
        ? `${what} from ${local(o.at ?? '')}`
        : o.state === 'later'
          ? `${what} from about ${local(o.at ?? '')}${o.chance !== null ? ` (chance ${whole(o.chance)} %)` : ''}`
          : `dry${o.at ? ` until at least ${local(o.at)}` : ''}`
  return `**Rain outlook** (${source}): ${text}`
}

const credit = (...lines: string[]) => `Credit (cite it): ${lines.join(' · ')} · ${SOURCE_URL}`

export interface ForecastExtras {
  days: number
  air: AirQuality | null
  trend: Trend | null
}

/** A forecast for the model: now, the rain to come, the days asked (with the ensemble's ranges past a week), the air. */
export function describeForecast(f: Forecast, { days, air, trend }: ForecastExtras): string {
  const shown = f.days.slice(0, days)
  const long = days > WEEK
  const spread = new Map((trend?.days ?? []).map((d) => [d.date, d]))
  const uv = new Map((air?.days ?? []).map((d) => [d.date, d.uv]))
  const lines = [...head(f, 'Weather'), '', outlookLine(f), '']
  const columns = [
    'day',
    'weather',
    'min °C',
    'max °C',
    'feels like °C',
    'rain mm',
    'chance of rain',
    'wind km/h',
    'gusts km/h',
    'UV max',
    'sunrise',
    'sunset',
    'model'
  ]
  const ranges = long && trend ? ['likely min °C', 'likely max °C', 'rainy runs', 'confidence'] : []
  lines.push(
    shown.length
      ? table(
          [...columns, ...ranges],
          shown.map((d) => {
            const t = spread.get(d.date)
            const u = uv.get(d.date)
            return [
              weekday(d.date),
              d.label,
              tenth(d.min),
              tenth(d.max),
              `${whole(d.feelsLikeMin)} to ${whole(d.feelsLikeMax)}`,
              tenth(d.precipitation),
              d.precipitationChance === null ? '' : `${whole(d.precipitationChance)} %`,
              `${compassEn(d.windDirection)} ${whole(d.windSpeed)}`,
              whole(d.windGusts),
              u === null || u === undefined ? '' : tenth(u),
              d.sunrise,
              d.sunset,
              MODELS[d.model],
              ...(ranges.length
                ? t
                  ? [`${whole(t.min.low)} to ${whole(t.min.high)}`, `${whole(t.max.low)} to ${whole(t.max.high)}`, `${whole(t.rain * 100)} %`, t.confidence]
                  : ['', '', '', '']
                : [])
            ]
          })
        )
      : 'No daily forecast for this place.'
  )
  if (long)
    lines.push(
      '',
      trend
        ? `Beyond about ${WEEK} days this is a trend, not a forecast: give the likely ranges (8 of the ensemble's ${trend.members} runs in 10 fall within them) and the confidence, not single figures. "rainy runs": the share of runs with at least 1 mm.`
        : `Beyond about ${WEEK} days this is a trend, not a forecast: say so, and round the figures. (The ensemble's ranges could not be read.)`
    )
  if (air) {
    const level = air.aqi === null ? '' : ` · European air quality index ${whole(air.aqi)} (${airLevel(air.aqi).label})`
    lines.push(
      '',
      `### Air quality, UV and pollen (CAMS)`,
      `Now (${local(air.time)})${level}${air.uv === null ? '' : ` · UV ${tenth(air.uv)} (${uvLevel(air.uv).label})`}`,
      table(
        ['day', 'air quality index max', 'UV max', 'pollen grains/m³ (max)'],
        air.days.map((d) => [
          weekday(d.date),
          d.aqi === null ? '' : `${whole(d.aqi)} (${airLevel(d.aqi).label})`,
          d.uv === null ? '' : `${tenth(d.uv)} (${uvLevel(d.uv).label})`,
          (Object.entries(d.pollen) as Array<[Pollen, number]>).map(([p, n]) => `${p} ${n}`).join(', ') || 'none'
        ])
      ),
      'The index and its words are the European one (CAMS model), not the official ATMO index of the regional air monitoring networks.'
    )
  }
  lines.push('', credit(f.credit, ...(long && trend ? [TREND_CREDIT] : []), ...(air ? [AIR_CREDIT] : [])))
  return lines.join('\n')
}

/** The hours to come for the model: now, the quarters of the next two hours where AROME reaches, then hour by hour. */
export function describeHours(f: Forecast, hours: number): string {
  const lines = [...head(f, 'Weather by the hour'), '', outlookLine(f), '']
  lines.push(
    f.quarters.length
      ? `**Next two hours, every 15 minutes** (Météo-France AROME):\n${table(
          ['from', 'precipitation mm', 'intensity'],
          f.quarters.map((q) => [local(q.time), hundredth(q.precipitation), intensity(q.precipitation)])
        )}`
      : 'No 15-minute forecast here: AROME’s 15-minute run covers metropolitan France only.',
    ''
  )
  const shown = f.hours.slice(0, hours)
  lines.push(
    shown.length
      ? table(
          ['hour', 'weather', '°C', 'feels like °C', 'rain mm', 'chance of rain', 'wind km/h', 'gusts km/h', 'humidity %', 'model'],
          shown.map((h) => [
            local(h.time),
            weatherLabel(h.code),
            tenth(h.temperature),
            tenth(h.feelsLike),
            tenth(h.precipitation),
            h.precipitationChance === null ? '' : `${whole(h.precipitationChance)} %`,
            `${compassEn(h.windDirection)} ${whole(h.windSpeed)}`,
            whole(h.windGusts),
            whole(h.humidity),
            MODELS[h.model]
          ])
        )
      : 'No hourly forecast for this place.',
    '',
    credit(f.credit)
  )
  return lines.join('\n')
}
