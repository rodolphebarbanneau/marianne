import { EventEmitter } from 'node:events'
import { session as electronSession, shell, WebContentsView, type BrowserWindow } from 'electron'
import type { BrowserState, PagePart } from '../../shared/types'
import { keychain, siteOf } from '../keychain'
import { log } from '../log'
import { session } from '../session'
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

export interface PageElement {
  id: string
  role: string
  label: string
  type: string
  secret: boolean
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
  /** The user's page and folder, set aside while a run has its own view. */
  private aside: { view: WebContentsView | null; folderId: string; usedAt: number } | null = null
  private prepared = new Set<string>()

  /**
   * A planned task's run starts: it gets a view of its own, in its own empty session, held to its
   * sites (run-guard.ts); the user's page waits aside, untouched. The scheduler only starts a run
   * while the browser isn't the user's (tasks.ts).
   */
  async beginRun(guard: (url: string) => boolean): Promise<void> {
    if (this.runGuard) await this.endRun()
    await electronSession.fromPartition(RUN_PARTITION).clearStorageData()
    this.aside = { view: this.view, folderId: this.folderId, usedAt: this.usedAt }
    this.view?.setVisible(false)
    this.view = null
    this.runGuard = guard
    this.changed()
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
    if (this.runGuard) this.emit('taken')
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

  /** Open `url` for a folder (http and https only). */
  open(url: string, folderId = this.folderId): void {
    if (!/^https?:\/\//i.test(url)) throw new Error(`Adresse non prise en charge : ${url}`)
    this.folderId = folderId
    this.usedAt = Date.now()
    void this.ensure().webContents.loadURL(url)
    this.changed()
  }

  navigate(input: string): void {
    const text = input.trim()
    if (!text) return
    this.reachedFor()
    const url = /^https?:\/\//i.test(text)
      ? text
      : /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(text)
        ? `https://${text}`
        : `https://www.service-public.gouv.fr/particuliers/recherche?keyword=${encodeURIComponent(text)}`
    this.open(url)
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
      url: wc?.getURL() ?? '',
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
    if (!wc || !wc.getURL()) throw new Error('Aucune page ouverte dans le navigateur de Marianne.')
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

  /** The page as Marianne sees it: text and the elements she can act on. Stored passwords are masked. */
  async readPage(): Promise<PageView> {
    const wc = this.agentPage()
    await this.settled()
    const page = (await wc.executeJavaScript(PAGE_READ_SCRIPT)) as PageView
    const secrets = this.storedPasswords(page.url)
    for (const secret of secrets) page.text = page.text.split(secret).join('(masqué)')
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
      for (const f of fields) if (secrets.has(f.value)) f.value = '(masqué)'
      if (fields.length || attempt === 3) return fields
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  /** Fill fields read by readForm. Never submits the form. */
  async fillForm(values: Record<string, string>): Promise<{ filled: string[]; missing: string[] }> {
    return (await this.agentPage().executeJavaScript(FORM_FILL_SCRIPT(values))) as { filled: string[]; missing: string[] }
  }

  /** Fill the login form with a keychain entry, in the frames that belong to the entry's site only. */
  async fillLogin(entryId: string): Promise<string[]> {
    const wc = this.view?.webContents
    const entry = keychain.list().find((e) => e.id === entryId)
    const secret = entry && keychain.secret(entryId)
    if (!wc || !entry || !secret) return []
    const site = siteOf(entry.url)
    if (siteOf(wc.getURL()) !== site) throw new Error('Cet identifiant n’est pas pour ce site.')
    for (const frame of wc.mainFrame.framesInSubtree) {
      if (siteOf(frame.url) !== site) continue
      try {
        const filled = (await frame.executeJavaScript(FILL_SCRIPT(secret.username, secret.password))) as string[]
        if (filled.length) return filled
      } catch (err) {
        log.warn('Autofill failed in a frame:', (err as Error).message)
      }
    }
    return []
  }

  /** The visible text of the page, to give to the conversation. */
  async capture(): Promise<PagePart | null> {
    const wc = this.view?.webContents
    if (!wc || !wc.getURL()) return null
    const page = (await wc.executeJavaScript(READ_SCRIPT)) as { title: string; url: string; text: string }
    const text = page.text
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return { type: 'page', url: page.url, title: page.title, text: text.length > MAX_PAGE_CHARS ? `${text.slice(0, MAX_PAGE_CHARS)}\n[… page tronquée]` : text }
  }

  currentUrl(): string {
    return this.view?.webContents.getURL() ?? ''
  }

  private storedPasswords(url: string): Set<string> {
    if (!session.maybe) return new Set()
    return new Set(
      keychain
        .forUrl(url)
        .map((e) => keychain.secret(e.id)?.password ?? '')
        .filter(Boolean)
    )
  }

  /** The account locked: forget every page, cookie and login. */
  async forget(): Promise<void> {
    this.folderId = ''
    this.waiting = ''
    this.controller = 'agent'
    await this.endRun()
    if (this.view) void this.view.webContents.loadURL('about:blank')
    await electronSession.fromPartition(PARTITION).clearStorageData()
    this.changed()
  }

  private changed(): void {
    this.emit('state', this.state())
  }
}

export const browser = new Browser()
