import { useEffect, useRef, useState } from 'react'
import { Failure, Loading, Notice, Spinner, useCall, useHost, useKeys, useSearch, useStored, useTab, type Loaded } from '@marianne/sdk/view'
import { AIR_CREDIT, CREDIT, TREND_CREDIT } from './credits'
import { clock } from './format'
import type { AirQuality, Favorites, Forecast, MeteoMethods, Place, Trend } from './types'
import { Credit } from './ui/common'
import { HoursTab } from './ui/hours'
import { TodayTab } from './ui/today'
import { TrendTab } from './ui/trend'
import { WeekTab } from './ui/week'
import './view.css'

/**
 * 3615 METEO's screen: the home commune's weather by default, any other one from the header's
 * search, favorites kept. Four tabs, the manifest's: now and today, the next 48 hours, the week,
 * and 15 days with the European model's scenarios. The forecast and the air are asked once for
 * every tab; the scenarios only when their tab shows.
 */

type Tab = 'today' | 'hours' | 'week' | 'trend'
type Spot = Favorites['communes'][number]

/** What « demander à Marianne » asks, by tab. */
const QUESTIONS: Record<Tab, (name: string) => string> = {
  today: (name) => `Quel temps fait-il à ${name} aujourd’hui ?`,
  hours: (name) => `Quel temps fera-t-il à ${name} dans les prochaines heures ?`,
  week: (name) => `Quel temps fera-t-il à ${name} cette semaine ?`,
  trend: (name) => `Quelle tendance pour le temps à ${name} dans les deux semaines à venir ?`
}

export function View() {
  const host = useHost<MeteoMethods>()
  const home = host.home
  const { tab: picked, open } = useTab()
  const tab = (picked || 'today') as Tab
  const search = useSearch()
  const [favorites, setFavorites] = useStored<Favorites>('favorites', { communes: [] })
  const [chosen, setChosen] = useState<Spot | null>(null)
  const place: Spot | null = chosen ?? (home ? { code: home.code, name: home.name } : null)
  const forecast = useCall<MeteoMethods, 'forecast'>('forecast', place ? [place.code] : null)
  const air = useCall<MeteoMethods, 'air'>('air', place ? [place.code] : null)
  const trend = useCall<MeteoMethods, 'trend'>('trend', place && tab === 'trend' ? [place.code] : null)
  // The last answer may still be another commune's while this one loads.
  const shown = forecast.data && forecast.data.commune.code === place?.code ? forecast.data : null

  const pick = (p: Spot) => {
    setChosen(p.code === home?.code ? null : { code: p.code, name: p.name })
    search.clear()
  }
  const starred = !!place && favorites.communes.some((f) => f.code === place.code)
  const toggleFavorite = () => {
    if (!place) return
    setFavorites({ communes: starred ? favorites.communes.filter((f) => f.code !== place.code) : [...favorites.communes, place] })
  }

  return (
    <div className="meteo">
      {search.query && <Found query={search.query} onPick={pick} />}
      {!home && !chosen && (
        <Notice action={{ label: 'renseigner mon adresse', onClick: () => host.openRoute('settings/identity') }}>
          Renseignez votre adresse pour voir d’emblée le temps de votre commune.
        </Notice>
      )}
      {!place ? (
        <p className="dim">Cherchez une commune dans le champ en haut de l’écran (/) pour voir son temps, maintenant et jusqu’à 15 jours.</p>
      ) : (
        <>
          <div className="meteo-head">
            <span className="meteo-name">{place.name}</span>
            {shown && (
              <span className="dim small">
                {shown.commune.departmentName} ({shown.commune.department}) · {Math.round(shown.elevation)} m
                {shown.now ? ` · relevé de ${clock(shown.now.time)}` : ''}
              </span>
            )}
            {forecast.loading && shown && <Spinner />}
            <span className="meteo-acts">
              <button className="btn small" onClick={toggleFavorite} aria-pressed={starred}>
                {starred ? '★ favori' : '☆ en favori'}
              </button>
              <button className="btn small" onClick={() => host.ask(QUESTIONS[tab](place.name))}>
                demander à Marianne
              </button>
            </span>
          </div>
          <Places home={home} favorites={favorites.communes} current={place.code} onPick={pick} />
          {forecast.error ? (
            <Failure title="Prévisions indisponibles" error={forecast.error} retry={forecast.reload} />
          ) : shown ? (
            <TabContent tab={tab} forecast={shown} air={air} trend={trend} openHours={() => open('hours')} />
          ) : (
            <Loading label={`les prévisions de ${place.name}`} />
          )}
        </>
      )}
    </div>
  )
}

