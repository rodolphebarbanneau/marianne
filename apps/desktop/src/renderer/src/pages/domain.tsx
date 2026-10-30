import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import type { Procedure } from '@marianne/content'
import { DOCUMENT_TYPE_LABELS, domainInfo, type Deadline, type DocumentMeta, type DomainInfo, type EntityKind, type Profile } from '@marianne/profile'
import { serviceCode, tabKey, type ServiceState, type ServiceSummary } from '@marianne/sdk'
import { ServiceIcon } from '@marianne/sdk/view'
import { accelOf, matches, SHORTCUTS } from '@shared/shortcuts'
import type { DomainId, FolderSummary, PlannedTask, TaskTemplate } from '@shared/types'
import { useApp, type DomainTab } from '../app/context'
import { KioskHead } from '../components/kiosk-head'
import { TicketMachine } from '../components/ticket-machine'
import { useServices } from '../host'
import { api, errorText, isMac } from '../lib/api'
import { aboutEntity, presses, proposed, SHEET_URL, todoItems, weekLabels, whenOf, type SearchTarget } from '../lib/demarches'
import { useDocuments, useProfile } from '../lib/profile'
import { useTasks, useTaskTemplates } from '../lib/tasks'
import { TodoRow } from './demarches/todo-row'
import { entitiesOf, folderGroups, folderRow, longDate, sheetTitles, tiedTitle, weekRows, type DomainEntity } from './domain-model'
import { useOpenTarget } from './open-target'
import { ReviewDialog } from './services/dialogs'
import { NewTaskDialog, TaskSheet, useDialogKeys } from './tasks/dialogs'
import { notPlanned, withEntity } from './tasks/model'
import { PropCard, RunsCells, TaskCard } from './tasks/task-card'

/**
 * A domain's page: a counter with its number. The bar on every tab opens a folder filed here; under
 * it, F2 to F5: what is going on (what to do, what the user has here, the eight weeks, what helps),
 * the planned tasks in full, the folders and the guided démarches, what to read. Only what is under
 * the tabs scrolls. Services are laid out from their summaries: data, never an add-on's own screen.
 */

const TABS: Array<{ id: DomainTab; label: string }> = [
  { id: 'apercu', label: 'aperçu' },
  { id: 'taches', label: 'tâches planifiées' },
  { id: 'dossiers', label: 'dossiers' },
  { id: 'ressources', label: 'ressources' }
]

type Dialog = { kind: 'new' } | { kind: 'sheet'; template: TaskTemplate } | null

/** What the tabs show of the domain and what they do with it. */
interface Domain {
  d: DomainInfo
  deadlines: Deadline[]
  documents: DocumentMeta[]
  folders: FolderSummary[]
  /** Its guided démarches. */
  guided: Procedure[]
  /** The titles known of Service-Public's sheets. */
  sheets: Map<string, string>
  tasks: PlannedTask[]
  /** What the services propose and the user hasn't taken. */
  proposals: TaskTemplate[]
  open: (target: SearchTarget, options?: { read?: boolean }) => void
  ask: (text: string) => void
  showTab: (tab: DomainTab) => void
  newTask: () => void
  plan: (template: TaskTemplate) => void
}

