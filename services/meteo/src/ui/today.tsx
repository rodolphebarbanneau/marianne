import { Failure, Loading, paletteValue } from '@marianne/sdk/view'
import { airLevel, clock, degrees, hoursLong, INTENSITY_LABELS, intensityColor, millimetres, percent, POLLEN_LABELS, rainLine, uvLevel, wind } from '../format'
import { dayAhead, intensity, rainOutlook } from '../outlook'
import { isSnow } from '../sky'
import type { AirDay, AirQuality, Forecast, Pollen, WeatherDay, WeatherNow } from '../types'
import { Fact, HoursChart, SkyIcon, Swatch } from './common'

/**
 * « aujourd’hui »: the weather now, the rain of the next two hours by quarter, the day's figures,
 * the air, and the next twelve hours at a glance.
 */

/** "Pluie dans 30 min.": a line of the outlook as a sentence. */
const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`

export interface AirState {
  data: AirQuality | null
  error: string
  loading: boolean
  reload: () => void
}

export function TodayTab({ forecast, air, openHours }: { forecast: Forecast; air: AirState; openHours: () => void }) {
  // Today until its sunset, then tomorrow, as the tile says it.
  const told = dayAhead(forecast.now?.time ?? '', forecast.days)
  const airDay = air.data?.days.find((d) => d.date === told?.day.date) ?? null
  return (
    <div className="meteo-today">
      {forecast.now ? <NowCard now={forecast.now} air={air.data} /> : <p className="card dim">Pas de relevé pour le moment.</p>}
      <RainCard forecast={forecast} />
      {told ? <DayCard day={told.day} tomorrow={told.tomorrow} air={airDay} /> : <p className="card dim">Pas de prévision pour aujourd’hui.</p>}
      <AirCard air={air} day={airDay} />
      <section className="meteo-wide">
        <span className="label">les douze prochaines heures</span>
        <HoursChart hours={forecast.hours.slice(0, 12)} />
        <button className="link small" onClick={openHours}>
          les 48 heures, heure par heure ›
        </button>
      </section>
    </div>
  )
}

function NowCard({ now, air }: { now: WeatherNow; air: AirQuality | null }) {
  return (
    <div className="card meteo-now">
      <span className="label">maintenant</span>
      <span className="meteo-now-head">
        <SkyIcon code={now.code} isDay={now.isDay} cell={7} />
        <span className="meteo-now-temp">{degrees(now.temperature, 1)}</span>
        <span className="hi">{now.label}</span>
      </span>
      <span className="meteo-facts">
        <Fact what="ressenti">{degrees(now.feelsLike)}</Fact>
        <Fact what="humidité">{percent(now.humidity)}</Fact>
        <Fact what="vent">
          {wind(now.windFrom, now.windSpeed)} · rafales {Math.round(now.windGusts)} km/h
        </Fact>
        {/* The UV of a night is nought: said only by day. */}
        {now.isDay && air?.uv !== null && air?.uv !== undefined && (
          <Fact what="UV">
            <Swatch color={uvLevel(air.uv).color} /> {Math.round(air.uv)} · {uvLevel(air.uv).label}
          </Fact>
        )}
      </span>
      <span className="small dim">relevé de {clock(now.time)}, heure locale</span>
    </div>
  )
}

/** « pluie dans les deux heures »: the quarters as cells, lit by how hard it falls, and the outlook in a sentence. */
function RainCard({ forecast }: { forecast: Forecast }) {
  const { now, quarters, hours } = forecast
  const outlook = rainOutlook(now, quarters, hours)
  const said = now ? sentence(rainLine(outlook, now.time)) : ''
  return (
    <div className="card meteo-rain">
      <span className="label">pluie dans les deux heures</span>
      {quarters.length ? (
        <>
          <span className="meteo-quarters" style={{ gridTemplateColumns: `repeat(${quarters.length}, minmax(0, 1fr))` }}>
            {quarters.map((q, i) => {
              const level = intensity(q.precipitation)
              const color = intensityColor(level, isSnow(q.code))
              return (
                <span key={q.time} title={`${clock(q.time)} · ${level === 'dry' ? 'sec' : `${isSnow(q.code) ? 'neige' : 'pluie'} ${INTENSITY_LABELS[level]}`}`}>
                  <i className={color ? undefined : 'dry'} style={color ? { background: paletteValue(color) } : undefined} />
                  {i % 2 === 0 ? clock(q.time) : ''}
                </span>
              )
            })}
          </span>
          <span className="hi">{said}</span>
          <span className="meteo-legend small dim">
            <Swatch color="cyan-pale" /> faible <Swatch color="cyan" /> modérée <Swatch color="bleu" /> forte · au quart d’heure, modèle AROME de Météo-France
          </span>
        </>
      ) : (
        <>
          <span className="hi">{said}</span>
          <span className="small dim">La pluie au quart d’heure n’est prévue qu’en métropole (modèle AROME) : ici, heure par heure.</span>
        </>
      )}
    </div>
  )
}

function DayCard({ day, tomorrow, air }: { day: WeatherDay; tomorrow: boolean; air: AirDay | null }) {
  return (
    <div className="card meteo-day-card">
      <span className="label">{tomorrow ? 'demain' : 'aujourd’hui'}</span>
      <span className="meteo-day-head">
        <SkyIcon code={day.code} cell={4} />
        <span>
          <span className="hi">{degrees(day.max)}</span> <span className="dim">/ {degrees(day.min)}</span>
        </span>
        <span>{day.label}</span>
      </span>
      <span className="meteo-facts">
        <Fact what="ressenti">
          {Math.round(day.feelsLikeMin)} à {degrees(day.feelsLikeMax)}
        </Fact>
        <Fact what="pluie">
          {day.precipitation >= 0.1 ? millimetres(day.precipitation) : 'sec'}
          {day.precipitation >= 0.1 && day.precipitationHours > 0 && ` en ${Math.round(day.precipitationHours)} h`}
          {day.precipitationChance !== null && ` · ${percent(day.precipitationChance)}`}
        </Fact>
        <Fact what="vent">
          {wind(day.windFrom, day.windSpeed)} · rafales {Math.round(day.windGusts)} km/h
        </Fact>
        {air?.uv !== null && air?.uv !== undefined && (
          <Fact what="UV max">
            <Swatch color={uvLevel(air.uv).color} /> {Math.round(air.uv)} · {uvLevel(air.uv).label}
          </Fact>
        )}
        <Fact what="soleil">
          {day.sunrise && day.sunset ? `${clock(day.sunrise)} – ${clock(day.sunset)}` : '—'}
          {day.daylight > 0 && ` · ${hoursLong(day.daylight)} de jour`}
        </Fact>
      </span>
    </div>
  )
}

/** « air et pollens »: the European index now and at its worst today, and the pollens in the air. */
function AirCard({ air, day }: { air: AirState; day: AirDay | null }) {
  const a = air.data
  const pollens = Object.entries(day?.pollen ?? {}) as Array<[Pollen, number]>
  return (
    <div className="card meteo-air">
      <span className="label">air et pollens</span>
      {a ? (
        <>
          <span className="meteo-facts">
            {a.aqi !== null && (
              <Fact what="maintenant">
                <Swatch color={airLevel(a.aqi).color} /> {airLevel(a.aqi).label} ({Math.round(a.aqi)})
              </Fact>
            )}
            {day?.aqi !== null && day?.aqi !== undefined && (
              <Fact what="au pire">
                <Swatch color={airLevel(day.aqi).color} /> {airLevel(day.aqi).label} ({Math.round(day.aqi)})
              </Fact>
            )}
            <Fact what="pollens">
              {pollens.length ? pollens.map(([p, n]) => `${POLLEN_LABELS[p]} ${n}`).join(', ') + ' grains/m³' : 'aucun en quantité notable'}
            </Fact>
          </span>
          <span className="small dim">Indice européen, de 0 (bon) à plus de 100, d’après le modèle CAMS : pas l’indice ATMO officiel de votre région.</span>
        </>
      ) : air.error ? (
        <Failure inline title="Qualité de l’air indisponible" error={air.error} retry={air.reload} />
      ) : air.loading ? (
        <Loading inline label="la qualité de l’air" />
      ) : (
        <p className="dim">Pas de qualité de l’air pour cette commune.</p>
      )}
    </div>
  )
}
