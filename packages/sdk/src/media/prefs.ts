import type { TimeMode } from './time'
import type { MiniCorner } from './types'

/**
 * What the player remembers from one video to the next, on this computer: the time's mode, the
 * volume, the sound cut, the mini-player's corner. The speed starts again at normal. In the
 * window's localStorage (a community service's screen has its own).
 */
export interface MediaPrefs {
  time: TimeMode
  /** 0 to 1. */
  volume: number
  muted: boolean
  corner: MiniCorner
}

export const PREFS_KEY = 'marianne.media'

export const DEFAULT_PREFS: MediaPrefs = { time: 'video', volume: 1, muted: false, corner: 'br' }

const CORNERS: readonly string[] = ['tl', 'tr', 'bl', 'br']

/** The stored preferences, each one checked; what is missing or wrong is the default. */
export function parsePrefs(text: string | null | undefined): MediaPrefs {
  let raw: unknown
  try {
    raw = text ? JSON.parse(text) : null
  } catch {
    raw = null
  }
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const volume = typeof o.volume === 'number' && Number.isFinite(o.volume) ? Math.min(1, Math.max(0, o.volume)) : DEFAULT_PREFS.volume
  return {
    time: o.time === 'heure' || o.time === 'video' ? o.time : DEFAULT_PREFS.time,
    volume,
    muted: typeof o.muted === 'boolean' ? o.muted : DEFAULT_PREFS.muted,
    corner: typeof o.corner === 'string' && CORNERS.includes(o.corner) ? (o.corner as MiniCorner) : DEFAULT_PREFS.corner
  }
}

const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

let current: MediaPrefs | null = null
const listeners = new Set<(p: MediaPrefs) => void>()

export function readMediaPrefs(): MediaPrefs {
  if (!current) {
    let text: string | null = null
    try {
      text = storage()?.getItem(PREFS_KEY) ?? null
    } catch {
      // A storage that refuses (private mode, a sandbox): the defaults.
    }
    current = parsePrefs(text)
  }
  return current
}

/** Merges, stores, and tells every player of the window. */
export function saveMediaPrefs(patch: Partial<MediaPrefs>): MediaPrefs {
  current = parsePrefs(JSON.stringify({ ...readMediaPrefs(), ...patch }))
  try {
    storage()?.setItem(PREFS_KEY, JSON.stringify(current))
  } catch {
    // Kept for this window only.
  }
  for (const l of listeners) l(current)
  return current
}

export function onMediaPrefs(listener: (p: MediaPrefs) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
