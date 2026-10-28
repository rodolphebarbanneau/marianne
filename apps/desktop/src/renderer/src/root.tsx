import { useEffect } from 'react'
import type { DeviceConfig } from '@shared/types'
import { AppProvider } from './app/context'
import { Shell } from './app/shell'
import { api, useLive } from './lib/api'
import { LockScreens } from './screens/lock'

/** Theme, fonts and widths from this computer's preferences. */
function useDisplay(config: DeviceConfig | null): void {
  useEffect(() => {
    if (!config) return
    const root = document.documentElement
    root.dataset.theme = config.ui.theme
    root.dataset.font = config.ui.pixelFont ? 'pixel' : 'clean'
    root.dataset.crt = config.ui.crt ? 'on' : 'off'
    root.dataset.platform = api.platform
    root.style.setProperty('--text-size', `${config.ui.fontSize}px`)
    root.style.setProperty('--side-w', `${config.ui.sidebarWidth}px`)
    root.style.setProperty('--browser-w', `${config.ui.browserWidth}px`)
  }, [config])
}

/** Locked: the lock screens. Unlocked: the application, on the open account. */
export function Root() {
  const config = useLive(api.getConfig, api.onConfig)
  const session = useLive(api.getSession, api.onSession)
  useDisplay(config)
  if (!config || !session) return null
  if (!session.unlocked || !session.account) return <LockScreens config={config} session={session} />
  return (
    // A new account remounts everything: nothing of the previous one stays on screen.
    <AppProvider key={session.account.id} config={config} session={session}>
      <Shell />
    </AppProvider>
  )
}
