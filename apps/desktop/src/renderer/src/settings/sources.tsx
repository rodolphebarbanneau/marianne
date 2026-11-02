import { Fragment, useEffect, useState } from 'react'
import { foldText, LEAN_LABELS, LEANS, SIDE_LABELS, SIDES, type Lean, type Side } from '@marianne/sdk'
import type { Address, NewsChoice } from '@marianne/profile'
import { keptSections, leanOf, NEWS_GROUP_LABELS, regionOf, type NewsGroup, type NewsSource, type NewsStats } from '@shared/news'
import { acceptSources, byLean, choiceOf, defaultLean, giveLean, isAccepted, keepSections, REGIONS, sidesOf } from '@shared/news-choice'
import { REPO_URL } from '@shared/project'
import { SearchField } from '../components/ui'
import { api, errorText } from '../lib/api'
import { useNewsSources } from '../lib/content'
import { useProfile } from '../lib/profile'
import { Filter, ReadBy } from './parts'

/**
 * Réglages › Sources d'information: Marianne's list of news sources, the same for everyone, and what the
 * user makes of it (opinions.sources): each source accepted or set aside, its sections, its colour. The
 * colours only show a source's editorial line; nothing here sorts, hides or picks a source for the user.
 */

/** A source's colour, from the theme's tokens (styles.css, « the news sources' colours »). */
const leanColor = (lean: Lean) => `var(--lean-${lean})`
const leanInk = (lean: Lean) => `var(--lean-${lean}-ink)`

/** The side's colour in the summary: its outermost position's. */
const SIDE_LEANS: Record<Side, Lean> = { left: 'gauche', centre: 'centre', right: 'droite' }

/** Where the proposals of a new source go: the content form, which has « A news source ». */
const PROPOSE_URL = `${REPO_URL}/issues/new?template=content.yml`

const siteOf = (homepage: string) => {
  try {
    return new URL(homepage).hostname.replace(/^www\./, '')
  } catch {
    return homepage
  }
}
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one)

/** A source's block: its name in its colour, hollow when set aside; its position in the title for the Minitel 1's greys. */
function SourceTag({ source, lean, off }: { source: NewsSource; lean: Lean; off: boolean }) {
  return (
    <span
      className={`source-tag${off ? ' off' : ''}`}
      style={off ? undefined : { background: leanColor(lean), color: leanInk(lean) }}
      title={`${source.name} · ${LEAN_LABELS[lean]}${off ? ' · écartée' : ''}`}
    >
      {source.name.toUpperCase()}
    </span>
  )
}

