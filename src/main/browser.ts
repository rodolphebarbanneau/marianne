import { EventEmitter } from 'node:events'
import { BrowserWindow, session, shell, WebContentsView } from 'electron'
import type { BrowserState, PagePart } from '../shared/types'
import { log } from './log'
import { siteOf, vault } from './vault'
import { appIcon, load, nativeChrome, quitting, webPreferences } from './windows'

/**
 * The built-in browser, for public-service websites: our toolbar (a renderer, with the app's
 * preload) above a sandboxed view of the site (no preload, its own session), so a website can
 * never reach Marianne's API. Logins come from the keychain on the user's request, and the
 * user decides when a page is sent to the conversation.
 */

const TOOLBAR_HEIGHT = 76
const PARTITION = 'persist:marianne-web'
const MAX_PAGE_CHARS = 40_000

/** Fill the login form of a page: the password field and the username field before it. */
const FILL_SCRIPT = (username: string, password: string) => `(() => {
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden'
  const set = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const inputs = [...document.querySelectorAll('input')].filter((i) => visible(i) && !i.disabled && !i.readOnly)
  const pwd = inputs.find((i) => i.type === 'password')
  const textual = (i) => ['text', 'email', 'tel', 'number', ''].includes(i.type)
  const user = inputs.find((i) => /username|email/.test(i.autocomplete || '')) || (pwd ? inputs.slice(0, inputs.indexOf(pwd)).reverse() : inputs).find(textual)
  const filled = []
  if (user && ${JSON.stringify(username)}) { set(user, ${JSON.stringify(username)}); filled.push('identifiant') }
  if (pwd && ${JSON.stringify(password)}) { set(pwd, ${JSON.stringify(password)}); filled.push('mot de passe') }
  ;(pwd || user)?.focus()
  return filled
})()`

const READ_SCRIPT = `(() => ({ title: document.title, url: location.href, text: (document.body && document.body.innerText) || '' }))()`

export interface FormField {
  id: string
  label: string
  type: string
  required: boolean
  value: string
  options?: string[]
}

/**
 * The fields of the form on the page, each tagged with a data-marianne-field id. Passwords, files
 * and buttons are left out: they are never filled.
 */
const FORM_READ_SCRIPT = `(() => {
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden'
  const text = (el) => (el ? (el.innerText || el.textContent || '') : '').replace(/\\s+/g, ' ').trim()
  const labelOf = (el) => {
    const byFor = el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean)
    const labelled = ids.map((i) => text(document.getElementById(i))).join(' ')
    return (text(byFor) || text(el.closest('label')) || el.getAttribute('aria-label') || labelled || el.placeholder || el.title || el.name || '').slice(0, 140)
  }
  const skip = ['hidden', 'password', 'file', 'submit', 'button', 'image', 'reset']
  // Shown passwords (type switched to text), one-time codes, captchas, card codes.
  const secret = (el) =>
    /password|one-time-code|cc-/i.test(el.getAttribute('autocomplete') || '') ||
    /pass(?!eport)|mot.?de.?passe|pwd|\\botp|captcha|code.?de.?s[ée]curit|cvv|cvc|cryptogramme/i.test([el.name, el.id, labelOf(el)].join(' '))
  const fields = []
  const groups = new Map()
  let n = 0
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (skip.includes(el.type) || el.disabled || !visible(el) || secret(el)) continue
    if (el.type === 'radio') {
      const key = el.name || 'radio' + n
      let g = groups.get(key)
      if (!g) {
        g = { id: 'f' + ++n, label: text(el.closest('fieldset')?.querySelector('legend')) || el.name, type: 'radio', required: el.required, value: '', options: [] }
        groups.set(key, g)
        fields.push(g)
      }
      el.setAttribute('data-marianne-field', g.id)
      const option = labelOf(el) || el.value
      g.options.push(option)
      if (el.checked) g.value = option
      continue
    }
    const id = 'f' + ++n
    el.setAttribute('data-marianne-field', id)
    fields.push({
      id,
      label: labelOf(el),
      type: el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : el.type || 'text',
      required: el.required,
      value: el.type === 'checkbox' ? String(el.checked) : el.value,
      options: el.tagName === 'SELECT' ? [...el.options].map((o) => text(o) || o.value) : undefined
    })
  }
  return fields
})()`

