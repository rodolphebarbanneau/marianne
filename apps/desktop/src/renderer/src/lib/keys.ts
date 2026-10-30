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
