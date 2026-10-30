import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CallCache, callKey } from './calls'
import type { ServiceManifest, ServiceMethods } from './index'
import type { PinnedMedia } from './media/types'
import { WaitContext } from './ui'

/**
 * @marianne/sdk/view: a service's screen. The package exports `View`, a React component that
 * Marianne shows in its frame: the 3615 header, and the tabs its manifest declares (`useTab` says
 * which one is shown). Everything it needs of the app comes through its host (`useHost`): calls to
 * its main side, its stored data, handing a question to Marianne, opening a link. The window's look
 * comes with the shared blocks (Loading, Failure, Notice, Spinner, Field, Modal), the pictures of
 * the palette (Pixels, ServiceIcon) and Marianne's stylesheet; a service adds its own styles in a
 * CSS file its view imports.
 */

export * from './index'
export { ServiceFrameProvider, ServiceTools, useKeys, useSearch, useTab, useTabBadges, type ServiceFrame, type ServiceKey } from './frame'
export { Failure, Field, floating, Loading, LoadingGate, Meter, Modal, Notice, Spinner, StickyPanel } from './ui'
export { ICON_CELLS, Pixels, ServiceIcon, usePixelRatio } from './pixels'

/** Something a service hands to Marianne with a question: a page it shows. */
export interface ShownPage {
  url: string
  title: string
  text: string
}

export interface ServiceHost<M extends ServiceMethods = ServiceMethods> {
  manifest: ServiceManifest
  /** A method of the service's main side. */
  call<K extends keyof M & string>(method: K, ...args: Parameters<M[K]>): Promise<Awaited<ReturnType<M[K]>>>
  /** What the screen was opened with: a link it handles ({ url }), a line of "Aujourd'hui"… */
  params: Record<string, string | number>
  /** The commune of the user's address, when the profile has one. */
  home: { code: string; name: string; postcode: string; latitude?: number; longitude?: number } | null
  /** Hand a question to Marianne: a new folder, the question ready in the composer. */
  ask(text: string, page?: ShownPage): void
  /**
   * Another screen of the app, as in marianne: links ("settings/identity", "service/carte"), with
   * what it opens with: `openRoute('service/infos', { search: 'budget 2027' })` opens 3615 INFOS
   * with its search field filled; "settings/identity#sources" scrolls Réglages to a section.
   */
  openRoute(route: string, params?: Record<string, string | number>): void
  /** A page in the system's browser. */
  openUrl(url: string): void
  copy(text: string, done?: string): void
  toast(text: string): void
  /** The user's data for this service (the same store as its main side's), in the encrypted archive. */
  load(key: string): Promise<unknown>
  save(key: string, value: unknown): Promise<void>
  /**
   * The app's mini-player (absent in tests and old hosts): a video keeps playing in a corner of the
   * window. `pin` hands it over (`auto`: the page is leaving; the app waits a moment, in case the
   * same video comes back at once). `take` hands it back: when the mini-player shows `src` (or is
   * about to), the app closes it and says where it was, ms; null otherwise. `playing`: the page's
   * `src` started playing; the mini-player, showing another video or about to, closes (one video
   * at a time). A `Player` calls `take` then `playing` as it plays.
   */
  media?: { pin(item: PinnedMedia, opts?: { auto?: boolean }): void; take(src: string): number | null; playing(src: string): void }
}

const HostContext = createContext<ServiceHost | null>(null)

/** Marianne's side: gives a view its host. */
/** What the screen's calls answered (calls.ts): one per screen, and anew when its host changes (an access given or taken back). */
const CallsContext = createContext<CallCache | null>(null)

export function ServiceHostProvider({ host, children }: { host: ServiceHost; children: ReactNode }) {
  const calls = useMemo(() => new CallCache(), [host])
  return (
    <HostContext.Provider value={host}>
      <CallsContext.Provider value={calls}>{children}</CallsContext.Provider>
    </HostContext.Provider>
  )
}

export function useHost<M extends ServiceMethods>(): ServiceHost<M> {
  const host = useContext(HostContext)
  if (!host) throw new Error('useHost outside a service screen')
  return host as unknown as ServiceHost<M>
}