/** Fill tagged fields; values of radios and selects match an option's label or value. */
const FORM_FILL_SCRIPT = (values: Record<string, string>) => `(() => {
  const values = ${JSON.stringify(values)}
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase()
  const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden'
  const filled = []
  const missing = []
  for (const [id, value] of Object.entries(values)) {
    const els = [...document.querySelectorAll('[data-marianne-field="' + id + '"]')]
    const el = els[0]
    if (!el || el.type === 'password' || el.type === 'file' || el.type === 'hidden' || !visible(el)) { missing.push(id); continue }
    if (el.type === 'radio') {
      const target = els.find((r) => norm(r.value) === norm(value) || norm((r.labels && r.labels[0] && r.labels[0].innerText) || r.closest('label')?.innerText) === norm(value))
      if (!target) { missing.push(id); continue }
      target.click()
    } else if (el.type === 'checkbox') {
      const on = ['true', 'oui', '1', 'x'].includes(norm(value))
      if (el.checked !== on) el.click()
    } else if (el.tagName === 'SELECT') {
      const option = [...el.options].find((o) => norm(o.value) === norm(value) || norm(o.text) === norm(value))
      if (!option) { missing.push(id); continue }
      el.value = option.value
      fire(el)
    } else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
      fire(el)
    }
    filled.push(id)
  }
  return { filled, missing }
})()`

class Browser extends EventEmitter {
  private win: BrowserWindow | null = null
  private view: WebContentsView | null = null
  private notice = ''
  private noticeTimer: NodeJS.Timeout | null = null

