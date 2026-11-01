import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DOMAINS } from '@marianne/profile'
import { Modal, ServiceIcon, Spinner } from '@marianne/sdk/view'
import { addEvery, dayOf, everyLabel } from '@shared/tasks'
import type { DomainId, PlannedTask, TaskEvery, TaskTemplate } from '@shared/types'
import { useApp } from '../../app/context'
import { useServices } from '../../host'
import { api, errorText } from '../../lib/api'
import { proposed } from '../../lib/demarches'
import { plainKey, useDialogEnter } from '../../lib/keys'
import { useTasks, useTaskTemplates } from '../../lib/tasks'
import { DomainBadge, SourceChip } from '../demarches/todo-row'
import { hostParts, nextShort, RHYTHMS, rhythmChoices, sameEvery, withEntity } from './model'

/**
 * The planned tasks' dialogs: how a task starts (in words, from a service's template, as a reminder),
 * the sheet the user says yes on, and changing a task. Nothing runs without that yes: a sheet's
 * Entrée (useDialogEnter) is never the one that opened it.
 */

/**
 * The bottom bar while a dialog is open: its keys, as on the Services page. The dialog sets them
 * itself, for it opens from several pages. `close` is kept aside: a new function at each render of
 * the page must not set the keys again, which would render the page again.
 */
export function useDialogKeys(what: string, close: () => void) {
  const { setScreenKeys } = useApp()
  const latest = useRef(close)
  latest.current = close
  useEffect(() => {
    setScreenKeys([
      { key: 'ENVOI', shortcut: 'Enter', what },
      { key: 'ANNULATION', shortcut: 'Escape', what: 'fermer', run: () => latest.current() },
      { key: 'GUIDE', shortcut: 'guide', what: 'aide' }
    ])
    return () => setScreenKeys(null)
  }, [what, setScreenKeys])
}

/** A dialog of tasks: the app's Modal, with its title, what it is about, and a way out. */
function TaskModal({ title, chip, onClose, children }: { title: string; chip: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <Modal wide onClose={onClose} label={title.toLowerCase()}>
      <div className="dm-modal">
        <div className="mh">
          <span className="t">{title}</span>
          {chip}
          <button className="btn small" onClick={onClose}>
            fermer ✕
          </button>
        </div>
        {children}
      </div>
    </Modal>
  )
}

const NEW_TASK = 'NOUVELLE TÂCHE PLANIFIÉE'

/** A line of a sheet: what it is about, then what it says. */
function Line({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="fr">
      <span className="k">{name}</span>
      {children}
    </div>
  )
}

/** One choice among a few. */
function Opt({ on, onPick, children }: { on: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <button className={`opt${on ? ' on' : ''}`} aria-pressed={on} onClick={onPick}>
      {on ? '●' : '○'} {children}
    </button>
  )
}

/** How often the user hears of it: asked of what Marianne does, for a reminder always comes back. */
function NotifyLine({ notify, onChange }: { notify: PlannedTask['notify']; onChange: (notify: PlannedTask['notify']) => void }) {
  return (
    <Line name="vous prévenir">
      <span className="opts">
        <Opt on={notify === 'found'} onPick={() => onChange('found')}>
          seulement si elle trouve
        </Opt>
        <Opt on={notify === 'always'} onPick={() => onChange('always')}>
          à chaque fois
        </Opt>
      </span>
    </Line>
  )
}

function RhythmOpts({ choices, every, onChange }: { choices: TaskEvery[]; every: TaskEvery; onChange: (every: TaskEvery) => void }) {
  return (
    <span className="opts">
      {choices.map((r) => (
        <Opt key={`${r.unit}:${r.n}`} on={sameEvery(r, every)} onPick={() => onChange(r)}>
          {everyLabel(r)}
        </Opt>
      ))}
    </span>
  )
}

// ---------------------------------------------------------------- how a task starts

type Step = { kind: 'template'; template: TaskTemplate } | { kind: 'reminder' } | null

/** « + nouvelle tâche »: choosing how it starts, then its sheet. `domain`: from a domain's page, its own. */
export function NewTaskDialog({ domain, onClose }: { domain?: DomainId; onClose: () => void }) {
  const [step, setStep] = useState<Step>(null)
  if (step?.kind === 'template') return <TaskSheet template={step.template} onClose={onClose} />
  if (step?.kind === 'reminder') return <ReminderSheet domain={domain} onClose={onClose} />
  return (
    <PickDialog
      domain={domain}
      onTemplate={(template) => setStep({ kind: 'template', template })}
      onReminder={() => setStep({ kind: 'reminder' })}
      onClose={onClose}
    />
  )
}

/**
 * In words, a new folder where Marianne prepares the task and proposes it on a card; from what the
 * services propose; or as a reminder.
 */
