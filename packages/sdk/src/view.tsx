import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ServiceManifest, ServiceMethods } from './index'

/**
 * @marianne/sdk/view: a service's screen. The package exports `View`, a React component that
 * Marianne shows under its 3615 header; everything it needs of the app comes through its host
 * (`useHost`): calls to its main side, its stored data, handing a question to Marianne, opening
 * a link. The window's look comes with the shared blocks (Spinner, Field, Modal) and Marianne's
 * stylesheet; a service adds its own styles in a CSS file its view imports.
 */

export * from './index'
export { Field, Modal, Spinner } from './ui'

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
  /** Another screen of the app, as in marianne: links ("settings/identity", "service/carte"). */
  openRoute(route: string): void
  /** A page in the system's browser. */
  openUrl(url: string): void
  copy(text: string, done?: string): void
  toast(text: string): void
  /** The user's data for this service (the same store as its main side's), in the encrypted archive. */
  load(key: string): Promise<unknown>
  save(key: string, value: unknown): Promise<void>
}

const HostContext = createContext<ServiceHost | null>(null)

/** Marianne's side: gives a view its host. */
export function ServiceHostProvider({ host, children }: { host: ServiceHost; children: ReactNode }) {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>
}

export function useHost<M extends ServiceMethods>(): ServiceHost<M> {
  const host = useContext(HostContext)
  if (!host) throw new Error('useHost outside a service screen')
  return host as unknown as ServiceHost<M>
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

/** The result of a method, loaded again when its arguments change (the previous one is dropped meanwhile); null arguments: nothing to load yet. */
export function useCall<M extends ServiceMethods, K extends keyof M & string>(method: K, args: Parameters<M[K]> | null): Loaded<Awaited<ReturnType<M[K]>>> {
  const host = useHost<M>()
  const [data, setData] = useState<Awaited<ReturnType<M[K]>> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [round, setRound] = useState(0)
  const key = args ? JSON.stringify(args) : null
  useEffect(() => {
    if (key === null) return
    let alive = true
    setData(null)
    setLoading(true)
    setError('')
    host
      .call(method, ...(JSON.parse(key) as Parameters<M[K]>))
      .then((v) => alive && setData(v))
      .catch((err: unknown) => alive && setError(errorText(err)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [host, method, key, round])
  const reload = useCallback(() => setRound((n) => n + 1), [])
  return { data, error, loading, reload }
}

/** Stored data with defaults until it is loaded; `update` merges, shows and stores. */
export function useStored<T extends object>(key: string, defaults: T): [T, (patch: Partial<T>) => void] {
  const host = useHost()
  const [value, setValue] = useState<T>(defaults)
  const current = useRef(value)
  const initial = useRef(defaults)
  useEffect(() => {
    let alive = true
    void host.load(key).then((stored) => {
      if (!alive || !stored || typeof stored !== 'object') return
      current.current = { ...initial.current, ...(stored as Partial<T>) }
      setValue(current.current)
    })
    return () => {
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