  private create(): void {
    const web = session.fromPartition(PARTITION)
    // Websites get nothing beyond plain browsing: no camera, location, notifications…
    web.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'clipboard-sanitized-write' || permission === 'fullscreen'))

    this.win = new BrowserWindow({
      width: 1180,
      height: 820,
      minWidth: 640,
      minHeight: 420,
      show: false,
      title: 'Marianne · navigateur',
      icon: appIcon(),
      ...nativeChrome(),
      webPreferences: webPreferences()
    })
    this.win.removeMenu()
    // The toolbar has the app's API: it never leaves its own page (a link dropped on it included).
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.win.webContents.on('will-navigate', (e) => e.preventDefault())
    this.view = new WebContentsView({
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false }
    })
    this.win.contentView.addChildView(this.view)
    const layout = () => {
      if (!this.win || !this.view) return
      const [width, height] = this.win.getContentSize()
      this.view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT) })
    }
    this.win.on('resize', layout)
    layout()

    const wc = this.view.webContents
    // Popups open in the same view; mail and phone links go to the system, other schemes nowhere.
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) void wc.loadURL(url)
      else if (/^(mailto|tel):/i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    for (const event of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading'] as const) {
      wc.on(event as 'did-navigate', () => this.changed())
    }
    wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3) this.flash(`impossible d’ouvrir la page (${description})`)
      // The host only: a URL may carry the user's values.
      log.warn('Browser load failed', code, description, siteOf(url))
    })

    this.win.on('close', (e) => {
      if (quitting()) return
      e.preventDefault()
      this.win?.hide()
    })
    load(this.win, 'browser')
  }

  /** Open `url` in the built-in browser (http and https only). */
  open(url: string): void {
    if (!/^https?:\/\//i.test(url)) throw new Error(`Adresse non prise en charge : ${url}`)
    if (!this.win) this.create()
    void this.view!.webContents.loadURL(url)
    this.win!.show()
    this.win!.focus()
  }

  navigate(input: string): void {
    const text = input.trim()
    if (!text) return
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
    const url = wc?.getURL() ?? ''
    return {
      url,
      title: wc?.getTitle() ?? '',
      loading: wc?.isLoading() ?? false,
      canGoBack: wc?.navigationHistory.canGoBack() ?? false,
      canGoForward: wc?.navigationHistory.canGoForward() ?? false,
      logins: url ? vault.forUrl(url).map((e) => ({ id: e.id, label: e.label, username: e.username })) : [],
      notice: this.notice || undefined
    }
  }

  /** Fill the login form with a keychain entry, in the frames that belong to the entry's site only. */
  async fill(entryId: string): Promise<void> {
    const wc = this.view?.webContents
    const entry = vault.list().find((e) => e.id === entryId)
    const secret = entry && vault.secret(entryId)
    if (!wc || !entry || !secret) return
    const site = siteOf(entry.url)
    if (siteOf(wc.getURL()) !== site) return this.flash('cet identifiant n’est pas pour ce site')
    let filled: string[] = []
    for (const frame of wc.mainFrame.framesInSubtree) {
      if (siteOf(frame.url) !== site) continue
      try {
        filled = (await frame.executeJavaScript(FILL_SCRIPT(secret.username, secret.password))) as string[]
      } catch (err) {
        log.warn('Autofill failed in a frame:', (err as Error).message)
      }
      if (filled.length) break
    }
    this.flash(filled.length ? `${filled.join(' et ')} rempli${filled.length > 1 ? 's' : ''}` : 'aucun champ de connexion trouvé sur cette page')
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

  /** The page shown, if any. */
  currentUrl(): string {
    return this.view?.webContents.getURL() ?? ''
  }

  /** The fields of the form shown (main frame), for the agent. */
  async readForm(): Promise<FormField[]> {
    const wc = this.view?.webContents
    if (!wc || !wc.getURL()) throw new Error('Aucune page ouverte dans le navigateur de Marianne.')
    await this.settled()
    // Pages built by scripts may show their form a moment after loading.
    const secrets = new Set(
      vault
        .forUrl(wc.getURL())
        .map((e) => vault.secret(e.id)?.password)
        .filter(Boolean)
    )
    for (let attempt = 1; ; attempt++) {
      const fields = (await wc.executeJavaScript(FORM_READ_SCRIPT)) as FormField[]
      for (const f of fields) if (secrets.has(f.value)) f.value = '(masqué)'
      if (fields.length || attempt === 3) return fields
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  /** Fill fields read by readForm. Never submits the form. */
  async fillForm(values: Record<string, string>): Promise<{ filled: string[]; missing: string[] }> {
    const wc = this.view?.webContents
    if (!wc || !wc.getURL()) throw new Error('Aucune page ouverte dans le navigateur de Marianne.')
    const result = (await wc.executeJavaScript(FORM_FILL_SCRIPT(values))) as { filled: string[]; missing: string[] }
    this.flash(`${result.filled.length} champ${result.filled.length > 1 ? 's' : ''} rempli${result.filled.length > 1 ? 's' : ''} : vérifiez avant d’envoyer`)
    this.win?.show()
    return result
  }

  /** The visible text of the page, for the conversation. */
  async capture(): Promise<PagePart | null> {
    const wc = this.view?.webContents
    if (!wc || !wc.getURL()) return null
    const page = (await wc.executeJavaScript(READ_SCRIPT)) as { title: string; url: string; text: string }
    const text = page.text
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    const clipped = text.length > MAX_PAGE_CHARS ? `${text.slice(0, MAX_PAGE_CHARS)}\n[… page tronquée]` : text
    this.flash('page envoyée au dialogue')
    return { type: 'page', url: page.url, title: page.title, text: clipped }
  }

  private flash(notice: string): void {
    this.notice = notice
    if (this.noticeTimer) clearTimeout(this.noticeTimer)
    this.noticeTimer = setTimeout(() => {
      this.notice = ''
      this.changed()
    }, 4000)
    this.changed()
  }

  private changed(): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('marianne:browserState', this.state())
  }

  /** The keychain changed: refresh the logins offered for the current site. */
  refresh(): void {
    this.changed()
  }
}

export const browser = new Browser()
