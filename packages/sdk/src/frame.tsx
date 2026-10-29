import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ServiceTab } from './index'

/**
 * A service's frame, which Marianne draws around its view: the 3615 header, and the tabs its
 * manifest declares (a bar fixed above the content, each tab with its function key). The view
 * says what the shown tab holds; it may add a few tools at the bar's end (ServiceTools) and a
 * count beside a tab (useTabBadges).
 */

export interface ServiceFrame {
  tabs: ServiceTab[]
  /** The tab shown: one of `tabs`, '' for a screen without tabs. */
  tab: string
  /** Show another tab, as a link of the content does ("toutes les vidéos ›"). */
  open(id: string): void
  /** Called whenever the user picks a tab (a click, its key), the one shown included. */
  subscribe(onPick: (id: string) => void): () => void
  setBadges(badges: Record<string, string>): void
  /** Where the view's tools go: the end of the tab bar, or of the header without tabs. */
  tools: HTMLElement | null
}

const NO_FRAME: ServiceFrame = { tabs: [], tab: '', open: () => undefined, subscribe: () => () => undefined, setBadges: () => undefined, tools: null }

const FrameContext = createContext<ServiceFrame>(NO_FRAME)

/** Marianne's side: gives a view its frame. */
export function ServiceFrameProvider({ frame, children }: { frame: ServiceFrame; children: ReactNode }) {
  return <FrameContext.Provider value={frame}>{children}</FrameContext.Provider>
}

/**
 * The tab shown, the tabs, and a way to show another. `onPick`: the user picked a tab, even the
 * one shown (a screen that opens panes over its tabs closes them, back to the tab's top).
 */
export function useTab(onPick?: (id: string) => void): { tab: string; tabs: ServiceTab[]; open: (id: string) => void } {
  const frame = useContext(FrameContext)
  const latest = useRef(onPick)
  latest.current = onPick
  const { subscribe } = frame
  useEffect(() => subscribe((id) => latest.current?.(id)), [subscribe])
  return { tab: frame.tab, tabs: frame.tabs, open: frame.open }
}

/** A short count beside tabs, by tab id ({ members: '3', videos: '2 à voir' }); an empty text, none. */
export function useTabBadges(badges: Record<string, string>): void {
  const { setBadges } = useContext(FrameContext)
  const key = JSON.stringify(badges)
  useEffect(() => {
    setBadges(JSON.parse(key) as Record<string, string>)
    return () => setBadges({})
  }, [key, setBadges])
}

/**
 * A few controls of the whole screen (a filter all its tabs follow), at the end of the tab bar,
 * or of the header for a screen without tabs. Keep them few: one or two small groups.
 */
export function ServiceTools({ children }: { children: ReactNode }) {
  const { tools } = useContext(FrameContext)
  return tools ? createPortal(children, tools) : null
}
