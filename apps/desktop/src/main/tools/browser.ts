import { siteReady } from '@marianne/profile'
import * as z from 'zod'
import type { LoginKind } from '../../shared/sites'
import type { BrowserState } from '../../shared/types'
import { accounts } from '../account'
import { approvals, type Decision } from '../approvals'
import { browser, HumanControlError, type PageElement, type PageView } from '../browser'
import type { FormField } from '../browser/scripts'
import { content } from '../content'
import { keychain, siteOf } from '../keychain'
import { profile } from '../profile/store'
import { session } from '../session'
import { tasks } from '../tasks'
import { callingFolder } from './folder'
import { consequential, Consents } from './online'
import { clip, DOMAIN_IDS, fold, plural, tool, TOKEN, ToolError, type ToolContext } from './tool'

/**
 * Marianne online, in the built-in browser: she opens public-service websites once the user
 * agreed to go online, reads pages, clicks and types; anything that commits the user waits for
 * their yes on a card, and they can take control at any time (CAPTCHA, code received by SMS,
 * FranceConnect). Passwords never reach the engine: sign-in comes from the keychain.
 */

const consents = new Consents()
/** The page each folder read last: clicks and typing act on its elements. */
const pages = new Map<string, { url: string; elements: Map<string, PageElement> }>()
/** The form each folder read last: fills apply to that page only. */
const forms = new Map<string, { url: string; fields: FormField[] }>()

// What the user allowed and what Marianne read go away with the session.
session.on('locked', () => {
  consents.clear()
  pages.clear()
  forms.clear()
})

const HUMAN = 'The user has taken control of the browser: do not act on the page until they hand it back, then read it again (read_page).'
const HAND_OVER_MS = 10 * 60_000

const ELEMENT = z.string().regex(/^e\d+$/, 'an element id from read_page, e.g. e12')
const FIELD = z.string().regex(/^f\d+$/, 'a field id from read_form, e.g. f3')

/** A browser action; while the user has control, the engine is told to wait. */
async function act<T>(run: () => T | Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    throw new ToolError(err instanceof HumanControlError ? HUMAN : (err as Error).message)
  }
}

const refusal = (decision: Decision, nothing: string) =>
  new ToolError(`${decision === 'refused' ? 'The user refused' : 'No answer from the user'}: ${nothing}. Do not retry; ask them what they want to do.`)

/** Consent to go to the site of `url` from this folder: once per folder, or once per site, as the user chose. */
async function online(folderId: string, url: string, reason: string): Promise<void> {
  const site = siteOf(url)
  // A planned task's run has the sites the user gave it, and for anything else asks site by site:
  // « any site of this folder » was said of a conversation, not of a run nobody watches.
  if (tasks.allows(folderId, site)) return
  const ask = tasks.runningIn(folderId) ? 'site' : accounts.settings().browser.askOnline
  if (consents.has(folderId, site, ask)) return
  const decision = await approvals.request(folderId, {
    kind: 'online',
    title: `Aller sur ${site} ?`,
    reason,
    fields: [
      { label: 'site', value: site },
      { label: 'accord', value: ask === 'folder' ? 'pour tous les sites de ce dossier' : 'pour ce site, dans ce dossier' }
    ]
  })
  if (decision !== 'accepted') throw refusal(decision, `not going to ${site}`)
  consents.add(folderId, site)
}

/** The folder's page, while Marianne drives it and the user agreed to its site. */
async function current(ctx: ToolContext): Promise<{ folderId: string; url: string; title: string }> {
  const folderId = callingFolder(ctx.folderId).id
  const state = browser.state()
  if (!state.url || state.folderId !== folderId) throw new ToolError('No page of this folder is open in the browser: open one with open_site.')
  if (state.controller === 'human') throw new ToolError(HUMAN)
  await online(folderId, state.url, 'Marianne veut continuer sur ce site pour ce dossier.')
  return { folderId, url: state.url, title: state.title }
}

