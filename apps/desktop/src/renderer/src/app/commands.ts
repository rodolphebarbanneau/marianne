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
      reload: app.reload,
      guide: () => app.openGuide(!app.guideOpen),
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
      // A key the page took already (the video player's space, arrows, letters): not a shortcut too.
      if (e.defaultPrevented) return
      const field = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')
      const typing = !!field
      // A dialog over the page (the palette, the settings, the guide, a page's or a service's own) keeps échap and the page keys.
      const dialog = !!document.querySelector('#root > .overlay')
      const onPage = app.view.kind !== 'folder' && !app.palette && !app.settingsPage && !app.guideOpen && !dialog
      // SUITE / RETOUR work from the pages' text boxes too (the composer keeps what was written); a list
      // keeps its keys, and so do a dashboard's and a service's forms, which would lose what was typed.
      const turning = onPage && (!field || (app.view.kind === 'page' && (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)))
      // RETOUR: from a domain's dashboard or a service's screen, échap goes back to its page.
      // A screen that took échap for itself (closing a pane it opened) keeps it.
      if (onPage && !typing && e.key === 'Escape' && !e.defaultPrevented && (app.view.kind === 'domain' || app.view.kind === 'service')) {
        e.preventDefault()
        app.step('prev')
        return
      }
      // ctrl+↓ / ctrl+↑ also change page, for keyboards without page keys.
      if (turning && e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        app.step(e.key === 'ArrowDown' ? 'next' : 'prev')
        return
      }
      for (const def of SHORTCUTS) {
        const run = actions[def.id]
        if (!run || !matches(e, accelOf(def.id, isMac, app.config.shortcuts), isMac)) continue
        // In a folder, pg↑ / pg↓ scroll the conversation (the folder handles them).
        if ((def.id === 'next' || def.id === 'prev') && !turning) continue
        e.preventDefault()
        run()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, app, recording])
}
