import { Fragment, useMemo, useState, type CSSProperties } from 'react'
import { SIDE_LABELS, SIDES, sideOf, subjectWords, useCall, useHost, type NewsHeadline, type Side } from '@marianne/sdk/view'
import { byLean, daysInRow, shownSources, themeLabel } from '../model'
import { addDays, dayName, hour, hourOf, parisDay, span } from '../time'
import type { InfosMethods, Subject } from '../types'
import { fill, Marked, Num, SourceTag, Spectrum, useInfos, Words } from './common'

/**
 * A subject opened over the tab: how each source titles it (by hour, or by side), the words its
 * titles share and the ones a title alone has, who said it when from its first title to its last, the days before.
 * Its rail: questions for Marianne (the titles and their links only), the fact-checks the grouping
 * put in it.
 */

const QUESTIONS = ['Qu’ont ces titres en commun, qu’est-ce qui les sépare ?', 'Pourquoi en parle-t-on aujourd’hui ?', 'Qu’est-ce que ça change pour moi ?']
/** « les mots »: the most frequent. */
const WORDS_SHOWN = 9
/** The side's rule in « par bord »: the colour of its middle position. */
const SIDE_COLOR = { left: 'gauche', centre: 'centre', right: 'droite' } as const

const oldestFirst = (a: NewsHeadline, b: NewsHeadline) => Date.parse(a.published) - Date.parse(b.published)

