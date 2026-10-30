import '@fontsource/vt323/latin.css'
import '@fontsource/vt323/latin-ext.css'
import '@fontsource-variable/jetbrains-mono'
import '../renderer/src/styles.css'
import './runtime.css'
import { Component, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ServiceTab } from '@marianne/sdk'
import {
  Failure,
  Loading,
  LoadingGate,
  ServiceFrameProvider,
  ServiceHostProvider,
  type ServiceFrame,
  type ServiceHost,
  type ServiceKey
} from '@marianne/sdk/view'
import { readToFrame, type FrameHost, type FrameLook, type FrameMedia, type FromFrame, type ScreenBridge } from '../shared/community'
import { removeConnections } from './isolate'

/**
 * Marianne's view runtime, in a community service's screen (view.html, in a view of its own over
 * the window's content): it loads the service's view.js and view.css, and gives its View what a
 * built-in screen gets — its host (calls to its main side, its stored data, the app's hand) and
 * its frame (the tab shown, its badges, its tools, the window's search field, its keys in the
 * bottom bar) — each a message through the bridge to the main
 * process, which checks it and answers, or hands it to the window. Marianne's stylesheet and fonts
 * are here, and the window's look follows (theme, text size). The service's `react` and
 * `@marianne/sdk/view` are this runtime's own (the page's import map): one React, one SDK, so its
 * hooks read the providers given here.
 */

removeConnections()

const bridge = (window as unknown as { __marianneScreen?: ScreenBridge }).__marianneScreen

/** A message to the main process; one that can't be sent (a function in it) fails the request. */
const post = (m: FromFrame) => bridge?.post(m)

let nextId = 1
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

type Request = { type: 'call'; method: string; args: unknown[] } | { type: 'load'; key: string } | { type: 'save'; key: string; value: unknown }

function request(m: Request): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    waiting.set(id, { resolve, reject })
    try {
      post({ ...m, id } as FromFrame)
    } catch {
      waiting.delete(id)
      reject(new Error('seules des données simples passent à Marianne'))
    }
  })
}

interface FrameState {
  host: FrameHost | null
  tabs: ServiceTab[]
  tab: string
  barred: boolean
  /** What the window's search field holds (a manifest with `search`). */
  query: string
}

let state: FrameState = { host: null, tabs: [], tab: '', barred: false, query: '' }

/**
 * The app's mini-player, as the window last said, and a video this screen pinned as its view left
 * it (the window shows it a moment later): `take` answers from these at once, without waiting for
 * the window, and tells it.
 */
let media: FrameMedia = { can: false, pinned: null }
let leftAt: { src: string; at: number; when: number } | null = null
/** As the window waits before showing a pin from a page that leaves (renderer/src/app/pinned.ts). */
const LEFT_MS = 300

function take(src: string): number | null {
  const left = leftAt?.src === src && Date.now() - leftAt.when < LEFT_MS ? leftAt : null
  const at = left?.at ?? (media.pinned?.src === src ? media.pinned.at : null)
  leftAt = null
  if (at === null) return null
  media = { ...media, pinned: null }
  post({ type: 'take', src })
  return at
}
const subscribers = new Set<() => void>()
const picks = new Set<(id: string) => void>()
const update = (patch: Partial<FrameState>) => {
  state = { ...state, ...patch }
  for (const fn of subscribers) fn()
}
const subscribe = (fn: () => void) => {
  subscribers.add(fn)
  return () => void subscribers.delete(fn)
}

/** The window's look: its theme, its CRT effect (the text's glow; the window draws the lines), its text size. */
function applyLook(look: FrameLook): void {
  const root = document.documentElement
  if (typeof look.theme === 'string') root.dataset.theme = look.theme
  root.dataset.crt = look.crt === true ? 'on' : 'off'
  if (typeof look.platform === 'string') root.dataset.platform = look.platform
  if (typeof look.fontSize === 'number' && Number.isFinite(look.fontSize)) root.style.setProperty('--text-size', `${look.fontSize}px`)
}

bridge?.onMessage((data) => {
  const m = readToFrame(data)
  if (!m) return
  switch (m.type) {
    case 'reply': {
      const w = waiting.get(m.id)
      if (!w) return
      waiting.delete(m.id)
      if (m.error !== undefined) w.reject(new Error(m.error))
      else w.resolve(m.ok)
      return
    }
    case 'init':
      applyLook(m.look)
      if (m.media) media = m.media
      return update({ host: m.host, tabs: m.tabs, tab: m.tab, barred: m.barred, query: m.query ?? '' })
    case 'media': {
      const can = media.can
      media = m.media
      // A host with the mini-player, or without: the view gets a new one.
      return can !== m.media.can && state.host ? update({ host: { ...state.host } }) : undefined
    }
    case 'leave':
      // The screen goes: its view unmounts (a video playing pins itself on the way).
      return root?.unmount()
    case 'host':
      return update({ host: m.host })
    case 'look':
      return applyLook(m.look)
    case 'query':
      return update({ query: m.query })
    case 'tab':
      update({ tab: m.tab })
      if (m.picked) for (const fn of picks) fn(m.tab)
  }
})

const typing = (target: EventTarget | null) => !!(target as Element | null)?.closest?.('input, textarea, select, [contenteditable]')

