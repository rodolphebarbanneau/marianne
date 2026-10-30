import { EventEmitter } from 'node:events'
import { app, WebContentsView, session as electronSession, type BrowserWindow, type Session, type WebContents } from 'electron'
import { allowedUrl, serviceCode, type ServiceManifest } from '@marianne/sdk'
import {
  frameMayOpen,
  frameUrl,
  ownRoute,
  readFromFrame,
  readToFrame,
  SCREEN_CHANNELS,
  SERVICE_SCHEME,
  type FrameHost,
  type FromFrame,
  type ToFrame
} from '../../../shared/community'
import { SCREEN_LIMITS } from '../../../shared/screen-channels'
import { matches, type KeyLike } from '../../../shared/shortcuts'
import { fromOwn, type SenderEvent } from './bridge'
import { RateLimit } from './limits'
import { mediaUrl, pictureUrl, schemeHandler, type SchemeSource } from './scheme'

/**
 * A community service's screen, out of Marianne's window's page: a view of its own (a
 * WebContentsView drawn over the screen's content area, as the built-in browser is), locked down
 * as its main side's sandbox: a session of its own that keeps nothing, every request cancelled but
 * its own files (its declared hosts' pictures and videos come through the scheme, fetched by the
 * main process), no permission, WebRTC and DNS sent to a proxy that leads nowhere. Its page reaches
 * Marianne only through its preload (preload/community-screen.ts) and this relay, which answers its
 * calls and data itself and hands the window only what the window shows: a question for Marianne,
 * another screen, a link to confirm, a toast, a tab, a key. The user's keys and clicks are read
 * here, from the view's input: a link or a copy needs a recent one, and only they keep the account
 * awake; F1 to F9 go to the window, échap when the screen doesn't use it.
 */

/** A link or a copy asked this long after the user's last key or click in the screen; later, ignored. */
export const INPUT_WINDOW_MS = 5000
/** An échap the screen hands back must follow a real one this closely. */
const ESCAPE_WINDOW_MS = 1000
/** The account's idle lock hears of the user at most this often. */
const TOUCH_EVERY_MS = 10_000
const NOWHERE = 'socks5://127.0.0.1:9'
/** A screen that goes keeps its page this long, hidden: its view unmounts, and a video that played pins itself. */
export const LEAVE_MS = 250

/** What the relay needs of the app. */
export interface ScreenHost {
  /** The manifest of an active community service; null: not active. */
  manifestOf(code: string): ServiceManifest | null
  /** The commune of the user's address, as community services get it (never the address). */
  home(): FrameHost['home']
  call(code: string, method: string, args: unknown[]): Promise<unknown>
  load(code: string, key: string): unknown
  save(code: string, key: string, value: unknown): void
  copy(text: string): void
  /** The user is here (the idle lock). */
  touch(): void
  /** The user's shortcut to lock the account (an accelerator: "CommandOrControl+L"), and the lock. */
  lockShortcut(): string
  lock(): void
  log: { warn(...args: unknown[]): void }
  now?: () => number
}

/**
 * The relay of one screen, without Electron: what the window sends it is kept and handed on once
 * the screen says hello, its home replaced by the commune; what the screen sends is checked, its
 * calls answered, the rest handed to the window when it may be.
 */
export class ScreenRelay extends EventEmitter {
  private ready = false
  private init: Extract<ToFrame, { type: 'init' }> | null = null
  /** The user's last click, Enter or Space in the screen: what a link or a copy needs. */
  private lastConsent = -Infinity
  private lastEscape = -Infinity
  /** The user's last « / » in the screen: the frame's search field takes it. */
  private lastSlash = -Infinity
  private lastTouch = -Infinity
  private readonly limit = new RateLimit(100, 300)
  private warned = false
  private readonly now: () => number
  /** Going: only a video pinned by its unmounting view still crosses. */
  leaving = false

  constructor(
    readonly code: string,
    private readonly host: ScreenHost,
    /** To the screen's page. */
    private readonly send: (message: ToFrame) => void
  ) {
    super()
    this.now = host.now ?? Date.now
  }

  private get who() {
    return `3615 ${this.code.toUpperCase()}`
  }

