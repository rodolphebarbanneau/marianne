import { useState } from 'react'
import { SERVICE_CATEGORIES, serviceCode, serviceMatches, sortServices, type ServiceState } from '@marianne/sdk'
import { useApp } from '../app/context'
import { useServices } from '../host'

/** Services: apps with a code, favorites first, then by category. Not tied to any folder. */
export function ServicesPage() {
  const app = useApp()
  const all = useServices()
  const [query, setQuery] = useState('')
  const shown = sortServices(all.filter((s) => s.on && serviceMatches(s.manifest, query)))
  const starred = shown.filter((s) => s.starred)
  const others = shown.filter((s) => !s.starred)
  const off = all.filter((s) => !s.on).length

  const toggleStar = (s: ServiceState) => {
    const list = app.settings?.services.starred ?? []
    void app.setSettings({ services: { starred: s.starred ? list.filter((x) => x !== s.manifest.id) : [...list, s.manifest.id] } })
  }
  const tile = (s: ServiceState) => (
    <div key={s.manifest.id} className={`card service-card${s.starred ? ' starred' : ''}`}>
      <button className="open" onClick={() => app.go({ kind: 'service', id: s.manifest.id })}>
        <span className="code">{serviceCode(s.manifest)}</span>
        <span className="t">{s.manifest.name}</span>
        <span className="l dim">{s.manifest.description}</span>
      </button>
      <button className={`star${s.starred ? ' on' : ''}`} onClick={() => toggleStar(s)} title={s.starred ? 'retirer des favoris' : 'mettre en favori'}>
        {s.starred ? '★' : '☆'}
      </button>
    </div>
  )

  return (
    <div className="page">
      <div className="page-body">
        <div className="section">
          <div className="section-bar">
            <span className="section-title">Services</span>
            <input
              className="filter"
              value={query}
              placeholder="filtrer : un code, un nom, un mot…"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {starred.length > 0 && (
            <div className="cat">
              <span className="dim">★ vos favoris</span>
              <div className="grid">{starred.map(tile)}</div>
            </div>
          )}
          {SERVICE_CATEGORIES.map((c) => {
            const list = others.filter((s) => s.manifest.category === c.id)
            return (
              list.length > 0 && (
                <div key={c.id} className="cat">
                  <span className="dim">{c.label}</span>
                  <div className="grid">{list.map(tile)}</div>
                </div>
              )
            )
          })}
          {!shown.length && <p className="dim">Aucun service ne correspond.</p>}
          <p className="small dim">
            chaque service a son code : tapez-le dans la recherche pour l’ouvrir · ☆ pour le mettre en tête
            {off > 0 && (
              <>
                {' '}
                ·{' '}
                <button className="link" onClick={() => app.openSettings('services')}>
                  {off} désactivé{off > 1 ? 's' : ''}
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
