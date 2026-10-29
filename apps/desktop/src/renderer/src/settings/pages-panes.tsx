import { useState } from 'react'
import { PROFILE_FIELDS, serviceCode, sortServices, type ServiceState } from '@marianne/sdk'
import { NEWS_GROUP_LABELS, type NewsGroup } from '@shared/news'
import { useApp } from '../app/context'
import { Spinner } from '../components/ui'
import { api, errorText } from '../lib/api'
import { useNewsSources } from '../lib/content'
import { when } from '../lib/format'
import { useServices } from '../host'

/** The services: on or off, starred, what they reach, their offline data. */
export function ServicesPane() {
  const { settings, setSettings } = useApp()
  const services = sortServices(useServices())
  const [error, setError] = useState('')
  if (!settings) return null
  const { starred, disabled } = settings.services
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id))
  const sync = (s: ServiceState) => {
    setError('')
    void api.syncService(s.manifest.id).catch((err) => setError(errorText(err)))
  }

  return (
    <>
      <div className="note">
        Les services sont de petites applications d’information, chacune avec son code, comme 3615 METEO. Ils ne voient jamais vos identifiants. Ils connaissent
        la commune de votre adresse, pour vous montrer ce qui est près de chez vous. Ceux qui veulent lire autre chose de votre profil vous le demandent
        d’abord. Chacun ne se connecte qu’aux sites qu’il annonce.
      </div>
      <div className="rows">
        {services.map((s) => {
          const m = s.manifest
          const running = s.sync?.running
          return (
            <div key={m.id} className="row">
              <span>
                <label>
                  <input
                    type="checkbox"
                    checked={!disabled.includes(m.id)}
                    disabled={!s.available}
                    onChange={(e) => void setSettings({ services: { disabled: toggle(disabled, m.id, !e.target.checked) } })}
                  />
                  <span className="code">{serviceCode(m)}</span> <span className="hi">{m.name}</span>
                </label>
                <br />
                <span className="small dim">
                  {m.description}
                  <br />
                  {m.hosts.length ? `se connecte à : ${m.hosts.join(', ')}` : 'ne se connecte à aucun site'} · version {m.version}
                  {s.access.asked.length > 0 && <Access state={s} />}
                  {s.error && <span className="bad"> · n’a pas pu démarrer : {s.error}</span>}
                  {!s.available && !s.error && <span className="bad"> · une connexion dont il dépend est désactivée</span>}
                </span>
              </span>
              <span className="small dim">
                {s.sync &&
                  (running
                    ? `${running.phase === 'download' ? 'téléchargement' : 'indexation'} ${running.total ? Math.round((running.done / running.total) * 100) : 0} %`
                    : s.sync.syncedAt
                      ? `${s.sync.summary || 'données'} · ${when(s.sync.syncedAt)}`
                      : 'données pas encore téléchargées')}
                {s.sync?.error && <span className="bad"> · {s.sync.error}</span>}
              </span>
              <span>
                <button
                  className={`star${s.starred ? ' on' : ''}`}
                  onClick={() => void setSettings({ services: { starred: toggle(starred, m.id, !s.starred) } })}
                  title={s.starred ? 'retirer des favoris' : 'mettre en favori'}
                >
                  {s.starred ? '★' : '☆'}
                </button>{' '}
                {s.sync && s.on && (
                  <button className="btn small" disabled={!!running} aria-busy={!!running} onClick={() => sync(s)}>
                    {running && <Spinner />}
                    mettre à jour
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>
      {error && <p className="small bad">{error}</p>}
    </>
  )
}

/** What a service may read of the profile, and the way to take it back or give it. */
function Access({ state }: { state: ServiceState }) {
  const { asked, granted } = state.access
  const set = (fields: typeof asked) => void api.setServiceAccess(state.manifest.id, fields)
  return (
    <>
      <br />
      {granted === null ? (
        'vous demandera l’accès à votre profil à la première ouverture'
      ) : granted.length ? (
        <>
          peut lire : {granted.map((f) => PROFILE_FIELDS[f]).join(', ')}{' '}
          <button className="link" onClick={() => set([])}>
            retirer l’accès
          </button>
        </>
      ) : (
        <>
          vous lui avez refusé l’accès à votre profil{' '}
          <button className="link" onClick={() => set(asked)}>
            autoriser ({asked.map((f) => PROFILE_FIELDS[f]).join(', ')})
          </button>
        </>
      )}
    </>
  )
}

/** The sources of Actualités: which ones, how many headlines each, the user's own feeds. */
export function NewsSourcesPane() {
  const { settings, setSettings } = useApp()
  const catalog = useNewsSources()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  if (!settings) return null
  const news = settings.news
  const toggle = (id: string, on: boolean) =>
    void setSettings({ news: { sources: on ? [...new Set([...news.sources, id])] : news.sources.filter((x) => x !== id) } })
  const groups = Object.keys(NEWS_GROUP_LABELS) as NewsGroup[]
  const addFeed = () => {
    const id = `custom-${Date.now().toString(36)}`
    void setSettings({ news: { custom: [...news.custom, { id, name: name.trim(), url: url.trim() }], sources: [...news.sources, id] } })
    setName('')
    setUrl('')
  }
  const validFeed = name.trim() && /^https:\/\/\S+$/.test(url.trim())

  return (
    <>
      <div className="note">
        Choisissez vos sources. Marianne affiche le titre, l’heure et le lien de chaque article, jamais l’article entier. Pour en savoir plus, demandez-lui.
      </div>
      {groups.map((g) => (
        <div key={g}>
          <span className="label sub">{NEWS_GROUP_LABELS[g]}</span>
          <div className="chips left">
            {catalog
              .filter((s) => s.group === g)
              .map((s) => {
                const on = news.sources.includes(s.id)
                return (
                  <button key={s.id} className={`chip${on ? ' on' : ''}`} onClick={() => toggle(s.id, !on)} title={s.homepage}>
                    {on ? '✓ ' : ''}
                    {s.name}
                  </button>
                )
              })}
          </div>
        </div>
      ))}
      <span className="label sub">Vos flux</span>
      <div className="rows">
        {news.custom.map((c) => (
          <div key={c.id} className="row">
            <label>
              <input type="checkbox" checked={news.sources.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} /> {c.name}
            </label>
            <span className="path">{c.url}</span>
            <button
              className="btn small danger"
              onClick={() => void setSettings({ news: { custom: news.custom.filter((x) => x.id !== c.id), sources: news.sources.filter((x) => x !== c.id) } })}
            >
              retirer
            </button>
          </div>
        ))}
        <div className="row">
          <input value={name} placeholder="nom du flux" onChange={(e) => setName(e.target.value)} />
          <input value={url} placeholder="adresse du flux RSS ou Atom (https://…)" onChange={(e) => setUrl(e.target.value)} />
          <button className="btn small" disabled={!validFeed} onClick={addFeed}>
            ajouter
          </button>
        </div>
      </div>
      <span className="label sub">Affichage</span>
      <div className="rows">
        <div className="row">
          <span>titres par source</span>
          <select value={news.perSource} onChange={(e) => void setSettings({ news: { perSource: Number(e.target.value) } })}>
            {[3, 5, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span />
        </div>
        <div className="row">
          <span>même sujet</span>
          <label>
            <input type="checkbox" checked={news.group} onChange={(e) => void setSettings({ news: { group: e.target.checked } })} /> regrouper les articles qui
            parlent de la même chose, avec « aussi chez … »
          </label>
          <span />
        </div>
      </div>
    </>
  )
}
