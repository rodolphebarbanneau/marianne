import { app, BrowserWindow, webContents, type WebContents } from 'electron'
import { chat } from './chat'
import { session } from './session'

/**
 * What postpones the automatic lock: the user using Marianne. Any input Chromium hands one of her
 * pages counts (the window, the browser panel, a service's screen: a key, a click, a scroll, the
 * pointer moving over her window in front), as Chromium reports it from the input itself, so no
 * page can say the user is there when they are not; Marianne's own clicks on a site are the page's
 * script, not input. A reply she is writing counts too, since the lock would stop it. Behind other
 * windows and untouched, or with the user away, the lock comes after the minutes they chose.
 */

/** At most one postponement every few seconds: the pointer moving sends many events. */
const TOUCH_EVERY_MS = 5_000
/** How often a reply under way postpones the lock: well within the shortest delay, 5 minutes. */
const HOLD_EVERY_MS = 30_000

/** The pointer only passing over a window. */
const PASSING = new Set(['mouseMove', 'mouseEnter', 'mouseLeave'])

/** Whether an input says the user is using Marianne: any, except the pointer passing over her window behind another one. */
export function isUse(type: string | undefined, inFront: boolean): boolean {
  if (!type) return false
  return inFront || !PASSING.has(type)
}

export interface Presence {
  /** An input reached one of Marianne's pages. */
  input(type: string | undefined): void
  /** Called every HOLD_EVERY_MS: a reply under way keeps the archive open. */
  hold(): void
}

export interface PresenceDeps {
  now: () => number
  /** Postpones the lock (session.touch). */
  touch: () => void
  /** One of Marianne's windows has the focus. */
  inFront: () => boolean
  /** Marianne is answering in a folder. */
  answering: () => boolean
}

export function presence(deps: PresenceDeps): Presence {
  let last = -Infinity
  return {
    input(type) {
      if (!isUse(type, deps.inFront())) return
      const now = deps.now()
      if (now - last < TOUCH_EVERY_MS) return
      last = now
      deps.touch()
    },
    hold() {
      if (deps.answering()) deps.touch()
    }
  }
}

/** Watches every page Marianne opens, from before the first. */
export function watchPresence(): void {
  const p = presence({
    now: Date.now,
    touch: () => session.touch(),
    inFront: () => BrowserWindow.getFocusedWindow() !== null,
    answering: () => chat.answering()
  })
  const watch = (wc: WebContents) => wc.on('input-event', (_e, input) => p.input(input.type))
  for (const wc of webContents.getAllWebContents()) watch(wc)
  app.on('web-contents-created', (_e, wc) => watch(wc))
  setInterval(() => p.hold(), HOLD_EVERY_MS).unref()
}
