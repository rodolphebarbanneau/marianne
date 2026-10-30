import { useEffect, useRef, useState } from 'react'
import { DOMAINS } from '@marianne/profile'
import { ENGINE_BADGES } from '@shared/config'
import type { DomainId, FolderSummary, Usage } from '@shared/types'
import { ArchivePath } from '../components/archive-path'
import { FilterIcon, NewIcon } from '../components/icons'
import { Gauge, Identicon, SearchField } from '../components/ui'
import { lockIntent } from '../lib/after-unlock'
import { api } from '../lib/api'
import { accountLabel, bytes, daysFromNow, when } from '../lib/format'
import { useShortcutLabel } from './commands'
import { useApp } from './context'

const STATUS: Record<FolderSummary['status'], string> = {
  approval: 'votre accord',
  question: 'question',
  working: 'travaille',
  failed: 'échec',
  done: 'terminé',
  woke: 'réveillé',
  idle: ''
}

const domainOf = (id: DomainId | '') => (id ? DOMAINS.find((d) => d.id === id) : undefined)
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Like T3 Code's: search, filter by domain, new; one row per folder; "En veille" and "Classés" folded at the bottom. */
export function Sidebar() {
  const app = useApp()
  const label = useShortcutLabel()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Set<string>>(new Set())
  const [filterOpen, setFilterOpen] = useState(false)
  const [open, setOpen] = useState<{ snoozed: boolean; settled: boolean }>({ snoozed: false, settled: false })
  const [settledShown, setSettledShown] = useState(10)

  const q = norm(query.trim())
  const shown = app.folders.filter((f) => (!q || norm(f.title).includes(q)) && (!filter.size || filter.has(f.domain || 'question')))
  const active = shown.filter((f) => !f.snoozedUntil && !f.settledAt)
  const snoozed = shown.filter((f) => f.snoozedUntil && !f.settledAt)
  const settled = shown.filter((f) => f.settledAt).sort((a, b) => b.settledAt.localeCompare(a.settledAt))
  const current = app.view.kind === 'folder' ? app.view.id : ''

  const toggleFilter = (id: string, many: boolean) =>
    setFilter((prev) => {
      const next = new Set(many ? prev : [])
      if (prev.has(id) && many) next.delete(id)
      else if (!(prev.has(id) && prev.size === 1)) next.add(id)
      return next
    })

  return (
    <aside className="side">
      <div className="side-search">
        <SearchField value={query} onChange={setQuery} placeholder="chercher" />
        <button className={`icon-btn${filter.size ? ' accent' : ''}`} title="filtrer par domaine" onClick={() => setFilterOpen(!filterOpen)}>
          <FilterIcon />
        </button>
        <button className="icon-btn" title={`nouveau dossier (${label('marianne')})`} onClick={() => app.goPage('home')}>
          <NewIcon />
        </button>
      </div>
      {filterOpen && (
        <Popover onClose={() => setFilterOpen(false)} style={{ top: 38, right: 8, width: 240 }}>
          <span className="label" style={{ padding: '6px 10px 2px', display: 'block' }}>
            filtrer par domaine
          </span>
          <button onClick={() => setFilter(new Set())}>
            <span>{filter.size ? '( )' : '(•)'} tous les domaines</span>
          </button>
          {[...DOMAINS.map((d) => ({ id: d.id as string, label: d.label })), { id: 'question', label: 'questions' }].map((d) => (
            <button key={d.id} onClick={(e) => toggleFilter(d.id, e.shiftKey)}>
              <span>
                {filter.has(d.id) ? '[✓]' : '[ ]'} {d.label}
              </span>
            </button>
          ))}
          <span className="item dim small">maj+clic : plusieurs</span>
        </Popover>
      )}

      <div className="side-list">
        {active.map((f) => (
          <FolderRow key={f.id} folder={f} on={f.id === current} />
        ))}
        {!active.length && (
          <p className="small muted" style={{ padding: '8px 14px' }}>
            {q || filter.size ? 'Aucun dossier ne correspond.' : 'Aucun dossier en cours.'}
          </p>
        )}
      </div>

      <div className="side-groups">
        <button className="group-head" onClick={() => setOpen({ ...open, snoozed: !open.snoozed })}>
          <span>En veille ({snoozed.length})</span>
          <span className="chev">{open.snoozed ? '▾' : '▸'}</span>
        </button>
        {open.snoozed && snoozed.map((f) => <FolderRow key={f.id} folder={f} on={f.id === current} />)}
        <button className="group-head" onClick={() => setOpen({ ...open, settled: !open.settled })}>
          <span>Classés ({settled.length})</span>
          <span className="chev">{open.settled ? '▾' : '▸'}</span>
        </button>
        {open.settled && (
          <>
            {settled.slice(0, settledShown).map((f) => (
              <button key={f.id} className="old-row" onClick={() => app.go({ kind: 'folder', id: f.id })}>
                <span>{f.title}</span>
                <span>{when(f.settledAt)}</span>
              </button>
            ))}
            {settled.length > settledShown && (
              <button className="old-row" onClick={() => setSettledShown(settledShown + 25)}>
                <span className="dim">+ afficher {Math.min(25, settled.length - settledShown)} de plus</span>
              </button>
            )}
          </>
        )}
      </div>

      <AccountSelector />
      <Splitter />
    </aside>
  )
}

