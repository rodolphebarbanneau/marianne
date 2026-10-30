import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { DOMAINS, type Deadline } from '@marianne/profile'
import type { Procedure } from '@marianne/content'
import type { DomainId } from '@shared/types'
import { useApp, type ScreenKey } from '../app/context'
import { KioskHead } from '../components/kiosk-head'
import { TicketMachine } from '../components/ticket-machine'
import { useServices } from '../host'
import { api } from '../lib/api'
import { plainKey } from '../lib/keys'
import {
  domainByNumber,
  presses,
  pressingLine,
  searchDemarches,
  searchRows,
  searchWords,
  TODO_DAYS,
  todoItems,
  type SearchRow,
  type TodoItem
} from '../lib/demarches'
import { useDocuments } from '../lib/profile'
import { useTasks } from '../lib/tasks'
import { SearchHead, SearchView } from './demarches/search-view'
import { Sommaire } from './demarches/sommaire'
import { TasksTab } from './demarches/tasks-tab'
import { TodoRow } from './demarches/todo-row'
import { useOpenTarget } from './open-target'
import { NewTaskDialog } from './tasks/dialogs'

/**
 * Démarches: the guichet. Its head is the one search of the page: a number calls a domain, as a
 * counter is called (the machine prints the ticket, the domain's line lights up, ENVOI goes there);
 * words look through what is the user's and what is official. Under it, three tabs: « mes domaines »
 * (what presses, then the sommaire), « à faire » (everything, ranked) and « tâches planifiées ». The
 * head and the tabs stay: only what is under them scrolls, each view from its top.
 */

type Tab = 'domains' | 'todo' | 'tasks'

const TABS: Array<[Tab, string]> = [
  ['domains', 'mes domaines'],
  ['todo', 'à faire'],
  ['tasks', 'tâches planifiées']
]

/** The tab shown, kept while the user opens something and comes back. */
let lastTab: Tab = 'domains'