function PickDialog({
  domain,
  onTemplate,
  onReminder,
  onClose
}: {
  domain?: DomainId
  onTemplate: (template: TaskTemplate) => void
  onReminder: () => void
  onClose: () => void
}) {
  const { go } = useApp()
  const tasks = useTasks()
  const services = useServices()
  const templates = useTaskTemplates(tasks.map((t) => t.id).join())
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useDialogKeys('envoyer', onClose)
  const offered = proposed(templates, tasks).filter((t) => !domain || t.domain === domain)
  const send = () => {
    const what = text.trim()
    if (!what) return setError('Dites ce qui doit revenir.')
    if (busy) return
    setBusy(true)
    setError('')
    api
      .send({ text: `Je voudrais une tâche planifiée : ${what}`, attachments: [], domain })
      .then((id) => {
        onClose()
        go({ kind: 'folder', id })
      })
      .catch((err: unknown) => {
        setError(errorText(err))
        setBusy(false)
      })
  }
  return (
    <TaskModal title={NEW_TASK} chip={domain && <DomainBadge domain={domain} />} onClose={onClose}>
      <div className="in">
        <div className="pick">
          <div className="codebar q" style={{ margin: 0 }}>
            <span className="pre" aria-hidden>
              TÂCHE
            </span>
            <label className="cfield">
              <input
                value={text}
                maxLength={2000}
                spellCheck={false}
                autoComplete="off"
                autoFocus
                placeholder="ce qui doit revenir"
                aria-label="ce qui doit revenir"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (!plainKey(e, 'Enter')) return
                  e.preventDefault()
                  send()
                }}
              />
              <span className="cursor" aria-hidden />
            </label>
            <button className="envoi" disabled={busy} onClick={send}>
              ENVOI ↵
            </button>
          </div>
          {error && <p className="small bad">{error}</p>}
          {offered.length > 0 && (
            <div className="sec-h">
              <span className="label">modèles de vos services</span>
            </div>
          )}
          {offered.map((t) => (
            <button key={`${t.service}:${t.id}`} className="dm-sline" onClick={() => onTemplate(t)}>
              <ServiceIcon icon={services.find((s) => s.manifest.id === t.service)?.manifest.icon ?? null} size="small" />
              <span className="stack">
                <span className="t">
                  <span className="inv small">3615</span> {t.service.toUpperCase()} · {withEntity(t)}
                </span>
                <span className="sum">Marianne vérifie · {t.rhythms[t.rhythm]?.label}</span>
              </span>
              <span className="btn small">choisir</span>
            </button>
          ))}
          <div className="sec-h">
            <span className="label">rappels</span>
          </div>
          <button className="dm-sline plain" onClick={onReminder}>
            <span className="stack">
              <span className="t">Un rappel à votre rythme</span>
              <span className="sum">rappel · de chaque jour à chaque année</span>
            </span>
            <span className="btn small">choisir</span>
          </button>
        </div>
      </div>
    </TaskModal>
  )
}

// ---------------------------------------------------------------- the sheets

/** The sheet of a service's template: everything the task will do, read before the user's yes. */
export function TaskSheet({ template, onClose }: { template: TaskTemplate; onClose: () => void }) {
  const { toast } = useApp()
  const [rhythm, setRhythm] = useState(template.rhythm)
  const [notify, setNotify] = useState<PlannedTask['notify']>('found')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useDialogKeys('planifier', onClose)
  const chosen = template.rhythms[rhythm]
  const plan = () => {
    if (busy) return
    setBusy(true)
    setError('')
    api
      .createTask({ kind: 'template', service: template.service, template: template.id, rhythm, notify })
      .then(() => {
        toast(`planifiée : ${withEntity(template)}, ${chosen.label}`)
        onClose()
      })
      .catch((err: unknown) => {
        setError(errorText(err))
        setBusy(false)
      })
  }
  useDialogEnter(plan)
  return (
    <TaskModal title={NEW_TASK} chip={<SourceChip text={`3615 ${template.service.toUpperCase()}`} />} onClose={onClose}>
      <div className="in">
        <Line name="vérifier">
          <span className="stack">
            <span className="hi">{template.checks}</span>
            {template.detail && <span className="small dim">{template.detail}</span>}
          </span>
        </Line>
        {template.entity && (
          <Line name={template.domain === 'mobility' ? 'véhicule' : 'pour'}>
            <span className="hi">{template.entity.label}</span>
          </Line>
        )}
        <Line name="quand">
          <span className="stack" style={{ gap: 'var(--s2)' }}>
            <span className="opts">
              {template.rhythms.map((r, i) => (
                <Opt key={r.label} on={i === rhythm} onPick={() => setRhythm(i)}>
                  {r.label}
                </Opt>
              ))}
            </span>
            {chosen?.note && <span className={`small ${chosen.warn ? 'accent' : 'dim'}`}>{chosen.note}</span>}
          </span>
        </Line>
        <Line name="Marianne pourra">
          <div className="can">
            {template.allows.map((allowed) => (
              <span key={allowed}>
                ·{' '}
                {hostParts(allowed, template.sites).map((part, i) =>
                  part.host ? (
                    <span key={i} className="host">
                      {part.text}
                    </span>
                  ) : (
                    part.text
                  )
                )}
              </span>
            ))}
          </div>
        </Line>
        <Line name="jamais">
          <div className="never">{template.never}</div>
        </Line>
        {template.followUp && (
          <Line name="si elle trouve quelque chose">
            <span className="stack">
              <span className="hi">{template.followUp.label}</span>
              <span className="small dim">un bouton dans son dossier : Marianne s’en charge avec vous, et ce qui vous engage attend votre oui</span>
            </span>
          </Line>
        )}
        <NotifyLine notify={notify} onChange={setNotify} />
        <Line name="ce qu’il faut">
          <span className="small dim">
            Marianne ne vérifie que déverrouillée : elle le fait à votre première ouverture du jour prévu. Chaque vérification utilise votre moteur une à deux
            minutes. Si un site demande un code, elle s’arrête et vous prévient.
          </span>
        </Line>
        {error && <p className="small bad">{error}</p>}
      </div>
      <div className="foot">
        <span className="small dim">dans le dossier « {withEntity(template)} », en veille entre deux fois</span>
        <button className="btn primary" disabled={busy} aria-busy={busy} onClick={plan}>
          {busy && <Spinner />}
          planifier
        </button>
      </div>
    </TaskModal>
  )
}

