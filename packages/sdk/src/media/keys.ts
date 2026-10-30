/** The player's keyboard: what a key does, given what the player is doing. */

/** What ←/→, J/L and the ±10 s keys move by. */
export const SKIP_MS = 10_000
/** What ↑/↓ change the volume by. */
export const VOLUME_STEP = 0.1

export type MediaAction =
  | { type: 'toggle' }
  | { type: 'skip'; ms: number }
  | { type: 'volume'; step: number }
  | { type: 'mute' }
  | { type: 'fullscreen' }
  | { type: 'mini' }
  | { type: 'speed'; step: 1 | -1 }
  /** 0–9: to 0 %–90 % of the video. */
  | { type: 'seekShare'; share: number }
  | { type: 'clip' }
  | { type: 'clipFrom' }
  | { type: 'clipTo' }
  | { type: 'clipKeep' }
  | { type: 'clipCancel' }
  | { type: 'live' }
  | { type: 'agenda' }
  /** Échap: the menu or the share panel closes. */
  | { type: 'close' }

export interface KeyState {
  /** A menu or the share panel is open. */
  popup?: boolean
  /** A clip is being cut. */
  clipping?: boolean
  /** Clips can be kept (the service takes them). */
  clips?: boolean
  live?: boolean
  /** The mini-player is there. */
  mini?: boolean
  /** Fullscreen, with an agenda to open. */
  agenda?: boolean
}

export interface KeyLike {
  key: string
  code?: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

/** The action of a key; null: not the player's (it goes on to the page). */
export function keyAction(e: KeyLike, s: KeyState = {}): MediaAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (e.key === 'Escape') return s.popup ? { type: 'close' } : s.clipping ? { type: 'clipCancel' } : null
  // The digits by their place: on a French keyboard the row without shift types & é " …
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code ?? '')?.[1] ?? (/^\d$/.test(e.key) ? e.key : null)
  if (digit !== null) return { type: 'seekShare', share: Number(digit) / 10 }
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (s.clipping) {
    if (key === 'i') return { type: 'clipFrom' }
    if (key === 'o') return { type: 'clipTo' }
    if (key === 'Enter') return { type: 'clipKeep' }
  }
  switch (key) {
    case ' ':
    case 'k':
      return { type: 'toggle' }
    case 'ArrowLeft':
    case 'j':
      return { type: 'skip', ms: -SKIP_MS }
    case 'ArrowRight':
    case 'l':
      return { type: 'skip', ms: SKIP_MS }
    case 'ArrowUp':
      return { type: 'volume', step: VOLUME_STEP }
    case 'ArrowDown':
      return { type: 'volume', step: -VOLUME_STEP }
    case 'm':
      return { type: 'mute' }
    case 'f':
      return { type: 'fullscreen' }
    case 'p':
      return s.mini ? { type: 'mini' } : null
    case '<':
      return { type: 'speed', step: -1 }
    case '>':
      return { type: 'speed', step: 1 }
    case 'x':
      return s.clips ? { type: 'clip' } : null
    case 'End':
      return s.live ? { type: 'live' } : null
    case 'o':
      return s.agenda ? { type: 'agenda' } : null
  }
  return null
}

/** A key typed in a field, a list or a button of its own is not the player's. */
export function ownsKeys(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return el.isContentEditable || !!el.closest('input, textarea, select, [contenteditable="true"], [role="listbox"], [role="menu"]')
}
