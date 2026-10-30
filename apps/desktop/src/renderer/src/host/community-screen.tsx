import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { serviceCode } from '@marianne/sdk'
import type { ServiceFrame, ServiceHost } from '@marianne/sdk/view'
import type { FrameHost, FrameLook, FromFrame, ToFrame } from '@shared/community'
import { useApp } from '../app/context'
import { Modal } from '../components/ui'
import { api } from '../lib/api'
import { overlay } from '../lib/overlay'

const rect = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
}

/**
 * A community service's screen. Its view runs out of this page, in a view of its own that the main
 * process draws over this box (main/community/runtime/screen.ts), as the built-in browser is: here
 * is the box, where it goes (none while a dialog, the palette or the settings cover it), and the
 * window's part of the bridge: what the screen is opened with (its params, its tabs, the window's
 * look) and what it asks of the window — a question for Marianne, another screen, a tab, a toast,
 * a key, and a link, which opens only once the user agrees. Its calls and data never come here:
 * the main process answers them.
 */
export function CommunityScreen({ host, frame, barred }: { host: ServiceHost; frame: ServiceFrame; barred: boolean }) {
  const app = useApp()
  const code = host.manifest.id
  const box = useRef<HTMLDivElement>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const dialog = useSyncExternalStore(overlay.subscribe, overlay.get)
  const covered = !!app.palette || !!app.settingsPage || app.guideOpen || dialog || !!opening
  const hidden = useRef(covered)
  hidden.current = covered
  const { theme, crt, fontSize } = app.config.ui
  const look = useMemo<FrameLook>(() => ({ theme, crt, fontSize, platform: api.platform }), [theme, crt, fontSize])
  // Its home is the main process's to give (the commune only): the screen gets its params from here.
  const frameHost = useMemo<FrameHost>(() => ({ manifest: host.manifest, params: host.params, home: null }), [host])
  const latest = useRef({ host, frame, look, frameHost, barred })
  latest.current = { host, frame, look, frameHost, barred }
  const post = (message: ToFrame) => api.communityScreenPost(code, message)

  // Opened with what it shows; closed when the screen goes.
  useEffect(() => {
    api.communityScreenOpen(code)
    const { frameHost: h, frame: f, look: l, barred: b } = latest.current
    api.communityScreenPost(code, { type: 'init', host: h, tabs: f.tabs, tab: f.tab, barred: b, look: l })
    return () => api.communityScreenClose(code)
  }, [code])

  // Where the main process draws it; nowhere while something covers it.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const report = () => !hidden.current && api.communityScreenBounds(rect(el))
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
  useEffect(() => {
    if (covered) api.communityScreenBounds(null)
    else if (box.current) api.communityScreenBounds(rect(box.current))
  }, [covered])

  useEffect(() => post({ type: 'host', host: frameHost }), [frameHost]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => post({ type: 'look', look }), [look]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => post({ type: 'tab', tab: frame.tab, picked: false }), [frame.tab]) // eslint-disable-line react-hooks/exhaustive-deps
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
            return h.openRoute(message.route)
          case 'url':
            return setOpening(message.url)
          case 'toast':
            return h.toast(message.text)
          case 'open':
            return f.open(message.tab)
          case 'badges':
            return f.setBadges(Object.fromEntries(Object.entries(message.badges).filter(([tab]) => f.tabs.some((t) => t.id === tab))))
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
