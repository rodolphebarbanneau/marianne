/**
 * The screen's keys, decided apart from the page so that they can be tested: ↓ ↑ choose a subject,
 * digits then Entrée open one by its number, échap closes what is open.
 */

/** An element, as far as the keys look at it (`Element.closest`). */
export interface KeyElement {
  closest(selector: string): unknown
}

/** What the screen shows, as far as its keys go. */
export interface KeyState {
  /** « à la une », nothing open, no search: ↓ ↑ choose, Entrée opens the chosen subject. */
  front: boolean
  /** A tab whose subjects have numbers, nothing open, no search: digits then Entrée open one. */
  numbered: boolean
  /** The digits typed so far. */
  typed: string
  /** Subjects opened over the tab. */
  open: number
}

export type KeyAction = 'clear' | 'close' | 'digit' | 'erase' | 'typed' | 'chosen' | 'down' | 'up' | null

/** A dialog or an overlay over the window (a Modal, the palette, the settings): its keys are its own. */
const OVER = '[role="dialog"], .modal, #root > .overlay'
const FIELD = 'input, textarea, select, [contenteditable]'
/** What Entrée already does something with: a button, a link. */
const PRESSABLE = 'button, a, [role="link"], [role="button"]'

/**
 * What a key does on the screen, given where it was pressed and where the focus is. The focus may be
 * anywhere in Marianne's frame (a tab just clicked, « toutes » in the tools at the tab bar's end):
 * the keys still work there; only a dialog over the window or a text field keeps them.
 */
export function keyAction(key: string, target: KeyElement | null, focus: KeyElement | null, s: KeyState): KeyAction {
  if (target?.closest?.(FIELD) || focus?.closest?.(FIELD)) return null
  if (focus?.closest?.(OVER) || target?.closest?.(OVER)) return null
  if (key === 'Escape') return s.typed ? 'clear' : s.open ? 'close' : null
  if (!s.numbered) return null
  if (/^\d$/.test(key)) return 'digit'
  if (key === 'Backspace') return s.typed ? 'erase' : null
  if (key === 'Enter') {
    // Digits typed: Entrée opens that subject, whatever has the focus (the tab just clicked, a row's button).
    if (s.typed) return 'typed'
    // Else the chosen subject, unless Entrée presses what has the focus.
    return s.front && !target?.closest?.(PRESSABLE) ? 'chosen' : null
  }
  if (s.front && key === 'ArrowDown') return 'down'
  if (s.front && key === 'ArrowUp') return 'up'
  return null
}