export function ProceduresPage() {
  const { folders, go, palette, settingsPage, guideOpen, setScreenKeys, toast } = useApp()
  const services = useServices()
  const documents = useDocuments()
  const tasks = useTasks()
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [procedures, setProcedures] = useState<Procedure[]>([])
  // Asked again when a task has run: it may have found something to pay.
  const lastRuns = tasks.map((t) => t.runs.at(-1)?.at ?? '').join()
  useEffect(() => void api.getDeadlines(120).then(setDeadlines), [lastRuns])
  useEffect(() => void api.listProcedures().then(setProcedures), [])

  const [tab, setTabState] = useState<Tab>(lastTab)
  const setTab = (next: Tab) => {
    lastTab = next
    setTabState(next)
  }
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [creating, setCreating] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const sources = useMemo(() => ({ folders, deadlines, documents, tasks }), [folders, deadlines, documents, tasks])
  const items = useMemo(() => todoItems(sources), [sources])
  const urgent = items.filter(presses)
  const later = items.filter((x) => !presses(x))

  // A number that calls no domain is searched as a word.
  const called = domainByNumber(query)
  const searching = !!query.trim() && !called
  const groups = useMemo(() => (searching ? searchDemarches(query, { ...sources, procedures }) : []), [searching, query, sources, procedures])
  const results = searchRows(groups)
  // A number lights its line, so the sommaire shows whatever the tab; the tab itself is kept for when it is cleared.
  const shown = called ? 'domains' : tab

  // Typing in the bar, at once: the page is a counter.
  useEffect(() => void input.current?.focus({ preventScroll: true }), [])
  // A digit or / typed anywhere on the page goes to the bar. The digit lands in it, which has the focus by then; the slash only calls it.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || !/^[0-9/]$/.test(e.key)) return
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return
      if (palette || settingsPage || guideOpen || document.querySelector('#root > .overlay')) return
      if (e.key === '/') e.preventDefault()
      input.current?.focus({ preventScroll: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [palette, settingsPage, guideOpen])

  const documentTitle = useCallback((id: string) => documents.find((x) => x.id === id)?.title ?? '', [documents])
  const openTarget = useOpenTarget(documentTitle)
  const openItem = (item: TodoItem) => openTarget(item.target)
  const openDomain = (id: DomainId) => go({ kind: 'domain', id })
  // From the search, a pièce opens to be read, where « à faire » makes a folder of a letter.
  const activate = (row: SearchRow) => openTarget(row.target, { read: true })

  const typed = (next: string) => {
    setQuery(next)
    setSelected(0)
  }
  const clear = () => typed('')
  const envoi = () => {
    if (called) return openDomain(called.id)
    if (!query.trim()) return toast('tapez un numéro ou un mot')
    const row = results[selected]
    if (row) activate(row)
  }
  const step = (by: number) => {
    // On a number, the next counter: SUITE and RETOUR do what they do on the results.
    if (called) return typed(String(Math.max(1, Math.min(DOMAINS.length, called.num + by))))
    setSelected((i) => Math.max(0, Math.min(results.length - 1, i + by)))
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (plainKey(e, 'Enter')) {
      e.preventDefault()
      envoi()
    } else if (e.key === 'Escape' && query) {
      e.preventDefault()
      e.stopPropagation()
      clear()
    } else if (query && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(e.key)) {
      // While something is typed, SUITE and RETOUR go through it rather than the pages.
      e.preventDefault()
      e.stopPropagation()
      step(e.key === 'ArrowDown' || e.key === 'PageDown' ? 1 : -1)
    }
  }

  // The bottom bar's keys: the bar's while something is typed, the page's otherwise.
  const active = !!query.trim()
  const short = called?.short
  useEffect(() => {
    const keys: ScreenKey[] | null = active
      ? [
          { key: 'ENVOI', shortcut: 'Enter', what: short ? `ouvrir ${short}` : 'ouvrir' },
          { key: 'SUITE', shortcut: 'ArrowDown', what: 'suivant' },
          { key: 'RETOUR', shortcut: 'ArrowUp', what: 'précédent' },
          { key: 'ANNULATION', shortcut: 'Escape', what: 'effacer', run: () => setQuery('') }
        ]
      : null
    setScreenKeys(keys)
  }, [active, short, setScreenKeys])
  useEffect(() => () => setScreenKeys(null), [setScreenKeys])

  const closeDialog = useCallback(() => setCreating(false), [])
  const counts: Record<Tab, number> = { domains: DOMAINS.length, todo: items.length, tasks: tasks.filter((t) => t.on).length }
  const rows = (list: TodoItem[], lit: boolean) => (
    <div>
      {list.map((item, i) => (
        <TodoRow key={item.key} item={item} first={lit && i === 0} onOpen={openItem} />
      ))}
    </div>
  )

  return (
    <div className="page services-page">
      <div className="section kiosk-top">
        <KioskHead
          ref={input}
          line={
            <span className="ask" id="kiosk-ask">
              QUELLE DÉMARCHE ?
            </span>
          }
          block="GUICHET"
          placeholder="un numéro ou un mot"
          query={query}
          onQuery={typed}
          onEnvoi={envoi}
          onKey={onKey}
          art={<TicketMachine number={called?.num ?? null} />}
          labelledBy="kiosk-ask"
          hint="GUICHET : tapez un numéro (de 1 à 10) pour ouvrir un domaine, ou des mots (amende, carte grise)"
        />
        {searching ? (
          <SearchHead query={query.trim()} groups={groups} onClear={clear} />
        ) : (
          <div className="ktabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={shown === id} className={shown === id ? 'on' : undefined} onClick={() => setTab(id)}>
                {label}
                <span className="n">{counts[id]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div key={searching ? 'search' : shown} className="page-body">
        <div className="section">
          {searching ? (
            <SearchView terms={searchWords(query)} groups={groups} selected={selected} onSelect={setSelected} onActivate={activate} />
          ) : shown === 'domains' ? (
            <div role="tabpanel">
              <div className="sec-h">
                <span className="label">à faire</span>
                <span className="small dim">{pressingLine(urgent.length)}</span>
                {later.length > 0 && (
                  <span className="tools">
                    <button className="link small" onClick={() => setTab('todo')}>
                      et {later.length} autre{later.length > 1 ? 's' : ''} ›
                    </button>
                  </span>
                )}
              </div>
              {rows(urgent, true)}
              <div className="sec-h">
                <span className="label">domaines</span>
              </div>
              <Sommaire sources={sources} services={services} typed={called?.num ?? null} onOpen={openDomain} />
            </div>
          ) : shown === 'todo' ? (
            <div role="tabpanel">
              <div className="sec-h">
                <span className="label">ce qui presse</span>
                <span className="small dim">{urgent.length}</span>
              </div>
              {rows(urgent, true)}
              <div className="sec-h">
                <span className="label">dans les {TODO_DAYS} jours</span>
                <span className="small dim">{later.length}</span>
              </div>
              {rows(later, false)}
            </div>
          ) : (
            <TasksTab tasks={tasks} onNew={() => setCreating(true)} />
          )}
        </div>
      </div>
      {creating && <NewTaskDialog onClose={closeDialog} />}
    </div>
  )
}