export function DomainPage({ id, tab = 'apercu' }: { id: DomainId; tab?: DomainTab }) {
  const app = useApp()
  const { go, toast, step, palette, settingsPage, guideOpen, config } = app
  const d = domainInfo(id)
  const profile = useProfile()
  const documents = useDocuments().filter((x) => x.domain === id)
  const services = useServices().filter((s) => s.manifest.domains.includes(id) && s.available)
  const allTasks = useTasks()
  const tasks = allTasks.filter((t) => t.domain === id)
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [summaries, setSummaries] = useState<Array<{ service: string; summary: ServiceSummary }>>([])
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const input = useRef<HTMLInputElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const sending = useRef(false)

  const onServices = services
    .filter((s) => s.on)
    .map((s) => s.manifest.id)
    .join()
  const tasksKey = allTasks.map((t) => `${t.id}:${t.runs.length}`).join()
  const templates = useTaskTemplates([onServices, tasksKey, JSON.stringify(profile?.vehicles ?? [])].join('|'))

  // Échéances move with the profile, and with what a task has just found.
  useEffect(() => {
    let alive = true
    void api.getDeadlines(400).then((list) => alive && setDeadlines(list.filter((x) => x.domain === id && x.status === 'todo')))
    return () => {
      alive = false
    }
  }, [id, profile, tasksKey])
  useEffect(() => void api.listProcedures().then(setProcedures), [])
  // The services' lines change with the services that are on.
  useEffect(() => void api.serviceSummaries(id).then(setSummaries), [id, onServices])
  // A question, at once: the page is a counter.
  useEffect(() => void input.current?.focus({ preventScroll: true }), [])
  // Each tab from its top. `scrollTo` returns a promise, which an effect must not.
  useEffect(() => void body.current?.scrollTo(0, 0), [tab])

  const showTab = useCallback((next: DomainTab) => go({ kind: 'domain', id, tab: next }), [go, id])

  // F2…F5: the tabs, in their order (F1 stays GUIDE), unless the key is one of the user's shortcuts or a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = /^F([2-5])$/.exec(e.key)
      if (!n || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
      if (palette || settingsPage || guideOpen || document.querySelector('#root > .overlay')) return
      if (SHORTCUTS.some((def) => matches(e, accelOf(def.id, isMac, config.shortcuts), isMac))) return
      e.preventDefault()
      showTab(TABS[Number(n[1]) - 2].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showTab, palette, settingsPage, guideOpen, config.shortcuts])

  const ask = (text: string) => {
    if (sending.current) return
    sending.current = true
    api
      .send({ text, attachments: [], domain: id })
      .then((folder) => go({ kind: 'folder', id: folder }))
      .catch((err: unknown) => toast(errorText(err)))
      .finally(() => (sending.current = false))
  }
  const envoi = () => {
    const text = query.trim()
    if (text) ask(text)
    else toast('écrivez votre question')
  }
  const onBarKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      envoi()
    } else if (e.key === 'Escape') {
      // The app leaves échap to whoever has a field; here an empty bar means the page's own RETOUR.
      e.preventDefault()
      e.stopPropagation()
      if (query) setQuery('')
      else step('prev')
    }
  }

  const closeDialog = useCallback(() => setDialog(null), [])
  const open = useOpenTarget((document) => documents.find((x) => x.id === document)?.title ?? '')
  const data: Domain = {
    d,
    deadlines,
    documents,
    folders: app.folders.filter((f) => f.domain === id),
    guided: procedures.filter((p) => p.domain === id),
    sheets: sheetTitles(procedures),
    tasks,
    proposals: proposed(templates, allTasks).filter((t) => t.domain === id),
    open,
    ask,
    showTab,
    newTask: () => setDialog({ kind: 'new' }),
    plan: (template) => setDialog({ kind: 'sheet', template })
  }
  const counts: Partial<Record<DomainTab, number>> = { taches: tasks.filter((t) => t.on).length, dossiers: data.folders.filter((f) => !f.settledAt).length }

  return (
    <div className="page service-page dm-dom">
      <div className="section kiosk-top">
        <KioskHead
          ref={input}
          line={
            <span className="ask dm-line" id="kiosk-ask">
              <button className="icon-btn back" title="retour aux Démarches (échap)" aria-label="retour aux Démarches" onClick={() => app.goPage('procedures')}>
                <svg viewBox="0 0 16 16" aria-hidden>
                  <path d="M13.5 8h-11 M7 3.5L2.5 8L7 12.5" />
                </svg>
              </button>
              {d.label.toUpperCase()}
              <span className="d">{d.description}</span>
            </span>
          }
          block={`GUICHET ${d.num}`}
          placeholder="votre question"
          query={query}
          onQuery={setQuery}
          onEnvoi={envoi}
          onKey={onBarKey}
          art={<TicketMachine number={d.num} />}
          sentence
          labelledBy="kiosk-ask"
        />
      </div>
      {/* The tabs stay above the content, which scrolls under them; each with its key. */}
      <nav className="service-tabs" aria-label={`onglets de ${d.label}`}>
        <div className="service-tab-list">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              className={`service-tab${t.id === tab ? ' on' : ''}`}
              aria-current={t.id === tab ? 'page' : undefined}
              title={`${t.label} (${tabKey(i)})`}
              onClick={() => showTab(t.id)}
            >
              <span className="fkey">{tabKey(i)}</span>
              {t.label}
              {!!counts[t.id] && <span className="count">{counts[t.id]}</span>}
            </button>
          ))}
        </div>
      </nav>
      <div className="service-body" ref={body}>
        <div className="service-content">
          <div>
            {tab === 'apercu' ? (
              <Overview data={data} profile={profile} services={services} summaries={summaries} />
            ) : tab === 'taches' ? (
              <Tasks data={data} />
            ) : tab === 'dossiers' ? (
              <Folders data={data} />
            ) : (
              <Resources data={data} />
            )}
          </div>
        </div>
      </div>
      {dialog?.kind === 'new' && <NewTaskDialog domain={id} onClose={closeDialog} />}
      {dialog?.kind === 'sheet' && <TaskSheet template={dialog.template} onClose={closeDialog} />}
    </div>
  )
}