/** An element of the page the folder read, still on screen. */
function element(folderId: string, url: string, id: string): PageElement {
  const read = pages.get(folderId)
  if (!read || read.url !== url) throw new ToolError('Read the page first (read_page): element ids change with the page.')
  const found = read.elements.get(id)
  if (!found) throw new ToolError(`No element ${id} on the page read: read it again.`)
  return found
}

/** Keep the elements of a page read, for click and type_text, and describe it for the engine. */
function remember(folderId: string, view: PageView): string {
  pages.set(folderId, { url: browser.currentUrl(), elements: new Map(view.elements.map((e) => [e.id, e])) })
  const elements = view.elements.map((e) => {
    const type = e.type && e.type !== e.role ? ` (${e.type})` : ''
    return `- ${e.id} · ${e.role}${type} · « ${e.label || 'no label'} »${e.secret ? ' · password: sign_in fills it' : ''}`
  })
  return `# ${view.title || '(untitled)'}\n${view.url}\n\n${clip(view.text.trim(), 20_000)}\n\n## Elements\n\n${elements.join('\n') || '(none)'}`
}

/** Until the user gives control back after taking it, the session locks, or the time runs out. */
function handedBack(timeoutMs: number): Promise<'back' | 'locked' | 'timeout'> {
  return new Promise((resolve) => {
    let taken = browser.state().controller === 'human'
    const onState = (state: BrowserState) => {
      if (state.controller === 'human') taken = true
      else if (taken) done('back')
    }
    const onLocked = () => done('locked')
    const timer = setTimeout(() => done('timeout'), timeoutMs)
    function done(outcome: 'back' | 'locked' | 'timeout'): void {
      clearTimeout(timer)
      browser.off('state', onState)
      session.off('locked', onLocked)
      resolve(outcome)
    }
    browser.on('state', onState)
    session.on('locked', onLocked)
  })
}

const LOGIN: Record<LoginKind, string> = { franceconnect: 'FranceConnect', account: 'own account', none: 'no sign-in' }

const describeField = (f: FormField) =>
  `- ${f.id} · ${f.label || '(no label)'} · ${f.type}${f.required ? ' · required' : ''}${f.value ? ` · current « ${f.value.slice(0, 60)} »` : ''}${f.options?.length ? ` · options: ${f.options.slice(0, 15).join(' | ')}` : ''}`