/** A reminder: nothing runs, the folder comes back with it, one period from today. */
function ReminderSheet({ domain, onClose }: { domain?: DomainId; onClose: () => void }) {
  const { toast } = useApp()
  const [title, setTitle] = useState('')
  const [every, setEvery] = useState<TaskEvery>({ unit: 'month', n: 1 })
  const [home, setHome] = useState<DomainId | ''>(domain ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useDialogKeys('planifier', onClose)
  const plan = () => {
    if (busy) return
    setBusy(true)
    setError('')
    api
      .createTask({ kind: 'reminder', title, domain: home, every })
      .then(() => {
        toast(`planifié : ${title.trim()}, ${everyLabel(every)}`)
        onClose()
      })
      .catch((err: unknown) => {
        setError(errorText(err))
        setBusy(false)
      })
  }
  useDialogEnter(plan)
  return (
    <TaskModal title={NEW_TASK} chip={domain && <DomainBadge domain={domain} />} onClose={onClose}>
      <div className="in">
        <Line name="me rappeler">
          <input value={title} maxLength={120} autoFocus aria-label="ce qu’il faut vous rappeler" onChange={(e) => setTitle(e.target.value)} />
        </Line>
        <Line name="quand">
          <RhythmOpts choices={RHYTHMS} every={every} onChange={setEvery} />
        </Line>
        <Line name="la première fois">
          <span className="hi">{nextShort(addEvery(dayOf(), every))}</span>
        </Line>
        {!domain && (
          <Line name="domaine">
            <select value={home} aria-label="domaine" onChange={(e) => setHome(e.target.value as DomainId | '')}>
              <option value="">aucun</option>
              {DOMAINS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </Line>
        )}
        {error && <p className="small bad">{error}</p>}
      </div>
      <div className="foot">
        <span className="small dim">dans un nouveau dossier, en veille entre deux fois</span>
        <button className="btn primary" disabled={busy} aria-busy={busy} onClick={plan}>
          {busy && <Spinner />}
          planifier
        </button>
      </div>
    </TaskModal>
  )
}

// ---------------------------------------------------------------- changing a task

/** A task's rhythm and how it tells the user, or the end of it: its folder stays, a conversation like any other. */
export function TaskEditDialog({ task, onClose }: { task: PlannedTask; onClose: () => void }) {
  const { toast } = useApp()
  const [every, setEvery] = useState(task.every)
  const [notify, setNotify] = useState(task.notify)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useDialogKeys('enregistrer', onClose)
  const fail = (err: unknown) => {
    setError(errorText(err))
    setBusy(false)
  }
  const save = () => {
    if (busy) return
    setBusy(true)
    setError('')
    api
      .updateTask(task.id, { ...(sameEvery(every, task.every) ? {} : { every }), notify })
      .then(() => {
        toast('tâche modifiée')
        onClose()
      })
      .catch(fail)
  }
  useDialogEnter(save)
  const remove = () => {
    if (busy || !confirm(`Supprimer la tâche « ${withEntity(task)} » ? Son dossier reste, avec sa conversation.`)) return
    setBusy(true)
    api
      .removeTask(task.id)
      .then(() => {
        toast('tâche supprimée')
        onClose()
      })
      .catch(fail)
  }
  return (
    <TaskModal title="MODIFIER LA TÂCHE" chip={task.domain && <DomainBadge domain={task.domain} />} onClose={onClose}>
      <div className="in">
        <Line name="tâche">
          <span className="hi">{withEntity(task)}</span>
        </Line>
        <Line name="quand">
          <RhythmOpts choices={rhythmChoices(task.every)} every={every} onChange={setEvery} />
        </Line>
        {task.runner === 'marianne' && <NotifyLine notify={notify} onChange={setNotify} />}
        {error && <p className="small bad">{error}</p>}
      </div>
      <div className="foot">
        <button className="btn danger" disabled={busy} onClick={remove}>
          supprimer la tâche
        </button>
        <button className="btn primary" disabled={busy} aria-busy={busy} onClick={save}>
          {busy && <Spinner />}
          enregistrer
        </button>
      </div>
    </TaskModal>
  )
}