/** A section's head: its name, a count or a word, its tools on the right. */
function SecHead({ label, note, tools }: { label: string; note?: ReactNode; tools?: ReactNode }) {
  return (
    <div className="sec-h">
      <span className="label">{label}</span>
      {note !== undefined && <span className="small dim">{note}</span>}
      {tools && <span className="tools">{tools}</span>}
    </div>
  )
}

/** A row that opens something: a click, or Enter once it has the focus. */
function Row({ className, onOpen, children }: { className: string; onOpen: () => void; children: ReactNode }) {
  return (
    <div className={className} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.target === e.currentTarget && e.key === 'Enter' && onOpen()}>
      {children}
    </div>
  )
}

function Guided({ data: { guided, open } }: { data: Domain }) {
  if (!guided.length) return <p className="dim small">Pas encore de démarche guidée ici.</p>
  return guided.map((p) => (
    <div key={p.id} className="dm-proc">
      <span className="steps" aria-hidden>
        {p.steps.map((_, i) => (
          <i key={i} />
        ))}
      </span>
      <span>
        <span className="t">{p.title}</span>
        <span className="s">{[`${p.steps.length} étape${p.steps.length > 1 ? 's' : ''}`, p.duration, p.description].filter(Boolean).join(' · ')}</span>
      </span>
      <button className="btn small" onClick={() => open({ kind: 'procedure', id: p.id })}>
        commencer
      </button>
    </div>
  ))
}

const STATE_LABELS: Record<ReturnType<typeof folderRow>['state'], string> = {
  approval: 'votre accord',
  question: 'question',
  working: 'travaille',
  failed: 'échec',
  done: 'terminé',
  woke: 'réveillé',
  idle: '',
  veille: 'en veille',
  classe: 'classé'
}