export const browserTools = [
  tool({
    name: 'public_sites',
    title: 'Public sites',
    readOnly: true,
    description:
      'The catalog of public-service websites useful to individuals (taxes, CAF, ameli, France Travail, ANTS, pensions, justice…), by domain: what they are for, how one signs in, their id (for the target account:<id>), whether they are set up in the profile, and whether the keychain holds a login for them (never revealed).',
    input: { domain: z.enum(DOMAIN_IDS).optional(), query: z.string().optional().describe('Words to look for') },
    run: async ({ domain, query }) => {
      const words = fold(query ?? '')
        .split(/\s+/)
        .filter(Boolean)
      const { sites } = content.get()
      const list = sites.filter((s) => (!domain || s.domain === domain) && words.every((w) => fold(`${s.name} ${s.description} ${s.url}`).includes(w)))
      if (!list.length) throw new ToolError('No site of the catalog matches.')
      const p = profile.get()
      return list
        .map((s) => {
          const setup = s.fields?.length || s.needsNir ? (siteReady(p, s) ? ' · set up' : ` · not set up (target account:${s.id})`) : ''
          const login = keychain.hasLogin(s.url) ? ' · login in the keychain' : ''
          return `- **${s.name}** (id ${s.id}, ${s.domain}) · ${LOGIN[s.login]}${setup}${login}\n  ${s.description}\n  ${s.url}`
        })
        .join('\n')
    }
  }),

  tool({
    name: 'open_site',
    title: 'Open a site',
    tokens: false,
    description:
      'Opens a page in Marianne’s built-in browser, for this folder. The first time (in the folder, or on each site, as the user chose), they are asked to agree to go online. Open the most precise page (form, simulator, sign-in page), then read it with read_page. The browser may run out of sight: set show when the user should watch.',
    input: {
      url: z.string().url().describe('https address of the page'),
      reason: z.string().describe('What it is for, in one sentence for the user (in French): shown when asking them to go online'),
      show: z.boolean().default(false).describe('Show the browser to the user')
    },
    run: async ({ url, reason, show }, ctx) => {
      const folderId = callingFolder(ctx.folderId).id
      if (!/^https:\/\//i.test(url)) throw new ToolError('Only https addresses are opened.')
      if (browser.state().controller === 'human') throw new ToolError(HUMAN)
      await online(folderId, url, reason)
      await act(() => browser.open(url, folderId))
      const setting = accounts.settings().browser.show
      const visible = setting === 'always' || (setting === 'ask' && show)
      if (visible) browser.reveal()
      await browser.settled()
      const { url: landed, title } = browser.state()
      // Where the address led: its redirects are part of opening it.
      if (landed) consents.add(folderId, siteOf(landed))
      pages.delete(folderId)
      forms.delete(folderId)
      const login = keychain.hasLogin(landed || url)
        ? 'A login for this site is in the keychain: sign_in fills the form.'
        : 'No login for this site in the keychain: if it needs one, sign_in asks the user to add it, or hand_over lets them sign in.'
      return `Opened ${landed || url}${title ? ` (« ${title} »)` : ''}, ${visible ? 'shown to the user' : 'out of sight (the user can open the browser)'}.\n${login}\nNext: read_page.`
    }
  }),

  tool({
    name: 'read_page',
    title: 'Page reading',
    readOnly: true,
    description:
      'The page open in this folder’s browser: its text, and its links, buttons and fields numbered (e1, e2…) for click and type_text. Read it again after the page changes: the numbers change with it.',
    input: {},
    run: async (_args, ctx) => {
      const { folderId } = await current(ctx)
      return remember(folderId, await act(() => browser.readPage()))
    }
  }),

  tool({
    name: 'click',
    title: 'Click',
    description:
      'Clicks an element of the page read (read_page). A click that commits the user (sign, pay, send, submit, confirm, declare, delete, certify…) waits for their yes on a card: Marianne judges from the element, and you must set consequential when you know it commits them whatever its label (a box « je certifie sur l’honneur »…). If they refuse, do not retry: ask them.',
    input: {
      element: ELEMENT,
      purpose: z.string().describe('What the click does, in one sentence for the user (in French): shown when it needs their yes'),
      consequential: z.boolean().default(false).describe('True when the click commits the user')
    },
    run: async ({ element: id, purpose, consequential: flagged }, ctx) => {
      const { folderId, url, title } = await current(ctx)
      const read = element(folderId, url, id)
      const label = (await act(() => browser.elementLabel(id))) || read.label
      if (flagged || consequential({ ...read, label }, purpose)) {
        const shown = label || 'cet élément'
        browser.setWaiting(`cliquer sur « ${shown} »`)
        const decision = await approvals.request(folderId, {
          kind: 'online',
          title: `Cliquer sur « ${shown} »`,
          reason: purpose,
          fields: [
            { label: 'site', value: siteOf(url) },
            { label: 'page', value: title || url },
            { label: 'élément', value: shown }
          ]
        })
        browser.setWaiting('')
        if (decision !== 'accepted') throw refusal(decision, 'nothing was clicked')
        // The page may have changed while the card waited: click only what the user saw.
        if (browser.currentUrl() !== url) throw new ToolError('The page changed while the user was deciding: nothing was clicked. Read it again.')
      }
      await act(() => browser.click(id))
      const after = browser.state()
      if (after.url && siteOf(after.url) !== siteOf(url)) {
        try {
          await online(folderId, after.url, `Le clic sur « ${label || id} » mène à ce site.`)
        } catch (err) {
          browser.back()
          throw new ToolError(`The click led to ${siteOf(after.url)}. ${(err as Error).message} Went back to the previous page.`)
        }
      }
      return `Clicked « ${label || id} ». Now on ${after.url}${after.title ? ` (« ${after.title} »)` : ''}: read_page to see it.`
    }
  }),

  tool({
    name: 'type_text',
    title: 'Typing',
    description:
      'Types a value into a field of the page read (read_page). Use tokens such as [[nir]] or [[last_name]] for the user’s identifiers: Marianne replaces them on their side, and never with a password (sign_in). Nothing is sent until the form is submitted.',
    input: { element: ELEMENT, value: z.string().max(10_000) },
    run: async ({ element: id, value }, ctx) => {
      const { folderId, url } = await current(ctx)
      const read = element(folderId, url, id)
      if (read.secret) throw new ToolError('Never type a password: sign_in fills the login from the keychain, or hand_over lets the user type it.')
      if (read.role === 'link' || read.role === 'button') throw new ToolError(`${id} is a ${read.role}, not a field: use click.`)
      if (TOKEN.test(value)) throw new ToolError('Tokens with no value in the profile: use request_setup so the user fills them in.')
      await act(() => browser.type(id, value))
      return `Typed into « ${read.label || id} ». Nothing is sent until the form is submitted.`
    }
  }),

  tool({
    name: 'sign_in',
    title: 'Sign-in',
    description:
      'Fills the sign-in form of the page with the user’s login for this site, from their keychain (the values never reach you), then you click the sign-in button. Without a saved login, it asks them to add one. For FranceConnect or a code received by SMS, use hand_over.',
    input: { login: z.string().optional().describe('The label of the saved login to use, when the site has several') },
    run: async ({ login }, ctx) => {
      const { folderId, url } = await current(ctx)
      const site = siteOf(url)
      const entries = keychain.forUrl(url)
      if (!entries.length) {
        approvals.setup(folderId, {
          page: 'sites',
          label: `vos identifiants ${site}`,
          reason: `Aucun identifiant n’est enregistré pour ${site} : ajoutez-le au trousseau pour que Marianne remplisse la connexion.`
        })
        throw new ToolError(`No login for ${site} in the keychain: a card asks the user to add one. Meanwhile they can sign in themselves: use hand_over.`)
      }
      const labels = entries.map((e) => `« ${e.label} »`).join(', ')
      const entry = login ? entries.find((e) => fold(e.label) === fold(login.trim())) : entries.length === 1 ? entries[0] : undefined
      if (!entry) throw new ToolError(`${login ? `No saved login « ${login} »` : 'Several saved logins'} for ${site}: ${labels}. Give the label to use.`)
      const filled = await act(() => browser.fillLogin(entry.id))
      if (!filled.length) throw new ToolError('No sign-in form on this page: go to the site’s sign-in page first (read_page to find it).')
      const what = filled.length > 1 ? 'username and password' : filled[0] === 'mot de passe' ? 'password' : 'username'
      return `Filled the ${what} of « ${entry.label} ». Now click the sign-in button (read_page to find it).`
    }
  }),

  tool({
    name: 'hand_over',
    title: 'Hand over',
    description:
      'Asks the user to take control of the browser for what only they can do: a CAPTCHA, a code received by SMS or email, FranceConnect, a check of their own. The browser is shown with your request over the page; waits (up to 10 minutes) until they hand control back, then gives you the page as it is.',
    input: {
      reason: z.string().describe('What the user should do, in one sentence (in French), e.g. « Saisissez le code reçu par SMS, puis rendez-moi la main. »')
    },
    run: async ({ reason }, ctx) => {
      const folderId = callingFolder(ctx.folderId).id
      const state = browser.state()
      if (!state.url || state.folderId !== folderId) throw new ToolError('No page of this folder is open in the browser: open one with open_site.')
      browser.setWaiting(reason)
      browser.reveal()
      const outcome = await approvals.hold(folderId, handedBack(HAND_OVER_MS))
      browser.setWaiting('')
      if (outcome === 'locked') throw new ToolError('The session locked while waiting for the user.')
      if (outcome === 'timeout')
        throw new ToolError(
          'The user has not handed control back after 10 minutes: in your answer, ask them to click « rendre la main » once done, then carry on.'
        )
      const now = browser.state()
      if (now.folderId !== folderId || !now.url) throw new ToolError('The page is no longer this folder’s: open it again with open_site.')
      // The user took the page where it is now: Marianne may carry on there.
      consents.add(folderId, siteOf(now.url))
      return `The user handed control back. The page now:\n\n${remember(folderId, await act(() => browser.readPage()))}`
    }
  }),

  tool({
    name: 'task_progress',
    title: 'Task progress',
    description:
      'Shows the user where a task on a website stands: a card in the conversation with its steps, ticked as they are done. Call it again with the same site to update the same card.',
    input: {
      site: z.string().min(1).max(80).describe('The website, e.g. "impots.gouv.fr"'),
      steps: z
        .array(z.object({ label: z.string().min(1).max(120).describe('In French, for the user'), done: z.boolean() }))
        .min(1)
        .max(12)
    },
    run: async ({ site, steps }, ctx) => {
      const folderId = callingFolder(ctx.folderId).id
      const name = /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(site.trim()) ? siteOf(site) : site.trim()
      approvals.progress(folderId, { id: `progress:${folderId}:${name}`, site: name, steps })
      return `Progress card updated: ${steps.filter((s) => s.done).length}/${steps.length} steps done.`
    }
  }),

  tool({
    name: 'read_form',
    title: 'Form reading',
    readOnly: true,
    description:
      'The fields of the form on the page (f1, f2…): label, type, options and current values. Passwords and files are left out. Call it before fill_form, and again when the page changes.',
    input: {},
    run: async (_args, ctx) => {
      const { folderId, url } = await current(ctx)
      const fields = await act(() => browser.readForm())
      forms.set(folderId, { url: browser.currentUrl(), fields })
      if (!fields.length) return `No field to fill on ${url}. The user may have to sign in, or to go on to the form.`
      return `Form of ${url} (${plural(fields.length, 'field')}):\n${fields.map(describeField).join('\n')}`
    }
  }),

  tool({
    name: 'fill_form',
    title: 'Form filling',
    description:
      'Fills fields of the form read by read_form, once the user has confirmed on a card that shows every value. Use tokens such as [[nir]] or [[tax_number]] for their identifiers: Marianne replaces them on their side. For a list or radio buttons, give the exact label of an option. Never fills a password, and never submits the form.',
    input: {
      fields: z
        .array(z.object({ id: FIELD, value: z.string() }))
        .min(1)
        .max(100),
      reason: z.string().describe('What this fills in, in one sentence for the user (in French)')
    },
    run: async ({ fields, reason }, ctx) => {
      const { folderId, url } = await current(ctx)
      const read = forms.get(folderId)
      if (!read || read.url !== url) throw new ToolError('Read the form of this page first (read_form).')
      const byId = new Map(read.fields.map((f) => [f.id, f]))
      const unknown = fields.filter((f) => !byId.has(f.id)).map((f) => f.id)
      if (unknown.length) throw new ToolError(`Unknown fields: ${unknown.join(', ')}. Read the form again.`)
      if (fields.some((f) => TOKEN.test(f.value))) throw new ToolError('Tokens with no value in the profile: use request_setup so the user fills them in.')
      const title = `Remplir ${plural(fields.length, 'champ')} sur ${siteOf(url)}`
      browser.setWaiting(title.toLowerCase())
      const decision = await approvals.request(folderId, {
        kind: 'form',
        title,
        reason,
        fields: fields.map((f) => ({ label: byId.get(f.id)?.label || f.id, value: f.value }))
      })
      browser.setWaiting('')
      if (decision !== 'accepted') throw refusal(decision, 'nothing was filled')
      // The page may have changed while the card waited: fill only the one the user saw.
      if (browser.currentUrl() !== read.url) throw new ToolError('The page changed since the form was read: nothing was filled. Read it again.')
      const { filled, missing } = await act(() => browser.fillForm(Object.fromEntries(fields.map((f) => [f.id, f.value]))))
      return `Filled ${plural(filled.length, 'field')}${missing.length ? `; not filled (option not found or field gone): ${missing.join(', ')}` : ''}. Nothing was submitted: once the user has checked it, submit it with click (they approve it), or let them send it.`
    }
  })
]
