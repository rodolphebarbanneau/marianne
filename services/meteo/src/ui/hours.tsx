import { clock, dayName, millimetres, percent, shortDegrees, wind } from '../format'
import { weatherLabel } from '../sky'
import type { Forecast, WeatherHour } from '../types'
import { HoursChart, SkyIcon } from './common'

/** « 48 heures »: the next two days as a chart, then hour by hour, day by day. */

export function HoursTab({ forecast }: { forecast: Forecast }) {
  const hours = forecast.hours
  if (!hours.length) return <p className="dim">Pas de prévision heure par heure pour cette commune.</p>
  // The days of the hours, named as the forecast's days are (today first).
  const dates = forecast.days.map((d) => d.date)
  const groups = [...new Set(hours.map((h) => h.time.slice(0, 10)))].map((date) => ({ date, hours: hours.filter((h) => h.time.startsWith(date)) }))
  return (
    <div className="meteo-hours">
      <section className="meteo-wide">
        <HoursChart hours={hours} every={3} />
        <p className="small dim">
          Le ciel et la température toutes les trois heures ; les barres jaunes le jour, bleues la nuit ; en bas, la pluie de chaque heure. Survolez une heure
          pour son détail.
        </p>
      </section>
      {groups.map((g) => {
        const index = dates.indexOf(g.date)
        return (
          <section key={g.date} className="meteo-hour-day">
            <span className="label">{index >= 0 ? dayName(g.date, index) : g.date}</span>
            <div className="meteo-hour-rows">
              {g.hours.map((h) => (
                <HourRow key={h.time} hour={h} />
              ))}
            </div>
          </section>
        )
      })}
      <p className="small dim">Météo-France (AROME, puis ARPEGE) pour ces heures ; la probabilité de pluie est celle du modèle européen du CEPMMT.</p>
    </div>
  )
}

function HourRow({ hour: h }: { hour: WeatherHour }) {
  return (
    <div className={`meteo-hour${h.precipitation >= 0.2 ? ' wet' : ''}`}>
      <span className="hi">{clock(h.time)}</span>
      <SkyIcon code={h.code} isDay={h.isDay} cell={3} />
      <span className="meteo-hour-sky">{weatherLabel(h.code)}</span>
      <span className="hi">{shortDegrees(h.temperature)}</span>
      <span className="dim meteo-hour-feel">ressenti {shortDegrees(h.feelsLike)}</span>
      <span className="meteo-hour-rain">
        {h.precipitation >= 0.1 ? millimetres(h.precipitation) : <span className="dim">sec</span>}
        {h.precipitationChance !== null && <span className="dim"> · {percent(h.precipitationChance)}</span>}
      </span>
      <span className="meteo-hour-wind">
        {wind(h.windFrom, h.windSpeed)}
        <span className="dim"> · rafales {Math.round(h.windGusts)}</span>
      </span>
      <span className="dim meteo-hour-hum">humidité {percent(h.humidity)}</span>
    </div>
  )
}