  /** The window's message for the screen: its host (the commune only), its tabs, its look, a toast. */
  fromWindow(raw: unknown): void {
    const m = readToFrame(raw)
    if (!m || m.type === 'reply') return
    const manifest = this.host.manifestOf(this.code)
    if (!manifest) return
    if (m.type === 'init' || m.type === 'host') {
      const host: FrameHost = { manifest, params: m.host.params, home: this.host.home() }
      if (m.type === 'init') {
        this.init = { ...m, host }
        if (this.ready) this.send(this.init)
        return
      }
      if (this.init) this.init = { ...this.init, host }
      if (this.ready) this.send({ type: 'host', host })
      return
    }
    if (m.type === 'tab' && this.init) this.init = { ...this.init, tab: m.tab }
    if (m.type === 'look' && this.init) this.init = { ...this.init, look: m.look }
    if (m.type === 'media' && this.init) this.init = { ...this.init, media: m.media }
    if (m.type === 'leave') return
    if (this.ready) this.send(m)
  }

  /** The screen goes: its page unmounts its view; what it pins then still reaches the window, nothing else. */
  leave(): void {
    this.leaving = true
    if (this.ready) this.send({ type: 'leave' })
  }

  /**
   * A key, a click or a scroll in the screen, from its input (not from its page): the user is here.
   * Only a click, Enter or Space counts as the user's go-ahead for a link or a copy.
   */
  input(kind: 'key' | 'click' | 'wheel', key?: string, modifiers?: Omit<KeyLike, 'key' | 'code'> & { code?: string }): string | null {
    const now = this.now()
    if (now - this.lastTouch >= TOUCH_EVERY_MS) {
      this.lastTouch = now
      this.host.touch()
    }
    if (kind === 'click' || (kind === 'key' && (key === 'Enter' || key === ' ' || key === 'Spacebar'))) this.lastConsent = now
    if (kind !== 'key' || !key) return null
    // The lock, as the user set it: it works with the focus in the screen too.
    if (modifiers && matches({ key, code: modifiers.code ?? '', ...modifiers }, this.host.lockShortcut(), process.platform === 'darwin')) {
      this.host.lock()
      return 'lock'
    }
    // « / » needs Shift on some keyboards (AZERTY's main row): Shift alone doesn't stop it.
    if (key === '/' && !(modifiers && (modifiers.ctrlKey || modifiers.altKey || modifiers.metaKey))) this.lastSlash = now
    if (modifiers && (modifiers.ctrlKey || modifiers.altKey || modifiers.metaKey || modifiers.shiftKey)) return null
    if (key === 'Escape') this.lastEscape = now
    // The guide and the tabs: the window's, whatever the screen does with them.
    if (/^F[1-9]$/.test(key)) {
      this.emit('window', { type: 'key', key } satisfies FromFrame)
      return key
    }
    return null
  }

  /** A message from the screen's page, checked; its calls answered here. */
  fromScreen(raw: unknown): void {
    if (!this.limit.take(this.now())) {
      if (!this.warned) this.host.log.warn(`${this.who}: its screen sends too many messages; some are dropped`)
      this.warned = true
      return
    }
    const m = readFromFrame(raw)
    if (!m || (this.leaving && m.type !== 'pin')) return
    const manifest = this.host.manifestOf(this.code)
    if (!manifest) return
    const recent = this.now() - this.lastConsent <= INPUT_WINDOW_MS
    switch (m.type) {
      case 'hello':
        this.ready = true
        if (this.init) this.send(this.init)
        return
      case 'call':
        return this.answer(m.id, () => this.host.call(this.code, m.method, m.args))
      case 'load':
        return this.answer(m.id, () => this.host.load(this.code, m.key))
      case 'save':
        return this.answer(m.id, () => this.host.save(this.code, m.key, m.value))
      // The user's presence comes from the screen's input only.
      case 'activity':
        return
      case 'key':
        // Only a key the user just pressed in the screen: a screen can't send the window back nor into its field by itself.
        if (m.key === 'Escape' && this.now() - this.lastEscape <= ESCAPE_WINDOW_MS) this.emit('window', m)
        if (m.key === '/' && this.now() - this.lastSlash <= ESCAPE_WINDOW_MS) this.emit('window', m)
        return
      case 'copy':
        if (!recent) return this.host.log.warn(`${this.who}: a copy without the user's click, ignored`)
        this.host.copy(m.text)
        this.emit('window', { type: 'toast', text: `${this.who} · ${m.done ?? 'copié'}` })
        return
      case 'url':
        if (!recent || !frameMayOpen(manifest, m.url)) return this.host.log.warn(`${this.who}: a link not opened (${m.url.slice(0, 120)})`)
        this.emit('window', m)
        return
      case 'toast':
        this.emit('window', { type: 'toast', text: `${this.who} · ${m.text}` })
        return
      // A video of its declared hosts, which brings the user back to its own screen; its picture only from there too.
      case 'pin': {
        const { poster, ...item } = m.item
        if (!allowedUrl(manifest, item.src) || !ownRoute(this.code, item.route)) return this.host.log.warn(`${this.who}: a video not pinned`)
        this.emit('window', { ...m, item: { ...item, ...(poster && allowedUrl(manifest, poster) ? { poster } : {}) } })
        return
      }
      case 'ask': {
        // A page it hands with a question is its own: labelled so, its address kept only on its declared hosts.
        const page = m.page && {
          title: `${this.who} · ${m.page.title}`.slice(0, 300),
          url: allowedUrl(manifest, m.page.url) ? m.page.url : '',
          text: m.page.text
        }
        this.emit('window', { type: 'ask', text: m.text, ...(page ? { page } : {}) })
        return
      }
      default:
        this.emit('window', m)
    }
  }

