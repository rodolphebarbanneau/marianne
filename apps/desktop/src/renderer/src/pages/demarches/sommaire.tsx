import { useEffect, useRef } from 'react'
import { DOMAIN_CATEGORIES, DOMAINS } from '@marianne/profile'
import type { ServiceState } from '@marianne/sdk'
import { Pixels } from '@marianne/sdk/view'
import type { DomainId } from '@shared/types'
import { domainLine, domainServices, weekLabels, weekMarks, type TodoSources } from '../../lib/demarches'

/**
 * The sommaire: the ten domains by category, one line each. Its state, its eight weeks of échéances
 * (a square, red when late or within 3 days), its dossiers, tâches and services. `typed`: the number
 * in the bar, whose line lights up.
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
  return (
    <div className="table-wrap">
      <table ref={table} className="stable dm-som">
        <thead>
          <tr>
            <th>
              <span className="sr-only">catégorie</span>
            </th>
            <th>domaine</th>
            <th>
              <span className="sr-only">état</span>
            </th>
            {/* By index: a month of four weeks repeats its days (« 9 févr., 16, 23, 2 mars, 9, 16, 23 »). */}
            {weekLabels(now).map((label, i) => (
              <th key={i} className={`wk${i === 0 ? ' now' : ''}`}>
                {label}
              </th>
            ))}
            <th className="nb">dossiers</th>
            <th className="nb">tâches</th>
            <th>services</th>
          </tr>
        </thead>
        <tbody>
          {DOMAIN_CATEGORIES.flatMap((category) => {
            const list = DOMAINS.filter((d) => d.category === category.id)
            return list.map((d, i) => {
              const line = domainLine(d.id, sources, now)
              const weeks = weekMarks(
                sources.deadlines.filter((x) => x.domain === d.id),
                now
              )
              const state = [line.wait, line.next].filter(Boolean).join(' · ')
              const classes = [line.idle && 'idle', i === list.length - 1 && 'end', typed === d.num && 'sel'].filter(Boolean).join(' ')
              return (
                <tr
                  key={d.id}
                  className={classes || undefined}
                  tabIndex={0}
                  aria-label={`ouvrir ${d.label}`}
                  onClick={() => onOpen(d.id)}
                  onKeyDown={(e) => e.target === e.currentTarget && e.key === 'Enter' && onOpen(d.id)}
                >
                  {i === 0 && (
                    <td className="cat" rowSpan={list.length}>
                      {category.label}
                    </td>
                  )}
                  <td className="dom">
                    <span className="dm-num">{d.num}</span> <span className="dm-badge">{d.badge}</span>
                    <span className="dn">{d.label}</span>
                  </td>
                  <td className="st" title={state || undefined}>
                    {line.wait && <b>{line.wait}</b>}
                    {line.wait && line.next && ' · '}
                    {state ? line.next : line.idle ? 'rien en cours' : 'à jour'}
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
            })
          })}
        </tbody>
      </table>
    </div>
  )
}
