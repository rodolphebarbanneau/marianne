import { Fragment, useLayoutEffect, useMemo, useState } from 'react'
import { isLive, sideOf, Spinner, subjectWords, useCall, withoutLive, type NewsArticle, type NewsHeadline } from '@marianne/sdk/view'
import { byLean, shownSources, themeLabel } from '../model'
import { clock, hour, longDay, parisDay, shortDay } from '../time'
import type { InfosMethods, Subject } from '../types'
import { Badges, fill, LeanKey, Marked, NoneFound, Num, placeOf, QueryMarked, sidesOf, SourceTag, Spectrum, Track, TrackAxis, useInfos, Words } from './common'

/**
 * F2 · à la une: the list of subjects and the subject a row points to. On the left, narrow, every
 * subject, a row each, its sources as one flat bar from the left to the right; on the right, sticky,
 * the chosen subject: its latest title and article, who tells it side by side, its own fil. Choosing
 * another row changes the right column; the list never moves. Above both, the band: what is live,
 * the hour of the reading and the page's counts. Under both, the titles no other source tells.
 */

/** The live cards of the band: the most recent, four across at most. */
const LIVE_CARDS = 4
/** The titles of « une seule source » shown, the most recent: the fil has them all. */
const SINGLE_SHOWN = 14

/** The band above the page: « EN DIRECT », the hour of the reading, the counts; under it, the live titles. */
export function Band({ refreshing, pending, apply, choose }: { refreshing: boolean; pending: boolean; apply: () => void; choose: (id: string) => void }) {
  const { reading, name, openArticle } = useInfos()
  const cards = reading.live.slice(0, LIVE_CARDS)
  return (
    <div className="infos-top">
      <div className="hd">
        <span className="lab">EN DIRECT</span>
        {refreshing ? (
          <Spinner />
        ) : reading.offline ? (
          <span className="day">hors ligne · titres de {hour(reading.readAt)}</span>
        ) : (
          <span className="day" title={`${longDay(reading.readAt)} · titres lus à ${hour(reading.readAt)}`}>
            {shortDay(reading.readAt)} · {clock(reading.readAt)}
          </span>
        )}
        {!reading.live.length && <span className="small muted">aucun direct en ce moment</span>}
        {reading.live.length > LIVE_CARDS && (
          <span className="small muted lv-count">
            {reading.live.length} directs, les {LIVE_CARDS} derniers
          </span>
        )}
        {pending && (
          <button className="link small" onClick={apply} title="les titres lus depuis, rangés de nouveau">
            nouveaux titres · actualiser
          </button>
        )}
        <span className="stats">
          <span className="stat">
            <b>{reading.items.length}</b>titres
          </span>
          <span className="stat">
            <b>{shownSources(reading).length}</b>sources
          </span>
        </span>
      </div>
      {cards.length > 0 && (
        <div className="lvs">
          {cards.map(({ item, number }) => (
            <LiveCard
              key={item.id}
              item={item}
              number={number}
              name={name(item.source)}
              onOpen={() => openArticle(item)}
              onChoose={() => number !== null && choose(reading.subjects[number - 1].id)}
            />
          ))}
          {reading.live.length > 1 && <span className="lv-more small muted">+{reading.live.length - 1}</span>}
        </div>
      )}
    </div>
  )
}

function LiveCard({
  item,
  number,
  name,
  onOpen,
  onChoose
}: {
  item: NewsHeadline
  number: number | null
  name: string
  onOpen: () => void
  onChoose: () => void
}) {
  const text = withoutLive(item.title)
  // A click anywhere on the card opens the article; from the keys, its title does. The number is a
  // button of its own beside the title, never inside it, so Entrée on it chooses the subject.
  return (
    <div className="lv" title={`${name}, en direct depuis ${hour(item.published)} · ${text}`} onClick={onOpen}>
      <span className="by">
        <SourceTag id={item.source} />
        <span className="tm">depuis {hour(item.published)}</span>
        {number !== null && (
          <button
            className="go"
            title={`voir le sujet ${number}`}
            onClick={(e) => {
              e.stopPropagation()
              onChoose()
            }}
          >
            <Num n={number} small />
          </button>
        )}
      </span>
      <span
        className="t"
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
          e.preventDefault()
          onOpen()
        }}
      >
        {text}
      </span>
    </div>
  )
}

