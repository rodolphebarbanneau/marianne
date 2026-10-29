import { useCallback, useEffect, useState } from 'react'
import type { FranceDigest, FranceItem, NewsDigest, NewsStory, TodayEvent } from '@shared/public'
import { useApp } from '../app/context'
import { PageHead, SearchField, Spinner } from '../components/ui'
import { api, errorText } from '../lib/api'
import { useNewsSources } from '../lib/content'
import { clock, shortDate } from '../lib/format'
import { NextArrow } from './next'

/**
 * Actualités: the headlines of the user's sources (only what a feed shows: title, time, link),
 * what happens today in public life, and what changes in France. Marianne never shows the
 * article: the user opens it, copies its link, or asks Marianne about it.
 */
export function NewsPage() {
  const app = useApp()
  const [news, setNews] = useState<NewsDigest | null>(null)
  const [today, setToday] = useState<TodayEvent[] | null>(null)
  const [france, setFrance] = useState<FranceDigest | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const settings = app.settings?.news
  const catalog = useNewsSources()

  const load = useCallback(() => {
    setError('')
    void api
      .news()
      .then(setNews)
      .catch((err) => setError(errorText(err)))
    void api
      .todayEvents()
      .then(setToday)
      .catch(() => setToday([]))
    void api
      .franceDigest()
      .then(setFrance)
      .catch(() => setFrance({ changes: [], news: [] }))
  }, [])
  // The sources the user follows decide the headlines.
  useEffect(load, [load, JSON.stringify(settings?.sources), JSON.stringify(settings?.custom)]) // eslint-disable-line react-hooks/exhaustive-deps

  const sourceName = (id: string) => catalog.find((s) => s.id === id)?.name ?? settings?.custom.find((c) => c.id === id)?.name ?? id
  const q = query.trim().toLowerCase()
  const stories = (news?.stories ?? []).filter((s) => !q || [s.item, ...s.others].some((i) => i.title.toLowerCase().includes(q)))
  const ask = (text: string) => {
    app.setSeed({ text, attachments: [] })
    app.goPage('home')
  }
  const copy = (url: string) => void navigator.clipboard.writeText(url).then(() => app.toast('lien copié'))
  const openToday = (e: TodayEvent) =>
    e.kind === 'service' && e.service ? app.go({ kind: 'service', id: e.service, params: e.params ?? {} }) : e.url && api.openExternal(e.url)

  return (
    <div className="page">
      <div className="page-body">
        <div className="section">
          <PageHead title="Actualités" detail={new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}>
            <SearchField value={query} onChange={setQuery} placeholder="chercher dans l’actualité" />
          </PageHead>
          <div className="news">
            <div className="srcs">
              {(settings?.sources ?? []).map((id) => (
                <span key={id} className="src">
                  {sourceName(id)}
                </span>
              ))}
              <button className="small link" onClick={() => app.openSettings('sources')}>
                gérer les sources ›
              </button>
              <button className="small link" onClick={load} title="les flux sont relus toutes les quelques minutes">
                actualiser
              </button>
            </div>
            <div className="news-cols">
              <div>
                <span className="label sub">À la une</span>
                {!news && !error && <Spinner />}
                {error && <p className="small accent">{error}</p>}
                {news && !stories.length && <p className="small dim">{q ? 'Rien ne correspond.' : 'Aucun titre pour le moment.'}</p>}
                {stories.map((s) => (
                  <Story key={s.id} story={s} sourceName={sourceName} onCopy={copy} onAsk={ask} />
                ))}
                {!!news?.failed.length && <p className="small dim">sans réponse : {news.failed.map((f) => sourceName(f.source)).join(', ')}</p>}
              </div>
              <div>
                <span className="label sub">Aujourd’hui</span>
                {!today && <Spinner />}
                {today && !today.length && <p className="small dim">Rien d’annoncé aujourd’hui.</p>}
                {today?.map((e) => (
                  <button key={e.id} className={`ev${e.cancelled ? ' cancelled' : ''}`} onClick={() => openToday(e)} title={e.source}>
                    <span>{/^\d{4}-\d{2}-\d{2}$/.test(e.start) ? '—' : clock(e.start)}</span>
                    <span>
                      {e.live && <span className="live">en direct</span>} {e.title}
                      {e.detail && <span className="small dim"> · {e.detail}</span>}
                      {e.place && <span className="small dim"> · {e.place}</span>}
                    </span>
                  </button>
                ))}
                <span className="label sub">En France</span>
                {!france && <Spinner />}
                {france && ![...france.changes, ...france.news].length && <p className="small dim">Rien de neuf.</p>}
                {france?.changes.map((c) => (
                  <FranceLine key={c.id} item={c} />
                ))}
                {france?.news.slice(0, 6).map((c) => (
                  <FranceLine key={c.id} item={c} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <NextArrow page="news" />
    </div>
  )
}

function Story({
  story,
  sourceName,
  onCopy,
  onAsk
}: {
  story: NewsStory
  sourceName: (id: string) => string
  onCopy: (url: string) => void
  onAsk: (text: string) => void
}) {
  const { item, others } = story
  const name = sourceName(item.source)
  return (
    <div className="ni">
      <span className="ns">{name.toUpperCase()}</span>
      <span>
        <button className="title link" onClick={() => api.openExternal(item.url)} title={item.url}>
          {item.title}
        </button>
        <span className="small dim">
          {' '}
          {clock(item.published)}
          {item.category && ` · ${item.category}`}
          {others.length > 0 && ` · aussi chez ${[...new Set(others.map((o) => sourceName(o.source)))].join(', ')}`}
        </span>
      </span>
      <span className="acts">
        <button className="btn small" onClick={() => onCopy(item.url)}>
          copier le lien
        </button>
        <button className="btn small" onClick={() => onAsk(`Que faut-il savoir sur « ${item.title} » (${name}, ${item.url}) ?`)}>
          demander à Marianne
        </button>
      </span>
    </div>
  )
}

function FranceLine({ item }: { item: FranceItem }) {
  const date = item.from ?? item.until ?? item.published
  return (
    <button className="ev" onClick={() => api.openExternal(item.url)} title={item.url}>
      <span>{date ? shortDate(date).slice(0, 5) : '—'}</span>
      <span>
        {item.title}
        {item.when && <span className="small dim"> · {item.when}</span>}
      </span>
    </button>
  )
}