function TabContent({
  tab,
  forecast,
  air,
  trend,
  openHours
}: {
  tab: Tab
  forecast: Forecast
  air: Loaded<AirQuality>
  trend: Loaded<Trend>
  openHours: () => void
}) {
  if (tab === 'hours')
    return (
      <>
        <HoursTab forecast={forecast} />
        <Credit lines={[forecast.credit]} />
      </>
    )
  if (tab === 'week')
    return (
      <>
        <WeekTab forecast={forecast} air={air.data} openHours={openHours} />
        <Credit lines={[CREDIT, ...(air.data ? [AIR_CREDIT] : [])]} />
      </>
    )
  if (tab === 'trend')
    return (
      <>
        <TrendTab forecast={forecast} trend={trend} />
        <Credit lines={[CREDIT, TREND_CREDIT]} />
      </>
    )
  return (
    <>
      <TodayTab forecast={forecast} air={air} openHours={openHours} />
      <Credit lines={[CREDIT, ...(air.data ? [AIR_CREDIT] : [])]} />
    </>
  )
}

/** The home commune and the favorites, one click each. */
function Places({ home, favorites, current, onPick }: { home: Spot | null; favorites: Spot[]; current: string; onPick: (p: Spot) => void }) {
  const others = favorites.filter((f) => f.code !== home?.code)
  if (!home && !others.length) return null
  return (
    <div className="meteo-places">
      {home && (
        <button className={`chip${current === home.code ? ' on' : ''}`} onClick={() => onPick(home)} title="votre commune">
          ⌂ {home.name}
        </button>
      )}
      {others.map((f) => (
        <button key={f.code} className={`chip${current === f.code ? ' on' : ''}`} onClick={() => onPick(f)}>
          ★ {f.name}
        </button>
      ))}
    </div>
  )
}

/** The communes the header's search finds; Entrée in the field opens the first. */
function Found({ query, onPick }: { query: string; onPick: (p: Place) => void }) {
  const typed = query.length >= 2
  const found = useCall<MeteoMethods, 'communes'>('communes', typed ? [query] : null)
  const list = typed ? (found.data ?? []) : []
  const first = useRef<Place | null>(null)
  first.current = list[0] ?? null
  const picked = useRef(onPick)
  picked.current = onPick
  useKeys(list[0] ? [{ key: 'ENVOI', what: `voir ${list[0].name}`, shortcut: 'Entrée' }] : [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Entrée alone, in the search field (the screen's only one): with ctrl it is the app's.
      if (e.key !== 'Enter' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || !(e.target instanceof HTMLInputElement) || !first.current) return
      e.preventDefault()
      picked.current(first.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="meteo-found">
      <span className="label">communes</span>
      {!typed ? (
        <p className="dim small">Tapez au moins deux lettres du nom, ou le code postal.</p>
      ) : found.error ? (
        <Failure inline title="Recherche indisponible" error={found.error} retry={found.reload} />
      ) : !found.data ? (
        <Loading inline label="les communes" />
      ) : !list.length ? (
        <p className="dim small">Aucune commune ne correspond à « {query} ».</p>
      ) : (
        <div className="meteo-found-list">
          {list.map((p) => (
            <button key={p.code} className="meteo-found-row" onClick={() => onPick(p)}>
              <span className="hi">{p.name}</span>
              <span className="dim small">
                {p.postalCodes[0] ?? p.code} · {p.departmentName}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
