import { useEffect, useRef, type ReactNode } from 'react'
import { daysUntil, type DomainId } from '@shared/dossier'
import { DOMAINS } from '@shared/domains'
import { ChatPanel } from '../chat/panel'
import { MARK, Mosaic } from '../components/mosaic'
import { FKey, HelpProvider, TitleBar, useWindowFocus } from '../components/ui'
import { AppProvider, useApp } from './context'
import { useConfig, useDisplay } from './hooks'
import { Agenda } from './pages/agenda'
import { Demarche } from './pages/demarche'
import { DocumentsPage } from './pages/documents'
import { DossierPage } from './pages/dossier'
import { Domaine } from './pages/domaine'
import { Entites } from './pages/entites'
import { Fiche } from './pages/fiche'
import { Moi } from './pages/moi'
import { routeTitle, TOP } from './routes'
import { Settings, type SettingsPage } from './settings/settings'
import { Status } from './status'

const api = window.marianne

export function App() {
  useWindowFocus()
  const [config, update] = useConfig()
  useDisplay(config)
  if (!config) return null
  return (
    <AppProvider config={config} update={update}>
      <Shell />
    </AppProvider>
  )
}

/** The sommaire: the person first, then the domains, Minitel style. */
function Rail() {
  const { route, go, deadlines } = useApp()
  const path = route.split('#')[0]
  const soon = (domain?: DomainId) =>
    deadlines.filter((d) => d.status === 'a_faire' && (!domain || d.domain === domain) && daysUntil(d.date) <= 7 && daysUntil(d.date) >= -30).length
  const item = (r: string, label: ReactNode, num?: string, badge = 0) => (
    <button key={r} className={path === r || (r.startsWith('reglages') && path.startsWith('reglages')) ? 'on' : ''} onClick={() => go(r)}>
      <span className="num">{num ?? ''}</span>
      <span className="name">{label}</span>
      {badge > 0 && (
        <span className="badge-count" title="échéances dans les 7 jours ou en retard">
          {badge}
        </span>
      )}
    </button>
  )
  return (
    <nav className="rail">
      {TOP.map((t) => item(t.route, t.label, t.num, t.route === 'agenda' ? soon() : 0))}
      <div className="rail-head">domaines</div>
      {DOMAINS.map((d) => item(`domaine/${d.id}`, d.short, String(d.num), soon(d.id)))}
      <div className="rail-fill" />
      {item('reglages/general', 'réglages')}
    </nav>
  )
}

function Locked() {
  const { dossierError, go } = useApp()
  return (
    <div className="page-inner">
      <div className="bar-fill inv-rouge" style={{ marginBottom: 12 }}>
        <span className="upper">coffre verrouillé</span>
      </div>
      <p className="line">{dossierError}</p>
      <p className="line">
        <button className="action" onClick={() => go('reglages/backup')}>
          restaurer une sauvegarde
        </button>
      </p>
    </div>
  )
}

/** Width of the conversation panel, dragged from its left edge. */
function Resizer() {
  const { config, update } = useApp()
  const start = useRef<{ x: number; w: number } | null>(null)
  useEffect(() => {
    const width = (e: MouseEvent) => Math.min(900, Math.max(360, start.current!.w + start.current!.x - e.clientX))
    const move = (e: MouseEvent) => {
      if (start.current) document.documentElement.style.setProperty('--chat-w', `${width(e)}px`)
    }
    const up = (e: MouseEvent) => {
      if (!start.current) return
      const w = width(e)
      start.current = null
      document.body.classList.remove('resizing')
      void update({ ui: { chatWidth: Math.round(w) } })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [update])
  return (
    <div
      className="resizer"
      title="glisser pour élargir"
      onMouseDown={(e) => {
        start.current = { x: e.clientX, w: config.ui.chatWidth }
        document.body.classList.add('resizing')
      }}
    />
  )
}

function Shell() {
  const { config, update, route, go, setHelp, dossierState } = useApp()
  const [path] = route.split('#')
  const open = config.ui.chatOpen
  const toggle = () => void update({ ui: { chatOpen: !open } })

  useEffect(() => {
    document.documentElement.style.setProperty('--chat-w', `${config.ui.chatWidth}px`)
  }, [config.ui.chatWidth])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === '0') go('moi')
      else if (mod && e.key.toLowerCase() === 'j') toggle()
      else if (e.key === 'F1') go('reglages/skills')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const needsVault = !path.startsWith('reglages') && !path.startsWith('fiche')
  let page: ReactNode
  if (dossierState !== 'ok' && needsVault) page = <Locked />
  else if (path === 'dossier') page = <DossierPage />
  else if (path === 'entites') page = <Entites />
  else if (path === 'agenda') page = <Agenda />
  else if (path === 'documents') page = <DocumentsPage />
  else if (path.startsWith('domaine/')) page = <Domaine id={path.slice(8) as DomainId} />
  else if (path.startsWith('demarche/')) page = <Demarche id={path.slice(9)} />
  else if (path.startsWith('fiche/')) page = <Fiche id={path.slice(6)} />
  else if (path.startsWith('reglages/')) page = <Settings page={(path.slice(9) || 'general') as SettingsPage} />
  else page = <Moi />

  return (
    <HelpProvider value={setHelp}>
      <div className="frame">
        <TitleBar
          right={
            <>
              <button className={`tab ${open ? 'on' : ''}`} onClick={toggle} title="ctrl+j">
                dialogue ◧
              </button>
              <button className={`tab ${path.startsWith('reglages') ? 'on' : ''}`} onClick={() => go('reglages/general')}>
                réglages
              </button>
            </>
          }
        >
          <Mosaic rows={MARK} scale={0.62} title="Marianne" />
          <b>3615 MARIANNE</b>
          <span className="muted">·</span>
          <span>{routeTitle(path)}</span>
        </TitleBar>
        <div className="shell">
          <Rail />
          <main className="page" key={path}>
            {page}
          </main>
          {open && (
            <>
              <Resizer />
              <ChatPanel />
            </>
          )}
        </div>
        <Status
          info="vos données restent sur cet ordinateur, chiffrées"
          keys={
            <>
              <FKey k="ctrl+0" onClick={() => go('moi')}>
                sommaire
              </FKey>
              <FKey k="f1" onClick={() => go('reglages/skills')}>
                guide
              </FKey>
              <FKey k="ctrl+j" primary={!open} onClick={toggle}>
                dialogue
              </FKey>
            </>
          }
        />
      </div>
    </HelpProvider>
  )
}

/** Open a site of the catalog (by id) or a URL in the built-in browser. */
export function openSite(target: string, services: Array<{ id: string; url: string }>): void {
  const url = /^https?:\/\//.test(target) ? target : services.find((s) => s.id === target)?.url
  if (url) api.openBrowser(url)
}
