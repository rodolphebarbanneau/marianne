import { useRef, useState, type CSSProperties } from 'react'
import { isLive, LEAN_LABELS, useHost } from '@marianne/sdk/view'
import { arranged, kioskOrder, matches, moveBy, moveTo, sameOrder } from '../model'
import { clock, hour } from '../time'
import type { InfosSource, Kiosk } from '../types'
import { fill, LeanKey, NoneFound, useInfos } from './common'

/**
 * F4 · kiosque: the same titles by source, a card each, in the user's order and at their size (a
 * large card spans two columns). A card moves by its grip only, as the Services page's tiles do; a
 * click anywhere else opens what it points to. The order and the sizes are kept in INFOS's storage.
 */

/** The subjects a card says it tells: the first ten, by their numbers. */
const TOP = 10

export function KioskTab({ kiosk, setKiosk }: { kiosk: Kiosk; setKiosk: (patch: Partial<Kiosk>) => void }) {
  const { reading, query } = useInfos()
  const ids = reading.sources.map((s) => s.id)
  const order = kioskOrder(ids, kiosk)
  // Kept only when it changed; Marianne's own order is kept as none, so « rétablir » doesn't offer to put it back.
  const keep = (next: string[]) => !sameOrder(next, order) && setKiosk({ order: sameOrder(next, ids) ? [] : next })
  // While a card is dragged, the others make room as it passes; dropped, the order is kept.
  const [moving, setMoving] = useState<{ id: string; order: string[] } | null>(null)
  const grip = useRef(false)
  const byId = new Map(reading.sources.map((s) => [s.id, s]))
  const shown = (moving?.order ?? order)
    .map((id) => byId.get(id)!)
    .filter((s) => reading.all || !s.setAside)
    .filter((s) => !query || reading.items.some((h) => h.source === s.id && matches(h.title, query)))
  const large = new Set(kiosk.large)

  return (
    <div onMouseUp={() => (grip.current = false)}>
      <div className="infos-kbar">
        <span className="label">votre kiosque</span>
        <span className="small dim">{shown.length} sources</span>
        <LeanKey />
        <span className="grow" />
        {arranged(kiosk) && (
          <button className="link small" onClick={() => setKiosk({ order: [], large: [] })}>
            rétablir l’ordre et les tailles
          </button>
        )}
      </div>
      {shown.length ? (
        <div className="infos-kiosk">
          {shown.map((s) => (
            <div
              key={s.id}
              className={`infos-kcard${s.setAside ? ' off' : ''}${large.has(s.id) ? ' large' : ''}${moving?.id === s.id ? ' dragging' : ''}`}
              style={{ '--grp': s.setAside ? 'var(--muted)' : `var(--lean-${s.lean})` } as CSSProperties}
              draggable
              onMouseDown={(e) => (grip.current = !!(e.target as HTMLElement).closest('.grip'))}
              onDragStart={(e) => {
                if (!grip.current) return e.preventDefault()
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', s.id)
                setMoving({ id: s.id, order })
              }}
              onDragOver={(e) => {
                if (!moving) return
                e.preventDefault()
                if (moving.id !== s.id) setMoving({ id: moving.id, order: moveTo(moving.order, moving.id, s.id) })
              }}
              onDrop={(e) => moving && e.preventDefault()}
              onDragEnd={() => {
                if (moving) keep(moving.order)
                setMoving(null)
                grip.current = false
              }}
            >
              <span className="kctl">
                <button
                  className="ksize"
                  title={large.has(s.id) ? 'réduire' : 'agrandir'}
                  onClick={() => setKiosk({ large: large.has(s.id) ? kiosk.large.filter((id) => id !== s.id) : [...kiosk.large, s.id] })}
                >
                  {large.has(s.id) ? '⤡' : '⤢'}
                </button>
                <span
                  className="grip"
                  role="button"
                  tabIndex={0}
                  title="glisser pour ranger (ou ← →)"
                  aria-label={`déplacer ${s.name}`}
                  onKeyDown={(e) => {
                    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0
                    if (!step) return
                    e.preventDefault()
                    keep(
                      moveBy(
                        order,
                        s.id,
                        step,
                        shown.map((x) => x.id)
                      )
                    )
                  }}
                >
                  <i>
                    {Array.from({ length: 6 }, (_, i) => (
                      <b key={i} />
                    ))}
                  </i>
                </span>
              </span>
              <Card source={s} large={large.has(s.id)} />
            </div>
          ))}
        </div>
      ) : (
        <NoneFound none="Aucune source à montrer." />
      )}
    </div>
  )
}

function Card({ source: s, large }: { source: InfosSource; large: boolean }) {
  const host = useHost()
  const { reading, query, openArticle, openSubject } = useInfos()
  const all = reading.items.filter((h) => h.source === s.id)
  const items = all.filter((h) => matches(h.title, query))
  const [first, ...rest] = items
  const top = reading.subjects.slice(0, TOP)
  const covers = top.map((t) => t.items.some((h) => h.source === s.id))
  const alone = reading.single.find((h) => h.source === s.id && h !== first && !isLive(h.title))
  return (
    <>
      <span className="mast">
        <b>{s.name.toUpperCase()}</b>
        <span className="sub">
          <span className="lean">
            <i style={fill(s.lean)} />
            {LEAN_LABELS[s.lean]}
          </span>
          {first && <span className="r small muted">mis à jour à {hour(first.published)}</span>}
        </span>
      </span>
      {first ? (
        <>
          <button className="une" onClick={() => openArticle(first)}>
            {first.title}
          </button>
          {first.summary && <p className={`infos-chapo${large ? '' : ' infos-clamp3'}`}>{first.summary}</p>}
        </>
      ) : (
        <span className="small dim">aucun titre sur 24 h</span>
      )}
      <div className="kl-list">
        {rest.slice(0, large ? 8 : 4).map((h) => (
          <button key={h.id} className="infos-kl" onClick={() => openArticle(h)}>
            <span className="tm">{clock(h.published)}</span>
            <span>{h.title}</span>
          </button>
        ))}
      </div>
      {top.length > 0 && (
        <span className="infos-kcov">
          <span className="cl">
            {covers.map((c, i) => (
              <button key={top[i].id} className={c ? 'on' : ''} title={`${i + 1}. ${top[i].words.join(' · ')}`} onClick={() => openSubject(top[i].id)}>
                {i + 1}
              </button>
            ))}
          </span>
          <span>
            {covers.filter(Boolean).length} des {top.length} sujets
          </span>
        </span>
      )}
      {alone && (
        <button className="solo" onClick={() => openArticle(alone)}>
          <b>seule à en parler</b> · {alone.title}
        </button>
      )}
      <span className="kf">
        <button className="site" onClick={() => host.openUrl(`https://${s.site}`)}>
          {s.site} ↗
        </button>
        <span className="r">
          {s.setAside ? (
            <span className="infos-off">écartée</span>
          ) : (
            [
              s.home ? 'votre région' : '',
              s.kept !== null ? `${s.kept} rubriques sur ${s.sections}` : '',
              s.perDay ? `≈ ${s.perDay} titres par jour` : `${all.length} titre${all.length > 1 ? 's' : ''} sur 24 h`
            ]
              .filter(Boolean)
              .join(' · ')
          )}
        </span>
      </span>
    </>
  )
}