export interface FrontProps {
  /** The subjects listed (the theme filter hides rows and keeps their numbers). */
  listed: Subject[]
  chosen: Subject | null
  choose(id: string): void
  mine: boolean
  setMine(mine: boolean): void
  /** Wide enough for the two columns; narrower, the chosen row opens its subject under itself. */
  wide: boolean
}

export function FrontTab(props: FrontProps) {
  const { reading, openSubject, openTab } = useInfos()
  const single = reading.single.slice(0, SINGLE_SHOWN)
  const [cur, setCur] = useState<HTMLDivElement | null>(null)
  const sticky = useFits(cur)
  return (
    <>
      {reading.subjects.length ? (
        <div className="infos-dash">
          <div className="infos-side">
            <SubjectList {...props} />
          </div>
          {props.wide && (
            <div ref={setCur} className={`infos-cur${sticky ? ' sticky' : ''}`}>
              {props.chosen && <Chosen subject={props.chosen} onOpen={() => openSubject(props.chosen!.id)} />}
            </div>
          )}
        </div>
      ) : (
        <p className="infos-empty">Aucun titre de vos sources ce matin.</p>
      )}
      {reading.single.length > 0 && (
        <div className="infos-section">
          <div className="infos-h">
            <span className="label">une seule source</span>
            <span className="small dim">{reading.single.length} titres que les autres ne reprennent pas</span>
            <button className="more link" onClick={() => openTab('wire')}>
              tout le fil ›
            </button>
          </div>
          <div className="infos-brief">
            {single.map((h) => (
              <SingleLine key={h.id} item={h} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/** Room kept above and below the sticky column, in the page that scrolls. */
const STICKY_ROOM = 24

/**
 * Whether the right column fits in the page that scrolls it: it sticks only then. Taller, it would
 * stay pinned with its end out of reach; it scrolls with the list instead.
 */
function useFits(el: HTMLElement | null): boolean {
  const [fits, setFits] = useState(false)
  useLayoutEffect(() => {
    if (!el) return
    let page: HTMLElement | null = el.parentElement
    while (page && !/(auto|scroll)/.test(getComputedStyle(page).overflowY)) page = page.parentElement
    const measure = () => setFits(el.offsetHeight + STICKY_ROOM <= (page?.clientHeight ?? window.innerHeight))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (page) observer.observe(page)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [el])
  return fits
}

/** The list, in the left column: a row a subject; a click chooses it, and the right column shows it. */
function SubjectList({ listed, chosen, choose, mine, setMine, wide }: FrontProps) {
  const { reading, openSubject, openSources, name } = useInfos()
  const cols = useMemo(() => byLean(shownSources(reading)), [reading])
  const themed = reading.subjects.filter((s) => s.themes.length).length
  return (
    <>
      <div className="infos-h">
        <span className="label">les sujets</span>
        <span className="more seg">
          <button className={mine ? '' : 'on'} onClick={() => setMine(false)}>
            tous · {reading.subjects.length}
          </button>
          {reading.themes.length > 0 && (
            <button className={mine ? 'on' : ''} onClick={() => setMine(true)} title="les sujets de vos thèmes (Réglages › Identité)">
              ◆ vos thèmes · {themed}
            </button>
          )}
        </span>
      </div>
      {listed.length ? (
        <table className="infos-mos infos-list">
          <tbody>
            {listed.map((s) => {
              const by = new Map(s.items.map((h) => [h.source, h]))
              const sel = chosen?.id === s.id
              return (
                <Fragment key={s.id}>
                  <tr className={`row${sel ? ' sel' : ''}`} data-subject={s.id} onClick={() => choose(s.id)}>
                    <td className="num">
                      <Num n={s.number} />
                    </td>
                    <td className="lbl">
                      <span className="w">
                        <span className="ws">{s.words.join(' · ')}</span>
                      </span>
                      <span className="t">
                        <Badges live={s.live} fresh={s.fresh} checked={s.checks.length > 0} themes={s.themes.map(themeLabel)} />
                        <span className="lst">{s.items[0].title}</span>
                      </span>
                      <span className="bar">
                        {cols.map((c, j) => {
                          const h = by.get(c.id)
                          const gs = j > 0 && sideOf(cols[j - 1].lean) !== sideOf(c.lean) ? ' gs' : ''
                          if (!h) return <span key={c.id} className={`cell${gs}`} title={`${placeOf(c.name, c.lean, c.setAside)} · n’en parle pas`} />
                          return (
                            <span
                              key={c.id}
                              className={`cell on${gs}${c.setAside ? ' offon' : ''}`}
                              style={c.setAside ? undefined : fill(c.lean)}
                              title={`${name(c.id)} · ${hour(h.published)} · ${h.title}`}
                            />
                          )
                        })}
                      </span>
                    </td>
                    <td className="n" title="le rang : le nombre de sources qui en parlent">
                      {s.told}
                      {s.aside > 0 && <span className="small muted">+{s.aside}</span>}
                    </td>
                  </tr>
                  {!wide && sel && (
                    <tr className="open">
                      <td colSpan={3}>
                        <Chosen subject={s} onOpen={() => openSubject(s.id)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="infos-empty">Aucun sujet de vos thèmes pour le moment.</p>
      )}
      <div className="infos-legend">
        <span className="small muted">sur 24 h, rangés par nombre de sources</span>
        <LeanKey />
        <button className="link small" onClick={openSources} title="Réglages › Identité › sources d’information">
          les couleurs ›
        </button>
      </div>
    </>
  )
}

/** The subject a row points to: its latest title and article, who tells it side by side, its own fil. */
export function Chosen({ subject: s, onOpen }: { subject: Subject; onOpen: () => void }) {
  const { reading, source, name, ask, setAll, openArticle } = useInfos()
  const lead = s.items[0]
  const article = useCall<InfosMethods, 'article'>('article', [lead.id])
  const shown = useMemo(() => byLean(shownSources(reading)), [reading])
  const telling = new Set(s.items.map((h) => h.source))
  const words = useMemo(() => subjectWords([...s.items].reverse().map((h) => h.title)), [s])
  const a = article.data
  return (
    <div className="infos-detail">
      <span className="infos-kick">
        <Num n={s.number} />
        <Words words={s.words} />
        <Badges live={s.live} fresh={s.fresh} checked={s.checks.length > 0} themes={s.themes.map(themeLabel)} />
      </span>
      <button className="big" onClick={() => openArticle(lead)} title={`ouvrir sur ${source(lead.source)?.site ?? name(lead.source)} ↗`}>
        {lead.title}
      </button>
      <div className={`dt-art${a?.media ? ' has-media' : ''}`}>
        {a?.media && <Media media={a.media} onOpen={() => openArticle(lead)} />}
        <div className="dt-text">
          {s.summary && <p className="infos-chapo">{s.summary}</p>}
          <ArticleStart article={a} source={name(lead.source)} onOpen={() => openArticle(lead)} />
          <span className="infos-by">
            <SourceTag id={lead.source} />
            <span>
              {name(lead.source)} · {hour(lead.published)} · {s.items.length} titres depuis {hour(s.first)}
            </span>
          </span>
          <span className="infos-foot">
            <button className="btn small primary" onClick={onOpen}>
              ouvrir le sujet ›
            </button>
            <button className="btn small" onClick={() => ask('Que faut-il savoir de ce sujet ?', s.items)}>
              demander à Marianne
            </button>
          </span>
        </div>
      </div>
      <div className="dt-sides">
        <span className="dt-hd">
          <span className="label">qui en parle</span>
          {(s.hidden.length > 0 || s.checks.length > 0) && (
            <span className="dt-more">
              {s.hidden.length > 0 && (
                <span className="small dim">
                  et {s.hidden.length} source{s.hidden.length > 1 ? 's' : ''} écartée{s.hidden.length > 1 ? 's' : ''} ·{' '}
                  <button className="link" onClick={() => setAll(true)}>
                    les voir
                  </button>
                </span>
              )}
              {s.checks.length > 0 && (
                <span className="small">
                  <span className="infos-chk">✓ vérifié</span> {s.checks.map((h) => `${name(h.source)}, ${hour(h.published)}`).join(' · ')}
                </span>
              )}
            </span>
          )}
        </span>
        <div className="sds">
          {sidesOf(shown).map(({ side, label, sources }) => {
            // The count is of the user's sources; the side is muted only when no cell is lit, a set-aside one's included.
            const mine = sources.filter((c) => !c.setAside)
            const on = mine.filter((c) => telling.has(c.id)).length
            const lit = sources.some((c) => telling.has(c.id))
            return (
              <div key={side} className={`sd${lit ? '' : ' none'}`}>
                <span className="l">{label}</span>
                <span className="cl">
                  {sources.map((c) => {
                    const lit = telling.has(c.id)
                    return (
                      <i
                        key={c.id}
                        className={`${lit ? 'on' : ''}${c.setAside ? ' off' : ''}`}
                        style={lit && !c.setAside ? fill(c.lean) : undefined}
                        title={`${placeOf(c.name, c.lean, c.setAside)}${lit ? '' : ' · n’en parle pas'}`}
                      />
                    )
                  })}
                </span>
                <span className="c">
                  <b>{on}</b> sur {mine.length}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="infos-sub">
        <span className="label">le fil du sujet</span>
        <span className="small dim">
          {s.items.length} titres, du dernier au premier · <mark className="infos-own">surligné</mark> : ce qu’un seul titre dit
        </span>
      </div>
      <div className="infos-snip">
        <div className="sn head">
          <span />
          <TrackAxis />
          <span />
          <span />
        </div>
        {s.items.map((h) => {
          const off = !!source(h.source)?.setAside
          return (
            <div key={h.id} className={`sn${off ? ' dim' : ''}`}>
              <span className="tm">{clock(h.published)}</span>
              <Track id={h.source} />
              <span className="src">
                <SourceTag id={h.source} />
              </span>
              <button className="t" onClick={() => openArticle(h)} title={h.title}>
                <Marked title={h.title} words={s.items.length >= 3 ? words : null} />
              </button>
              {off ? <span className="infos-off">écartée</span> : isLive(h.title) ? <span className="infos-direct">DIRECT</span> : <span />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The start of the article, four lines at most, then the way to the rest; behind a paywall, only the way. */
export function ArticleStart({ article, source, onOpen }: { article: NewsArticle | null; source: string; onOpen: () => void }) {
  if (article?.start)
    return (
      <p className="dt-start">
        <span className="tx">{article.start}</span>
        <button className="link" onClick={onOpen}>
          lire la suite sur {source} ›
        </button>
      </p>
    )
  if (article?.paid)
    return (
      <p className="dt-start paid">
        <span className="infos-paid">abonnés</span> la suite est réservée aux abonnés ·{' '}
        <button className="link" onClick={onOpen}>
          l’ouvrir sur {source} ›
        </button>
      </p>
    )
  return null
}

/** The headline's media, at the left of its text: the image (or a video's frame), its caption and credit. A video never plays here. */
export function Media({ media, onOpen }: { media: NonNullable<NewsArticle['media']>; onOpen: () => void }) {
  return (
    <figure className={`dt-media${media.kind === 'vidéo' ? ' video' : ''}`}>
      <button className="ph" onClick={onOpen} title={`${media.alt} · ouvrir l’article`}>
        <img src={media.src} alt={media.alt} />
        {media.kind === 'vidéo' && <span className="play">▶</span>}
        <span className="kind">
          {media.kind}
          {media.duration ? ` · ${media.duration}` : ''}
        </span>
      </button>
      {(media.alt || media.credit) && (
        <figcaption>
          {media.alt}
          {media.credit && <span className="cr">{media.credit}</span>}
        </figcaption>
      )}
    </figure>
  )
}

/** A title no other source tells: its time, its source, the title; a live coverage, a fact-check or a theme says so. */
function SingleLine({ item: h }: { item: NewsHeadline }) {
  const { reading, source, openArticle } = useInfos()
  const off = !!source(h.source)?.setAside
  const mark = isLive(h.title) ? (
    <span className="infos-direct">DIRECT</span>
  ) : source(h.source)?.group === 'factcheck' ? (
    <span className="infos-chk">✓ vérification</span>
  ) : reading.themed[h.id] ? (
    <span className="infos-th" title={reading.themed[h.id].map(themeLabel).join(', ')}>
      ◆
    </span>
  ) : (
    <span />
  )
  return (
    <div className={`infos-bl${off ? ' dim' : ''}`}>
      <span className="tm">{clock(h.published)}</span>
      <span>
        <SourceTag id={h.source} />
      </span>
      <button className="t" onClick={() => openArticle(h)}>
        {h.title}
      </button>
      {mark}
    </div>
  )
}

/** The search on « à la une »: the titles that say the words, over the last 7 days, each subject once with its number. */
export function SearchResults() {
  const { reading, query, openArticle, openSubject } = useInfos()
  const found = useCall<InfosMethods, 'search'>('search', [query, { all: reading.all }])
  const cols = useMemo(() => byLean(shownSources(reading)), [reading])
  const hits = useMemo(() => {
    const seen = new Set<number>()
    return (found.data ?? []).filter((h) => {
      const n = reading.numbers[h.id]
      if (!n) return true
      if (seen.has(n)) return false
      seen.add(n)
      return true
    })
  }, [found.data, query, reading])
  // What the list shows: a line a subject, then a line a title in none.
  const subjects = hits.filter((h) => reading.numbers[h.id]).length
  const titles = hits.length - subjects
  const counted = [subjects && `${subjects} sujet${subjects > 1 ? 's' : ''}`, titles && `${titles} titre${titles > 1 ? 's' : ''} hors sujet`].filter(Boolean)
  const today = parisDay(new Date(reading.readAt))
  return (
    <>
      <div className="infos-h infos-first">
        <span className="label">« {query} »</span>
        {counted.length > 0 && <span className="small dim">{counted.join(' · ')}</span>}
        {found.loading && <Spinner />}
      </div>
      {found.error ? (
        <p className="infos-empty bad">{found.error}</p>
      ) : !found.data ? null : hits.length ? (
        <div className="infos-brief one">
          {hits.map((h) => {
            const n = reading.numbers[h.id]
            const s = n ? reading.subjects[n - 1] : null
            return (
              <div key={h.id} className="infos-bl">
                <span className="tm" title={longDay(h.published)}>
                  {parisDay(new Date(h.published)) === today ? clock(h.published) : shortDay(h.published)}
                </span>
                <span>
                  <SourceTag id={h.source} />
                </span>
                <button className="t" onClick={() => openArticle(h)}>
                  <QueryMarked text={h.title} query={query} />
                </button>
                {s ? (
                  <span className="infos-hit">
                    <Spectrum sources={cols} telling={new Set(s.items.map((x) => x.source))} />
                    <button className="infos-cov" onClick={() => openSubject(s.id)} title={`le sujet ${s.number} · ${s.items.length} sources`}>
                      <Num n={s.number} small />
                      {s.items.length} ›
                    </button>
                  </span>
                ) : (
                  <span />
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <NoneFound />
      )}
    </>
  )
}
