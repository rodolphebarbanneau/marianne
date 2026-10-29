import { useActions, useShortcuts } from './commands'
import { useApp } from './context'
import { BottomBar } from './bottombar'
import { AfterUnlock } from './after-unlock'
import { AppGuide } from './guide'
import { Palette } from './palette'
import { Sidebar } from './sidebar'
import { TitleBar } from './titlebar'
import { BrowserPanel } from '../browser/panel'
import { Boundary } from '../components/ui'
import { FolderScreen } from '../folder/folder'
import { DomainPage } from '../pages/domain'
import { HomePage } from '../pages/home'
import { NewsPage } from '../pages/news'
import { ProceduresPage } from '../pages/procedures'
import { ServicesPage } from '../pages/services'
import { ServiceScreen } from '../host/screen'
import { SettingsDialog } from '../settings/dialog'

/** The open account: title bar, sidebar of folders, the screen, the browser when shown, the bottom bar. */
export function Shell() {
  const app = useApp()
  const actions = useActions()
  useShortcuts(actions, false)
  const { view } = app
  const folded = !app.config.ui.sidebarOpen

  return (
    <div className={`app${folded ? ' folded' : ''}`}>
      <TitleBar />
      <div className="body">
        <Boundary label="la barre latérale">
          <Sidebar />
        </Boundary>
        <main className="main">
          <Boundary key={view.kind === 'page' ? view.page : `${view.kind}:${view.id}`} label="cet écran">
            {view.kind === 'folder' ? (
              <FolderScreen id={view.id} />
            ) : view.kind === 'domain' ? (
              <DomainPage id={view.id} />
            ) : view.kind === 'service' ? (
              <ServiceScreen id={view.id} params={view.params ?? {}} />
            ) : view.page === 'news' ? (
              <NewsPage />
            ) : view.page === 'procedures' ? (
              <ProceduresPage />
            ) : view.page === 'services' ? (
              <ServicesPage />
            ) : (
              <HomePage />
            )}
          </Boundary>
        </main>
        {view.kind === 'folder' && app.browserOpen && <BrowserPanel folderId={view.id} />}
      </div>
      <BottomBar actions={actions} />
      {app.palette && (
        <Boundary label="la fenêtre de commandes">
          <Palette actions={actions} />
        </Boundary>
      )}
      {app.settingsPage && (
        <Boundary label="les réglages">
          <SettingsDialog />
        </Boundary>
      )}
      {app.guideOpen && <AppGuide />}
      <AfterUnlock />
      {app.toastText && <div className="toast">{app.toastText}</div>}
    </div>
  )
}
