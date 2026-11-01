import { Fragment, useEffect, useRef, useState } from 'react'
import type { Procedure, ProcedureAction } from '@marianne/content'
import { DOMAINS, setupPage } from '@marianne/profile'
import { serviceCode, type ServiceState } from '@marianne/sdk'
import { ENGINE_LABELS } from '@shared/config'
import { accelOf, matches } from '@shared/shortcuts'
import type { Site } from '@shared/sites'
import type { ChatMessage, DomainId, EngineId, Folder, FolderView } from '@shared/types'
import { useApp } from '../app/context'
import { Popover, SnoozeMenu } from '../app/sidebar'
import { MoreIcon } from '../components/icons'
import { Loading, Spinner } from '../components/ui'
import { useServices } from '../host'
import { api, errorText, isMac } from '../lib/api'
import { useSites } from '../lib/content'
import { shortDate } from '../lib/format'
import { plainKey } from '../lib/keys'
import { useDocuments } from '../lib/profile'
import { useTasks } from '../lib/tasks'
import { TaskEditDialog } from '../pages/tasks/dialogs'
import { Composer } from './composer'
import { Message } from './message'
import { followUpOffer, foldLabel, foldRuns, nextLabel, runLabel, type QuietRun } from './runs'

/**
 * One folder = one conversation: its header (title, steps, pièces), the conversation, the composer.
 * `at: 'run'`: opened at the line of the run that found something, rather than at the end.
 */
export function FolderScreen({ id, at }: { id: string; at?: 'run' }) {
  const app = useApp()
  const [view, setView] = useState<FolderView | null>(null)
  const task = useTasks().find((t) => t.id === view?.folder.task)
  const services = useServices()
  const offer = view ? followUpOffer(task, services, view.messages, view.running) : null
  /** Opened at a run's line: placed there once, then the user's to scroll. */
  const placed = useRef(false)
  const [procedure, setProcedure] = useState<Procedure | null>(null)
  const conv = useRef<HTMLDivElement>(null)
  const column = useRef<HTMLDivElement>(null)
  /** Whether the conversation follows its end: until the user scrolls up to read. */
  const stick = useRef(true)
  const [away, setAway] = useState(false)
  const loaded = view !== null
  const lastUserId = view ? [...view.messages].reverse().find((m) => m.role === 'user')?.id : undefined

  const toEnd = () => {
    const el = conv.current
    if (!el) return
    stick.current = true
    setAway(false)
    el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    let alive = true
    void api.getFolder(id).then((v) => alive && setView(v))
    const off = api.onFolder((v) => v.folder.id === id && setView(v))
    return () => {
      alive = false
      off()
    }
  }, [id])

  useEffect(() => {
    if (!view?.folder.procedure) return setProcedure(null)
    void api.listProcedures().then((list) => setProcedure(list.find((p) => p.id === view.folder.procedure) ?? null))
  }, [view?.folder.procedure])

  // Follow the end while the answer is written, the composer grows or the window changes, unless the user scrolled up to read.
  useEffect(() => {
    const el = conv.current
    if (!loaded || !el || !column.current) return
    const follow = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight
    })
    follow.observe(el)
    follow.observe(column.current)
    return () => follow.disconnect()
  }, [loaded])

  // A message sent (or the folder opened) brings the end back, wherever the user was reading.
  useEffect(() => {
    if (lastUserId) toEnd()
  }, [lastUserId])

  // Opened at the run that found something (« à faire »): its line and its follow-up at the top, once
  // the tasks and the services say it is offered; the conversation no longer follows its end.
  useEffect(() => {
    const el = conv.current
    const line = el?.querySelector<HTMLElement>('[data-follow-up]')
    if (placed.current || at !== 'run' || !el || !line) return
    placed.current = true
    stick.current = false
    setAway(true)
    el.scrollTop += line.getBoundingClientRect().top - el.getBoundingClientRect().top - 12
  }, [at, offer?.lineId])

  // ANNULATION stops Marianne, RÉPÉTITION writes the last answer again, on the keys Réglages gives them; pg↑ / pg↓
  // scroll the conversation, from the composer too. A dialog over the folder keeps its keys.
  const shortcuts = app.config.shortcuts
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (app.palette || app.settingsPage || app.guideOpen || e.defaultPrevented || document.querySelector('#root > .overlay')) return
      const field = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')
      if ((e.key === 'PageUp' || e.key === 'PageDown') && !e.ctrlKey && !e.metaKey && !e.altKey && (!field || field.closest('.composer'))) {
        const el = conv.current
        if (!el) return
        e.preventDefault()
        el.scrollBy({ top: (e.key === 'PageDown' ? 1 : -1) * el.clientHeight * 0.9 })
      }
      if (view?.running && matches(e, accelOf('stop', isMac, shortcuts), isMac)) {
        e.preventDefault()
        api.cancel(id)
      }
      if (!view?.running && matches(e, accelOf('retry', isMac, shortcuts), isMac)) {
        e.preventDefault()
        void api.regenerate(id)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [id, view?.running, app.palette, app.settingsPage, app.guideOpen, shortcuts])

  if (!view) return <Loading label="le dossier" />
  const { folder, messages, running } = view
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const lastUserText = lastUser?.parts.map((p) => (p.type === 'text' ? p.text : '')).join('\n')

  return (
    <div className="folder">
      <FolderHead view={view} procedure={procedure} />
      <div className="conv-frame">
        <div
          className="conv"
          ref={conv}
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
            setAway(!stick.current)
          }}
        >
          <div className="column" ref={column}>
            {foldRuns(messages).map((row) =>
              row.kind === 'message' ? (
                offer?.lineId === row.message.id ? (
                  <FollowUpLine key={row.message.id} line={row.message} label={offer.label} folderId={folder.id} running={running} />
                ) : (
                  <Message key={row.message.id} message={row.message} />
                )
              ) : (
                <QuietRuns key={row.key} runs={row.runs} onToggle={() => (stick.current = false)} />
              )
            )}
          </div>
        </div>
        {away && (
          <button className="btn to-end" title="aller au dernier message" onClick={toEnd}>
            ↓
          </button>
        )}
      </div>
      <div className="dock">
        <Composer
          folderId={folder.id}
          domain={folder.domain}
          engine={folder.engine}
          running={running}
          lastUserText={lastUserText}
          autoFocus
          placeholder="Répondre à Marianne…"
        />
      </div>
    </div>
  )
}

