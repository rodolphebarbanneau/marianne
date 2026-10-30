import { app, BrowserWindow, session as electronSession, type Session } from 'electron'
import { SANDBOX_CHANNELS, SERVICE_SCHEME, sandboxUrl } from '../../../shared/community'
import { fromOwn, REFUSED, type SenderEvent } from './bridge'
import { schemeHandler, type SchemeSource } from './scheme'
import type { SandboxFactory } from './service'

/**
 * A community service's sandbox, in Electron: a hidden window of its own, sandboxed, isolated,
 * without Node, in a session of its own that keeps nothing on disk. Its session cancels every
 * request but its own marianne-service://<code>/ files, refuses every permission and download,
 * and sends WebRTC nowhere (a proxy that leads nowhere, no UDP outside it). The window never
 * navigates nor opens another. Its preload (preload/community.ts) gives its page the bridge, and
 * only this window's main frame may use the bridge's channels.
 */

export interface SandboxOptions {
  /** The community preload (out/preload/community.js). */
  preload: string
  /** What the scheme serves (the service's files, Marianne's runtime). */
  source: SchemeSource
}

/** A proxy nobody listens on: WebRTC, which no content policy governs, may only go through it. */
const NOWHERE = 'socks5://127.0.0.1:9'

/**
 * Each key's setup (a session's), begun by the first caller and awaited by every one: a second
 * caller never goes past it while the first one's is still under way (its proxy not yet in place).
 * A setup that failed stays failed: its handlers are set already, so it can't run again, and
 * nothing is made in that session.
 */
export function onceEach<K extends object>(): (key: K, setup: () => Promise<void>) => Promise<void> {
  const setups = new WeakMap<K, Promise<void>>()
  return (key, setup) => {
    let running = setups.get(key)
    if (!running) {
      // Begun at once, a synchronous failure included in the promise.
      running = (async () => setup())()
      setups.set(key, running)
    }
    return running
  }
}

const setUp = onceEach<Session>()

/** A service's session, set up once: its own scheme handler (its code only), nothing else reachable. */
async function prepare(code: string, source: SchemeSource): Promise<Session> {
  const ses = electronSession.fromPartition(`community-${code}`, { cache: false })
  // A sandbox started again at once (a restart, an unlock) waits for the one setup: never a window before the proxy is in place.
  await setUp(ses, async () => {
    const own = `${SERVICE_SCHEME}://${code}/`
    ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith(own) }))
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    ses.setPermissionCheckHandler(() => false)
    ses.setDevicePermissionHandler(() => false)
    ses.on('will-download', (e, item) => {
      e.preventDefault()
      item.cancel()
    })
    ses.setSpellCheckerEnabled(false)
    ses.protocol.handle(SERVICE_SCHEME, schemeHandler(source, code))
    await ses.setProxy({ mode: 'fixed_servers', proxyRules: NOWHERE })
  })
  // What a previous run of it kept in memory (an earlier account's) is gone before it starts.
  await ses.clearStorageData()
  await ses.clearCache()
  return ses
}

/** The factory the host gives each community service: Electron's sandbox. */
export function electronSandbox(opts: SandboxOptions): SandboxFactory {
  return (code, events) => {
    let ended = false
    let win: BrowserWindow | null = null
    const end = () => {
      if (ended) return
      ended = true
      const w = win
      win = null
      if (!w || w.isDestroyed()) return
      if (!w.webContents.isDestroyed()) w.webContents.forcefullyCrashRenderer()
      w.destroy()
    }
    void prepare(code, opts.source).then(
      () => {
        if (ended) return
        win = new BrowserWindow({
          show: false,
          width: 480,
          height: 360,
          skipTaskbar: true,
          focusable: false,
          paintWhenInitiallyHidden: false,
          webPreferences: {
            preload: opts.preload,
            partition: `community-${code}`,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            nodeIntegrationInSubFrames: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: false,
            spellcheck: false,
            backgroundThrottling: false,
            navigateOnDragDrop: false,
            disableDialogs: true,
            devTools: !app.isPackaged
          }
        })
        const wc = win.webContents
        const own = (e: SenderEvent) => !ended && fromOwn(wc, e)
        wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
        wc.setWindowOpenHandler(() => ({ action: 'deny' }))
        wc.on('will-navigate', (e) => e.preventDefault())
        wc.on('will-frame-navigate', (e) => e.preventDefault())
        wc.on('will-attach-webview', (e) => e.preventDefault())
        wc.ipc.handle(SANDBOX_CHANNELS.call, (e, name: unknown, args: unknown) =>
          own(e) ? events.call(name, args) : Promise.reject(new Error('Appel refusé.'))
        )
        wc.ipc.on(SANDBOX_CHANNELS.callSync, (e, name: unknown, args: unknown) => {
          e.returnValue = own(e) ? events.callSync(name, args) : REFUSED
        })
        wc.ipc.on(SANDBOX_CHANNELS.reply, (e, id: unknown, reply: unknown) => {
          if (own(e)) events.reply(id, reply)
        })
        wc.ipc.on(SANDBOX_CHANNELS.log, (e, level: unknown, text: unknown) => {
          if (own(e)) events.log(level, text)
        })
        wc.on('did-finish-load', () => !ended && events.loaded())
        wc.on('did-fail-load', (_e, _code, _description, _url, isMainFrame) => {
          if (!isMainFrame || ended) return
          end()
          events.gone('load-failed')
        })
        wc.on('render-process-gone', () => {
          if (ended) return
          end()
          events.gone('crashed')
        })
        wc.on('unresponsive', () => {
          if (ended) return
          end()
          events.gone('unresponsive')
        })
        // Closed by anything but Marianne (its page can't, but the system may): as a crash.
        win.on('closed', () => {
          if (ended) return
          ended = true
          events.gone('crashed')
        })
        void wc.loadURL(sandboxUrl(code)).catch(() => undefined)
      },
      () => {
        if (ended) return
        ended = true
        events.gone('load-failed')
      }
    )
    return {
      send: (message) => {
        const wc = win && !win.isDestroyed() ? win.webContents : null
        if (!wc || wc.isDestroyed() || ended) throw new Error('no sandbox')
        wc.send(SANDBOX_CHANNELS.invoke, message)
      },
      destroy: end
    }
  }
}
