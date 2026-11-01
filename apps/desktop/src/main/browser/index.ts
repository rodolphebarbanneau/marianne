import { EventEmitter } from 'node:events'
import { session as electronSession, shell, WebContentsView, type BrowserWindow } from 'electron'
import { addressUrl } from '../../shared/address'
import type { BrowserState, PagePart } from '../../shared/types'
import { hostOf, siteOf } from '../../shared/hosts'
import { maskCards } from '../cards'
import { keychain, loginFits } from '../keychain'
import { log } from '../log'
import { session } from '../session'
import { ARRIVALS_KEPT, CARD_CLEAR_SCRIPT, CARD_FILL_SCRIPT, CARD_SCAN_SCRIPT, PAY_PRESS_SCRIPT, type Arrival, type CardFrame } from './payment'
import { holdToRun, mayOpen, type RunGuard } from './run-guard'
import {
  CLICK_SCRIPT,
  FILL_SCRIPT,
  FORM_FILL_SCRIPT,
  FORM_READ_SCRIPT,
  LABEL_SCRIPT,
  PAGE_READ_SCRIPT,
  READ_SCRIPT,
  TYPE_SCRIPT,
  type FormField
} from './scripts'

/**
 * The built-in browser, docked in the main window: a sandboxed view of public-service websites
 * (no preload, its own in-memory session, forgotten when the account locks), shown in the right
 * panel of a folder or running out of sight. Marianne drives it through her tools; the user can
 * take control at any time, and then Marianne waits until it is given back. Anything that
 * commits (sign, pay, send) waits for the user's yes (see tools/browser).
 */

/** Not "persist:": cookies and logins never reach the disk, and go away with the lock. */
const PARTITION = 'marianne-web'
/**
 * A planned task's run browses in a session of its own, emptied before and after each run: it never
 * carries the user's sign-ins, and leaves nothing for the next run or for the user.
 */
const RUN_PARTITION = 'marianne-run'
const MAX_PAGE_CHARS = 40_000

/** A view's address; none for the blank page a lock leaves, which is nobody's page. */
function addressOf(wc: Electron.WebContents | undefined): string {
  const url = wc?.getURL() ?? ''
  return url === 'about:blank' ? '' : url
}

/** The origins from the page down to a frame; null for a frame gone. */
function originsOf(frame: Electron.WebFrameMain): string[] | null {
  const origins: string[] = []
  for (let f: Electron.WebFrameMain | null = frame; f; f = f.parent) {
    if (f.isDestroyed() || f.detached) return null
    origins.unshift(f.origin)
  }
  return origins
}

/** An arrival with at most `n` pages in its chain, itself included. */
const kept = (a: Arrival | null, n: number): Arrival | null => (a && n > 0 ? { ...a, previous: kept(a.previous, n - 1) } : null)

export interface PageElement {
  id: string
  role: string
  label: string
  type: string
  secret: boolean
  /** A bank card's field: pay_by_card fills it, nothing else. */
  card: boolean
}

export interface PageView {
  url: string
  title: string
  text: string
  elements: PageElement[]
}

export class HumanControlError extends Error {
  constructor() {
    super('L’utilisateur a pris la main sur le navigateur : attendez qu’il vous la rende.')
  }
}

class Browser extends EventEmitter {
  private win: BrowserWindow | null = null
  private view: WebContentsView | null = null
  private bounds: Electron.Rectangle | null = null
  private controller: BrowserState['controller'] = 'agent'
  private folderId = ''
  private waiting = ''
  private usedAt = 0
  /** While a planned task runs, the sites its page may go to (run-guard.ts). */
  private runGuard: RunGuard = null
  /** A run is getting its view ready: reaching for the browser meanwhile interrupts it too. */
  private starting = false
  /** The user's page and folder, set aside while a run has its own view. */
  private aside: { view: WebContentsView | null; folderId: string; usedAt: number } | null = null
  private prepared = new Set<string>()
  /** How each view's page came to be there, and the navigation under way (follow). */
  private trails = new WeakMap<Electron.WebContents, { arrival: Arrival | null; going: { hops: string[]; initiator: string } | null }>()
  /** Counts every change of page, in any view: what the user approved on a page holds while it stays the same. */
  private changes = 0

