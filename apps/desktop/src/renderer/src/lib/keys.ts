import { useEffect, useState } from 'react'

/** What a key event says, of the key and its modifiers. */
export interface KeyPress {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * Whether the key pressed is one of `keys` (' ' for Space), alone: no Ctrl, Alt, Shift nor Cmd.
 * A page's own Enter or Space answers only these. With a modifier the key is one of the app's
 * shortcuts (ctrl+entrée, ctrl+espace), which skip a key a page has already taken.
 */
export function plainKey(e: KeyPress, ...keys: string[]): boolean {
  return keys.includes(e.key) && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey
}

/**
 * Which tab of a page F2, F3… open, by its place (F2 the first: F1 stays GUIDE), or null: another
 * key, a key with a modifier, or a page with fewer tabs. The same keys on a service's screen, a
 * domain's page, Démarches and Services.
 */
export function tabFromKey(e: KeyPress, count: number): number | null {
  const n = /^F([2-9])$/.exec(e.key)
  if (!n || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return null
  const index = Number(n[1]) - 2
  return index < count ? index : null
}

/** What a dialog reads of a key event before taking it. */
export interface DialogKey extends KeyPress {
  /** When it was pressed, on the clock of performance.now(). */
  timeStamp: number
  defaultPrevented: boolean
  /** The key held down, repeating. */
  repeat: boolean
}

/**
 * Whether a dialog drawn at `openedAt` (performance.now() then) takes this Entrée for its main
 * button. Not the Entrée that opened it: a page opening a dialog from its own keydown has it drawn,
 * its listener included, before that same keydown goes on to the window where the dialog listens,
 * and « avant d’ajouter » would add the service the user had only asked to see. Nor that Entrée
 * held down a little long, repeating, nor one a field took already.
 */
export function dialogEnter(e: DialogKey, openedAt: number): boolean {
  return plainKey(e, 'Enter') && !e.defaultPrevented && !e.repeat && e.timeStamp > openedAt
}

/**
 * Entrée in a dialog: its main button (`run`, null while it can't), unless the focus is on another
 * button, a link or a text box of several lines. Ctrl+Entrée stays the app's (a new folder).
 */
export function useDialogEnter(run: (() => void) | null): void {
  // Taken when the dialog is first drawn, not at each new `run`, which most dialogs make at each render.
  const [openedAt] = useState(() => performance.now())
  useEffect(() => {
    if (!run) return
    const key = (e: KeyboardEvent) => {
      if (!dialogEnter(e, openedAt) || (e.target as HTMLElement | null)?.closest?.('button, a, textarea')) return
      e.preventDefault()
      run()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [run, openedAt])
}