/**
 * The line of the run that found something, with its task's follow-up: a click starts it, a turn of
 * the conversation whose message reads as the label. Not while Marianne answers in the folder.
 */
function FollowUpLine({ line, label, folderId, running }: { line: ChatMessage; label: string; folderId: string; running: boolean }) {
  const { toast } = useApp()
  const [busy, setBusy] = useState(false)
  const start = () => {
    setBusy(true)
    api
      .followUp(folderId, line.id)
      .catch((err: unknown) => toast(errorText(err)))
      .finally(() => setBusy(false))
  }
  return (
    <div className="compacted" data-follow-up>
      {line.parts.map((p) => (p.type === 'text' ? p.text : '')).join(' ')}
      <button className="btn small primary" disabled={running || busy} aria-busy={busy} onClick={start}>
        {busy && <Spinner />}
        {label}
      </button>
    </div>
  )
}

/**
 * A planned task's runs that found nothing: one line, and a click opens them all, each with its
 * answer. `onToggle`: the conversation grows above its end, and the reader must not be taken there.
 */
function QuietRuns({ runs, onToggle }: { runs: QuietRun[]; onToggle: () => void }) {
  const [open, setOpen] = useState(false)
  const toggle = () => {
    onToggle()
    setOpen(!open)
  }
  if (!open)
    return (
      <button className="compacted dm-older" onClick={toggle}>
        {foldLabel(runs)}
      </button>
    )
  return runs.map((run) => (
    <Fragment key={run.line.id}>
      <button className="compacted dm-older" onClick={toggle}>
        {runLabel(run)}
      </button>
      {run.answer && <Message message={run.answer} />}
    </Fragment>
  ))
}

