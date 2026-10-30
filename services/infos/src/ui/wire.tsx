import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { LEANS, type NewsGroup, type NewsHeadline } from '@marianne/sdk/view'
import { GROUP_LABELS, GROUPS, matches, newSince, themeLabel } from '../model'
import { clock, hourOf, parisDay } from '../time'
import { fill, LeanKey, Num, SourceTag, useInfos } from './common'

/**
 * F3 · fil: the same titles by time, newest first, one line each under hour rules, each with its
 * subject's number. Above them, the morning's flow: one column per hour, one cell per title in its
 * source's colour, stacked from the left (bottom) to the right (top). The families only filter.
 */

/** The flow starts at 5 h, when the morning papers are out (earlier, at midnight). */
const MORNING = 5

export function WireTab() {
  const { reading, source, lean, query, since, openArticle, openSubject } = useInfos()
  const [group, setGroup] = useState<NewsGroup | null>(null)
  const [mine, setMine] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const fresh = useMemo(() => new Set(newSince(reading.items, since).map((h) => h.id)), [reading, since])
  const today = parisDay(new Date(reading.readAt))
  const dayOf = (h: NewsHeadline) => parisDay(new Date(h.published))

  const rows = reading.items.filter(
    (h) => (!group || source(h.source)?.group === group) && (!mine || reading.themed[h.id]) && (matches(h.title, query) || matches(h.summary ?? '', query))
  )
  const counts = Object.fromEntries(GROUPS.map((g) => [g, reading.items.filter((h) => source(h.source)?.group === g).length]))

  // The flow: today's hours, from the morning to the hour of the reading.
  const now = hourOf(reading.readAt)
  const from = now >= MORNING ? MORNING : 0
  const morning = rows.filter((h) => dayOf(h) === today && hourOf(h.published) >= from)
  const hours = Array.from({ length: now - from + 1 }, (_, i) => from + i)
  // The cells get thinner when an hour is crowded, so that every column stays in view (160 px at most).
  const busiest = Math.max(1, ...hours.map((h) => morning.filter((x) => hourOf(x.published) === h).length))
  const cell = Math.max(1, Math.min(4, Math.floor(160 / busiest) - 1))
  const rankOf = (h: NewsHeadline) => LEANS.indexOf(lean(h.source))
  const toHour = (h: number) => root.current?.querySelector(`[data-hour="${today}-${h}"]`)?.scrollIntoView({ block: 'start' })

  const keyOf = (h: NewsHeadline) => `${dayOf(h)}-${hourOf(h.published)}`
  const perHour = new Map<string, number>()
  for (const h of rows) perHour.set(keyOf(h), (perHour.get(keyOf(h)) ?? 0) + 1)
  let last = ''
  return (
    <div ref={root}>
      <div className="infos-flow">
        <div className="infos-hist" style={{ '--cell': `${cell}px`, '--cell-gap': cell > 2 ? '1px' : '0px' } as CSSProperties}>
          {hours.map((h) => {
            const inHour = morning.filter((x) => hourOf(x.published) === h).sort((a, b) => rankOf(a) - rankOf(b))
            return (
              <button key={h} onClick={() => toHour(h)} title={`${inHour.length} titres à ${h} h`} disabled={!inHour.length}>
                <span className="c">{inHour.length}</span>
                <span className="stk">
                  {inHour.map((x) => (
                    <i key={x.id} style={source(x.source)?.setAside ? { background: 'var(--rule)' } : fill(lean(x.source))} />
                  ))}
                </span>
                <span className="h">{h} H</span>
              </button>
            )
          })}
        </div>
        <div className="sum">
          <span className="dim">
            <b>{morning.length}</b>titres depuis {from} h
          </span>
          <LeanKey />
        </div>
      </div>
      <div className="infos-bar">
        <span className="chips">
          <button className={`chip${group ? '' : ' on'}`} onClick={() => setGroup(null)}>
            tout
          </button>
          {GROUPS.filter((g) => counts[g]).map((g) => (
            <button key={g} className={`chip${group === g ? ' on' : ''}`} onClick={() => setGroup(group === g ? null : g)}>
              {GROUP_LABELS[g]}
              <span className="n">{counts[g]}</span>
            </button>
          ))}
        </span>
        {reading.themes.length > 0 && (
          <button className={`chip${mine ? ' on' : ''}`} onClick={() => setMine(!mine)}>
            ◆ vos thèmes
          </button>
        )}
      </div>
      {rows.length ? (
        rows.map((h) => {
          const key = keyOf(h)
          const head = key !== last
          last = key
          const n = reading.numbers[h.id]
          const s = n ? reading.subjects[n - 1] : null
          const off = !!source(h.source)?.setAside
          return (
            <div key={h.id}>
              {head && (
                <div className="infos-hour" data-hour={key}>
                  {hourOf(h.published)} H{dayOf(h) !== today && ' · HIER'}
                  <span>
                    {perHour.get(key)} titre{perHour.get(key)! > 1 ? 's' : ''}
                  </span>
                </div>
              )}
              <div className={`infos-w${off ? ' dim' : ''}`}>
                <span className="tm">{clock(h.published)}</span>
                <span>
                  <SourceTag id={h.source} />
                </span>
                <button className="t" onClick={() => openArticle(h)} title={h.title}>
                  {h.title}
                </button>
                <span className="r">
                  {fresh.has(h.id) && <span className="infos-new">NOUVEAU</span>}
                  {reading.themed[h.id]?.map((t) => (
                    <span key={t} className="infos-th">
                      ◆ {themeLabel(t)}
                    </span>
                  ))}
                  {off && <span className="infos-off">écartée</span>}
                  {s && (
                    <button className="infos-cov" onClick={() => openSubject(s.id)} title={`le sujet ${s.number} · ${s.items.length} sources`}>
                      <Num n={s.number} small />
                      {s.items.length} ›
                    </button>
                  )}
                </span>
              </div>
            </div>
          )
        })
      ) : (
        <p className="infos-empty">{query ? 'Aucun titre de vos sources n’en parle.' : 'Aucun titre ne correspond.'}</p>
      )}
    </div>
  )
}
