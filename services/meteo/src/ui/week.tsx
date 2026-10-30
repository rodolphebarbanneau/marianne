import { clock, dayName, millimetres, percent, shortDegrees, uvLevel, wind } from '../format'
import type { AirQuality, Forecast, WeatherDay } from '../types'
import { RangeBar, SkyIcon, Swatch } from './common'

/** « 7 jours »: each day in a row, its low and high on the week's scale, its rain, wind, UV and sun. */

const DAYS = 7

const SOURCES: Record<WeatherDay['model'], string> = { meteofrance: 'Météo-France', ecmwf: 'CEPMMT' }

export function WeekTab({ forecast, air, openHours }: { forecast: Forecast; air: AirQuality | null; openHours: () => void }) {
  const week = forecast.days.slice(0, DAYS)
  if (!week.length) return <p className="dim">Pas de prévision sur plusieurs jours pour cette commune.</p>
  const low = Math.min(...week.map((d) => d.min))
  const high = Math.max(...week.map((d) => d.max))
  const uv = new Map((air?.days ?? []).map((d) => [d.date, d.uv]))
  return (
    <div className="meteo-days">
      <div className="meteo-day-rows">
        {week.map((d, i) => (
          <DayRow key={d.date} day={d} index={i} low={low} high={high} uv={uv.get(d.date) ?? null} openHours={i < 2 ? openHours : undefined} />
        ))}
      </div>
      <p className="small dim">
        Les premiers jours, les modèles de Météo-France (AROME, ARPEGE) ; ensuite celui du CEPMMT, le centre européen. La probabilité de pluie et l’UV ne sont
        donnés que là où un modèle les calcule.
      </p>
    </div>
  )
}

function DayRow({
  day: d,
  index,
  low,
  high,
  uv,
  openHours
}: {
  day: WeatherDay
  index: number
  low: number
  high: number
  uv: number | null
  openHours?: () => void
}) {
  return (
    <div className="meteo-day-row">
      <span className="meteo-day-name hi">{dayName(d.date, index)}</span>
      <SkyIcon code={d.code} cell={4} />
      <span className="meteo-day-sky">
        <span>{d.label}</span>
        <span className="dim small">
          {SOURCES[d.model]}
          {openHours && (
            <>
              {' · '}
              <button className="link" onClick={openHours}>
                heure par heure ›
              </button>
            </>
          )}
        </span>
      </span>
      <span className="meteo-day-temps">
        <span className="dim">{shortDegrees(d.min)}</span>
        <RangeBar from={d.min} to={d.max} low={low} high={high} />
        <span className="hi">{shortDegrees(d.max)}</span>
      </span>
      <span className="meteo-day-more">
        <span>
          {d.precipitation >= 0.1 ? millimetres(d.precipitation) : <span className="dim">sec</span>}
          {d.precipitationChance !== null && <span className="dim"> · {percent(d.precipitationChance)}</span>}
        </span>
        <span>
          {wind(d.windFrom, d.windSpeed)}
          <span className="dim"> · rafales {Math.round(d.windGusts)}</span>
        </span>
        <span title={uv !== null ? `indice UV ${uvLevel(uv).label}` : undefined}>
          {uv !== null && (
            <>
              <Swatch color={uvLevel(uv).color} /> UV {Math.round(uv)}
            </>
          )}
        </span>
        <span className="meteo-day-sun dim small">{d.sunrise && d.sunset ? `${clock(d.sunrise)} – ${clock(d.sunset)}` : ''}</span>
      </span>
    </div>
  )
}
