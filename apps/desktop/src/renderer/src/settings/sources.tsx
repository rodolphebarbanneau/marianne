import { useEffect, useState } from 'react'
import { foldText, LEAN_LABELS, LEANS, SIDE_LABELS, SIDES, type Lean, type Side } from '@marianne/sdk'
import type { Address, NewsChoice } from '@marianne/profile'
import { keptSections, leanOf, NEWS_GROUP_LABELS, regionOf, type NewsGroup, type NewsSource, type NewsStats } from '@shared/news'
import { acceptSources, byLean, choiceOf, defaultLean, giveLean, isAccepted, keepSections, REGIONS, sidesOf } from '@shared/news-choice'
import { REPO_URL } from '@shared/project'
import { GearIcon, SearchIcon } from '../components/icons'
import { api } from '../lib/api'
import { useNewsSources } from '../lib/content'

/**
 * Réglages › Identité › sources d'information: Marianne's list of news sources, the same for
 * everyone, and what the user makes of it (opinions.sources): each source accepted or set aside,
 * its sections, its colour. The colours only show a source's editorial line; nothing here sorts,
 * hides or picks a source for the user.
 */

/** A source's colour, from the theme's tokens (styles.css, « the news sources' colours »). */
const leanColor = (lean: Lean) => `var(--lean-${lean})`
const leanInk = (lean: Lean) => `var(--lean-${lean}-ink)`

/** The side's colour in the summary: its outermost position's. */
const SIDE_LEANS: Record<Side, Lean> = { left: 'gauche', centre: 'centre', right: 'droite', none: 'aucune' }

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

