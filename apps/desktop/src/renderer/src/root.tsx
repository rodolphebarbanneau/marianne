import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { AccountInfo, DeviceConfig } from '@shared/types'
import { AppProvider } from './app/context'
import { MediaProvider } from './app/media'
import { Shell } from './app/shell'
import { ArchivePath } from './components/archive-path'
import { Identicon, Modal } from './components/ui'
import { lockIntent, opening } from './lib/after-unlock'
import { api, useLive } from './lib/api'
import { overlay } from './lib/overlay'
import { accountLabel } from './lib/format'
import { LockScreens } from './screens/lock'

/** Theme, text size and widths from this computer's preferences. */
function useDisplay(config: DeviceConfig | null): void {
  useEffect(() => {
    if (!config) return
    const root = document.documentElement
    root.dataset.theme = config.ui.theme
    root.dataset.crt = config.ui.crt ? 'on' : 'off'
    root.dataset.platform = api.platform
    root.style.setProperty('--text-size', `${config.ui.fontSize}px`)
    root.style.setProperty('--side-w', `${config.ui.sidebarWidth}px`)
    root.style.setProperty('--browser-w', `${config.ui.browserWidth}px`)
  }, [config])
}

/** An archive opened from the system (a double-clicked .marianne file): the account to show, until the screen has taken it. */
function useOpenedArchive(): [string | null, () => void] {
  const [opened, setOpened] = useState<string | null>(null)
  useEffect(() => {
    const take = () => void api.takeOpenedArchive().then((id) => id && setOpened(id))
    // One may have come with the launch, before this window listened.
    take()
    return api.onOpenArchive(take)
  }, [])
  return [opened, useCallback(() => setOpened(null), [])]
}

/** Locked, or still opening: the lock screens. Unlocked: the application, on the open account. */
export function Root() {
  const config = useLive(api.getConfig, api.onConfig)
  const session = useLive(api.getSession, api.onSession)
  const [opened, done] = useOpenedArchive()
  const stillOpening = useSyncExternalStore(opening.subscribe, opening.get)
  useDisplay(config)
  // A dialog on screen, on the lock screens as in the application: the window buttons dim too.
  const dimmed = useSyncExternalStore(overlay.subscribe, overlay.get)
  useEffect(() => api.dimTitleBar(dimmed), [dimmed])
  const current = session?.unlocked && !stillOpening ? session.account : null

  // The archive opened is the one already open (or a copy of it): nothing to switch.
  useEffect(() => {
    if (opened && opened === current?.id) done()
  }, [opened, current?.id, done])

  if (!config || !session) return null
  if (!current) return <LockScreens config={config} session={session} opened={opened} onOpened={done} />
  return (
    <>
      {/* A new account remounts everything: nothing of the previous one stays on screen. */}
      <AppProvider key={current.id} config={config} session={session}>
        <MediaProvider>
          <Shell />
        </MediaProvider>
      </AppProvider>
      {opened && opened !== current.id && <SwitchArchive id={opened} current={current} onClose={done} />}
    </>
  )
}

/** Another archive opened from the system while an account is open: Marianne locks this one first, if the user agrees. */
function SwitchArchive({ id, current, onClose }: { id: string; current: AccountInfo; onClose: () => void }) {
  const target = (useLive(api.listAccounts, api.onAccounts) ?? []).find((a) => a.id === id)
  const name = (a: AccountInfo) => `${accountLabel(a.id)}${a.display ? ` · ${a.display}` : ''}`
  const open = () => {
    lockIntent.account = id
    onClose()
    api.lock()
  }
  return (
    <Modal onClose={onClose}>
      <div className="in">
        <span className="label">Ouvrir une autre archive</span>
        <p>Le compte {name(current)} est ouvert. Pour ouvrir cette archive, Marianne le verrouille d’abord.</p>
        {target && (
          <div className="account-line">
            <Identicon id={target.id} />
            <span className="grow">
              <span className="hi">{name(target)}</span>
              <span className="small dim file">
                <ArchivePath path={target.file} />
              </span>
            </span>
          </div>
        )}
      </div>
      <div className="foot">
        <button className="btn" onClick={onClose}>
          annuler
        </button>
        <button className="btn primary" autoFocus onClick={open}>
          verrouiller et ouvrir
        </button>
      </div>
    </Modal>
  )
}
