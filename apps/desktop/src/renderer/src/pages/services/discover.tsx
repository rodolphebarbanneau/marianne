import { useEffect, useRef } from 'react'
import { ServiceIcon } from '@marianne/sdk/view'
import type { CatalogueState } from '@shared/catalogue'
import { Failure, Loading } from '../../components/ui'
import { dayMonth, shortDate } from '../../lib/format'
import { categoryLabel, sortCatalogue, trustRank, type CatalogueKey, type Listing, type Sort } from './model'
import { SortHead } from './mine'
import { Access, Code, Origin, TrustMark } from './parts'

/**
 * « découvrir », the marketplace: on top, as cards, what Marianne recommends (the official services
 * not added yet, then the community services she recommends); under them, every other service of
 * the community catalogue as a table, validated first, its rows loaded as one scrolls.
 */

/** The catalogue's rows come this many at a time. */
export const CATALOGUE_PAGE = 15

export type TrustFilter = 'all' | 'validated' | 'unvalidated'

export const TRUST_FILTERS: Array<[TrustFilter, string]> = [
  ['all', 'tous'],
  ['validated', '✓ validés'],
  ['unvalidated', 'non validés']
]

/** The recommended: official services first, then the community's; by name within each. */
export const recommended = (all: Listing[]) =>
  all.filter((l) => !l.added && l.recommended).sort((a, b) => trustRank(a) - trustRank(b) || a.name.localeCompare(b.name, 'fr'))

/** The rest of the catalogue: community services not added, not recommended. */
export const catalogueRows = (all: Listing[], filter: TrustFilter, sort: Sort<CatalogueKey>) =>
  sortCatalogue(
    all.filter((l) => !l.added && !l.official && !l.recommended && (filter === 'all' || l.trust === filter)),
    sort
  )

export function RecommendedCards({ list, onReview }: { list: Listing[]; onReview: (l: Listing) => void }) {
  return (
    <div className="kgrid">
      {list.map((l) => (
        <div
          key={l.code}
          className={`kcard${l.official ? '' : ' community'}`}
          role="button"
          tabIndex={0}
          onClick={() => onReview(l)}
          onKeyDown={(e) => e.key === 'Enter' && onReview(l)}
        >
          <ServiceIcon icon={l.icon} size="medium" />
          <span className="stack">
            <Code code={l.code} />
            <span className="t">{l.name}</span>
            <span className="d clamp2">{l.description}</span>
          </span>
          <span className="meta">
            <Origin listing={l} inline />
            <button
              className="btn small primary"
              onClick={(e) => {
                e.stopPropagation()
                onReview(l)
              }}
            >
              + ajouter
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}

/** The catalogue's table: `shown` rows, more when its end comes into view. */
export function CatalogueTable({
  rows,
  sort,
  onSort,
  shown,
  onMore,
  onReview
}: {
  rows: Listing[]
  sort: Sort<CatalogueKey>
  onSort: (key: CatalogueKey) => void
  shown: number
  onMore: () => void
  onReview: (l: Listing) => void
}) {
  const more = useRef<HTMLTableRowElement>(null)
  const left = shown < rows.length
  // Reaching the end of the table loads the next rows; the observer looks again after each load, in case the end is still in sight.
  useEffect(() => {
    const row = more.current
    if (!row || !left) return
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onMore(), {
      root: row.closest('.page-body'),
      rootMargin: '0px 0px 80px 0px'
    })
    observer.observe(row)
    return () => observer.disconnect()
  }, [left, shown, onMore])

  return (
    <div className="table-wrap">
      <table className="stable">
        <thead>
          <tr>
            <SortHead sort={sort} column="service" label="service" onSort={onSort} />
            <SortHead sort={sort} column="validation" label="validation" onSort={onSort} />
            <SortHead sort={sort} column="theme" label="thème" onSort={onSort} />
            <SortHead sort={sort} column="author" label="auteur" onSort={onSort} />
            <SortHead sort={sort} column="updated" label="mis à jour" onSort={onSort} />
            <th>accès</th>
            <th>
              <span className="sr-only">ajouter</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, shown).map((l) => (
            <tr
              key={l.code}
              tabIndex={0}
              aria-label={`3615 ${l.code.toUpperCase()} : avant d’ajouter`}
              onClick={() => onReview(l)}
              onKeyDown={(e) => e.target === e.currentTarget && e.key === 'Enter' && onReview(l)}
            >
              <td>
                <span className="tsvc">
                  <ServiceIcon icon={l.icon} size="small" />
                  <span className="stack" style={{ gap: 3 }}>
                    <span className="svcname">
                      <Code code={l.code} />
                      <span className="hi ell">{l.name}</span>
                    </span>
                    <span className="small dim ell desc" title={l.description}>
                      {l.description}
                    </span>
                  </span>
                </span>
              </td>
              <td className="small">{l.trust && <TrustMark trust={l.trust} />}</td>
              <td className="dim">{categoryLabel(l.category)}</td>
              <td>
                <span className="stack" style={{ gap: 2 }}>
                  <span className="dim">{l.author}</span>
                  <span className="small muted">version {l.version}</span>
                </span>
              </td>
              <td className="dim" title={l.entry ? shortDate(`${l.entry.published}T12:00:00`) : undefined}>
                {l.entry ? dayMonth(l.entry.published) : ''}
              </td>
              <td>
                <Access listing={l} />
              </td>
              <td className="act">
                <button
                  className={`btn small${l.trust === 'validated' ? ' primary' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onReview(l)
                  }}
                >
                  + ajouter
                </button>
              </td>
            </tr>
          ))}
          {left && (
            <tr className="more" ref={more}>
              <td colSpan={7}>
                <span className="loading-cells" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                chargement
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** What the catalogue is, when it has nothing to list: not open yet, coming, unreadable. */
export function CatalogueNote({ state, filtered }: { state: CatalogueState; filtered: boolean }) {
  if (state.status === 'loading') return <Loading inline label="le catalogue de la communauté" />
  if (state.status === 'none') return <p className="dim">Le catalogue de la communauté n’est pas encore ouvert.</p>
  if (state.status === 'failed' && !state.entries.length)
    return <Failure inline title="Catalogue indisponible" error={state.error ?? 'il n’a pas pu être lu.'} />
  return <p className="dim">{filtered ? 'Aucun service de ce genre dans le catalogue.' : 'Le catalogue n’a pas d’autre service pour l’instant.'}</p>
}
