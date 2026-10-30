import { useEffect } from 'react'
import { useActions, useShortcuts } from './commands'
import { useApp } from './context'
import { BottomBar } from './bottombar'
import { AfterUnlock } from './after-unlock'
import { AppGuide } from './guide'
import { MiniArea } from './media'
import { Palette } from './palette'
import { Sidebar } from './sidebar'
import { TitleBar } from './titlebar'
import { BrowserPanel } from '../browser/panel'
import { Boundary } from '../components/ui'
import { FolderScreen } from '../folder/folder'
import { DomainPage } from '../pages/domain'
import { HomePage } from '../pages/home'
import { ProceduresPage } from '../pages/procedures'
import { ServicesPage } from '../pages/services'
import { offerFileReview } from '../pages/services/pending'
import { ServiceScreen } from '../host/screen'
import { SettingsDialog } from '../settings/dialog'
import { api } from '../lib/api'

/** The open account: title bar, sidebar of folders, the screen (the mini-player over it), the browser when shown, the bottom bar. */
export function Shell() {
  const app = useApp()
  const actions = useActions()
  useShortcuts(actions)
  const { view } = app
  const folded = !app.config.ui.sidebarOpen
  // A narrow window: the sidebar, over the screen (styles.css), goes away once a screen is chosen.
  const viewKey = JSON.stringify(view)
  useEffect(() => {
    if (!folded && window.matchMedia('(max-width: 900px)').matches) void app.setConfig({ ui: { sidebarOpen: false } })
  }, [viewKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // A .3615 file opened from the system: the Services page, with its review over it. Those opened
  // before the shell was there (with the app, before unlocking) wait to be taken.
  const { goPage } = app
  useEffect(() => {
    const take = () =>
      void api.takeServiceFiles().then((reviews) => {
        if (!reviews.length) return
        for (const review of reviews) offerFileReview(review)
        goPage('services')
      })
    take()
    return api.onServiceFile(take)
  }, [goPage])

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
              <DomainPage id={view.id} tab={view.tab} />
            ) : view.kind === 'service' ? (
              <ServiceScreen id={view.id} params={view.params ?? {}} opened={view.opened ?? 0} />
            ) : view.page === 'procedures' ? (
              <ProceduresPage />
            ) : view.page === 'services' ? (
              <ServicesPage />
            ) : (
              <HomePage />
            )}
          </Boundary>
          {/* The video a screen handed over, in a corner, over any page. */}
          <MiniArea />
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
      {app.guideOpen && (
        <Boundary label="le guide">
          <AppGuide />
        </Boundary>
      )}
      <AfterUnlock />
      {app.toastText && <div className="toast">{app.toastText}</div>}
    </div>
  )
}
