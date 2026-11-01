import { useState } from 'react'
import { Spinner } from '@marianne/sdk/view'
import type { PlannedTask, TaskTemplate } from '@shared/types'
import { useApp } from '../../app/context'
import { api, errorText } from '../../lib/api'
import { runCell } from '../../lib/demarches'
import { SourceChip } from '../demarches/todo-row'
import { TaskEditDialog } from './dialogs'
import { followUpLine, nextShort, runLine, runWhen, withEntity } from './model'

/** A planned task at full size, and the small parts every list of tasks shows. */

/** A task's last runs, oldest to latest, a cell each. */
export function RunsCells({ task, n = 8 }: { task: Pick<PlannedTask, 'runs'>; n?: number }) {
  return (
    <span className="dm-runs">
      {task.runs.slice(-n).map((run) => {
        const { look, title } = runCell(run)
        return <i key={run.at} className={look || undefined} title={title} />
      })}
    </span>
  )
}

/** Who does the work: Marianne, or nobody and the folder comes back. */
export function RunnerTag({ task }: { task: Pick<PlannedTask, 'runner'> }) {
  return task.runner === 'marianne' ? <span className="dm-runner">Marianne vérifie</span> : <span className="dm-runner remind">rappel</span>
}

/** Where a task comes from: a service, Marianne in a conversation, the user. */
export function OriginTag({ task }: { task: Pick<PlannedTask, 'origin'> }) {
  const { origin } = task
  return <SourceChip text={origin.kind === 'service' ? `3615 ${origin.service.toUpperCase()}` : origin.kind === 'agent' ? 'proposée par Marianne' : 'vous'} />
}

/** What a task may do, will never do, and why it comes back so often: it says so on its card as it did on its sheet. */
function Does({ lines, notes }: { lines: string[]; notes: string[] }) {
  if (!lines.length && !notes.length) return null
  return (
    <div className="does">
      {lines.map((l) => (
        <span key={l}>· {l}</span>
      ))}
      {notes.map((l) => (
        <span key={l} className="no">
          · {l}
        </span>
      ))}
    </div>
  )
}

/** A task as the domain's « tâches planifiées » shows it: what it does, its last runs, what one can do with it. */
export function TaskCard({ task }: { task: PlannedTask }) {
  const app = useApp()
  const [editing, setEditing] = useState(false)
  const [running, setRunning] = useState(false)
  const last = task.runs[task.runs.length - 1]
  const fail = (err: unknown) => app.toast(errorText(err))
  const run = () => {
    setRunning(true)
    // It resolves when the run has ended, a minute or two later: the folder and the cells tell the rest.
    api
      .runTask(task.id)
      .catch(fail)
      .finally(() => setRunning(false))
  }
  return (
    <div className={`dm-tcard${task.on ? '' : ' off'}`}>
      <div className="hd">
        <span className="t">{withEntity(task)}</span>
        <span className="s">
          <RunnerTag task={task} />
          <OriginTag task={task} />
          <span>{task.everyLabel}</span>
        </span>
        <Does
          lines={[...(task.allows ?? []), ...followUpLine(task)]}
          notes={[task.never ?? '', task.why ? `pourquoi ce rythme : ${task.why}` : ''].filter(Boolean)}
        />
      </div>
      <div className="log">
        <span className="label">ses dernières fois</span>
        {last ? (
          <>
            <RunsCells task={task} n={10} />
            <span className="last">
              <span className="when">{runWhen(last.at)} · </span>
              {runLine(last)}
            </span>
          </>
        ) : (
          <span className="last">
            <span className="when">aucune pour l’instant</span>
          </span>
        )}
      </div>
      <div className="cmd">
        <button
          className={`switch${task.on ? ' on' : ''}`}
          role="switch"
          aria-checked={task.on}
          title={task.on ? 'mettre en pause' : 'reprendre'}
          onClick={() => void api.setTaskOn(task.id, !task.on).catch(fail)}
        >
          <i />
        </button>
        <span className="nx">
          prochaine
          <b>{task.on ? nextShort(task.next) : 'en pause'}</b>
        </span>
        {task.runner === 'marianne' && task.on && (
          <button className="btn small" disabled={running} aria-busy={running} onClick={run}>
            {running && <Spinner />}
            lancer maintenant
          </button>
        )}
        <button className="btn small" onClick={() => setEditing(true)}>
          modifier
        </button>
        <button className="btn small" onClick={() => app.go({ kind: 'folder', id: task.folderId })}>
          son dossier ›
        </button>
      </div>
      {editing && <TaskEditDialog task={task} onClose={() => setEditing(false)} />}
    </div>
  )
}

/** A task a service proposes and the user hasn't taken: nothing runs before its sheet's yes. */
export function PropCard({ template, onPlan }: { template: TaskTemplate; onPlan: (template: TaskTemplate) => void }) {
  const rhythm = template.rhythms[template.rhythm]
  return (
    <div className="dm-tcard prop">
      <div className="hd">
        <span className="t">{withEntity(template)}</span>
        <span className="s">
          <RunnerTag task={{ runner: 'marianne' }} />
          <OriginTag task={{ origin: { kind: 'service', service: template.service, template: template.id } }} />
          <span>{rhythm?.label}</span>
        </span>
        <Does lines={[...template.allows, ...followUpLine(template)]} notes={[]} />
      </div>
      <div className="log">{rhythm?.note && <span className="small dim">{rhythm.note}</span>}</div>
      <div className="cmd">
        <button className="btn small primary" onClick={() => onPlan(template)}>
          + planifier
        </button>
      </div>
    </div>
  )
}
