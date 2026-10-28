/**
 * Keyboard shortcuts, stored as Electron accelerators like in the user's other app (speak):
 * CommandOrControl is ctrl on Windows and Linux, cmd on macOS. Shown lowercase, terminal style
 * (ctrl+maj+entrée, cmd+k). Every shortcut can be changed in Réglages › Raccourcis clavier.
 */

export type CommandId =
  | 'marianne'
  | 'news'
  | 'procedures'
  | 'services'
  | 'next'
  | 'prev'
  | 'commands'
  | 'menu'
  | 'search'
  | 'settings'
  | 'sidebar'
  | 'lock'
  | 'fullscreen'
  | 'guide'
  | 'send'
  | 'stop'
  | 'edit'
  | 'retry'

export interface ShortcutDef {
  id: CommandId
  label: string
  group: 'Pages' | 'Fenêtres' | 'Application' | 'Conversation'
  accel: string
  /** macOS default, when it differs. */
  mac?: string
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'marianne', label: 'Parler à Marianne : nouveau dossier', group: 'Pages', accel: 'CommandOrControl+Enter' },
  { id: 'news', label: 'Actualités', group: 'Pages', accel: 'CommandOrControl+1' },
  { id: 'procedures', label: 'Démarches', group: 'Pages', accel: 'CommandOrControl+2' },
  { id: 'services', label: 'Services', group: 'Pages', accel: 'CommandOrControl+3' },
  { id: 'next', label: 'Page suivante (SUITE)', group: 'Pages', accel: 'PageDown' },
  { id: 'prev', label: 'Page précédente (RETOUR)', group: 'Pages', accel: 'PageUp' },
  { id: 'commands', label: 'Commandes', group: 'Fenêtres', accel: 'CommandOrControl+K' },
  // cmd+space is Spotlight on macOS, so the menu takes ctrl+space there.
  { id: 'menu', label: 'Menu de l’application (SOMMAIRE)', group: 'Fenêtres', accel: 'CommandOrControl+Space', mac: 'Control+Space' },
  { id: 'search', label: 'Chercher partout', group: 'Fenêtres', accel: 'CommandOrControl+Shift+Enter' },
  { id: 'settings', label: 'Réglages', group: 'Application', accel: 'CommandOrControl+,' },
  { id: 'sidebar', label: 'Replier la barre latérale', group: 'Application', accel: 'CommandOrControl+B' },
  { id: 'lock', label: 'Verrouiller la session', group: 'Application', accel: 'CommandOrControl+L' },
  { id: 'fullscreen', label: 'Plein écran', group: 'Application', accel: 'F11', mac: 'Control+CommandOrControl+F' },
  { id: 'guide', label: 'Aide de l’écran (GUIDE)', group: 'Application', accel: 'F1' },
  { id: 'send', label: 'Envoyer (ENVOI)', group: 'Conversation', accel: 'Enter' },
  { id: 'stop', label: 'Arrêter Marianne (ANNULATION)', group: 'Conversation', accel: 'Escape' },
  { id: 'edit', label: 'Modifier mon message (CORRECTION)', group: 'Conversation', accel: 'ArrowUp' },
  { id: 'retry', label: 'Refaire la réponse (RÉPÉTITION)', group: 'Conversation', accel: 'CommandOrControl+R' }
]

const BY_ID = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s])) as Record<CommandId, ShortcutDef>

/** The accelerator of a command, with the user's changes; anything else is taken as an accelerator already. */
export function accelOf(id: string, mac: boolean, custom: Record<string, string> = {}): string {
  const def = BY_ID[id as CommandId]
  if (!def) return id
  return custom[id] ?? ((mac && def.mac) || def.accel)
}

const KEY_LABELS: Record<string, string> = {
  Control: 'ctrl',
  Super: 'super',
  Shift: 'maj',
  Alt: 'alt',
  Enter: 'entrée',
  Space: 'espace',
  Escape: 'échap',
  PageDown: 'pg↓',
  PageUp: 'pg↑',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backspace: 'retour arrière',
  Tab: 'tab'
}

export function shortcutLabel(accel: string, mac: boolean): string {
  return accel
    .split('+')
    .map((t) => (t === 'CommandOrControl' ? (mac ? 'cmd' : 'ctrl') : (KEY_LABELS[t] ?? (/^F\d+$/.test(t) ? t : t.toLowerCase()))))
    .join('+')
}

export interface KeyLike {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export function matches(e: KeyLike, accel: string, mac: boolean): boolean {
  const parts = accel.split('+')
  const key = parts.pop() ?? ''
  const want = { ctrl: false, meta: false, shift: false, alt: false }
  for (const m of parts) {
    if (m === 'CommandOrControl') want[mac ? 'meta' : 'ctrl'] = true
    else if (m === 'Control') want.ctrl = true
    else if (m === 'Super') want.meta = true
    else if (m === 'Shift') want.shift = true
    else if (m === 'Alt') want.alt = true
  }
  if (e.ctrlKey !== want.ctrl || e.metaKey !== want.meta || e.shiftKey !== want.shift || e.altKey !== want.alt) return false
  // Digits by physical key, so ctrl+1 works on AZERTY keyboards too; the rest by the character typed.
  if (/^\d$/.test(key)) return e.code === `Digit${key}` || e.code === `Numpad${key}`
  if (key === 'Space') return e.code === 'Space' || e.key === ' '
  return e.key.toLowerCase() === key.toLowerCase()
}

const NAMED: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  PageDown: 'PageDown',
  PageUp: 'PageUp',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Escape: 'Escape'
}

/** The combination pressed while recording a new shortcut; null while only modifiers are down. */
export function pressedAccel(e: KeyLike, mac: boolean): string | null {
  const key = /^Digit\d$/.test(e.code)
    ? e.code.slice(5)
    : /^F\d{1,2}$/.test(e.code)
      ? e.code
      : (NAMED[e.code] ?? (e.key.length === 1 && e.key !== ' ' ? e.key.toUpperCase() : null))
  if (!key) return null
  const mods: string[] = []
  if (e.ctrlKey) mods.push(mac ? 'Control' : 'CommandOrControl')
  if (e.metaKey) mods.push(mac ? 'CommandOrControl' : 'Super')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  return [...mods, key].join('+')
}