function FolderHead({ view, procedure }: { view: FolderView; procedure: Procedure | null }) {
  const app = useApp()
  const { folder } = view
  const task = useTasks().find((t) => t.id === folder.task)
  const documents = useDocuments().filter((d) => d.folderId === folder.id)
  const [menu, setMenu] = useState<'more' | 'snooze' | 'engine' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(folder.title)
  const [pieces, setPieces] = useState(false)
  const [changing, setChanging] = useState(false)
  const domain = DOMAINS.find((d) => d.id === folder.domain)

  const rename = () => {
    setRenaming(false)
    if (title.trim() && title !== folder.title) void api.renameFolder(folder.id, title.trim())
  }
  const remove = () => {
    if (confirm(`Supprimer le dossier « ${folder.title} » et sa conversation ? Ses pièces restent dans l’archive.`)) void api.deleteFolder(folder.id)
  }

  return (
    <div className="folder-head">
      <div className="top">
        <span className={`badge${domain ? '' : ' none'}`}>{domain?.badge ?? '··'}</span>
        <span className="title" onDoubleClick={() => (setTitle(folder.title), setRenaming(true))}>
          {renaming ? (
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={rename} onKeyDown={(e) => plainKey(e, 'Enter') && rename()} />
          ) : (
            folder.title
          )}
        </span>
        <button className={`btn${app.browserOpen ? ' primary' : ''}`} onClick={() => app.setBrowserOpen(!app.browserOpen)}>
          navigateur ◨
        </button>
        <button className={`btn more${menu ? ' primary' : ''}`} title="plus d’actions" onClick={() => setMenu(menu ? null : 'more')}>
          <MoreIcon />
        </button>
        {menu === 'more' && (
          <Popover onClose={() => setMenu(null)} style={{ top: 44, right: 20, width: 240 }}>
            <button onClick={() => (setMenu(null), void api.pinFolder(folder.id, !folder.pinned))}>{folder.pinned ? 'désépingler' : 'épingler'}</button>
            <button onClick={() => setMenu('snooze')}>mettre en veille…</button>
            <button onClick={() => (setMenu(null), void api.settleFolder(folder.id, !folder.settledAt))}>
              {folder.settledAt ? 'ressortir des classés' : 'classer'}
            </button>
            <button onClick={() => (setMenu(null), setTitle(folder.title), setRenaming(true))}>renommer</button>
            <button onClick={() => setMenu('engine')}>changer de moteur</button>
            <hr />
            <button className="bad" onClick={() => (setMenu(null), remove())}>
              supprimer le dossier
            </button>
          </Popover>
        )}
        {menu === 'snooze' && <SnoozeMenu folderId={folder.id} onClose={() => setMenu(null)} style={{ top: 44, right: 20, width: 240 }} />}
        {menu === 'engine' && (
          <Popover onClose={() => setMenu(null)} style={{ top: 44, right: 20, width: 240 }}>
            {app.lights.map((l) => (
              <button key={l.id} disabled={!l.ok} onClick={() => (setMenu(null), void api.setFolderEngine(folder.id, l.id as EngineId))}>
                {folder.engine === l.id ? '(•)' : '( )'} {ENGINE_LABELS[l.id]}
              </button>
            ))}
          </Popover>
        )}
      </div>
      <span className="small dim">
        {domain ? domain.label.toLowerCase() : 'question'} · ouvert le {shortDate(folder.createdAt)} · {ENGINE_LABELS[folder.engine]}
        {folder.settledAt && ` · classé le ${shortDate(folder.settledAt)}`}
        {task && ` · tâche planifiée, ${task.everyLabel} · ${task.on ? `prochaine ${nextLabel(task.next)}` : 'en pause'}`}
      </span>
      {procedure && (
        <div className="steps">
          {procedure.steps.map((s, i) => {
            const done = folder.stepsDone.includes(i)
            const current = !done && procedure.steps.findIndex((_, j) => !folder.stepsDone.includes(j)) === i
            return (
              <Fragment key={i}>
                {i > 0 && <i aria-hidden>—</i>}
                <button
                  className={done ? 'done' : current ? 'cur' : ''}
                  title={done ? 'marquer comme à faire' : 'marquer comme fait'}
                  aria-pressed={done}
                  aria-current={current ? 'step' : undefined}
                  onClick={() => void api.setFolderStep(folder.id, i, !done)}
                >
                  {done ? '✓' : current ? '●' : '○'} {s.title}
                </button>
              </Fragment>
            )
          })}
        </div>
      )}
      {procedure && <StepActions folder={folder} procedure={procedure} running={view.running} />}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn small" onClick={() => setPieces(!pieces)}>
          pièces ({documents.length}) {pieces ? '▴' : '▾'}
        </button>
        {task && (
          <button className="btn small" onClick={() => setChanging(true)}>
            modifier la tâche
          </button>
        )}
        {task && (
          <button className="btn small" onClick={() => void api.setTaskOn(task.id, !task.on)}>
            {task.on ? 'mettre en pause' : 'reprendre'}
          </button>
        )}
      </div>
      {changing && task && <TaskEditDialog task={task} onClose={() => setChanging(false)} />}
      {pieces && (
        <div className="inline-card" style={{ margin: 0 }}>
          <div className="in">
            {documents.map((d) => (
              <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="link" onClick={() => void api.openDocument(d.id)}>
                  {d.title}
                </button>
                <span className="small dim">{d.fileName}</span>
              </div>
            ))}
            {!documents.length && <p className="dim small">Aucune pièce dans ce dossier.</p>}
            <div className="acts">
              <button className="btn small" onClick={() => void api.addDocuments({ domain: folder.domain || 'identity', folderId: folder.id })}>
                + ajouter des pièces
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const SHEET_URL = 'https://www.service-public.gouv.fr/particuliers/vosdroits/'

/** What the step in progress offers: a site or a sheet in the folder's browser, a setting, a pièce, a question, a service. */
function StepActions({ folder, procedure, running }: { folder: Folder; procedure: Procedure; running: boolean }) {
  const sites = useSites()
  const services = useServices()
  const index = procedure.steps.findIndex((_, i) => !folder.stepsDone.includes(i))
  const step = procedure.steps[index]
  if (!step?.actions.length) return null
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="small dim">étape {index + 1} :</span>
      {step.actions.map((a, i) => (
        <StepAction key={i} action={a} folder={folder} domain={folder.domain || procedure.domain} running={running} sites={sites} services={services} />
      ))}
    </div>
  )
}

function StepAction({
  action: a,
  folder,
  domain,
  running,
  sites,
  services
}: {
  action: ProcedureAction
  folder: Folder
  domain: DomainId
  running: boolean
  sites: Site[]
  services: ServiceState[]
}) {
  const app = useApp()
  const failed = (err: unknown) => app.toast(errorText(err))
  const button = (run: (() => void) | null, disabled = false) => (
    <button className="btn small" disabled={!run || disabled} onClick={run ?? undefined}>
      {a.label}
    </button>
  )
  const browse = (url: string | undefined) =>
    url
      ? () => {
          api.browserOpen(url, folder.id)
          app.setBrowserOpen(true)
        }
      : null
  switch (a.kind) {
    case 'open':
      return button(browse(/^https:\/\//.test(a.target) ? a.target : sites.find((s) => s.id === a.target)?.url))
    case 'sheet':
      return button(browse(SHEET_URL + a.target))
    case 'setup': {
      const page = setupPage(a.target)
      return button(page ? () => app.openSettings(page) : null)
    }
    case 'document':
      return button(() => void api.addDocuments({ domain, folderId: folder.id }).catch(failed))
    case 'ask':
      return button(() => void api.send({ folderId: folder.id, text: a.target, attachments: [] }).catch(failed), running)
    case 'service': {
      const service = services.find((s) => s.manifest.id === a.target)
      if (service?.on) return button(() => app.go({ kind: 'service', id: a.target }))
      const code = serviceCode({ id: a.target })
      const why = !service
        ? `3615 ${code} n’est pas installé`
        : service.available
          ? `3615 ${code} est désactivé`
          : `3615 ${code} est indisponible : une connexion dont il a besoin est coupée`
      return (
        <span className="small dim">
          {button(null)} {why} ·{' '}
          <button className="link" onClick={() => app.openSettings('services')}>
            réglages des services
          </button>
        </span>
      )
    }
  }
}