function FolderRow({ folder: f, on }: { folder: FolderSummary; on: boolean }) {
  const app = useApp()
  const [snoozing, setSnoozing] = useState(false)
  const domain = domainOf(f.domain)
  const status = f.status === 'idle' ? when(f.updatedAt) : f.status === 'working' ? STATUS.working : STATUS[f.status]
  // A click anywhere on the row opens the folder; for the keys, its title is the button. The row itself can't be
  // one: a button holds no other, and veille and classer are buttons.
  return (
    <div style={{ position: 'relative' }}>
      <div className={`fi${on ? ' on' : ''}${f.unread ? ' unread' : ''}`} onClick={() => app.go({ kind: 'folder', id: f.id })}>
        <span className="l1">
          <span className={`badge${domain ? '' : ' none'}`}>{domain?.badge ?? '··'}</span>
          {f.pinned && <span className="pin" />}
          <span className="kind">{domain?.label.toLowerCase() ?? 'question'}</span>
          <span className={`right status st-${f.status}`}>{f.snoozedUntil ? `réveil le ${new Date(f.snoozedUntil).toLocaleDateString('fr-FR')}` : status}</span>
          <span className="right hover-actions">
            <button
              title="mettre en veille"
              onClick={(e) => {
                e.stopPropagation()
                setSnoozing(true)
              }}
            >
              veille
            </button>
            <button
              title={f.settledAt ? 'ressortir des classés' : 'classer'}
              onClick={(e) => {
                e.stopPropagation()
                void api.settleFolder(f.id, !f.settledAt)
              }}
            >
              {f.settledAt ? 'ressortir' : 'classer'}
            </button>
          </span>
        </span>
        <button className="l2" aria-current={on ? 'page' : undefined}>
          {f.title}
        </button>
        <span className="l3">
          <span>{f.meta}</span>
          <span className="right">
            <span className="badge">{ENGINE_BADGES[f.engine]}</span>
          </span>
        </span>
      </div>
      {snoozing && <SnoozeMenu folderId={f.id} onClose={() => setSnoozing(false)} />}
    </div>
  )
}

export function SnoozeMenu({ folderId, onClose, style }: { folderId: string; onClose: () => void; style?: React.CSSProperties }) {
  const [date, setDate] = useState('')
  const snooze = (iso: string) => {
    void api.snoozeFolder(folderId, iso)
    onClose()
  }
  return (
    <Popover onClose={onClose} style={style ?? { top: 24, right: 8, width: 230 }}>
      <span className="label" style={{ padding: '6px 10px 2px', display: 'block' }}>
        mettre en veille jusqu’à…
      </span>
      <button onClick={() => snooze(daysFromNow(1))}>demain matin</button>
      <button onClick={() => snooze(daysFromNow(3))}>dans 3 jours</button>
      <button onClick={() => snooze(daysFromNow(7))}>dans une semaine</button>
      <button onClick={() => snooze(daysFromNow(30))}>dans un mois</button>
      <span className="item" style={{ gap: 6 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ flex: 1 }} />
        <button className="btn small" disabled={!date} onClick={() => snooze(new Date(`${date}T09:00:00`).toISOString())}>
          ok
        </button>
      </span>
    </Popover>
  )
}

