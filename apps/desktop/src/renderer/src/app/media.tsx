import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MiniPlayer, onMediaPrefs, readMediaPrefs, saveMediaPrefs, type MiniCorner, type PinnedMedia } from '@marianne/sdk/media'
import type { ServiceHost } from '@marianne/sdk/view'
import { ownRoute } from '@shared/community'
import { Boundary } from '../components/ui'
import { useServices } from '../host'
import { api } from '../lib/api'
import { useApp } from './context'
import { backTo, PinnedDesk } from './pinned'

type HostMedia = NonNullable<ServiceHost['media']>

interface MediaValue {
  /** What the mini-player shows. */
  item: PinnedMedia | null
  corner: MiniCorner
  /** `host.media` of a built-in screen. */
  media: HostMedia
  desk: PinnedDesk
  /** Whether the window plays a video from this host (its content policy: the built-in services' hosts). */
  playable(hostname: string): boolean
}

const MediaContext = createContext<MediaValue | null>(null)

export function useMedia(): MediaValue {
  const value = useContext(MediaContext)
  if (!value) throw new Error('useMedia outside MediaProvider')
  return value
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * The app's mini-player: a video a screen hands over (`host.media.pin`) goes on in a corner of the
 * window, over any page, until the user closes it, goes back to its page, or a page takes it back
 * (`host.media.take`). Community screens reach it through the bridge.
 */
export function MediaProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<PinnedMedia | null>(null)
  // A take comes from a player's first render: what shows changes once that render is done.
  const [desk] = useState(() => new PinnedDesk((next) => queueMicrotask(() => setItem(next))))
  const [corner, setCorner] = useState<MiniCorner>(() => readMediaPrefs().corner)
  useEffect(() => onMediaPrefs((p) => setCorner(p.corner)), [])
  useEffect(() => () => desk.close(), [desk])

  // The window's content policy lets it reach the built-in services' hosts only: a community
  // service's video plays here only from one of those.
  const services = useServices()
  const hostsKey = services
    .filter((s) => s.builtIn)
    .flatMap((s) => s.manifest.hosts)
    .sort()
    .join(' ')
  const hosts = useMemo(() => new Set(hostsKey.split(' ').filter(Boolean)), [hostsKey])
  const playable = useCallback((hostname: string) => hosts.has(hostname), [hosts])

  // A community screen's pin and take, checked by the main process already (its declared hosts, its own screen).
  const latest = useRef(playable)
  latest.current = playable
  useEffect(
    () =>
      api.onCommunityScreen(({ code, message }) => {
        if (message.type === 'take') return void desk.take(message.src, (it) => ownRoute(code, it.route))
        if (message.type !== 'pin' || !ownRoute(code, message.item.route) || !latest.current(hostOf(message.item.src))) return
        const { poster, ...rest } = message.item
        desk.pin({ ...rest, ...(poster && latest.current(hostOf(poster)) ? { poster } : {}) }, { auto: message.auto })
      }),
    [desk]
  )

  const media = useMemo<HostMedia>(() => ({ pin: (it, opts) => desk.pin(it, opts), take: (src) => desk.take(src) }), [desk])
  const value = useMemo<MediaValue>(() => ({ item, corner, media, desk, playable }), [item, corner, media, desk, playable])
  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>
}

/** The mini-player itself, in the screen's area (`.main`): its bottom corners above a folder's reply box. */
export function MiniArea() {
  const { item, corner, desk } = useMedia()
  const { view, openRoute } = useApp()
  const area = useRef<HTMLDivElement>(null)
  const [bottom, setBottom] = useState(0)
  const folder = view.kind === 'folder'
  const shown = !!item
  useLayoutEffect(() => {
    setBottom(0)
    if (!folder || !shown) return
    // The folder may still be loading: its dock is looked for until it comes.
    let observer: ResizeObserver | null = null
    const find = () => {
      const dock = area.current?.parentElement?.querySelector<HTMLElement>('.dock')
      if (!dock) return false
      observer = new ResizeObserver(() => setBottom(dock.offsetHeight))
      observer.observe(dock)
      setBottom(dock.offsetHeight)
      return true
    }
    const timer = find() ? undefined : setInterval(() => find() && clearInterval(timer), 400)
    return () => {
      clearInterval(timer)
      observer?.disconnect()
    }
  }, [folder, view, shown])

  return (
    <div className="mini-area" ref={area}>
      {item && (
        <Boundary label="le mini-lecteur">
          <MiniPlayer
            key={item.src}
            media={item}
            corner={corner}
            bottom={bottom}
            onCorner={(c) => saveMediaPrefs({ corner: c })}
            onTime={(ms) => desk.time(ms)}
            onClose={() => desk.close()}
            onExpand={(at) => {
              desk.close()
              const back = backTo(item, at)
              openRoute(back.route, back.params)
            }}
          />
        </Boundary>
      )}
    </div>
  )
}