function FolderRows({ folders, none, data }: { folders: FolderSummary[]; none: string; data: Domain }) {
  return (
    <div className="dm-rows">
      {!folders.length && <p className="dim small">{none}</p>}
      {folders.map((f) => {
        const { detail, state } = folderRow(f)
        return (
          <Row key={f.id} className="dm-fr here" onOpen={() => data.open({ kind: 'folder', id: f.id })}>
            <span>
              <span className="t">{f.title}</span>
              <span className="s">{detail}</span>
            </span>
            <span className={`dm-stat ${state}`}>{STATE_LABELS[state]}</span>
          </Row>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- F2 aperçu

const ENTITY_TITLES: Record<EntityKind, string> = {
  vehicles: 'vos véhicules',
  properties: 'vos logements',
  companies: 'vos entreprises',
  employers: 'vos employeurs'
}

/** The colours of the Crit’Air stickers: data's own, as a plate's are. */
const CRITAIR: Record<string, string> = { 0: '#2e9d4f', 1: '#7b3fa0', 2: '#e2b400', 3: '#e2731c', 4: '#8c1c2c', 5: '#6f6f6f' }

/** A small French plate. Its right band carries a département the owner chose, which the profile doesn't hold: it stays empty rather than guessed. */
function Plate({ plate }: { plate: string }) {
  return (
    <span className="dm-plate mini">
      <span className="eu" aria-hidden>
        F
      </span>
      <span className="n">{plate || '—'}</span>
      <span className="dep" aria-hidden />
    </span>
  )
}

/** A vehicle, a home, an employer: what it is, then what is tied to it, and what could be. */
function EntityCard({ entity: e, data }: { entity: DomainEntity; data: Domain }) {
  const tied = data.deadlines.filter((x) => aboutEntity(x, e.id))
  const tasks = data.tasks.filter((t) => t.entity?.id === e.id)
  const offered = data.proposals.filter((t) => t.entity?.id === e.id)
  const v = e.vehicle
  return (
    <div className="dm-ent">
      <span className="top">
        {v && <Plate plate={v.plate} />}
        <span className="md ell" title={e.name}>
          {e.name} {v?.firstRegistration && <span className="small dim">· {v.firstRegistration.slice(0, 4)}</span>}
        </span>
        {v?.critair && (
          <span className="dm-critair" style={{ background: CRITAIR[v.critair] ?? 'var(--muted)' }} title={`Crit’Air ${v.critair}`}>
            {v.critair}
          </span>
        )}
      </span>
      {e.facts.length > 0 && (
        <span className="facts stack">
          {e.facts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </span>
      )}
      {tied.length + tasks.length + offered.length > 0 && (
        <div className="tied">
          {tied.map((x) => {
            const when = whenOf(x.date)
            return (
              <div key={x.key} className="r">
                <span className="ell">{tiedTitle(x.title, e.names)}</span>
                <span className={`dm-when ${when.tone}`}>{when.text}</span>
              </div>
            )
          })}
          {tasks.map((t) => (
            <div key={t.id} className="r">
              <span className="ell">
                {t.title} · {t.everyLabel}
              </span>
              <RunsCells task={t} n={4} />
            </div>
          ))}
          {offered.map((t) => (
            <div key={`${t.service}:${t.id}`} className="r">
              <span className="dim ell">{notPlanned(t)}</span>
              <button className="btn small" onClick={() => data.plan(t)}>
                + planifier
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** The eight weeks to come, a thin line per entity that has something in them, then what none holds. */
function Weeks({ entities, data }: { entities: DomainEntity[]; data: Domain }) {
  const rows = weekRows(
    entities.map((e) => e.id),
    data.deadlines
  )
  if (!rows.length) return null
  const nameOf = (entity: DomainEntity | undefined) => {
    if (!entity) return entities.length ? 'autres' : 'échéances'
    return entity.vehicle ? <Plate plate={entity.vehicle.plate} /> : entity.name.split(',')[0]
  }
  return (
    <>
      <SecHead label="les huit semaines à venir" />
      <table className="dm-dtl">
        <thead>
          <tr>
            <th />
            {weekLabels().map((label, i) => (
              <th key={label} className={i === 0 ? 'now' : undefined}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.entity ?? 'others'}>
              <td className="ell">{nameOf(entities.find((e) => e.id === row.entity))}</td>
              {row.marks.map((week, i) => (
                <td key={i} className={i === 0 ? 'now' : undefined}>
                  <span className="dm-mk">
                    {week.map((mark) => (
                      <i key={mark.key} className={`e${mark.pressing ? ' late' : ''}`} title={mark.title} />
                    ))}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/** « + ajouter »: the same review as on Services; nothing is ever enabled by itself. */
function AddService({ state, onDone }: { state: ServiceState; onDone: () => void }) {
  const { toast } = useApp()
  useDialogKeys('ajouter', onDone)
  return (
    <ReviewDialog
      subject={{ kind: 'official', state }}
      onAdded={() => {
        onDone()
        toast(`3615 ${serviceCode(state.manifest)} ajouté à mes services`)
      }}
      onClose={onDone}
    />
  )
}

/** A service useful for the domain: its summary when it is on, a suggestion when it is off or not among the user's. */
function ServiceLine({ state, summary }: { state: ServiceState; summary?: ServiceSummary }) {
  const app = useApp()
  const [reviewing, setReviewing] = useState(false)
  const m = state.manifest
  const name = (
    <span className="t">
      <span className="inv small">3615</span> {serviceCode(m)} · {m.name}
    </span>
  )
  const origin = state.builtIn ? 'officiel' : 'communauté'
  const closeReview = useCallback(() => setReviewing(false), [])
  if (!state.added)
    return (
      <div className="dm-sline sug">
        <ServiceIcon icon={m.icon} size="small" />
        <span className="stack">
          {name}
          <span className="sum">
            {origin} · {m.description}
          </span>
        </span>
        <button className="btn small" onClick={() => setReviewing(true)}>
          + ajouter
        </button>
        {reviewing && <AddService state={state} onDone={closeReview} />}
      </div>
    )
  if (!state.on) {
    const disabled = app.settings?.services.disabled ?? []
    return (
      <div className="dm-sline sug">
        <ServiceIcon icon={m.icon} size="small" />
        <span className="stack">
          {name}
          <span className="sum">désactivé · {m.description}</span>
        </span>
        <button className="btn small" onClick={() => void app.setSettings({ services: { disabled: disabled.filter((x) => x !== m.id) } })}>
          activer
        </button>
      </div>
    )
  }
  const said = [summary?.text ?? m.description, summary?.detail].filter(Boolean).join(' · ')
  return (
    <div className="dm-sline">
      <ServiceIcon icon={m.icon} size="small" />
      <span className="stack">
        {name}
        <span className="sum" title={said}>
          {/* What presses is lit: the only thing a line keeps of a tile's urgency. */}
          {summary?.urgency === 'urgent' || summary?.urgency === 'soon' ? <span className="accent">{said}</span> : said}
        </span>
      </span>
      <button className="btn small" onClick={() => app.go({ kind: 'service', id: m.id, params: summary?.params ?? {} })}>
        ouvrir
      </button>
    </div>
  )
}

function Overview({
  data,
  profile,
  services,
  summaries
}: {
  data: Domain
  profile: Profile | null
  services: ServiceState[]
  summaries: Array<{ service: string; summary: ServiceSummary }>
}) {
  const app = useApp()
  const { d, deadlines, documents, folders, tasks, open, ask, showTab, newTask } = data
  const items = todoItems({ folders, deadlines, documents, tasks }, d.id)
  const held = profile ? d.entities.map((kind) => ({ kind, list: entitiesOf(profile, kind, deadlines) })) : []
  const entities = held.flatMap((x) => x.list)
  const running = folderGroups(folders).open
  // What the user has comes first; what could help follows.
  const lines = [...services].sort((a, b) => Number(b.added && b.on) - Number(a.added && a.on))
  return (
    <>
      <div className="dm-starters">
        {d.starters.map((s) => (
          <button key={s} className="chip" onClick={() => ask(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="dm-two">
        <div>
          {items.length > 0 && (
            <>
              <SecHead label="à faire" note={items.length} />
              <div>
                {items.map((item, i) => (
                  <TodoRow key={item.key} item={item} first={i === 0 && presses(item)} here onOpen={(x) => open(x.target)} />
                ))}
              </div>
            </>
          )}
          {held.map(({ kind, list }) => (
            <EntityBlock key={kind} title={ENTITY_TITLES[kind]} list={list} onFoyer={() => app.openSettings('household')} data={data} />
          ))}
          <Weeks entities={entities} data={data} />
          {profile && !items.length && !entities.length && (
            <>
              <SecHead label="démarches guidées" note={data.guided.length} />
              <Guided data={data} />
            </>
          )}
        </div>
        <div>
          <SecHead label="services" note="utiles dans ce domaine" />
          <div className="dm-svcs">
            {!lines.length && <p className="dim small">Aucun service pour ce domaine.</p>}
            {lines.map((s) => (
              <ServiceLine key={s.manifest.id} state={s} summary={summaries.find((x) => x.service === s.manifest.id)?.summary} />
            ))}
          </div>
          <SecHead
            label="dossiers en cours"
            note={running.length}
            tools={
              <button className="link small" onClick={() => showTab('dossiers')}>
                tous ›
              </button>
            }
          />
          <FolderRows folders={running} none="Aucun dossier en cours." data={data} />
          <SecHead
            label="tâches planifiées"
            note={tasks.filter((t) => t.on).length}
            tools={
              tasks.length ? (
                <button className="link small" onClick={() => showTab('taches')}>
                  toutes ›
                </button>
              ) : (
                <button className="link small" onClick={newTask}>
                  + nouvelle tâche
                </button>
              )
            }
          />
          <div className="dm-rows">
            {!tasks.length && <p className="dim small">Aucune tâche planifiée.</p>}
            {tasks.map((t) => (
              <Row key={t.id} className="dm-fr here" onOpen={() => showTab('taches')}>
                <span>
                  <span className="t">{withEntity(t)}</span>
                  <span className="s">
                    {t.runner === 'marianne' ? 'Marianne vérifie' : 'rappel'} · {t.everyLabel}
                  </span>
                </span>
                <RunsCells task={t} n={6} />
              </Row>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function EntityBlock({ title, list, onFoyer, data }: { title: string; list: DomainEntity[]; onFoyer: () => void; data: Domain }) {
  return (
    <>
      <SecHead
        label={title}
        note={list.length}
        tools={
          <button className="link small" onClick={onFoyer}>
            dans Moi › Foyer ›
          </button>
        }
      />
      {list.length ? (
        <div className={`dm-ents${list.length === 1 ? ' one' : ''}`}>
          {list.map((e) => (
            <EntityCard key={e.id} entity={e} data={data} />
          ))}
        </div>
      ) : (
        <p className="dim small">Rien d’enregistré.</p>
      )}
    </>
  )
}

// ---------------------------------------------------------------- F3 tâches planifiées

function Tasks({ data: { tasks, proposals, newTask, plan } }: { data: Domain }) {
  return (
    <>
      <SecHead
        label="tâches planifiées"
        note={`${tasks.length} · Marianne vérifie, ou vous rappelle`}
        tools={
          <button className="btn small" onClick={newTask}>
            + nouvelle tâche
          </button>
        }
      />
      {!tasks.length && <p className="dim">Aucune tâche planifiée dans ce domaine.</p>}
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}
      {proposals.length > 0 && (
        <>
          <SecHead label="proposées par vos services" note={proposals.length} />
          {proposals.map((t) => (
            <PropCard key={`${t.service}:${t.id}`} template={t} onPlan={plan} />
          ))}
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------- F4 dossiers

function Folders({ data }: { data: Domain }) {
  const { open, asleep, settled } = folderGroups(data.folders)
  const groups = [
    { label: 'en cours', list: open },
    { label: 'en veille', list: asleep },
    { label: 'classés', list: settled }
  ]
  return (
    <div className="dm-two">
      <div>
        {groups.map(({ label, list }) => (
          <Fragment key={label}>
            <SecHead label={label} note={list.length} />
            <FolderRows folders={list} none="Aucun." data={data} />
          </Fragment>
        ))}
      </div>
      <div>
        <SecHead label="démarches guidées" note={data.guided.length} />
        <Guided data={data} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- F5 ressources

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, '')

function Resources({ data: { d, documents, sheets, open } }: { data: Domain }) {
  // A letter nobody has dealt with becomes a folder; any other pièce simply opens.
  const toProcess = (x: DocumentMeta) => x.type === 'letter' && !x.folderId
  return (
    <div className="dm-two">
      <div>
        <SecHead label="vos pièces" note={documents.length} />
        {!documents.length && <p className="dim small">Aucune pièce dans ce domaine.</p>}
        {documents.map((x) => (
          <button key={x.id} className="dm-link" onClick={() => open({ kind: 'letter', id: x.id }, { read: !toProcess(x) })}>
            <span className="k">{DOCUMENT_TYPE_LABELS[x.type]}</span>
            <span>
              {x.title} {x.date && <span className="small dim">· {longDate(x.date)}</span>}
            </span>
            <span className={`small ${toProcess(x) ? 'accent' : 'dim'}`}>{toProcess(x) ? 'à traiter' : 'ouvrir'}</span>
          </button>
        ))}
      </div>
      <div>
        {d.sheets.length > 0 && (
          <>
            <SecHead label="fiches Service-Public" note={d.sheets.length} />
            {d.sheets.map((sheet) => (
              <button key={sheet} className="dm-link" title={`${SHEET_URL}${sheet}`} onClick={() => api.openExternal(`${SHEET_URL}${sheet}`)}>
                <span className="k">{sheet}</span>
                <span>{sheets.get(sheet) ?? 'fiche Service-Public'}</span>
                <span className="small dim">lire</span>
              </button>
            ))}
          </>
        )}
        <SecHead label="liens officiels" />
        {d.links.map((l) => (
          <button key={l.url} className="dm-link" title={l.url} onClick={() => api.openExternal(l.url)}>
            <span className="k">{hostOf(l.url)}</span>
            <span>{l.label}</span>
            <span className="small dim">↗</span>
          </button>
        ))}
      </div>
    </div>
  )
}