export function SourcesSection({ stored, address, onChange }: { stored: NewsChoice | null; address: Address; onChange: (choice: NewsChoice) => void }) {
  const catalog = useNewsSources()
  const stats = useNewsStats()
  const [query, setQuery] = useState('')
  const [sectionsOpen, setSectionsOpen] = useState<string | null>(null)
  const [leanOpen, setLeanOpen] = useState<string | null>(null)
  // The choice as last changed here: a second click before the profile comes back builds on the first.
  const [pending, setPending] = useState<NewsChoice | null>(null)
  useEffect(() => setPending(null), [stored])
  const choice = pending ?? choiceOf(stored, catalog, address.inseeCode)
  const change = (next: NewsChoice) => {
    setPending(next)
    onChange(next)
  }
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
  const shown = catalog.filter((s) => !q || foldText(`${s.name} ${siteOf(s.homepage)}`).includes(q))
  const groups = Object.keys(NEWS_GROUP_LABELS) as NewsGroup[]

  const accept = (ids: string[], on: boolean) => {
    if (!on && sectionsOpen && ids.includes(sectionsOpen)) setSectionsOpen(null)
    change(acceptSources(choice, ids, on))
  }
  const toggleSection = (source: NewsSource, id: string) => {
    const kept = keptSections(source, choice)
    const next = kept.includes(id) ? kept.filter((x) => x !== id) : [...kept, id]
    if (!next.length) setSectionsOpen(null)
    change(keepSections(choice, source, next))
  }

  const row = (s: NewsSource) => {
    const off = !isAccepted(choice, s.id)
    const lean = leanOf(s, choice)
    const changed = choice.leanings[s.id] !== undefined
    const all = s.sections ?? []
    const kept = keptSections(s, choice)
    const tunable = all.length > 1
    const what = off ? (
      <span className="muted">écartée</span>
    ) : !tunable ? (
      'un seul flux'
    ) : kept.length === all.length ? (
      'toutes les rubriques'
    ) : (
      `${kept.length} rubriques sur ${all.length}`
    )
    const day = perDay(s.id)
    const covers = today.filter((t) => t.sources.includes(s.id)).length
    const numbers = [day !== undefined && `≈ ${Math.round(day)} par jour`, today.length > 0 && `${covers}/${today.length} sujets du jour`]
      .filter(Boolean)
      .join(' · ')
    const own = !!region && !!s.regions?.includes(region)
    const areas = (s.regions ?? []).map((r) => REGIONS[r] ?? r).join(', ')
    return (
      <div key={s.id}>
        <div className={`perm-row source-row${off ? ' off' : ''}`}>
          <span className="perm-stack">
            <span className="perm-name">
              <SourceTag source={s} lean={lean} off={off} />
              {own ? <span className="source-region">votre région</span> : areas && <span className="small muted perm-ell">{areas}</span>}
            </span>
            <span className="small dim perm-ell">
              {s.name} · {siteOf(s.homepage)}
            </span>
          </span>
          <span className="perm-stack small">
            <span>{what}</span>
            <span className="muted">{numbers}</span>
          </span>
          <button
            className={`lean-btn${leanOpen === s.id ? ' open' : ''}`}
            aria-expanded={leanOpen === s.id}
            onClick={() => setLeanOpen(leanOpen === s.id ? null : s.id)}
            title="sa couleur : sa ligne éditoriale"
          >
            <i style={{ background: leanColor(lean) }} />
            {LEAN_LABELS[lean]}
            {changed && <span className="mod">modifié</span>}
          </button>
          <span className="perm-acts">
            <span className="perm-seg">
              <button className={off ? '' : 'on'} onClick={() => accept([s.id], true)}>
                accepter
              </button>
              <button className={off ? 'on' : ''} onClick={() => accept([s.id], false)}>
                écarter
              </button>
            </span>
            <button
              className={`icon-btn${sectionsOpen === s.id ? ' accent' : ''}`}
              disabled={!tunable || off}
              onClick={() => setSectionsOpen(sectionsOpen === s.id ? null : s.id)}
              title={!tunable ? 'un seul flux : rien à choisir' : off ? 'écartée : acceptez-la pour choisir ses rubriques' : 'choisir ses rubriques'}
            >
              <GearIcon />
            </button>
          </span>
        </div>
        {leanOpen === s.id && (
          <div className="perm-cfg lean-pick">
            <span className="small dim">{s.name} :</span>
            {LEANS.map((l) => (
              <button key={l} className={l === lean ? 'on' : ''} onClick={() => change(giveLean(choice, s, l))}>
                <i style={{ background: leanColor(l) }} />
                {LEAN_LABELS[l]}
                {l === defaultLean(s) && (
                  <span className="small muted" title="le classement par défaut de Marianne : vous pouvez le changer">
                    {' '}
                    · Marianne
                  </span>
                )}
              </button>
            ))}
            {changed && (
              <button className="link small" onClick={() => change(giveLean(choice, s, null))}>
                rétablir
              </button>
            )}
          </div>
        )}
        {sectionsOpen === s.id && !off && (
          <div className="perm-cfg">
            <span className="small dim">{s.name} :</span>
            {all.map((sec) => (
              <label key={sec.id}>
                <input type="checkbox" checked={kept.includes(sec.id)} onChange={() => toggleSection(s, sec.id)} /> {sec.label}
              </label>
            ))}
            <span className="small muted">tout décocher revient à l’écarter</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <section id="sources">
      <span className="label sub">sources d’information</span>
      <div className="space opinions">
        <span>
          Les journaux, radios et télévisions que Marianne lit pour vous : leur titre, leur heure, leur lien et le début de l’article, jamais l’article entier.
          Ceux que vous écartez ne s’affichent plus, ni dans 3615 INFOS, ni dans les services à qui vous partagez vos sources. Leur couleur dit leur ligne
          éditoriale : celle que propose Marianne, ou celle que vous leur donnez.
        </span>
        {catalog.length > 0 && (
          <>
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
            <div className="perm-bar">
              <label className="search-field framed">
                <SearchIcon />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="chercher une source" />
              </label>
              <span className="small dim">
                {accepted.length} {plural(accepted.length, 'acceptée', 'acceptées')} · {catalog.length - accepted.length}{' '}
                {plural(catalog.length - accepted.length, 'écartée', 'écartées')}
              </span>
            </div>
            <div className="perms sources">
              {groups.map((g) => {
                const rows = shown.filter((s) => s.group === g)
                if (!rows.length) return null
                const on = rows.filter((s) => isAccepted(choice, s.id)).length
                const ids = rows.map((s) => s.id)
                return (
                  <div key={g}>
                    <div className="source-family">
                      <span>{NEWS_GROUP_LABELS[g]}</span>
                      <span className="small dim">
                        {on} sur {rows.length}
                      </span>
                      {g === 'regional' && region && address.city && (
                        <span className="small muted where">
                          d’après votre adresse : {address.city}, {REGIONS[region]}
                        </span>
                      )}
                      <span className="perm-seg">
                        <button className={on === rows.length ? 'on' : ''} onClick={() => accept(ids, true)}>
                          tout accepter
                        </button>
                        <button className={on === 0 ? 'on' : ''} onClick={() => accept(ids, false)}>
                          tout écarter
                        </button>
                      </span>
                    </div>
                    {rows.map(row)}
                  </div>
                )
              })}
              {!shown.length && <p className="small dim perm-empty">Aucune source ne correspond.</p>}
            </div>
          </>
        )}
        <span className="small muted">
          La liste est celle de Marianne, la même pour tous ; on n’y ajoute pas de flux à la main.{' '}
          <button className="link" onClick={() => api.openExternal(PROPOSE_URL)} title={PROPOSE_URL}>
            Proposer une source ›
          </button>
        </span>
      </div>
    </section>
  )
}
