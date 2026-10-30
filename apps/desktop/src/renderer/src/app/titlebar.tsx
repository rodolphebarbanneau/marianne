import { GearIcon, PanelIcon, ReloadIcon, SearchIcon } from '../components/icons'
import { useShortcutLabel } from './commands'
import { PAGE_LABELS, useApp, type PageId } from './context'

const TABS: PageId[] = ['procedures', 'services']

/** Sidebar toggle and MARIANNE on the left; the pages; search, settings and reload before the window buttons. */
export function TitleBar() {
  const app = useApp()
  const label = useShortcutLabel()
  const current = app.view.kind === 'page' ? app.view.page : app.view.kind === 'service' ? 'services' : app.view.kind === 'domain' ? 'procedures' : null
  return (
    <header className="titlebar">
      <div className="brand">
        <button className="icon-btn" title={`replier la barre latérale (${label('sidebar')})`} onClick={app.toggleSidebar}>
          <PanelIcon />
        </button>
        <button className="mark" title={`parler à Marianne : nouveau dossier (${label('marianne')})`} onClick={() => app.goPage('home')}>
          <span className="wordmark">MARIANNE</span>
        </button>
      </div>
      <nav className="tabs-bar">
        {TABS.map((page) => (
          <button key={page} className={current === page ? 'on' : ''} title={label(page)} onClick={() => app.goPage(page)}>
            {PAGE_LABELS[page]}
          </button>
        ))}
      </nav>
      <div className="right">
        <button
          className="icon-btn"
          title={`chercher partout (${label('search')})`}
          onClick={() => app.openPalette(app.palette === 'search' ? null : 'search')}
        >
          <SearchIcon />
        </button>
        <button className="icon-btn" title={`réglages (${label('settings')})`} onClick={() => app.openSettings('identity')}>
          <GearIcon />
        </button>
        <button className="icon-btn" title={`recharger la fenêtre (${label('reload')})`} onClick={app.reload}>
          <ReloadIcon />
        </button>
      </div>
    </header>
  )
}