export function SubjectPane({ subject: s }: { subject: Subject }) {
  const host = useHost<InfosMethods>()
  const { reading, name, lean, ask, openArticle } = useInfos()
  const [order, setOrder] = useState<'time' | 'side'>('time')
  const [withHidden, setWithHidden] = useState(false)
  const days = useCall<InfosMethods, 'days'>('days', [s.id, { all: reading.all }])
  const rows = useMemo(() => [...s.items, ...(withHidden ? s.hidden : [])].sort(oldestFirst), [s, withHidden])
  const words = useMemo(() => subjectWords(rows.map((h) => h.title)), [rows])
  const setAside = (h: NewsHeadline) => !!h.setAside
  const sides = byLean(shownSources(reading))
  const telling = new Set(s.items.map((h) => h.source))
  const today = parisDay(new Date(reading.readAt))
  const first = rows[0]
  const last = rows[rows.length - 1]

  const grouped: Array<{ h: NewsHeadline | null; head: Side | null }> =
    order === 'side'
      ? SIDES.flatMap((side): Array<{ h: NewsHeadline | null; head: Side | null }> => {
          const mine = rows.filter((h) => sideOf(lean(h.source)) === side)
          return mine.length ? mine.map((h, i) => ({ h, head: i === 0 ? side : null })) : [{ h: null, head: side }]
        })
      : rows.map((h) => ({ h, head: null }))

  // The axis of « dans la journée »: from the first title's hour to the hour after the last.
  const h0 = Date.parse(first.published) - (Date.parse(first.published) % 3_600_000)
  const h1 = Date.parse(last.published) - (Date.parse(last.published) % 3_600_000) + 3_600_000
  const x = (iso: string) => `${(((Date.parse(iso) - h0) / (h1 - h0)) * 94 + 3).toFixed(1)}%`
  const ticks = Array.from({ length: Math.round((h1 - h0) / 3_600_000) + 1 }, (_, i) => new Date(h0 + i * 3_600_000).toISOString())

  const inRow = days.data ? daysInRow(days.data, today, addDays) : null
  const ranked = [...words.count.entries()].sort((a, b) => b[1] - a[1]).slice(0, WORDS_SHOWN)

  return (
    <div className="infos-pane">
      <div className="infos-a">
        <div>
          <span className="infos-kick">
            <Num n={s.number} />
            <Words words={s.words} />
            {s.themes.map((t) => (
              <span key={t} className="infos-th">
                ◆ {themeLabel(t)}
              </span>
            ))}
            <span className="grow" />
            <Spectrum sources={sides} telling={telling} />
          </span>
          <h2>{s.items[0].title}</h2>
          {s.summary && <p className="infos-chapo">{s.summary}</p>}
          <div className="infos-stats">
            <span>
              <b>{s.told}</b>
              {reading.filtered ? `de vos ${reading.accepted} sources` : `sources sur ${reading.sources.length}`}
            </span>
            <span>
              <b>{rows.length}</b>titres
            </span>
            <span>
              <b>{span(first.published, last.published)}</b>du premier au dernier
            </span>
            {/* The days before couldn't be read: no count, rather than a wait that never ends. */}
            {!days.error && (
              <span>
                <b>{inRow ?? '…'}</b>
                {inRow && inRow > 1 ? 'jours d’affilée' : 'jour'}
              </span>
            )}
          </div>

          <div className="infos-h">
            <span className="label">comment ils titrent</span>
            <span className="small dim">
              <mark className="infos-own">surligné</mark> : ce qu’un seul titre dit
            </span>
            <span className="more seg">
              <button className={order === 'time' ? 'on' : ''} onClick={() => setOrder('time')}>
                par heure
              </button>
              <button className={order === 'side' ? 'on' : ''} onClick={() => setOrder('side')}>
                par bord
              </button>
            </span>
          </div>
          <table className="infos-ctable">
            <tbody>
              {grouped.map(({ h, head }, i) => [
                head && (
                  <tr key={`head-${head}`} className="sidehead">
                    <td colSpan={3}>
                      <span className="sh" style={{ '--side': `var(--lean-${SIDE_COLOR[head]})` } as CSSProperties}>
                        {SIDE_LABELS[head]}
                      </span>
                    </td>
                  </tr>
                ),
                h ? (
                  <tr key={h.id} className={`${setAside(h) ? 'off' : ''}${order === 'time' && i === 0 ? ' first' : ''}`}>
                    <td>
                      <SourceTag id={h.source} />
                    </td>
                    <td className="tm">{hour(h.published)}</td>
                    <td className="tt">
                      <button className="t" onClick={() => openArticle(h)}>
                        <Marked title={h.title} words={rows.length >= 3 ? words : null} />
                      </button>
                      {setAside(h) && <span className="infos-off">écartée</span>}
                      <span className="infos-acts">
                        <button className="btn small" onClick={() => host.copy(h.url, 'lien copié')}>
                          copier le lien
                        </button>
                        <button className="btn small" onClick={() => ask('Que faut-il savoir de ce titre ?', [h])}>
                          demander à Marianne
                        </button>
                      </span>
                    </td>
                  </tr>
                ) : (
                  <tr key={`none-${head}`} className="none">
                    <td colSpan={3} className="small muted">
                      aucun titre de ce côté
                    </td>
                  </tr>
                )
              ])}
            </tbody>
          </table>
          {s.hidden.length > 0 && (
            <div className="infos-more">
              {s.hidden.map((h) => (
                <SourceTag key={h.id} id={h.source} />
              ))}
              <span>
                {s.hidden.length} source{s.hidden.length > 1 ? 's' : ''} écartée{s.hidden.length > 1 ? 's' : ''} en parle{s.hidden.length > 1 ? 'nt' : ''} aussi
              </span>
              <button className="link" onClick={() => setWithHidden(!withHidden)}>
                {withHidden ? 'masquer' : 'afficher'}
              </button>
            </div>
          )}

          <div className="infos-two">
            <div>
              <div className="infos-h">
                <span className="label">les mots</span>
                <span className="small dim">dans combien de titres</span>
              </div>
              <div className="infos-wbars">
                {ranked.map(([k, n]) => (
                  <Fragment key={k}>
                    <span className={`w${n === 1 ? ' own' : ''}`}>{words.surface.get(k)}</span>
                    <span className="bar">
                      {Array.from({ length: n }, (_, j) => (
                        <i key={j} className={n === 1 ? 'own' : ''} />
                      ))}
                    </span>
                    <span className="n">
                      {n}/{rows.length}
                    </span>
                  </Fragment>
                ))}
              </div>
            </div>
            <div>
              <div className="infos-h">
                <span className="label">dans la journée</span>
                <span className="small dim">qui l’a dit quand</span>
              </div>
              <div className="infos-time">
                <span className="tn" style={{ left: 0 }}>
                  {name(first.source)}, {hour(first.published)}
                </span>
                <span className="tn" style={{ right: 0 }}>
                  {name(last.source)}, {hour(last.published)}
                </span>
                {rows.map((h, i) => (
                  <i
                    key={h.id}
                    className={setAside(h) ? 'off' : ''}
                    // Heights vary only so that two titles close in time stay two bars.
                    style={{ left: x(h.published), height: 12 + (i % 4) * 8, ...(setAside(h) ? {} : fill(lean(h.source))) }}
                    title={`${name(h.source)} · ${hour(h.published)}`}
                  />
                ))}
                {ticks.map((t) => (
                  <span key={t} className="h" style={{ left: x(t) }}>
                    {hourOf(t)} h
                  </span>
                ))}
              </div>
            </div>
          </div>

          {days.data && days.data.length > 0 && (
            <>
              <div className="infos-h">
                <span className="label">les jours d’avant</span>
                <span className="small dim">le même sujet, chaque jour</span>
              </div>
              <div className="infos-days">
                {[...days.data, { day: today, title: s.items[0].title, sources: s.items.length }].map((d) => (
                  <Fragment key={d.day}>
                    <span className={`d${d.day === today ? ' today' : ''}`}>{dayName(d.day)}</span>
                    <span className="t">{d.title}</span>
                    <span className="infos-cells" title={`${d.sources} sources`}>
                      {Array.from({ length: d.sources }, (_, j) => (
                        <i key={j} />
                      ))}
                    </span>
                  </Fragment>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <div className="infos-h">
            <span className="label">demander à Marianne</span>
          </div>
          <div className="infos-qs">
            {QUESTIONS.map((q) => (
              <button key={q} className="btn small" onClick={() => ask(q, rows)}>
                {q}
              </button>
            ))}
            <span className="small muted">elle reçoit ces titres et leurs liens, rien d’autre</span>
          </div>
          <div className="infos-h">
            <span className="label">vérification</span>
            <span className="small dim">{s.checks.length}</span>
          </div>
          {s.checks.length ? (
            s.checks.map((h) => (
              <button key={h.id} className="infos-rl" onClick={() => openArticle(h)}>
                <span className="by">
                  <SourceTag id={h.source} />
                  <span className="tm">{hour(h.published)}</span>
                </span>
                <span className="t">{h.title}</span>
              </button>
            ))
          ) : (
            <p className="infos-empty">Aucune vérification sur ce sujet pour le moment.</p>
          )}
        </div>
      </div>
    </div>
  )
}
