import { tabKey, type ServiceState } from '@marianne/sdk'
import type { ServiceKey } from '@marianne/sdk/view'
import type { Actions } from '../app/commands'

/**
 * What Marianne's frame does around a service's view, apart from drawing it (screen.tsx): when the
 * view shows, its search field (« / » reaches it, échap empties it), and what the bottom bar says.
 */

/** The pause after the last letter typed before the query reaches the view. */
export const SEARCH_PAUSE_MS = 250

/** A Minitel key of the bottom bar: [key, shortcut, what it does, command when clicked]. */
export type BarKey = [string, string, string, keyof Actions | (() => void) | null]

/**
 * What a service's screen adds to the bottom bar after Marianne's keys: its tabs (SUITE), its
 * frame's search field (CHERCHER, or ANNULATION while the field has the focus) and its own keys (useKeys).
 */
export interface ServiceBar {
  tabs: number
  search: { what: string; focused: boolean; focus: () => void } | null
  keys: ServiceKey[]
}

/**
 * Whether the service's view shows: added, reviewed, on, started, its connections on, and the
 * profile's fields it asks for answered. Before that, the frame draws neither its tabs nor its search.
 */
export function viewShows(state: ServiceState, hasView: boolean): boolean {
  return (
    state.added &&
    !state.reviewedVersion &&
    state.available &&
    state.on &&
    !state.error &&
    !(state.access.asked.length > 0 && state.access.granted === null) &&
    hasView
  )
}

/** What the search field starts with: the screen's params.search (an opened route), else nothing. */
export const searchOf = (params: Record<string, string | number>): string => (params.search === undefined ? '' : String(params.search))

/** « / » reaches the field, unless the user is typing somewhere already or holds a modifier (shift aside: « / » needs it on some keyboards). */
export const opensSearch = (e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey'>, typing: boolean): boolean =>
  e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey && !typing

/**
 * A service's screen in the bottom bar: Marianne's keys (the way back, the tabs, the menu, the
 * guide), its frame's search, then the screen's own. While the search field has the focus, échap
 * empties it instead of going back, and the screen's keys wait: what is typed goes to the field. A
 * screen key on échap (« fermer le sujet ») stands in for the way back.
 */
export function serviceKeys(bar: ServiceBar | null, menu: BarKey[]): BarKey[] {
  const tabs: BarKey[] = bar && bar.tabs > 1 ? [['SUITE', `${tabKey(0)}…${tabKey(bar.tabs - 1)}`, 'onglets', null]] : []
  if (bar?.search?.focused) return [['ANNULATION', 'Escape', 'effacer la recherche', null], ...tabs, ...menu]
  // A screen that takes échap itself (closing what it opened over a tab) says so instead of the way back.
  const ownBack = (bar?.keys ?? []).some((k) => /^(échap|escape)$/i.test(k.shortcut))
  return [
    ...(ownBack ? [] : [['RETOUR', 'Escape', 'Services', 'prev'] satisfies BarKey]),
    ...tabs,
    ...menu,
    ...(bar?.search ? [['CHERCHER', '/', bar.search.what, bar.search.focus] satisfies BarKey] : []),
    ...(bar?.keys ?? []).map((k): BarKey => [k.key, k.shortcut, k.what, null])
  ]
}
