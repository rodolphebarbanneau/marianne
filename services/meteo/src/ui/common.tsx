import type { ReactNode } from 'react'
import { paletteValue, Pixels, useHost, type PaletteColor } from '@marianne/sdk/view'
import { LICENCE_URL, SOURCE_URL } from '../credits'
import { clock, millimetres, percent, shortDay, shortDegrees, wind } from '../format'
import { skyPicture, weatherLabel } from '../sky'
import type { MeteoMethods, WeatherHour } from '../types'

/** The parts every tab of 3615 METEO draws: the sky's picture, the hours as a chart, a day's span on a scale, the credits. */

/** The sky as a mosaic of the palette, its label for those who don't see it. */
export function SkyIcon({ code, isDay = true, cell = 3 }: { code: number; isDay?: boolean; cell?: number }) {
  return <Pixels art={skyPicture(code, isDay)} cell={cell} gap={0} label={weatherLabel(code)} className="meteo-sky" />
}

/** One fact of a card: what it is, dim, then its value. */
export function Fact({ what, children }: { what: string; children: ReactNode }) {
  return (
    <>
      <span className="dim">{what}</span>
      <span>{children}</span>
    </>
  )
}

/** "21 h · 12° · Couvert · 0,2 mm (40 %) · vent SO 15 km/h, rafales 30": an hour of the chart, on hover. */
const hourTitle = (h: WeatherHour) =>
  [
    `${shortDay(h.time)} ${clock(h.time)}`,
    shortDegrees(h.temperature),
    weatherLabel(h.code),
    `${millimetres(h.precipitation)}${h.precipitationChance !== null ? ` (${percent(h.precipitationChance)})` : ''}`,
    `vent ${wind(h.windFrom, h.windSpeed)}, rafales ${Math.round(h.windGusts)}`
  ].join(' · ')

/** Under this, a chart's rain bars are drawn against 2 mm, so that a drizzle doesn't look like a downpour. */
const RAIN_SCALE_MM = 2

/**
 * The hours as a chart, one column each: the sky's picture and the temperature every `every`
 * columns, the temperature as a bar from the coldest hour shown (yellow by day, blue by night, so
 * that the days show), the rain under it against the wettest hour, a rule at midnight with the
 * day's name. A bar in the sky's colour would draw a clear night in yellow.
 */
export function HoursChart({ hours, every = 1 }: { hours: WeatherHour[]; every?: number }) {
  if (!hours.length) return <p className="dim">Pas de prévision heure par heure pour cette commune.</p>
  const temps = hours.map((h) => h.temperature)
  const [low, high] = [Math.floor(Math.min(...temps)) - 1, Math.ceil(Math.max(...temps))]
  const wettest = Math.max(RAIN_SCALE_MM, ...hours.map((h) => h.precipitation))
  return (
    <div className="meteo-chart" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
      {hours.map((h, i) => {
        const hour = Number(h.time.slice(11, 13))
        const labelled = i % every === 0
        const midnight = hour === 0 && i > 0
        return (
          <div key={h.time} className={`meteo-col${h.isDay ? '' : ' night'}${midnight ? ' midnight' : ''}`} title={hourTitle(h)}>
            {midnight && <span className="meteo-day-mark">{shortDay(h.time)}</span>}
            <span className="meteo-col-sky">{labelled && <SkyIcon code={h.code} isDay={h.isDay} cell={2} />}</span>
            <span className="meteo-col-t">{labelled ? shortDegrees(h.temperature) : ''}</span>
            <span className="meteo-col-temp">
              <i style={{ height: `${Math.max(4, ((h.temperature - low) / (high - low || 1)) * 100)}%` }} />
            </span>
            <span className="meteo-col-rain">{h.precipitation >= 0.1 && <i style={{ height: `${Math.max(8, (h.precipitation / wettest) * 100)}%` }} />}</span>
            <span className="meteo-col-h">{labelled ? `${hour} h` : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

/** A day's span (from `from` to `to`) on the scale of the days shown (from `low` to `high`); `band`: a wider, paler span around it (the scenarios'). */
export function RangeBar({ from, to, low, high, band }: { from: number; to: number; low: number; high: number; band?: [number, number] }) {
  const at = (n: number) => `${(((Math.min(high, Math.max(low, n)) - low) / (high - low || 1)) * 100).toFixed(1)}%`
  const width = (a: number, b: number) => `calc(${at(b)} - ${at(a)})`
  return (
    <span className="meteo-range" aria-hidden>
      {band && <i className="band" style={{ left: at(band[0]), width: width(band[0], band[1]) }} />}
      <i className="span" style={{ left: at(from), width: width(from, to) }} />
    </span>
  )
}

/** A colour of the palette as a small square, beside a level's word. */
export const Swatch = ({ color }: { color: PaletteColor }) => <i className="meteo-swatch" style={{ background: paletteValue(color) }} aria-hidden />

/** The credits of what the tab shows, with Open-Meteo's link and the licence, as CC BY asks. */
export function Credit({ lines }: { lines: string[] }) {
  const host = useHost<MeteoMethods>()
  return (
    <p className="small dim meteo-credit">
      {lines.join(' · ')}. Mises en forme par Marianne ·{' '}
      <button className="link" onClick={() => host.openUrl(SOURCE_URL)}>
        open-meteo.com
      </button>{' '}
      ·{' '}
      <button className="link" onClick={() => host.openUrl(LICENCE_URL)}>
        licence CC BY 4.0
      </button>
    </p>
  )
}
