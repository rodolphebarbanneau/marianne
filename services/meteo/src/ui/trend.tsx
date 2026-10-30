import { Fragment } from 'react'
import { Failure, Loading, Notice } from '@marianne/sdk/view'
import { CONFIDENCE_LABELS, dayName, percent, range, shortDay, shortDegrees } from '../format'
import type { Confidence, Forecast, Trend, TrendDay, WeatherDay } from '../types'
import { RangeBar, SkyIcon } from './common'

/**
 * « 15 jours »: every day to come as the European model's scenarios see it. The first week as a
 * forecast, the second as what it is, a trend: where eight scenarios in ten fall, and how far they
 * agree. Without the scenarios, the single run, said to be one.
 */

/** Past this many days, the screen says the forecast has become a trend. */
const WEEK = 7

const LIT: Record<Confidence, number> = { high: 3, medium: 2, low: 1 }

export interface TrendState {
  data: Trend | null
  error: string
  loading: boolean
  reload: () => void
}

export function TrendTab({ forecast, trend }: { forecast: Forecast; trend: TrendState }) {
  const days = forecast.days
  if (!days.length) return <p className="dim">Pas de prévision sur plusieurs jours pour cette commune.</p>
  const t = trend.data
  if (!t && trend.loading) return <Loading label="les scénarios du modèle européen" />
  const spread = new Map((t?.days ?? []).map((d) => [d.date, d]))
  // One scale for the fifteen days: the scenarios' extremes, or the single run's.
  const lows = days.map((d) => spread.get(d.date)?.min.low ?? d.min)
  const highs = days.map((d) => spread.get(d.date)?.max.high ?? d.max)
  const [low, high] = [Math.min(...lows), Math.max(...highs)]
  return (
    <div className="meteo-trend">
      <Notice>
        Au-delà d’une semaine, la prévision devient une tendance. Le modèle européen du CEPMMT calcule {t ? t.members : 51} scénarios, partis d’états un peu
        différents de l’atmosphère : les fourchettes disent où tombent huit scénarios sur dix, la confiance, combien ils s’accordent.
      </Notice>
      {!t && trend.error && (
        <>
          <Failure inline title="Scénarios indisponibles" error={trend.error} retry={trend.reload} />
          <p className="small dim">En attendant, les chiffres ci-dessous sont ceux d’un seul calcul : au-delà d’une semaine, lisez-les comme une tendance.</p>
        </>
      )}
      <div className="meteo-trend-rows">
        <span className="meteo-trend-head small dim" aria-hidden>
          <span>jour</span>
          <span />
          <span>min</span>
          <span />
          <span>max</span>
          <span>pluie</span>
          <span>confiance</span>
        </span>
        {days.map((d, i) => (
          <Fragment key={d.date}>
            {i === WEEK && <span className="meteo-trend-divider label">au-delà d’une semaine : une tendance</span>}
            <TrendRow day={d} index={i} scenarios={spread.get(d.date) ?? null} low={low} high={high} />
          </Fragment>
        ))}
      </div>
    </div>
  )
}

function TrendRow({ day: d, index, scenarios: s, low, high }: { day: WeatherDay; index: number; scenarios: TrendDay | null; low: number; high: number }) {
  // The first week reads as figures; past it, as the scenarios' ranges.
  const ranged = !!s && index >= WEEK
  return (
    <div className={`meteo-trend-row${index >= WEEK ? ' far' : ''}`}>
      <span className="hi">
        <span className="meteo-long">{dayName(d.date, index)}</span>
        <span className="meteo-short">{index < 2 ? dayName(d.date, index) : shortDay(d.date)}</span>
      </span>
      <SkyIcon code={d.code} cell={3} />
      <span className="dim">{ranged ? range(s.min.low, s.min.high) : shortDegrees(d.min)}</span>
      {s ? (
        <RangeBar from={s.min.mid} to={s.max.mid} low={low} high={high} band={[s.min.low, s.max.high]} />
      ) : (
        <RangeBar from={d.min} to={d.max} low={low} high={high} />
      )}
      <span className="hi">{ranged ? range(s.max.low, s.max.high) : shortDegrees(d.max)}</span>
      <span title={s ? `${Math.round(s.rain * 10)} scénarios sur 10 donnent au moins 1 mm` : undefined}>
        {s ? percent(s.rain * 100) : d.precipitationChance !== null ? percent(d.precipitationChance) : '—'}
      </span>
      <span className="meteo-confidence" title={s ? `confiance ${CONFIDENCE_LABELS[s.confidence]}` : undefined}>
        {s ? (
          <>
            <span className={`meteo-cells ${s.confidence}`} aria-hidden>
              {[1, 2, 3].map((n) => (
                <i key={n} className={n <= LIT[s.confidence] ? 'on' : undefined} />
              ))}
            </span>
            <span className="meteo-word">{CONFIDENCE_LABELS[s.confidence]}</span>
          </>
        ) : (
          <span className="dim">—</span>
        )}
      </span>
    </div>
  )
}
