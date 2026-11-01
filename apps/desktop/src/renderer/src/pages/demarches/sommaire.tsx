import { useEffect, useRef } from 'react'
import { DOMAIN_CATEGORIES, DOMAINS } from '@marianne/profile'
import type { ServiceState } from '@marianne/sdk'
import { Pixels } from '@marianne/sdk/view'
import type { DomainId } from '@shared/types'
import { domainLine, domainServices, weekLabels, weekMarks, type TodoSources } from '../../lib/demarches'

/**
 * The sommaire: the ten domains under their four categories, a row each. Its name and, under it, its
 * state (or, with nothing going on, what it covers), its eight weeks of échéances (a square, red when
 * late or within 3 days), its dossiers, tâches and services. `typed`: the number in the bar, whose
 * row lights up.
 *
 * Each category is a group of its own (a tbody under its heading row): hovering any of its rows
 * lights its heading, where a cell spanning the group's rows belonged to its first row alone.
 */
export function Sommaire({
  sources,
  services,
  typed,
  onOpen
}: {
  sources: TodoSources
  services: ServiceState[]
  typed: number | null
  onOpen: (id: DomainId) => void
}) {
  const table = useRef<HTMLTableElement>(null)
  // The line a number calls stays in sight.
  useEffect(() => void table.current?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }), [typed])

  const now = new Date()
  const count = (n: number) => (n ? <b>{n}</b> : '—')
  const weekHeads = weekLabels(now)
  return (
    <div className="table-wrap">
      <table ref={table} className="stable dm-som">
        <thead>
          <tr>
            <th>domaine</th>
            {/* By index: a month of four weeks repeats its days (« 9 févr., 16, 23, 2 mars, 9, 16, 23 »). */}
            {weekHeads.map((label, i) => (
              <th key={i} className={`wk${i === 0 ? ' now' : ''}`}>
                {label}
              </th>
            ))}
            <th className="nb">dossiers</th>
            <th className="nb">tâches</th>
            <th>services</th>
          </tr>
        </thead>
        {DOMAIN_CATEGORIES.map((category) => (
          <tbody key={category.id} className="dm-grp">
            <tr className="grp-h">
              {/* The week columns go on under the heading, so the current one reads as one band down the table. */}
              <th scope="rowgroup">{category.label}</th>
              {weekHeads.map((_, i) => (
                <td key={i} className={`wk${i === 0 ? ' now' : ''}`} />
              ))}
              <td colSpan={3} />
            </tr>
            {DOMAINS.filter((d) => d.category === category.id).map((d) => {
              const line = domainLine(d.id, sources, now)
              const weeks = weekMarks(
                sources.deadlines.filter((x) => x.domain === d.id),
                now
              )
              const state = [line.wait, line.next].filter(Boolean).join(' · ')
              const classes = [line.idle && 'idle', typed === d.num && 'sel'].filter(Boolean).join(' ')
              return (
                <tr
                  key={d.id}
                  className={classes || undefined}
                  tabIndex={0}
                  aria-label={`ouvrir ${d.label}`}
                  onClick={() => onOpen(d.id)}
                  onKeyDown={(e) => e.target === e.currentTarget && e.key === 'Enter' && onOpen(d.id)}
                >
                  <td className="dom">
                    <div className="dm-cell">
                      <span className="dm-num">{d.num}</span>
                      <span className="dm-badge">{d.badge}</span>
                      <span className="stack">
                        <span className="dn ell">{d.label}</span>
                        {/* What is going on, else what the domain covers: the sommaire reads as a table of contents. */}
                        <span className="st ell" title={state || d.description}>
                          {line.wait && <b>{line.wait}</b>}
                          {line.wait && line.next && ' · '}
                          {state ? line.next : line.idle ? d.description : 'à jour'}
                        </span>
                      </span>
                    </div>
                  </td>
                  {weeks.map((marks, w) => (
                    <td key={w} className={`wk${w === 0 ? ' now' : ''}`}>
                      <span className="dm-mk">
                        {marks.map((m) => (
                          <i key={m.key} className={`e${m.pressing ? ' late' : ''}`} title={m.title} />
                        ))}
                      </span>
                    </td>
                  ))}
                  <td className="nb">{count(line.folders)}</td>
                  <td className="nb">{count(line.tasks)}</td>
                  <td className="sv">
                    <span className="row-flex" style={{ gap: 2, flexWrap: 'nowrap' }}>
                      {/* Half the size of a service's icon: a line of the sommaire is barely taller. */}
                      {domainServices(services, d.id).map(
                        (s) =>
                          s.manifest.icon && (
                            <span key={s.manifest.id} title={`3615 ${s.manifest.id.toUpperCase()}`}>
                              <Pixels art={s.manifest.icon} cell={2} gap={0} />
                            </span>
                          )
                      )}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </div>
  )
}
