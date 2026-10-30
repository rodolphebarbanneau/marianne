import { useEffect, useRef } from 'react'
import { searchRows, type SearchGroup, type SearchRow } from '../../lib/demarches'
import { Lit } from '../services/parts'
import { DomainBadge } from './todo-row'

/**
 * What the GUICHET bar finds, in place of everything under the kiosk while one types words: what is
 * the user's first, then what is elsewhere, and always a way to ask Marianne. ↑ ↓ move the
 * selection, ENVOI opens it, échap gives the page back.
 */

/** What stays above the results, in the tabs' place: what was asked, what it found, and effacer. */
export function SearchHead({ query, groups, onClear }: { query: string; groups: SearchGroup[]; onClear: () => void }) {
  // The offer to ask Marianne is always there: it isn't something found.
  const found = searchRows(groups).length - 1
  const yours = groups.find((g) => g.id === 'yours')?.rows.length ?? 0
  return (
    <div className="results-bar">
      <span className="label">recherche</span>
      <span className="hi">« {query} »</span>
      <span className="small dim" aria-live="polite">
        {found ? `${found} résultat${found > 1 ? 's' : ''} · ${yours} chez vous · ${found - yours} ailleurs` : 'aucun résultat'}
      </span>
      <button className="link small" onClick={onClear}>
        effacer
      </button>
    </div>
  )
}

export function SearchView({
  terms,
  groups,
  selected,
  onSelect,
  onActivate
}: {
  terms: string[]
  groups: SearchGroup[]
  selected: number
  onSelect: (index: number) => void
  onActivate: (row: SearchRow) => void
}) {
  const list = useRef<HTMLDivElement>(null)
  // The row chosen with the keys stays in sight.
  // (void: Chromium's scroll methods may return a promise, which React would take for a cleanup.)
  useEffect(() => void list.current?.querySelector('.srow.sel')?.scrollIntoView({ block: 'nearest' }), [selected])

  let index = -1
  return (
    <div ref={list} className="search-list" role="listbox" aria-label="résultats">
      {groups.map((g) => (
        <div key={g.id} role="group" aria-label={g.label}>
          <div className="sgroup">
            <span className="label">{g.label}</span>
            {g.id !== 'ask' && <span className="small dim">{g.rows.length}</span>}
          </div>
          {g.rows.map((r) => {
            index++
            const i = index
            return (
              <div
                key={r.key}
                className={`srow${i === selected ? ' sel' : ''}`}
                role="option"
                aria-selected={i === selected}
                onMouseMove={() => i !== selected && onSelect(i)}
                onClick={() => onActivate(r)}
              >
                <DomainBadge domain={r.domain} />
                <span className="stack" style={{ gap: 3 }}>
                  <span className="hi ell">
                    <Lit text={r.title} terms={terms} />
                  </span>
                  <span className="small dim ell">
                    <Lit text={r.detail} terms={terms} />
                  </span>
                </span>
                <span>
                  <span className="dm-src">{r.kind}</span>
                </span>
                <span className="act">
                  <span className="btn small">{r.act}</span>
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