  private answer(id: number, job: () => unknown): void {
    Promise.resolve()
      .then(job)
      .then(
        (ok) => this.send({ type: 'reply', id, ok: ok ?? null }),
        (err: unknown) =>
          this.send({
            type: 'reply',
            id,
            error: (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
          })
      )
  }
}

/** A screen's session, set up once: its own files only, its declared hosts' pictures through the scheme, nothing else. */
const prepared = new WeakSet<Session>()
async function prepare(code: string, source: SchemeSource, manifestOf: (code: string) => ServiceManifest | null): Promise<Session> {
  const ses = electronSession.fromPartition(`community-screen-${code}`, { cache: false })
  if (!prepared.has(ses)) {
    prepared.add(ses)
    const own = `${SERVICE_SCHEME}://${code}/`
    ses.webRequest.onBeforeRequest((details, callback) => {
      if (details.url.startsWith(own)) return callback({})
      const m = manifestOf(code)
      if (m && details.resourceType === 'image' && allowedUrl(m, details.url)) return callback({ redirectURL: pictureUrl(code, details.url) })
      // A video's playlist and pieces (a player's requests, a <video>'s), fetched by the main process too.
      if (m && details.method === 'GET' && (details.resourceType === 'xhr' || details.resourceType === 'media') && allowedUrl(m, details.url))
        return callback({ redirectURL: mediaUrl(code, details.url) })
      callback({ cancel: true })
    })
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
  }
  await ses.clearStorageData()
  await ses.clearCache()
  return ses
}

export interface ScreensOptions {
  /** The community screen preload (out/preload/community-screen.js). */
  preload: string
  /** What the scheme serves, pictures included. */
  source: SchemeSource
  host: ScreenHost
}

/**
 * The community screen shown in Marianne's window, one at a time: opened when the window shows a
 * community service's screen, placed where it says, hidden while something covers it, closed when
 * the screen goes. 'window' tells the window what the screen asks of it ({ code, message }).
 */
export class CommunityScreens extends EventEmitter {
  private win: BrowserWindow | null = null
  private view: WebContentsView | null = null
  private relay: ScreenRelay | null = null
  private bounds: Electron.Rectangle | null = null
  private opening = 0
  /** Each relay's view, the one leaving included. */
  private readonly views = new Map<ScreenRelay, WebContentsView>()

  constructor(private readonly opts: ScreensOptions) {
    super()
  }