/** The history's numbers; without them (nothing read yet), the rows and the summary leave theirs out. */
function useNewsStats(): NewsStats | null {
  const [stats, setStats] = useState<NewsStats | null>(null)
  useEffect(() => {
    let alive = true
    void api
      .newsStats()
      .then((s) => alive && setStats(s))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  return stats
}

export function SourcesPane() {
  const profile = useProfile()
  const [error, setError] = useState('')
  if (!profile) return null
  const save = (sources: NewsChoice) =>
    void api
      .updateProfile({ type: 'opinions', opinions: { sources } })
      .then(() => setError(''))
      .catch((err) => setError(errorText(err)))
  return (
    <>
      <Sources stored={profile.opinions.sources} address={profile.address} onChange={save} />
      {error && <p className="bad small">{error}</p>}
      <ReadBy field="opinions.sources" what={{ some: 'lues par', none: 'aucun service ne les lit' }} />
    </>
  )
}

type Shown = 'all' | 'on' | 'off'

function Sources({ stored, address, onChange }: { stored: NewsChoice | null; address: Address; onChange: (choice: NewsChoice) => void }) {
  const catalog = useNewsSources()
  const stats = useNewsStats()
  const [query, setQuery] = useState('')
  const [shownBy, setShownBy] = useState<Shown>('all')
  const [by, setBy] = useState<'family' | 'lean'>('family')
  const [open, setOpen] = useState<string | null>(null)
  // The choice as last changed here: a second click before the profile comes back builds on the first.
  const [pending, setPending] = useState<NewsChoice | null>(null)
  useEffect(() => setPending(null), [stored])
  const choice = pending ?? choiceOf(stored, catalog, address.inseeCode)
  const change = (next: NewsChoice) => {
    setPending(next)
    onChange(next)
  }
  if (!catalog.length) return null
  const region = regionOf(address.inseeCode)
  const accepted = catalog.filter((s) => isAccepted(choice, s.id))
  const today = stats?.today ?? []
  const perDay = (id: string) => stats?.perDay[id]
  const titles = Math.round(accepted.reduce((n, s) => n + (perDay(s.id) ?? 0), 0))
  const sides = sidesOf(catalog, choice)
  // What the choice leaves out: today's big subjects told only by set-aside sources, and this morning's titles only they have.
  const missed = today.filter((t) => t.sources.length > 0 && t.sources.every((id) => !isAccepted(choice, id))).length
  const aloneOff = catalog.filter((s) => !isAccepted(choice, s.id)).reduce((n, s) => n + (stats?.aloneThisMorning[s.id] ?? 0), 0)
  const q = foldText(query.trim())
  const shown = catalog
    .filter((s) => !q || foldText(`${s.name} ${siteOf(s.homepage)}`).includes(q))
    .filter((s) => shownBy === 'all' || (shownBy === 'on') === isAccepted(choice, s.id))

  const accept = (ids: string[], on: boolean) => change(acceptSources(choice, ids, on))
  const toggleSection = (source: NewsSource, id: string) => {
    const kept = keptSections(source, choice)
    change(keepSections(choice, source, kept.includes(id) ? kept.filter((x) => x !== id) : [...kept, id]))
  }

  // The groups: Marianne's families, or the editorial lines from the left to the right.
  const groups: Array<{ key: string; label: string; where?: string; rows: NewsSource[] }> =
    by === 'family'
      ? (Object.keys(NEWS_GROUP_LABELS) as NewsGroup[]).map((g) => ({
          key: g,
          label: NEWS_GROUP_LABELS[g],
          where: g === 'regional' && region && address.city ? `d’après votre adresse : ${address.city}, ${REGIONS[region]}` : undefined,
          rows: shown.filter((s) => s.group === g)
        }))
      : LEANS.map((l) => ({ key: l, label: LEAN_LABELS[l], rows: shown.filter((s) => leanOf(s, choice) === l) }))

  const row = (s: NewsSource) => {
    const off = !isAccepted(choice, s.id)
    const lean = leanOf(s, choice)
    const changed = choice.leanings[s.id] !== undefined
    const all = s.sections ?? []
    const kept = keptSections(s, choice)
    const tunable = all.length > 1
    const day = perDay(s.id)
    const covers = today.filter((t) => t.sources.includes(s.id)).length
    const own = !!region && !!s.regions?.includes(region)
    const areas = (s.regions ?? []).map((r) => REGIONS[r] ?? r).join(', ')
    const isOpen = open === s.id
    return (
      <Fragment key={s.id}>
        <tr className={off ? 'off' : ''} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
          <td onClick={(e) => e.stopPropagation()}>
            <button
              className={`switch${off ? '' : ' on'}`}
              role="switch"
              aria-checked={!off}
              aria-label={`accepter ${s.name}`}
              onClick={() => accept([s.id], off)}
            >
              <i />
            </button>
          </td>
          <td>
            <span className="stack" style={{ gap: 3 }}>
              <span className="row-flex" style={{ gap: 8 }}>
                <SourceTag source={s} lean={lean} off={off} />
                {own ? <span className="source-region">votre région</span> : areas && <span className="small muted ell">{areas}</span>}
              </span>
              <span className="small dim ell">
                {s.name} · {siteOf(s.homepage)}
              </span>
            </span>
          </td>
          <td>
            {off ? (
              <span className="muted">—</span>
            ) : !tunable ? (
              <span className="muted">un seul flux</span>
            ) : kept.length === all.length ? (
              'toutes'
            ) : (
              `${kept.length} sur ${all.length}`
            )}
          </td>
          <td>
            <span className="lean-chip">
              <i style={{ background: leanColor(lean) }} />
              {LEAN_LABELS[lean]}
              {changed && <span className="small accent">modifiée</span>}
            </span>
          </td>
          <td>{day !== undefined ? `≈ ${Math.round(day)} par jour` : <span className="muted">—</span>}</td>
          <td>{today.length > 0 ? `${covers}/${today.length}` : <span className="muted">—</span>}</td>
        </tr>
        {isOpen && (
          <tr className="detail">
            <td colSpan={6}>
              <div className="src-detail">
                <div>
                  <span className="label">rubriques</span>
                  {off ? (
                    <span className="small dim">écartée : acceptez-la pour choisir ses rubriques</span>
                  ) : tunable ? (
                    <div className="opts">
                      {all.map((sec) => (
                        <label key={sec.id}>
                          <input
                            type="checkbox"
                            checked={kept.includes(sec.id)}
                            // The last one unchecked sets the source aside: it is said on the box's title.
                            title={kept.length === 1 && kept.includes(sec.id) ? 'la dernière : la décocher écarte la source' : undefined}
                            onChange={() => toggleSection(s, sec.id)}
                          />{' '}
                          {sec.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <span className="small dim">un seul flux : rien à choisir</span>
                  )}
                </div>
                <div>
                  <span className="label">ligne éditoriale</span>
                  <div className="leans">
                    {LEANS.map((l) => (
                      <button key={l} className={l === lean ? 'on' : ''} onClick={() => change(giveLean(choice, s, l))}>
                        <i style={{ background: leanColor(l) }} />
                        {LEAN_LABELS[l]}
                        {l === defaultLean(s) && (
                          <span className="small muted" title="le classement par défaut de Marianne">
                            {' '}
                            · Marianne
                          </span>
                        )}
                      </button>
                    ))}
                    {changed && (
                      <button className="link small" onClick={() => change(giveLean(choice, s, null))}>
                        rétablir celle de Marianne
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  return (
    <section id="sources">
      <div className="source-kiosk">
        <span className="cells">
          {byLean(catalog, choice).map((s) => {
            const off = !isAccepted(choice, s.id)
            const lean = leanOf(s, choice)
            return (
              <i
                key={s.id}
                className={off ? 'off' : ''}
                style={off ? undefined : { background: leanColor(lean) }}
                title={`${s.name} · ${LEAN_LABELS[lean]}${off ? ' · écartée' : ''}`}
              />
            )
          })}
        </span>
        <span className="perm-stack">
          <span>
            <b>{accepted.length}</b> {plural(accepted.length, 'source', 'sources')} sur {catalog.length}
            {stats && (
              <>
                {' '}
                · <b>≈ {titles}</b> titres par jour
              </>
            )}
          </span>
          <span className="sides">
            {SIDES.filter((side) => sides[side] !== undefined).map((side) => (
              <span key={side}>
                <i style={{ background: leanColor(SIDE_LEANS[side]) }} />
                {SIDE_LABELS[side]} {sides[side]}
              </span>
            ))}
          </span>
          {missed > 0 ? (
            <span className="small accent">
              {missed} des grands sujets d’aujourd’hui ne vous {plural(missed, 'parviendrait', 'parviendraient')} pas
            </span>
          ) : (
            (today.length > 0 || aloneOff > 0) && (
              <span className="small dim">
                {today.length > 0 && `les ${today.length} grands sujets d’aujourd’hui vous parviennent`}
                {today.length > 0 && aloneOff > 0 && ' · '}
                {aloneOff > 0 && `${aloneOff} ${plural(aloneOff, 'titre', 'titres')}, ce matin, seulement chez des sources écartées`}
              </span>
            )
          )}
        </span>
      </div>
      <div className="list-tools">
        <SearchField className="framed" value={query} onChange={setQuery} placeholder="chercher une source" />
        <Filter<Shown>
          label="lesquelles"
          value={shownBy}
          onChange={setShownBy}
          options={[
            ['all', `toutes ${catalog.length}`],
            ['on', `acceptées ${accepted.length}`],
            ['off', `écartées ${catalog.length - accepted.length}`]
          ]}
        />
        <span className="grow" />
        <Filter<'family' | 'lean'>
          label="classer"
          value={by}
          onChange={setBy}
          options={[
            ['family', 'par famille'],
            ['lean', 'par ligne']
          ]}
        />
      </div>
      {shown.length ? (
        <div className="table-wrap">
          <table className="stable sources-table">
            <thead>
              <tr>
                <th style={{ width: 52 }}>
                  <span className="sr-only">acceptée</span>
                </th>
                <th>source</th>
                <th>rubriques</th>
                <th>ligne éditoriale</th>
                <th>par jour</th>
                <th>sujets du jour</th>
              </tr>
            </thead>
            <tbody>
              {groups
                .filter((g) => g.rows.length)
                .map((g) => {
                  const on = g.rows.filter((s) => isAccepted(choice, s.id)).length
                  const ids = g.rows.map((s) => s.id)
                  return (
                    <Fragment key={g.key}>
                      <tr className="grp">
                        <td colSpan={6}>
                          <span className="label">{g.label}</span>
                          <span className="small dim">
                            {on} sur {g.rows.length}
                          </span>
                          {g.where && <span className="small muted"> · {g.where}</span>}
                          <span className="grp-tools">
                            <button className="link small" disabled={on === g.rows.length} onClick={() => accept(ids, true)}>
                              tout accepter
                            </button>
                            {' · '}
                            <button className="link small" disabled={on === 0} onClick={() => accept(ids, false)}>
                              tout écarter
                            </button>
                          </span>
                        </td>
                      </tr>
                      {g.rows.map(row)}
                    </Fragment>
                  )
                })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small dim empty">Aucune source ne correspond.</p>
      )}
      <p className="small list-foot">
        <button className="link" onClick={() => api.openExternal(PROPOSE_URL)} title={PROPOSE_URL}>
          proposer une source ↗
        </button>
      </p>
    </section>
  )
}