// The way back (échap), when the screen doesn't use it: no dialog of its own open, nothing typed in;
// « / » likewise, to the window's search field when the manifest declares one.
// F1 to F9 never reach the page: the main process hands them to the window.
window.addEventListener('keydown', (e) => {
  const slash = e.key === '/' && !!state.host?.manifest.search
  if ((e.key !== 'Escape' && !slash) || e.ctrlKey || e.altKey || e.metaKey || (e.shiftKey && !slash)) return
  if (document.querySelector('#root > .overlay') || e.defaultPrevented || typing(e.target)) return
  if (slash) e.preventDefault()
  post({ type: 'key', key: e.key })
})

function hostOf(h: FrameHost): ServiceHost {
  return {
    manifest: h.manifest,
    params: h.params,
    home: h.home,
    call: ((method: string, ...args: unknown[]) => request({ type: 'call', method, args })) as ServiceHost['call'],
    ask: (text, page) => post({ type: 'ask', text, ...(page ? { page: { url: page.url, title: page.title, text: page.text } } : {}) }),
    openRoute: (route, params) => post({ type: 'route', route, ...(params ? { params } : {}) }),
    openUrl: (url) => post({ type: 'url', url }),
    copy: (text, done) => post({ type: 'copy', text, ...(done ? { done } : {}) }),
    toast: (text) => post({ type: 'toast', text }),
    load: (key) => request({ type: 'load', key }),
    save: (key, value) => request({ type: 'save', key, value }).then(() => undefined),
    // The app's mini-player, when its videos are of a host the window plays from.
    ...(media.can
      ? {
          media: {
            pin: (item, opts) => {
              const auto = !!opts?.auto
              if (auto) leftAt = { src: item.src, at: item.at, when: Date.now() }
              post({ type: 'pin', item: { ...item }, auto })
            },
            take
          }
        }
      : {})
  }
}

/** A view that throws: the screen says so, rather than going blank. */
class Boundary extends Component<{ children: ReactNode }, { error: string }> {
  override state = { error: '' }
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
  override render() {
    return this.state.error ? <Failure title="Écran indisponible" error={this.state.error} retry={() => this.setState({ error: '' })} /> : this.props.children
  }
}

function Screen({ View }: { View: ComponentType }) {
  const s = useSyncExternalStore(subscribe, () => state)
  const [tools, setTools] = useState<HTMLElement | null>(null)
  const body = useRef<HTMLDivElement>(null)
  // A new host when what it carries changes, as the window gives a built-in screen: views read again with it.
  const host = useMemo(() => (s.host ? hostOf(s.host) : null), [s.host])
  const open = useCallback((id: string) => post({ type: 'open', tab: id }), [])
  const onPick = useCallback((fn: (id: string) => void) => {
    picks.add(fn)
    return () => void picks.delete(fn)
  }, [])
  const setBadges = useCallback((badges: Record<string, string>) => post({ type: 'badges', badges }), [])
  // The field is the window's: what it holds comes back as the query, filled there at once.
  const setQuery = useCallback((text: string) => post({ type: 'query', text }), [])
  const setKeys = useCallback((keys: ServiceKey[]) => post({ type: 'keys', keys: keys.map((k) => ({ key: k.key, what: k.what, shortcut: k.shortcut })) }), [])
  const frame = useMemo<ServiceFrame>(
    () => ({ tabs: s.tabs, tab: s.tab, open, subscribe: onPick, setBadges, tools, query: s.query, setQuery, setKeys }),
    [s.tabs, s.tab, open, onPick, setBadges, tools, s.query, setQuery, setKeys]
  )
  // A new tab: back to its top.
  useEffect(() => {
    void body.current?.scrollTo(0, 0)
  }, [s.tab])
  if (!host) return <Loading />
  return (
    <div className={`service-body community-body${s.barred ? ' barred' : ''}`} ref={body}>
      <div className="service-content">
        {/* Its tools: the window's tab bar is out of reach, so they head the screen. */}
        <div className="community-tools">
          <span className="service-tools" ref={setTools} />
        </div>
        <ServiceHostProvider host={host}>
          <ServiceFrameProvider frame={frame}>
            <Boundary>
              <LoadingGate tab={s.tab}>
                <View />
              </LoadingGate>
            </Boundary>
          </ServiceFrameProvider>
        </ServiceHostProvider>
      </div>
    </div>
  )
}

let root: Root | null = null

async function boot(): Promise<void> {
  const view = createRoot(document.getElementById('root')!)
  root = view
  post({ type: 'hello' })
  // The service's own styles, after Marianne's.
  const css = document.createElement('link')
  css.rel = 'stylesheet'
  css.href = new URL('../view.css', location.href).href
  document.head.append(css)
  try {
    const loaded = (await import(/* @vite-ignore */ new URL('../view.js', location.href).href)) as { View?: unknown }
    if (typeof loaded.View !== 'function') throw new Error('view.js n’exporte pas d’écran (export function View).')
    view.render(<Screen View={loaded.View as ComponentType} />)
  } catch (err) {
    view.render(<Failure title="Écran indisponible" error={err instanceof Error ? err.message : String(err)} />)
  }
}

void boot()