  /**
   * A planned task's run starts: it gets a view of its own, in its own empty session, held to its
   * sites (run-guard.ts); the user's page waits aside, untouched. The scheduler only starts a run
   * while the browser isn't the user's (tasks.ts).
   */
  async beginRun(guard: (url: string) => boolean): Promise<void> {
    this.starting = true
    try {
      if (this.runGuard) await this.endRun()
      await electronSession.fromPartition(RUN_PARTITION).clearStorageData()
    } finally {
      this.starting = false
    }
    this.aside = { view: this.view, folderId: this.folderId, usedAt: this.usedAt }
    this.view?.setVisible(false)
    this.view = null
    this.runGuard = guard
    this.changed()
  }

  /** Whether a run has the browser: a run's call made once it no longer has it stops (tools/browser.ts). */
  inRun(): boolean {
    return !!this.runGuard
  }

  /** The run is over: its view and everything it reached go, the user's page comes back. */
  async endRun(): Promise<void> {
    if (!this.runGuard) return
    const run = this.view
    this.runGuard = null
    this.view = this.aside?.view ?? null
    this.folderId = this.aside?.folderId ?? ''
    // The user's page was left when they left it: a run's own use doesn't make it look fresh to the scheduler.
    this.usedAt = this.aside?.usedAt ?? 0
    this.aside = null
    if (run) {
      try {
        this.win?.contentView.removeChildView(run)
      } catch {
        // the window is gone
      }
      if (!run.webContents.isDestroyed()) run.webContents.close()
    }
    await electronSession.fromPartition(RUN_PARTITION).clearStorageData()
    this.layout()
    this.changed()
  }

  /** The user reached for the browser during a run: the run gives way (chat.ts), as it does to their message. */
  private reachedFor(): void {
    if (this.runGuard || this.starting) this.emit('taken')
  }

  /**
   * The user's page is about to load: a run under way gives way first, and its view and session go
   * before anything loads, so that the user's page never opens in the run's guarded session, nor the
   * run's view closes on it.
   */
  private async giveWay(): Promise<void> {
    this.reachedFor()
    await this.endRun()
  }

  /** The window the panel lives in. */
  attach(win: BrowserWindow): void {
    this.win = win
    win.on('closed', () => {
      this.win = null
      this.view = null
    })
  }

