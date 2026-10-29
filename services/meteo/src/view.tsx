import { useState } from 'react'
import { Failure, Loading, Notice, Spinner, useCall, useDebounced, useHost, useStored } from '@marianne/sdk/view'
import { dayName, degrees, millimetres, weatherGlyph, wind } from './format'
import type { Favorites, Forecast, MeteoMethods, Place, WeatherDay, WeatherNow } from './types'
import './view.css'

/** 3615 METEO: the home commune's weather by default, any other one by search, favorites kept. */

type Spot = Favorites['communes'][number]

const MODELS: Record<WeatherDay['model'], string> = { meteofrance: 'Météo-France', ecmwf: 'CEPMMT' }

export function View() {
  const host = useHost<MeteoMethods>()
  const home = host.home
  const [favorites, setFavorites] = useStored<Favorites>('favorites', { communes: [] })
  const [chosen, setChosen] = useState<Spot | null>(null)
  const place: Spot | null = chosen ?? (home ? { code: home.code, name: home.name } : null)
  const forecast = useCall<MeteoMethods, 'forecast'>('forecast', place ? [place.code] : null)
  // The last answer may still be another commune's while this one loads.
  const shown = forecast.data && forecast.data.commune.code === place?.code ? forecast.data : null
  const starred = !!place && favorites.communes.some((f) => f.code === place.code)

  const toggleFavorite = () => {
    if (!place) return
    setFavorites({ communes: starred ? favorites.communes.filter((f) => f.code !== place.code) : [...favorites.communes, place] })
  }

  return (
    <div className="meteo">
      <div className="meteo-body">
        {!home && (
          <Notice action={{ label: 'renseigner mon adresse', onClick: () => host.openRoute('settings/identity') }}>
            Renseignez votre adresse pour voir d’emblée le temps de votre commune.
          </Notice>
        )}

        <div className="meteo-bar">
          <CommuneSearch onPick={setChosen} />
          <div className="meteo-places">
            {home && (
              <button className={`chip${place?.code === home.code ? ' on' : ''}`} onClick={() => setChosen(null)} title="votre commune">
                ⌂ {home.name}
              </button>
            )}
            {favorites.communes
              .filter((f) => f.code !== home?.code)
              .map((f) => (
                <button key={f.code} className={`chip${place?.code === f.code ? ' on' : ''}`} onClick={() => setChosen(f)}>
                  ★ {f.name}
                </button>
              ))}
          </div>
        </div>

        {!place ? (
          <p className="dim">Cherchez une commune pour voir son temps, maintenant et sur 7 jours.</p>
        ) : (
          <>
            <div className="meteo-head">
              <span className="hi meteo-name">{place.name}</span>
              {shown && (
                <span className="dim small">
                  {shown.commune.departmentName} ({shown.commune.department}) · {Math.round(shown.elevation)} m
                </span>
              )}
              {forecast.loading && shown && <Spinner />}
              <span className="meteo-acts">
                <button className="btn small" onClick={toggleFavorite}>
                  {starred ? '★ retirer des favoris' : '☆ ajouter aux favoris'}
                </button>
                <button className="btn small" onClick={() => host.ask(`Quel temps fera-t-il à ${place.name} ces prochains jours ?`)}>
                  demander à Marianne
                </button>
              </span>
            </div>
            {forecast.error ? (
              <Failure title="Prévisions indisponibles" error={forecast.error} retry={forecast.reload} />
            ) : shown ? (
              <ForecastPanel forecast={shown} />
            ) : (
              <Loading label={`les prévisions de ${place.name}`} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CommuneSearch({ onPick }: { onPick: (spot: Spot) => void }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const term = useDebounced(text.trim())
  const typed = text.trim().length >= 2 && term.length >= 2
  const found = useCall<MeteoMethods, 'communes'>('communes', typed ? [term] : null)
  const list = typed ? (found.data ?? []) : []
  const pick = (p: Place) => {
    onPick({ code: p.code, name: p.name })
    setText('')
  }
  return (
    <div className="meteo-search">
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && list[0]) pick(list[0])
          if (e.key === 'Escape') setText('')
        }}
        placeholder="une commune : nom ou code postal"
        aria-label="chercher une commune"
      />
      {open && typed && (
        // Pressing a choice must not blur the input first: that would close the list before the click.
        <div className="meteo-found" onMouseDown={(e) => e.preventDefault()}>
          {list.map((p) => (
            <button key={p.code} onClick={() => pick(p)}>
              <span>{p.name}</span>
              <span className="dim small">
                {p.postalCodes[0] ?? p.code} · {p.departmentName}
              </span>
            </button>
          ))}
          {found.loading ? (
            <span className="meteo-hint">
              <Spinner />
            </span>
          ) : found.error ? (
            <span className="meteo-hint bad small">{found.error}</span>
          ) : (
            !list.length && <span className="meteo-hint dim small">aucune commune</span>
          )}
        </div>
      )}
    </div>
  )
}

function ForecastPanel({ forecast }: { forecast: Forecast }) {
  return (
    <>
      {forecast.now && <Now now={forecast.now} />}
      <div className="meteo-days">
        {forecast.days.map((d, i) => (
          <Day key={d.date} day={d} index={i} />
        ))}
      </div>
      <span className="small dim">{forecast.credit}</span>
    </>
  )
}

function Now({ now }: { now: WeatherNow }) {
  return (
    <div className="card meteo-now">
      <span className="meteo-glyph meteo-big">{weatherGlyph(now.code, now.isDay)}</span>
      <span className="meteo-temp">{degrees(now.temperature, 1)}</span>
      <span className="meteo-facts">
        <span className="hi">{now.label}</span>
        <span>ressenti {degrees(now.feelsLike)}</span>
        <span>
          vent {wind(now.windFrom, now.windSpeed)} · rafales {Math.round(now.windGusts)}&nbsp;km/h
        </span>
        <span>
          humidité {Math.round(now.humidity)}&nbsp;% · précipitations {millimetres(now.precipitation)}
        </span>
        <span className="small dim">maintenant · relevé de {now.time.slice(11, 16)}, heure locale</span>
      </span>
    </div>
  )
}

function Day({ day, index }: { day: WeatherDay; index: number }) {
  return (
    <div className="card meteo-day">
      <span className="hi">{dayName(day.date, index)}</span>
      <span className="meteo-glyph" title={day.label}>
        {weatherGlyph(day.code)}
      </span>
      <span className="small">{day.label}</span>
      <span>
        <span className="hi">{degrees(day.max)}</span> <span className="dim">{degrees(day.min)}</span>
      </span>
      <span className="small">
        {millimetres(day.precipitation)}
        {day.precipitationChance !== null && ` · ${Math.round(day.precipitationChance)} %`}
      </span>
      <span className="small">{wind(day.windFrom, day.windSpeed)}</span>
      <span className="small dim">
        {day.sunrise} – {day.sunset}
      </span>
      <span className="small dim">{MODELS[day.model]}</span>
    </div>
  )
}
