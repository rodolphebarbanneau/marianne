import { useEffect, useMemo } from 'react'
import { accelOf, matches, SHORTCUTS, shortcutLabel, type CommandId } from '@shared/shortcuts'
import { api, isMac } from '../lib/api'
import { useApp } from './context'

export type Actions = Partial<Record<CommandId | 'shortcuts' | 'updates' | 'account' | 'browser', () => void>>

/** What every shortcut, menu entry and command does. */
export function useActions(): Actions {
  const app = useApp()
  return useMemo<Actions>(
    () => ({
      marianne: () => app.goPage('home'),
      news: () => app.goPage('news'),
      procedures: () => app.goPage('procedures'),
      services: () => app.goPage('services'),
      next: () => app.step('next'),
      prev: () => app.step('prev'),
      commands: () => app.openPalette(app.palette === 'commands' ? null : 'commands'),
      menu: () => app.openPalette(app.palette === 'menu' ? null : 'menu'),
      search: () => app.openPalette(app.palette === 'search' ? null : 'search'),
      settings: () => app.openSettings('identity'),
      shortcuts: () => app.openSettings('shortcuts'),
      updates: () => app.openSettings('about'),
      sidebar: app.toggleSidebar,
      lock: () => api.lock(),
      account: () => api.lock(),
      fullscreen: () => api.toggleFullscreen(),
      browser: () => app.setBrowserOpen(!app.browserOpen)
    }),
    [app]
  )
}

/** The label of a command's shortcut, with the user's changes ("ctrl+k", "cmd+k"). */
export function useShortcutLabel(): (id: string) => string {
  const { config } = useApp()
  return (id) => shortcutLabel(accelOf(id, isMac, config.shortcuts), isMac)
}

/** The application's shortcuts, everywhere but where the user types (pages and dialogs have their own keys). */
export function useShortcuts(actions: Actions, recording: boolean): void {
  const app = useApp()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (recording) return
      api.activity()
      const typing = !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')
      const onPage = app.view.kind !== 'folder' && !app.palette && !app.settingsPage
      // RETOUR: from a domain's dashboard or a service's screen, échap goes back to its page.
      if (onPage && !typing && e.key === 'Escape' && (app.view.kind === 'domain' || app.view.kind === 'service')) {
        e.preventDefault()
        app.step('prev')
        return
      }
      // ctrl+↓ / ctrl+↑ also change page, for keyboards without page keys.
      if (onPage && !typing && e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        app.step(e.key === 'ArrowDown' ? 'next' : 'prev')
        return
      }
      for (const def of SHORTCUTS) {
        const run = actions[def.id]
        if (!run || !matches(e, accelOf(def.id, isMac, app.config.shortcuts), isMac)) continue
        // In a folder, pg↑ / pg↓ scroll the conversation as usual; in a text box they move the caret.
        if ((def.id === 'next' || def.id === 'prev') && (!onPage || typing)) continue
        e.preventDefault()
        run()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, app, recording])
}