/**
 * A small menu that closes on Échap or a click outside. That Échap is the menu's alone, as a
 * dialog's (Modal): taken on the document, before the window's listeners, which leave a key taken;
 * a folder would stop Marianne with it, a service's screen go back to the Services.
 */
export function Popover({ children, onClose, style }: { children: React.ReactNode; onClose: () => void; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      onClose()
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [onClose])
  return (
    <div className="menu" ref={ref} style={style}>
      {children}
    </div>
  )
}

/** The account, in the sidebar's footer; its menu shows how full the archive is. */
function AccountSelector() {
  const app = useApp()
  const account = app.session.account!
  const [open, setOpen] = useState(false)
  const [usage, setUsage] = useState<Usage | null>(null)
  useEffect(() => {
    if (open) void api.getUsage().then(setUsage)
  }, [open])
  const go = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  return (
    <div className="side-foot">
      <button className="account-btn" title="votre compte : réglages, archive, changer de compte, verrouiller" onClick={() => setOpen(!open)}>
        <Identicon id={account.id} />
        <span className="who">
          {accountLabel(account.id)} {account.display && <small>· {account.display}</small>}
        </span>
        <span className="dim">▴</span>
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)} style={{ bottom: 48, left: 8, width: 300 }}>
          <div className="head">
            <Identicon id={account.id} size={36} />
            <span className="who">
              <span className="hi">
                {accountLabel(account.id)}
                {account.display && ` · ${account.display}`}
              </span>
              {usage && (
                <button title="Réglages › Place et emplacement" onClick={go(() => app.openSettings('space'))}>
                  <Gauge usage={usage} />
                </button>
              )}
              {usage && (
                <small>
                  {bytes(usage.used)} sur {bytes(usage.capacity)} · il reste {bytes(Math.max(0, usage.capacity - usage.used))}
                </small>
              )}
              <small>
                <ArchivePath path={account.file} />
              </small>
            </span>
          </div>
          <button onClick={go(() => app.openSettings('identity'))}>
            <span>Réglages</span>
          </button>
          <button onClick={go(() => app.openSettings('space'))}>
            <span>Archive</span>
          </button>
          <hr />
          <button
            onClick={go(() => {
              lockIntent.list = true
              api.lock()
            })}
          >
            <span>Changer de compte</span>
          </button>
          <button onClick={go(() => api.lock())}>
            <span>Verrouiller</span>
          </button>
        </Popover>
      )}
    </div>
  )
}

/** Drag the sidebar's edge; double-click puts the default width back. */
function Splitter() {
  const { config, setConfig } = useApp()
  const [drag, setDrag] = useState(false)
  return (
    <div
      className={`splitter${drag ? ' drag' : ''}`}
      title="glisser pour redimensionner · double-clic : largeur par défaut"
      onDoubleClick={() => void setConfig({ ui: { sidebarWidth: 270 } })}
      onPointerDown={(e) => {
        const el = e.currentTarget
        el.setPointerCapture(e.pointerId)
        setDrag(true)
        const start = e.clientX
        const width = config.ui.sidebarWidth
        let last = width
        const move = (m: PointerEvent) => {
          last = Math.max(210, Math.min(420, width + m.clientX - start))
          document.documentElement.style.setProperty('--side-w', `${last}px`)
        }
        const up = () => {
          el.removeEventListener('pointermove', move)
          setDrag(false)
          void setConfig({ ui: { sidebarWidth: last } })
        }
        el.addEventListener('pointermove', move)
        el.addEventListener('pointerup', up, { once: true })
      }}
    />
  )
}