/** The host, or null outside a service screen: for blocks that also work elsewhere (the media player). */
export function useHostOptional<M extends ServiceMethods>(): ServiceHost<M> | null {
  return useContext(HostContext) as unknown as ServiceHost<M> | null
}

/** The message of an error that came back from the main side. */
export function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export interface Loaded<T> {
  data: T | null
  error: string
  loading: boolean
  reload: () => void
}

/**
 * The result of a method, loaded again when its arguments change (the previous one is dropped
 * meanwhile); null arguments: nothing to load yet. Loaded again with the same arguments (`reload`,
 * a new host), it keeps showing the previous result until the new one comes, without holding the
 * tab back. A call the screen already made (a tab picked again) shows its last answer from the first
 * paint, and is asked again behind it.
 */
export function useCall<M extends ServiceMethods, K extends keyof M & string>(method: K, args: Parameters<M[K]> | null): Loaded<Awaited<ReturnType<M[K]>>> {
  const host = useHost<M>()
  const waits = useContext(WaitContext)
  const calls = useContext(CallsContext)
  const key = args ? JSON.stringify(args) : null
  // What the screen had for this call is there from the first paint: a tab picked again doesn't flash empty.
  const [data, setData] = useState(() => (key === null ? null : ((calls?.get(callKey(method, key))?.value ?? null) as Awaited<ReturnType<M[K]>> | null)))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [round, setRound] = useState(0)
  /** The call whose answer is on screen. */
  const answered = useRef<string | null>(null)
  const rounds = useRef(round)
  useEffect(() => {
    if (key === null) return
    let alive = true
    const id = callKey(method, key)
    // A part that mounts again (its tab picked again) shows what the screen had at once, and asks
    // again behind it. A reload asks and waits, as the first time, its answer kept meanwhile.
    const reloading = rounds.current !== round
    rounds.current = round
    const kept = reloading ? null : (calls?.get(id) ?? null)
    if (kept) {
      setData(kept.value as Awaited<ReturnType<M[K]>>)
      setLoading(false)
      answered.current = id
    } else {
      if (answered.current !== id) setData(null)
      setLoading(true)
    }
    setError('')
    // Only a call with nothing on screen holds the tab back: one asked again behind its answer (a
    // reload every few minutes) doesn't keep a tab the user picks meanwhile waiting.
    const came = answered.current === id ? undefined : waits?.hold()
    host
      .call(method, ...(JSON.parse(key) as Parameters<M[K]>))
      .then((v) => {
        calls?.set(id, v)
        if (!alive) return
        answered.current = id
        setData(v)
      })
      // Asked again behind what it showed: a failure then leaves it shown.
      .catch((err: unknown) => alive && !kept && setError(errorText(err)))
      .finally(() => {
        if (alive && !kept) setLoading(false)
        came?.()
      })
    return () => {
      alive = false
      came?.()
    }
  }, [host, method, key, round, waits, calls])
  const reload = useCallback(() => setRound((n) => n + 1), [])
  return { data, error, loading, reload }
}

/** Stored data with defaults until it is loaded; `update` merges, shows and stores. */
export function useStored<T extends object>(key: string, defaults: T): [T, (patch: Partial<T>) => void] {
  const host = useHost()
  const waits = useContext(WaitContext)
  const [value, setValue] = useState<T>(defaults)
  const current = useRef(value)
  const initial = useRef(defaults)
  useEffect(() => {
    let alive = true
    const came = waits?.hold()
    void host
      .load(key)
      .then((stored) => {
        if (!alive || !stored || typeof stored !== 'object') return
        current.current = { ...initial.current, ...(stored as Partial<T>) }
        setValue(current.current)
      })
      .finally(() => came?.())
    return () => {
      came?.()
      alive = false
    }
  }, [host, key])
  const update = useCallback(
    (patch: Partial<T>) => {
      current.current = { ...current.current, ...patch }
      setValue(current.current)
      void host.save(key, current.current)
    },
    [host, key]
  )
  return [value, update]
}

/** A value that follows another after a pause: a search as the user types, not at each key. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

/** The time, kept fresh (every minute by default): what is open, or left to pay, changes with it. */
export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}
