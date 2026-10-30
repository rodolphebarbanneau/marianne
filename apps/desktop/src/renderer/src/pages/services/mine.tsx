import { ServiceIcon } from '@marianne/sdk/view'
import { lastDay } from '../../lib/format'
import { categoryLabel, sortMine, type Listing, type MineKey, type Sort } from './model'
import { Access, Code, Origin } from './parts'

/** My services, official and community: one table, filtered by origin, sorted by a column. */

export type OriginFilter = 'all' | 'official' | 'community'

export const ORIGIN_FILTERS: Array<[OriginFilter, string]> = [
  ['all', 'tous'],
  ['official', 'officiels'],
  ['community', 'communauté']
]

export const byOrigin = (filter: OriginFilter) => (l: Listing) => filter === 'all' || (filter === 'official') === l.official

/** A column's head: a button that sorts by it, ▴ or ▾ when it does. */
export function SortHead<K extends string>({ sort, column, label, onSort }: { sort: Sort<K>; column: K; label: string; onSort: (key: K) => void }) {
  const on = sort.key === column
  return (
    <th className={on ? 'sorted' : undefined} aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button onClick={() => onSort(column)}>
        {label}
        {on ? (sort.dir === 1 ? ' ▴' : ' ▾') : ''}
      </button>
    </th>
  )
}

export function MineTable({
  list,
  sort,
  onSort,
  onOpen,
  onPin,
  onSwitch,
  onSettings
}: {
  list: Listing[]
  sort: Sort<MineKey>
  onSort: (key: MineKey) => void
  onOpen: (l: Listing) => void
  onPin: (l: Listing) => void
  onSwitch: (l: Listing, on: boolean) => void
  onSettings: (l: Listing) => void
}) {
  if (!list.length) return <p className="dim">Aucun de vos services ne vient de là.</p>
  return (
    <div className="table-wrap">
      <table className="stable">
        <thead>
          <tr>
            <SortHead sort={sort} column="pinned" label="★" onSort={onSort} />
            <SortHead sort={sort} column="service" label="service" onSort={onSort} />
            <SortHead sort={sort} column="origin" label="origine" onSort={onSort} />
            <SortHead sort={sort} column="theme" label="thème" onSort={onSort} />
            <th>accès</th>
            <th>ouvert</th>
            <th>actif</th>
            <th>
              <span className="sr-only">réglages</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortMine(list, sort).map((l) => {
            const s = l.state!
            return (
              <tr key={l.code} className={s.on ? undefined : 'off'} onClick={() => onOpen(l)}>
                <td>
                  <button
                    className={`star${l.pinned ? ' on' : ''}`}
                    title={l.pinned ? 'désépingler' : 'épingler en tuile'}
                    aria-pressed={l.pinned}
                    onClick={(e) => {
                      e.stopPropagation()
                      onPin(l)
                    }}
                  >
                    {l.pinned ? '★' : '☆'}
                  </button>
                </td>
                <td>
                  <span className="tsvc">
                    <ServiceIcon icon={l.icon} size="small" />
                    <span className="stack" style={{ gap: 3 }}>
                      <Code code={l.code} />
                      <span className="small dim ell short" title={l.description}>
                        {l.name}
                      </span>
                    </span>
                  </span>
                </td>
                <td>
                  <Origin listing={l} />
                </td>
                <td className="dim">{categoryLabel(l.category)}</td>
                <td>
                  <Access listing={l} />
                </td>
                <td className="dim">{lastDay(s.openedAt)}</td>
                <td>
                  <button
                    className={`switch${s.on ? ' on' : ''}`}
                    role="switch"
                    aria-checked={s.on}
                    disabled={!s.available}
                    title={!s.available ? 'une connexion dont il dépend est désactivée' : s.on ? 'désactiver' : 'activer'}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSwitch(l, !s.on)
                    }}
                  >
                    <i />
                  </button>
                </td>
                <td>
                  <button
                    className="icon-btn"
                    title="réglages du service"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSettings(l)
                    }}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden>
                      <path d="M2 8h2 M7 8h2 M12 8h2" style={{ strokeWidth: 2 }} />
                    </svg>
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
