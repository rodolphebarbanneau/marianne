import { useEffect, useRef } from 'react'
import { ServiceIcon } from '@marianne/sdk/view'
import type { Listing, SearchGroup } from './model'
import { Code, Lit, Origin } from './parts'

/**
 * What the 3615 bar finds, in place of everything under the kiosk while one types: my services and
 * the catalogue's in one list, ranked by trust in groups, then by relevance. ↑ ↓ move the
 * selection, ENVOI opens it (an installed service) or its review (one to add), échap gives the page
 * back.
 */

/** The rows in order, as ↑ ↓ go through them. */
export const flatten = (groups: SearchGroup[]) => groups.flatMap((g) => g.rows.map((r) => r.listing))

/** What stays above the results, in the tabs' place: what was asked, what it found, and effacer. */
export function SearchHead({ query, groups, onClear }: { query: string; groups: SearchGroup[]; onClear: () => void }) {
  const found = flatten(groups).length
  const yours = groups.filter((g) => g.id === 'pinned' || g.id === 'installed').reduce((n, g) => n + g.rows.length, 0)
  return (
    <div className="results-bar">
      <span className="label">recherche</span>
      <span className="hi">« {query} »</span>
      <span className="small dim" aria-live="polite">
        {found ? `${found} service${found > 1 ? 's' : ''} · ${yours} chez vous · ${found - yours} ailleurs` : 'aucun service'}
      </span>
      <button className="link small" onClick={onClear}>
        effacer
      </button>
    </div>
  )
}

export function SearchView({
  query,
  terms,
  groups,
  selected,
  onSelect,
  onActivate,
  onFile
}: {
  query: string
  terms: string[]
  groups: SearchGroup[]
  selected: number
  onSelect: (index: number) => void
  onActivate: (l: Listing) => void
  onFile: () => void
}) {
  const list = useRef<HTMLDivElement>(null)
  // The row chosen with the keys stays in sight.
  // (void: Chromium's scroll methods may return a promise, which React would take for a cleanup.)
  useEffect(() => void list.current?.querySelector('.srow.sel')?.scrollIntoView({ block: 'nearest' }), [selected])

  if (!flatten(groups).length)
    return (
      <p className="dim" style={{ marginTop: 0 }}>
        Aucun service « {query} ». Essayez un autre mot, ou{' '}
        <button className="link" onClick={onFile}>
          ajoutez un fichier .3615
        </button>
        .
      </p>
    )

  let index = -1
  return (
    <div ref={list} className="search-list" role="listbox" aria-label="services trouvés">
      {groups.map((g) => (
        <div key={g.id} role="group" aria-label={g.label}>
          <div className="sgroup">
            <span className="label">{g.label}</span>
            <span className="small dim">{g.rows.length}</span>
          </div>
          {g.rows.map(({ listing: l, why }) => {
            index++
            const i = index
            return (
              <div
                key={l.code}
                className={`srow${i === selected ? ' sel' : ''}`}
                role="option"
                aria-selected={i === selected}
                onMouseMove={() => i !== selected && onSelect(i)}
                onClick={() => onActivate(l)}
              >
                <ServiceIcon icon={l.icon} size="small" />
                <span className="stack" style={{ gap: 3 }}>
                  <span className="row-flex" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <Code code={l.code} terms={terms} />
                    <span className="hi ell">
                      <Lit text={l.name} terms={terms} />
                    </span>
                    {l.pinned && <span className="accent">★</span>}
                  </span>
                  <span className="small dim ell">
                    <Lit text={l.description} terms={terms} />
                    {why && (
                      <>
                        {' '}
                        · <span className="why">{why}</span>
                      </>
                    )}
                  </span>
                </span>
                <span className="stack" style={{ gap: 3, alignItems: 'flex-start' }}>
                  <Origin listing={l} />
                </span>
                <span className="act">
                  {l.added ? (
                    <span className="btn small">ouvrir</span>
                  ) : (
                    <span className={`btn small${l.official || l.trust === 'validated' ? ' primary' : ''}`}>+ ajouter</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