  /** The window the screens are drawn in: a reload, a navigation or a crash of its page takes the screen away (the page opens it again). */
  attach(win: BrowserWindow): void {
    this.win = win
    win.on('closed', () => {
      this.win = null
      this.view = null
      this.relay = null
    })
    win.webContents.on('render-process-gone', () => this.close())
    win.webContents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) this.close()
    })
  }

  /** The screen of a community service that is on; nothing for another. */
  open(code: unknown): void {
    if (typeof code !== 'string' || !this.opts.host.manifestOf(code) || !this.win) return
    if (this.relay?.code === code && this.view) return
    this.close()
    const ticket = ++this.opening
    const relay = new ScreenRelay(code, this.opts.host, (message) => {
      const wc = this.views.get(relay)?.webContents
      if (wc && !wc.isDestroyed() && (this.relay === relay || relay.leaving)) wc.send(SCREEN_CHANNELS.message, message)
    })
    relay.on('window', (message: FromFrame) => {
      // « / » goes to the frame's search field, in the window's page: the keyboard follows it there.
      if (message.type === 'key' && message.key === '/' && this.win && !this.win.webContents.isDestroyed()) this.win.webContents.focus()
      this.emit('window', { code, message })
    })
    this.relay = relay
    void prepare(code, this.opts.source, (c) => this.opts.host.manifestOf(c)).then(
      () => {
        if (ticket !== this.opening || !this.win) return
        const view = new WebContentsView({
          webPreferences: {
            preload: this.opts.preload,
            partition: `community-screen-${code}`,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            nodeIntegrationInSubFrames: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: false,
            spellcheck: false,
            navigateOnDragDrop: false,
            disableDialogs: true,
            devTools: !app.isPackaged
          }
        })
        view.setBackgroundColor('#00000000')
        view.setVisible(false)
        this.win.contentView.addChildView(view)
        this.view = view
        this.views.set(relay, view)
        this.wire(view.webContents, relay)
        this.layout()
        void view.webContents.loadURL(frameUrl(code)).catch(() => undefined)
      },
      (err: unknown) =>
        this.opts.host.log.warn(`3615 ${code.toUpperCase()}: its screen could not be prepared:`, err instanceof Error ? err.message : String(err))
    )
  }

  private wire(wc: WebContents, relay: ScreenRelay): void {
    const own = (e: SenderEvent) => (this.relay === relay || relay.leaving) && fromOwn(wc, e)
    wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
    wc.setWindowOpenHandler(() => ({ action: 'deny' }))
    wc.on('will-navigate', (e) => e.preventDefault())
    wc.on('will-frame-navigate', (e) => e.preventDefault())
    wc.on('will-attach-webview', (e) => e.preventDefault())
    wc.ipc.on(SCREEN_CHANNELS.post, (e, json: unknown) => {
      // Text within its length, from its preload, before anything is read of it.
      if (!own(e) || typeof json !== 'string' || json.length > SCREEN_LIMITS.chars) return
      let message: unknown
      try {
        message = JSON.parse(json)
      } catch {
        return
      }
      relay.fromScreen(message)
    })
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return
      const modifiers = { code: input.code, ctrlKey: input.control, altKey: input.alt, metaKey: input.meta, shiftKey: input.shift }
      if (relay.input('key', input.key, modifiers)) e.preventDefault()
    })
    wc.on('input-event', (_e, input) => {
      if (input.type === 'mouseDown' || input.type === 'gestureTap') relay.input('click')
      else if (input.type === 'mouseWheel' || input.type === 'gestureScrollBegin') relay.input('wheel')
    })
    wc.on('render-process-gone', () => {
      if (this.relay !== relay) return
      this.opts.host.log.warn(`3615 ${relay.code.toUpperCase()}: its screen's renderer is gone`)
      this.close()
      this.emit('window', { code: relay.code, message: { type: 'toast', text: `3615 ${serviceCode({ id: relay.code })} · son écran s’est arrêté` } })
    })
  }

  /** Where the screen goes, from the window; null: hidden (covered, or the screen is leaving). */
  setBounds(rect: unknown): void {
    const r = rect as Electron.Rectangle | null
    this.bounds =
      r && [r.x, r.y, r.width, r.height].every((n) => Number.isFinite(n))
        ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
        : null
    this.layout()
  }

  private layout(): void {
    if (!this.view) return
    if (this.bounds && this.bounds.width > 0 && this.bounds.height > 0) {
      this.view.setBounds(this.bounds)
      this.view.setVisible(true)
    } else this.view.setVisible(false)
  }

  /** A message of the window for the shown screen. */
  post(code: unknown, message: unknown): void {
    if (this.relay && this.relay.code === code) this.relay.fromWindow(message)
  }

  /** The shown screen closed (`code`: only if it is that one's). */
  close(code?: unknown): void {
    if (code !== undefined && this.relay?.code !== code) return
    this.opening++
    const view = this.view
    const relay = this.relay
    this.view = null
    this.relay = null
    if (!view || !relay) return void relay?.removeAllListeners()
    view.setVisible(false)
    relay.leave()
    setTimeout(() => {
      relay.removeAllListeners()
      this.views.delete(relay)
      try {
        this.win?.contentView.removeChildView(view)
      } catch {
        // the window is gone
      }
      if (!view.webContents.isDestroyed()) view.webContents.close()
    }, LEAVE_MS)
  }

  /** The services changed: a screen whose service is no longer on goes. */
  check(): void {
    if (this.relay && !this.opts.host.manifestOf(this.relay.code)) this.close()
  }
}