  private ensure(): WebContentsView {
    if (this.view) return this.view
    if (!this.win) throw new Error('La fenêtre de Marianne n’est pas ouverte.')
    const run = !!this.runGuard
    const partition = run ? RUN_PARTITION : PARTITION
    const web = electronSession.fromPartition(partition)
    if (!this.prepared.has(partition)) {
      this.prepared.add(partition)
      // Websites get nothing beyond plain browsing: no camera, location, notifications…
      web.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'clipboard-sanitized-write' || permission === 'fullscreen'))
      // Nobody watches a run: nothing it reaches is saved on the computer.
      if (run) web.on('will-download', (e) => e.preventDefault())
    }
    const view = new WebContentsView({
      webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false }
    })
    view.setVisible(false)
    this.win.contentView.addChildView(view)
    const wc = view.webContents
    // Marianne keeps working while the panel is closed.
    wc.setBackgroundThrottling(false)
    // Popups open in the same view; mail and phone links go to the system, other schemes nowhere.
    // During a run, a popup opens only on its sites, and nothing goes to the system.
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) {
        if (mayOpen(this.runGuard, url)) void wc.loadURL(url)
      } else if (/^(mailto|tel):/i.test(url) && !this.runGuard) void shell.openExternal(url)
      return { action: 'deny' }
    })
    if (run) holdToRun(wc, () => this.runGuard)
    this.follow(wc)
    for (const event of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading'] as const) {
      wc.on(event as 'did-navigate', () => this.changed())
    }
    wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      // The host only: a URL may carry the user's values.
      if (isMainFrame && code !== -3) log.warn('Browser load failed', code, description, siteOf(url))
    })
    this.view = view
    this.layout()
    return view
  }

  /**
   * Keep how the view's page came to be there (payment.ts, paymentRoute): the frame that sent it, by
   * its origin ('' when no page did: an address opened, back, reload), the addresses on the way, the
   * pages before; and count each change of page, a fragment's or a script's included.
   */
  private follow(wc: Electron.WebContents): void {
    const trail: { arrival: Arrival | null; going: { hops: string[]; initiator: string } | null } = { arrival: null, going: null }
    this.trails.set(wc, trail)
    wc.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument) return
      let initiator = ''
      try {
        initiator = details.initiator?.origin ?? ''
      } catch {
        // The frame that started it is gone: nobody can be said to have sent it.
      }
      trail.going = { hops: [details.url], initiator }
    })
    wc.on('did-redirect-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) trail.going?.hops.push(details.url)
    })
    wc.on('did-navigate', (_e, url) => {
      const going = trail.going
      trail.going = null
      trail.arrival = { url, initiator: going?.initiator ?? '', hops: [...(going?.hops ?? []), url], previous: kept(trail.arrival, ARRIVALS_KEPT - 1) }
      this.changes++
    })
    wc.on('did-navigate-in-page', (_e, _url, isMainFrame) => {
      if (isMainFrame) this.changes++
    })
  }

  /** How the page open came to be there; null with none. */
  arrival(): Arrival | null {
    const wc = this.view?.webContents
    return (wc && this.trails.get(wc)?.arrival) || null
  }

  /** A number that changes whenever a page does: a card approved on a page, and the pay click it covers, hold while it is the same. */
  pageVersion(): number {
    return this.changes
  }

  /** The panel's rectangle, from the screens; null when it is closed (the page keeps running). */
  setBounds(bounds: Electron.Rectangle | null): void {
    this.bounds = bounds
    if (bounds) this.reachedFor()
    this.layout()
    this.changed()
  }

  private layout(): void {
    if (!this.view) return
    // A run's page is never shown: it runs out of sight, and gives way if the user opens the panel.
    if (!this.runGuard && this.bounds && this.bounds.width > 0 && this.bounds.height > 0) {
      this.view.setBounds(this.bounds)
      this.view.setVisible(true)
    } else this.view.setVisible(false)
  }

  /** Open `url` for a folder (http and https only): Marianne's tools, or the user's once a run gave way. */
  open(url: string, folderId = this.folderId): void {
    if (!/^https?:\/\//i.test(url)) throw new Error(`Adresse non prise en charge : ${url}`)
    this.folderId = folderId
    this.usedAt = Date.now()
    void this.ensure().webContents.loadURL(url)
    this.changed()
  }

  /** An address the user opens (a step's site, a link of the window): a run under way gives way first. */
  async openForUser(url: string, folderId?: string): Promise<void> {
    try {
      await this.giveWay()
      // After the run: its folder was the run's, the user's page is back with its own.
      this.open(url, folderId ?? this.folderId)
    } catch {
      // The host only: an address may carry the user's values.
      log.warn('Browser: could not open a page on', siteOf(url) || 'an address that is not a web page')
    }
  }

  /** What the user typed in the address bar: an address, or a search of Service-Public. */
  navigate(input: string): Promise<void> {
    const url = addressUrl(input)
    return url ? this.openForUser(url) : Promise.resolve()
  }

  back(): void {
    this.view?.webContents.navigationHistory.goBack()
  }

  forward(): void {
    this.view?.webContents.navigationHistory.goForward()
  }

  reload(): void {
    this.view?.webContents.reload()
  }

  openExternal(): void {
    const url = this.view?.webContents.getURL()
    if (url && /^https?:/i.test(url)) void shell.openExternal(url)
  }

  state(): BrowserState {
    const wc = this.view?.webContents
    return {
      url: addressOf(wc),
      title: wc?.getTitle() ?? '',
      loading: wc?.isLoading() ?? false,
      canGoBack: wc?.navigationHistory.canGoBack() ?? false,
      canGoForward: wc?.navigationHistory.canGoForward() ?? false,
      visible: !!this.bounds,
      controller: this.controller,
      folderId: this.folderId,
      waiting: this.waiting
    }
  }

  /** "Prendre la main": Marianne's actions are refused until the user gives it back. */
  setController(controller: BrowserState['controller']): void {
    if (controller === 'human') this.reachedFor()
    this.controller = controller
    this.changed()
  }

  /** What Marianne waits for the user's yes about, shown over the page. */
  setWaiting(text: string): void {
    this.waiting = text
    this.changed()
  }

  /** Ask the screens to show the panel (Marianne wants the user to look). */
  reveal(): void {
    this.emit('reveal', this.folderId)
  }

  // ---------- what Marianne does (refused while the user has control) ----------

  /** How long since the page was last used, by anyone. */
  quietMs(): number {
    return Date.now() - this.usedAt
  }

  private agentPage(): Electron.WebContents {
    this.usedAt = Date.now()
    if (this.controller === 'human') throw new HumanControlError()
    const wc = this.view?.webContents
    if (!wc || !addressOf(wc)) throw new Error('Aucune page ouverte dans le navigateur de Marianne.')
    return wc
  }

  /** Wait until the page has loaded, redirects included (capped): a quiet spell without loading. */
  async settled(timeoutMs = 15_000): Promise<void> {
    const wc = this.view?.webContents
    if (!wc) return
    const until = Date.now() + timeoutMs
    let quiet = 0
    while (quiet < 3 && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 250))
      quiet = wc.isLoading() ? 0 : quiet + 1
    }
  }

  /** The page as Marianne sees it: text and the elements she can act on. Stored passwords and card numbers are masked. */
  async readPage(): Promise<PageView> {
    const wc = this.agentPage()
    await this.settled()
    const page = (await wc.executeJavaScript(PAGE_READ_SCRIPT)) as PageView
    const secrets = this.storedPasswords(page.url)
    page.text = this.masked(page.text, secrets)
    for (const e of page.elements) e.label = this.masked(e.label, secrets)
    return page
  }

  async elementLabel(id: string): Promise<string> {
    return (await this.agentPage().executeJavaScript(LABEL_SCRIPT(id))) as string
  }

  async click(id: string): Promise<void> {
    const done = (await this.agentPage().executeJavaScript(CLICK_SCRIPT(id))) as boolean
    if (!done) throw new Error('Cet élément n’est plus sur la page : relisez-la.')
    await this.settled()
  }

  async type(id: string, value: string): Promise<void> {
    const done = (await this.agentPage().executeJavaScript(TYPE_SCRIPT(id, value))) as boolean
    if (!done) throw new Error('Ce champ n’est plus sur la page (ou c’est un mot de passe) : relisez-la.')
  }

  /** The fields of the form shown (main frame). */
  async readForm(): Promise<FormField[]> {
    const wc = this.agentPage()
    await this.settled()
    const secrets = this.storedPasswords(wc.getURL())
    // Pages built by scripts may show their form a moment after loading.
    for (let attempt = 1; ; attempt++) {
      const fields = (await wc.executeJavaScript(FORM_READ_SCRIPT)) as FormField[]
      for (const f of fields) f.value = secrets.has(f.value) ? '(masqué)' : maskCards(f.value)
      if (fields.length || attempt === 3) return fields
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  /** Fill fields read by readForm. Never submits the form. */
  async fillForm(values: Record<string, string>): Promise<{ filled: string[]; missing: string[] }> {
    return (await this.agentPage().executeJavaScript(FORM_FILL_SCRIPT(values))) as { filled: string[]; missing: string[] }
  }

  /**
   * Fill the login form with a keychain entry, in the frames on the entry's own host or under it only:
   * not anywhere on its registrable domain, which other owners may share (x.asso.fr and evil.asso.fr).
   */
  async fillLogin(entryId: string): Promise<string[]> {
    const wc = this.view?.webContents
    const entry = keychain.list().find((e) => e.id === entryId)
    const secret = entry && keychain.secret(entryId)
    if (!wc || !entry || !secret) return []
    if (!loginFits(entry.url, wc.getURL())) throw new Error('Cet identifiant n’est pas pour ce site.')
    for (const frame of wc.mainFrame.framesInSubtree) {
      if (!loginFits(entry.url, frame.url)) continue
      try {
        const filled = (await frame.executeJavaScript(FILL_SCRIPT(secret.username, secret.password))) as string[]
        if (filled.length) return filled
      } catch (err) {
        log.warn('Autofill failed in a frame:', (err as Error).message)
      }
    }
    return []
  }

  /** The visible text of the page, to give to the conversation: stored passwords and card numbers masked, as Marianne reads it. */
  async capture(): Promise<PagePart | null> {
    const wc = this.view?.webContents
    if (!wc || !addressOf(wc)) return null
    const page = (await wc.executeJavaScript(READ_SCRIPT)) as { title: string; url: string; text: string }
    const text = this.masked(page.text, this.storedPasswords(page.url))
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return { type: 'page', url: page.url, title: page.title, text: text.length > MAX_PAGE_CHARS ? `${text.slice(0, MAX_PAGE_CHARS)}\n[… page tronquée]` : text }
  }

  currentUrl(): string {
    return addressOf(this.view?.webContents)
  }

  /**
   * The card fields of the page, in each of its frames that `may` receive a card (payment.ts,
   * frameMayReceive, from the origins of the frame and of those above it), tagged there for
   * fillCard. A frame that can't be read is left out.
   */
  async cardFields(may: (origins: string[]) => boolean): Promise<CardFrame[]> {
    const wc = this.agentPage()
    await this.settled()
    const found: CardFrame[] = []
    for (const frame of wc.mainFrame.framesInSubtree) {
      const origins = originsOf(frame)
      if (!origins || !may(origins)) continue
      try {
        const read = (await frame.executeJavaScript(CARD_SCAN_SCRIPT(frame.parent ? frame.name : null))) as Pick<CardFrame, 'fields' | 'pay'>
        if (read.fields.length) found.push({ node: frame.frameTreeNodeId, origins, fields: read.fields, pay: read.pay })
      } catch {
        // The host only: never what the frame holds.
        log.warn('Card fields: could not read a frame on', hostOf(frame.origin))
      }
    }
    return found
  }

  /**
   * Fill a card in the fields cardFields tagged, frame by frame: each frame still the one read (the
   * same node, the same origins down to it) and each field taking its value, or nothing stays filled.
   * True once the whole card is in. Nothing of it is logged.
   */
  async fillCard(fills: Array<{ node: number; origins: string[]; values: Record<string, string> }>): Promise<boolean> {
    const wc = this.agentPage()
    const frames = new Map(wc.mainFrame.framesInSubtree.map((f) => [f.frameTreeNodeId, f]))
    const touched: Array<{ frame: Electron.WebFrameMain; ids: string[] }> = []
    let whole = true
    for (const fill of fills) {
      const frame = frames.get(fill.node)
      const ids = Object.keys(fill.values)
      if (!frame || originsOf(frame)?.join(' ') !== fill.origins.join(' ')) {
        whole = false
        break
      }
      touched.push({ frame, ids })
      const filled = (await frame.executeJavaScript(CARD_FILL_SCRIPT(fill.values)).catch(() => [])) as string[]
      if (filled.length !== ids.length) {
        whole = false
        break
      }
    }
    if (!whole) for (const { frame, ids } of touched) await frame.executeJavaScript(CARD_CLEAR_SCRIPT(ids)).catch(() => undefined)
    return whole
  }

  /** Press the pay button cardFields tagged in one of the page's frames, still the one read; true once pressed. */
  async pressPay(pay: { node: number; origins: string[]; id: string }): Promise<boolean> {
    const wc = this.agentPage()
    const frame = wc.mainFrame.framesInSubtree.find((f) => f.frameTreeNodeId === pay.node)
    if (!frame || originsOf(frame)?.join(' ') !== pay.origins.join(' ')) return false
    const pressed = (await frame.executeJavaScript(PAY_PRESS_SCRIPT(pay.id), true).catch(() => false)) as boolean
    if (pressed) await this.settled()
    return pressed
  }

  /** `text` without the stored passwords given (storedPasswords) nor any stored card number. */
  private masked(text: string, passwords: Set<string>): string {
    let out = text
    for (const password of passwords) out = out.split(password).join('(masqué)')
    return maskCards(out)
  }

  /** The passwords to mask on a page: those of its whole site, wider than where they fill. */
  private storedPasswords(url: string): Set<string> {
    if (!session.maybe) return new Set()
    return new Set(
      keychain
        .ofSite(url)
        .map((e) => keychain.secret(e.id)?.password ?? '')
        .filter(Boolean)
    )
  }

  /** The account locked: forget every page, cookie and login. */
  async forget(): Promise<void> {
    await this.endRun()
    // After the run, which puts the user's folder and its time back: the lock leaves no page, nobody's,
    // and none left lately, so the planned tasks of the next opening aren't held for it (tasks.isBusy).
    this.folderId = ''
    this.waiting = ''
    this.controller = 'agent'
    this.usedAt = 0
    // Nothing the next opening pays on came from a page of this one.
    const trail = this.view && this.trails.get(this.view.webContents)
    if (trail) Object.assign(trail, { arrival: null, going: null })
    if (this.view) void this.view.webContents.loadURL('about:blank')
    await electronSession.fromPartition(PARTITION).clearStorageData()
    this.changed()
  }

  private changed(): void {
    this.emit('state', this.state())
  }
}

export const browser = new Browser()
