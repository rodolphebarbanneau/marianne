import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { serviceCode } from '@marianne/sdk'
import type { ServiceFrame, ServiceHost } from '@marianne/sdk/view'
import { ownRoute, type FrameHost, type FrameLook, type FrameMedia, type FromFrame, type ToFrame } from '@shared/community'
import { useApp } from '../app/context'
import { useMedia } from '../app/media'
import { roomBeside } from '../app/pinned'
import { Modal } from '../components/ui'
import { api } from '../lib/api'
import { overlay } from '../lib/overlay'

const rect = (el: Element) => {
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
}

/** The box, short of the mini-player when it is over it: the screen drawn over the window would hide it. */
const placeOf = (el: HTMLElement) => {
  const mini = document.querySelector('.mini-area > .mini')
  return roomBeside(rect(el), mini ? rect(mini) : null)
}

/** The mini-player's state goes to the screen this often while it plays: where it is, for a take. */
const MEDIA_EVERY_MS = 2000

/** Whether something is fullscreen in the window (the mini-player): the screen drawn over it would hide it. */
function useFullscreenOn(): boolean {
  const [on, setOn] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const change = () => setOn(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', change)
    return () => document.removeEventListener('fullscreenchange', change)
  }, [])
  return on
}

/**
 * A community service's screen. Its view runs out of this page, in a view of its own that the main
 * process draws over this box (main/community/runtime/screen.ts), as the built-in browser is: here
 * is the box, where it goes (none while a dialog, the palette or the settings cover it), and the
 * window's part of the bridge: what the screen is opened with (its params, its tabs, the window's
 * look, what the frame's search field holds) and what it asks of the window — a question for
 * Marianne, another screen, a tab, a toast, a key, its keys for the bottom bar, the search field
 * filled, and a link, which opens only once the user agrees. Its calls and data never come here:
 * the main process answers them. The app's mini-player is drawn in the window, so the box stops
 * short of it, and the screen hears what it shows (its pins, takes and plays go to app/media.tsx).
 */
export function CommunityScreen({ host, frame, barred }: { host: ServiceHost; frame: ServiceFrame; barred: boolean }) {
  const app = useApp()
  const code = host.manifest.id
  const box = useRef<HTMLDivElement>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const dialog = useSyncExternalStore(overlay.subscribe, overlay.get)
  const fullscreen = useFullscreenOn()
  const covered = !!app.palette || !!app.settingsPage || app.guideOpen || dialog || !!opening || fullscreen
  const hidden = useRef(covered)
  hidden.current = covered
  const { theme, crt, fontSize } = app.config.ui
  const look = useMemo<FrameLook>(() => ({ theme, crt, fontSize, platform: api.platform }), [theme, crt, fontSize])
  // Its home is the main process's to give (the commune only): the screen gets its params from here.
  const frameHost = useMemo<FrameHost>(() => ({ manifest: host.manifest, params: host.params, home: null }), [host])
  // The app's mini-player: whether this service's videos may go there, and the one it shows when
  // this service pinned it (what the user watches from another service is none of its business).
  const { item, corner, desk, playable } = useMedia()
  const can = host.manifest.hosts.some(playable)
  const mine = !!item && ownRoute(code, item.route)
  const mediaOf = (): FrameMedia => ({ can, pinned: item && mine ? { src: item.src, at: desk.position } : null })
  const latest = useRef({ host, frame, look, frameHost, barred, mediaOf })
  latest.current = { host, frame, look, frameHost, barred, mediaOf }
  const post = (message: ToFrame) => api.communityScreenPost(code, message)

  // Opened with what it shows; closed when the screen goes.
  useEffect(() => {
    api.communityScreenOpen(code)
    const { frameHost: h, frame: f, look: l, barred: b, mediaOf: m } = latest.current
    api.communityScreenPost(code, { type: 'init', host: h, tabs: f.tabs, tab: f.tab, barred: b, look: l, media: m(), query: f.query })
    return () => api.communityScreenClose(code)
  }, [code])
  useEffect(() => {
    post({ type: 'media', media: latest.current.mediaOf() })
    if (!item) return
    const timer = setInterval(() => post({ type: 'media', media: latest.current.mediaOf() }), MEDIA_EVERY_MS)
    return () => clearInterval(timer)
  }, [can, item]) // eslint-disable-line react-hooks/exhaustive-deps

  // Where the main process draws it; nowhere while something covers it.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const report = () => !hidden.current && api.communityScreenBounds(placeOf(el))
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
      api.communityScreenBounds(null)
    }
  }, [])
  // Again when the mini-player comes, goes or moves to another corner.
  useLayoutEffect(() => {
    if (covered) api.communityScreenBounds(null)
    else if (box.current) api.communityScreenBounds(placeOf(box.current))
  }, [covered, item, corner])

  useEffect(() => post({ type: 'host', host: frameHost }), [frameHost]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => post({ type: 'look', look }), [look]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => post({ type: 'tab', tab: frame.tab, picked: false }), [frame.tab]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => post({ type: 'query', query: frame.query }), [frame.query]) // eslint-disable-line react-hooks/exhaustive-deps
  const { subscribe } = frame
  useEffect(() => subscribe((tab) => post({ type: 'tab', tab, picked: true })), [subscribe]) // eslint-disable-line react-hooks/exhaustive-deps
  // The window's toasts would be under the screen: drawn over the bottom bar while it shows (styles.css), never in it.
  useEffect(() => {
    document.documentElement.dataset.communityScreen = 'on'
    return () => void delete document.documentElement.dataset.communityScreen
  }, [])

  // What the screen asks of the window, checked by the main process already.
  useEffect(
    () =>
      api.onCommunityScreen(({ code: from, message }: { code: string; message: FromFrame }) => {
        if (from !== code) return
        const { host: h, frame: f } = latest.current
        switch (message.type) {
          case 'ask':
            return h.ask(message.text, message.page && { url: message.page.url, title: message.page.title, text: message.page.text })
          case 'route':
            return h.openRoute(message.route, message.params)
          case 'url':
            return setOpening(message.url)
          case 'toast':
            return h.toast(message.text)
          case 'open':
            return f.open(message.tab)
          case 'badges':
            return f.setBadges(Object.fromEntries(Object.entries(message.badges).filter(([tab]) => f.tabs.some((t) => t.id === tab))))
          // Its search field is the frame's, in the window: only a manifest that declares it has one.
          case 'query':
            return h.manifest.search ? f.setQuery(message.text) : undefined
          case 'keys':
            return f.setKeys(message.keys)
          case 'key':
            // As if pressed here: the guide, the tabs, the way back answer as on any screen.
            window.dispatchEvent(new KeyboardEvent('keydown', { key: message.key, bubbles: true, cancelable: true }))
        }
      }),
    [code]
  )

  return (
    <>
      <div ref={box} className="community-screen" />
      {opening && (
        <Modal onClose={() => setOpening(null)} label="ouvrir un lien">
          <div className="in">
            <p>
              <span className="inv">3615</span> {serviceCode(host.manifest)} veut ouvrir dans votre navigateur :
            </p>
            <p className="hi selectable" style={{ wordBreak: 'break-all' }}>
              {opening}
            </p>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setOpening(null)}>
              annuler
            </button>
            <button
              className="btn primary"
              onClick={() => {
                host.openUrl(opening)
                setOpening(null)
              }}
            >
              ouvrir
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
