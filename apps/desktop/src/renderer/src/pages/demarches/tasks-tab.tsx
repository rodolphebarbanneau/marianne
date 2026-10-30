import type { PlannedTask } from '@shared/types'
import { useApp } from '../../app/context'
import { api } from '../../lib/api'
import { nextTaskDay } from '../../lib/demarches'
import { nextShort } from '../tasks/model'
import { OriginTag, RunnerTag, RunsCells } from '../tasks/task-card'
import { DomainBadge } from './todo-row'

/** « tâches planifiées »: every task as a line of the Services table, each with its real switch. */

export function TasksTab({ tasks, onNew }: { tasks: PlannedTask[]; onNew: () => void }) {
  const { go } = useApp()
  const on = tasks.filter((t) => t.on).length
  const next = nextTaskDay(tasks)
  // In its domain, or in its folder when it has none.
  const open = (t: PlannedTask) => go(t.domain ? { kind: 'domain', id: t.domain, tab: 'taches' } : { kind: 'folder', id: t.folderId })
  return (
    <div role="tabpanel">
      <div className="sec-h">
        <span className="label">tâches planifiées</span>
        <span className="small dim">
          {on}
          {next && ` · la prochaine ${next}`}
        </span>
        <span className="tools">
          <button className="btn small" onClick={onNew}>
            + nouvelle tâche
          </button>
        </span>
      </div>
      {tasks.length > 0 && (
        <div className="table-wrap">
          <table className="stable dm-tks">
            <thead>
              <tr>
                <th>
                  <span className="sr-only">domaine</span>
                </th>
                <th>tâche</th>
                <th>qui</th>
                <th>d’où</th>
                <th>ses dernières fois</th>
                <th>prochaine</th>
                <th>active</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr
                  key={t.id}
                  className={t.on ? undefined : 'off'}
                  tabIndex={0}
                  aria-label={`ouvrir la tâche ${t.title}`}
                  onClick={() => open(t)}
                  onKeyDown={(e) => e.target === e.currentTarget && e.key === 'Enter' && open(t)}
                >
                  <td>
                    <DomainBadge domain={t.domain} />
                  </td>
                  <td>
                    <span className="t">
                      {t.title}
                      {t.entity && ` · ${t.entity.label}`}
                    </span>
                    <span className="c">{t.everyLabel}</span>
                  </td>
                  <td>
                    <RunnerTag task={t} />
                  </td>
                  <td>
                    <OriginTag task={t} />
                  </td>
                  <td>
                    <RunsCells task={t} />
                  </td>
                  <td className="dim">{t.on ? nextShort(t.next) : '—'}</td>
                  <td>
                    <button
                      className={`switch${t.on ? ' on' : ''}`}
                      role="switch"
                      aria-checked={t.on}
                      title={t.on ? 'mettre en pause' : 'reprendre'}
                      onClick={(e) => {
                        e.stopPropagation()
                        void api.setTaskOn(t.id, !t.on)
                      }}
                    >
                      <i />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
