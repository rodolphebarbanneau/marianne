import { siteReady } from '@marianne/profile'
import * as z from 'zod'
import type { ApprovalRequest } from '../../shared/approvals'
import { cardTitle, cvvProblem, expired, parseExpiry } from '../../shared/cards'
import type { LoginKind } from '../../shared/sites'
import type { BrowserState, PaymentCard, PlannedTask } from '../../shared/types'
import { accounts } from '../account'
import { approvals, type Decision } from '../approvals'
import { browser, HumanControlError, type PageElement, type PageView } from '../browser'
import { cardFills, frameMayReceive, paymentRoute, planCard, type CardFieldKind, type CardPlan } from '../browser/payment'
import type { FormField } from '../browser/scripts'
import { cards } from '../cards'
import { content } from '../content'
import { hostOf, siteOf } from '../../shared/hosts'
import { services } from '../host'
import { keychain } from '../keychain'
import { profile } from '../profile/store'
import { session } from '../session'
import { siteAllowed, tasks } from '../tasks'
import { callingFolder } from './folder'
import { binding, consequential, Consents, knownSites, PAY_GRANT_MS, PayGrants, paying, reading } from './online'
import { clip, DOMAIN_IDS, fold, plural, tool, TOKEN, ToolError, type ToolContext } from './tool'

/**
 * Marianne online, in the built-in browser: she opens public-service websites once the user
 * agreed to go online (on a card, or ahead: main/approvals.ts), reads pages, clicks and types;
 * anything that commits the user waits for their yes on a card, and they can take control at any
 * time (CAPTCHA, code received by SMS, FranceConnect). Passwords never reach the engine: sign-in
 * comes from the keychain. Nor do cards: paying by card fills the user's saved card after their yes.
 */

const consents = new Consents()
/** The pay click each folder's approved payment covers (pay_by_card, click). */
const payGrants = new PayGrants()
/** The page each folder read last: clicks and typing act on its elements. */
const pages = new Map<string, { url: string; elements: Map<string, PageElement> }>()
/** The form each folder read last: fills apply to that page only. */
const forms = new Map<string, { url: string; fields: FormField[] }>()
/**
 * The sites where something of the user's own may be in play this session: an account Marianne signed
 * in to (sign_in), a page the user had in hand (hand_over, « prendre la main »), where they may have
 * signed in or typed their card. There, a click that reads as paying may pay with what the site keeps,
 * without the payment card (click). By site, not by folder: the browser's sign-ins are the session's,
 * every folder's, until the lock empties them.
 */
const personal = new Set<string>()

// What the user allowed and what Marianne read go away with the session.
session.on('locked', () => {
  consents.clear()
  payGrants.clear()
  pages.clear()
  forms.clear()
  personal.clear()
})
// A payment's yes covers its pay click within its turn only.
approvals.on('ended', (folderId: string) => payGrants.end(folderId))
// Wherever the user goes while the page is in their hands.
browser.on('state', (state: BrowserState) => {
  if (state.controller === 'human' && state.url && session.unlocked) personal.add(siteOf(state.url))
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

/** Nobody watches a run, so nothing waits on a card: what is beyond it stops it, and the user is told. */
const beyondRun = (what: string) =>
  new ToolError(`A planned task's run cannot ${what}: nobody is watching. Stop here and report "waiting" with task_report, saying what the user should do.`)

/**
 * The run a call started in (ToolContext.run), while it still runs; null for a conversation's call.
 * A call that outlives its run (the user's message stopped it while a page loaded) stops here: it
 * never goes on as a conversation's, so nothing it reached becomes the folder's consent. So does one
 * made once the run's browser is gone (the user typed an address) while its engine is being stopped:
 * the page is the user's again.
 */
function runOf(ctx: ToolContext): PlannedTask | null {
  if (!ctx.run) return null
  if (tasks.runningIn(ctx.run.folderId) !== ctx.run || !browser.inRun()) throw new ToolError('The planned task’s run is over: stop here.')
  return ctx.run
}

const refusal = (decision: Decision, nothing: string) =>
  new ToolError(`${decision === 'refused' ? 'The user refused' : 'No answer from the user'}: ${nothing}. Do not retry; ask them what they want to do.`)

/** The user's go-ahead from a planned task's follow-up: its label, its task's sites, its service. */
interface GoAhead {
  label: string
  sites: string[]
  service: string
}

/**
 * The follow-up the user started the call's turn with (ToolContext.followUp, the chat runner's), while
 * that very turn goes on: their go-ahead, for it, to go to the task's sites and fill forms on those its
 * service declares (the approval policy still decides, and the floor holds). A built-in service's task
 * with its template's follow-up only, while it still offers it (its service on); never in a run, and
 * nothing a call the turn outlived can use.
 */
function goAhead(ctx: ToolContext): GoAhead | null {
  const task = ctx.followUp
  if (!task?.followUp || ctx.run || task.origin.kind !== 'service' || tasks.followingUp(ctx.folderId) !== task || !tasks.isOffered(task)) return null
  return { label: task.followUp.label, sites: task.sites, service: task.origin.service }
}

/**
 * The sites Marianne knows, by registrable domain: the content's public sites, and those the built-in
 * services that are on declare (`sites`), never a community service's. The « autonomie » level lets
 * her go there and fill forms without asking.
 */
export const known = (): Set<string> => knownSites([...content.get().sites.map((s) => s.url), ...services.declaredSites()])

/**
 * Whether an address is on a site the built-in services that are on declare, or among `sites`: on a
 * declared host or under it, as a task's sites are matched (« www.x » standing for x), never the
 * whole registrable domain. There, Marianne clicks the steps on the way without a card (click).
 */
const declared = (url: string, sites = services.declaredSites()): boolean => siteAllowed({ sites }, url)

/** Going to the page `url` from a folder, as the approval policy reads it: what the folder said yes to, and the follow-up's go-ahead when its task's sites hold the page. */
function goingTo(folderId: string, url: string, go: GoAhead | null): Extract<ApprovalRequest, { action: 'online' }> {
  const site = siteOf(url)
  return {
    action: 'online',
    site,
    known: known().has(site),
    consented: { site: consents.has(folderId, site, 'site'), folder: consents.has(folderId, site, 'folder') },
    ...(go && siteAllowed(go, url) ? { followUp: go.label } : {})
  }
}

/**
 * Consent to go to the site of `url` from this folder, as the approval policy decides: the user's yes
 * on a card, or given in the folder before, or allowed ahead (their level, a standing permission, the
 * follow-up they started). True when the user said yes in this folder to that site; false when it
 * was allowed ahead, which covers that site only and isn't kept as the folder's consent, or when the
 * page counts as another one (a payment's).
 */
async function online(folderId: string, url: string, reason: string, run: PlannedTask | null, go: GoAhead | null = null): Promise<boolean> {
  // A run has the sites the user gave it. It neither reads nor adds to the folder's consents: those
  // were given to a conversation, and what a run opens mustn't widen what a conversation may.
  if (run) {
    if (siteAllowed(run, url)) return false
    throw beyondRun(`reach ${siteOf(url)}`)
  }
  // How the browser came to the page, when it is the one open now (not an address about to be opened).
  const arrival = url === browser.currentUrl() ? browser.arrival() : null
  // Where the payment the user approved led (the bank's 3-D Secure, the way back): part of it, its card the yes.
  if (payGrants.onward(folderId, url, arrival)) return false
  // A payment provider's page that a declared site's own page sent the browser to counts as that page: whatever
  // let Marianne there (the folder's yes, a standing permission, « autonomie », the follow-up) lets her on, and
  // nothing else does. Otherwise it is a site of its own.
  const route = arrival && paymentRoute(url, arrival, (_site, page) => declared(page))
  const at = route?.provider && approvals.covered(folderId, goingTo(folderId, route.from, go)) ? route.from : url
  const request = goingTo(folderId, at, go)
  const site = request.site
  const each = accounts.settings().approvals.level === 'ask'
  const { decision, ahead } = await approvals.ask(folderId, request, {
    kind: 'online',
    title: `Aller sur ${site}`,
    reason,
    fields: [
      { label: 'site', value: site },
      { label: 'accord', value: each ? 'pour ce site, dans ce dossier' : 'pour tous les sites de ce dossier' }
    ]
  })
  if (decision !== 'accepted') throw refusal(decision, `not going to ${site}`)
  if (!ahead) consents.add(folderId, site)
  return !ahead && at === url
}

/** The folder's page, while Marianne drives it and the user agreed to its site. */
async function current(ctx: ToolContext): Promise<{ folderId: string; url: string; title: string }> {
  const folderId = callingFolder(ctx.folderId).id
  const state = browser.state()
  if (!state.url || state.folderId !== folderId) throw new ToolError('No page of this folder is open in the browser: open one with open_site.')
  if (state.controller === 'human') throw new ToolError(HUMAN)
  await online(folderId, state.url, 'Marianne veut continuer sur ce site pour ce dossier.', runOf(ctx), goAhead(ctx))
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

/**
 * Whether a frame of the page, any of them, holds a card's number or security code, filled or not
 * (pay_by_card's scan): a card may be typed there. A holder's name or an expiry alone may be an
 * account's or an identity card's.
 */
async function holdsCard(): Promise<boolean> {
  const frames = await act(() => browser.cardFields(() => true))
  return frames.some((frame) => frame.fields.some((field) => field.kind === 'number' || field.kind === 'cvv'))
}

/** Keep the elements of a page read, for click and type_text, and describe it for the engine. */
function remember(folderId: string, view: PageView): string {
  pages.set(folderId, { url: browser.currentUrl(), elements: new Map(view.elements.map((e) => [e.id, e])) })
  const elements = view.elements.map((e) => {
    const type = e.type && e.type !== e.role ? ` (${e.type})` : ''
    const secret = e.card ? ' · card field: pay_by_card fills it' : e.secret ? ' · password: sign_in fills it' : ''
    return `- ${e.id} · ${e.role}${type} · « ${e.label || 'no label'} »${secret}`
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

/** The saved card to pay with: the one named (its label, or its last four digits), or the only one that hasn't expired; otherwise a ToolError that lists them. */
function pickCard(wanted: string | undefined): PaymentCard {
  const all = cards.list()
  if (!all.length)
    throw new ToolError(
      'No card is saved. Propose adding one (request_setup, target payment), or let the user type theirs in the page (hand_over). Never ask for card details in the conversation.'
    )
  const listing = all.map((c) => `- ${cardTitle(c)}${expired(c.expiry) ? ' (expired)' : ''}`).join('\n')
  const name = wanted?.trim() ?? ''
  const digits = name.replace(/\D/g, '')
  const found = name ? all.filter((c) => fold(c.label) === fold(name) || (digits.length === 4 && digits === c.last4)) : all.filter((c) => !expired(c.expiry))
  if (found.length !== 1) {
    const why = name
      ? found.length
        ? `Several saved cards match « ${name} »`
        : `No saved card « ${name} »`
      : found.length
        ? 'Several saved cards'
        : 'Every saved card has expired'
    throw new ToolError(`${why}. The user's cards (give card: its label or its last four digits):\n${listing}`)
  }
  if (expired(found[0].expiry)) throw new ToolError(`That card has expired: use another, or let the user type theirs (hand_over).\n${listing}`)
  return found[0]
}

/** The fields a plan fills, in French for the card and in English for the engine. */
const FIELD_WORDS: Record<CardFieldKind, [string, string]> = {
  number: ['numéro', 'card number'],
  expiry: ['date d’expiration', 'expiry'],
  month: ['date d’expiration', 'expiry'],
  year: ['date d’expiration', 'expiry'],
  holder: ['titulaire', 'holder'],
  cvv: ['cryptogramme', 'security code']
}
function filledWords(plan: CardPlan, language: 0 | 1): string {
  const words = [...new Set(plan.targets.map((t) => FIELD_WORDS[t.kind][language]))]
  return language ? words.join(', ').replace(/, ([^,]+)$/, ' and $1') : words.join(', ')
}

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
      'Opens a page in Marianne’s built-in browser, for this folder. Going to a site needs the user’s agreement: a card asks them, unless they already said yes to it in this folder, allowed it ahead (their level, a standing permission), or started this turn from a planned task’s follow-up that covers the site. Open the most precise page (form, simulator, sign-in page), then read it with read_page. The browser may run out of sight: set show when the user should watch.',
    input: {
      url: z.string().url().describe('https address of the page'),
      reason: z.string().describe('What it is for, in one sentence for the user (in French): shown when asking them to go online'),
      show: z.boolean().default(false).describe('Show the browser to the user')
    },
    run: async ({ url, reason, show }, ctx) => {
      const folderId = callingFolder(ctx.folderId).id
      if (!/^https:\/\//i.test(url)) throw new ToolError('Only https addresses are opened.')
      if (browser.state().controller === 'human') throw new ToolError(HUMAN)
      const run = runOf(ctx)
      const go = goAhead(ctx)
      // An address Marianne opens is her own step: what follows is no longer a payment's (the bank's 3-D Secure).
      payGrants.land(folderId)
      const asked = await online(folderId, url, reason, run, go)
      await act(() => browser.open(url, folderId))
      const setting = accounts.settings().browser.show
      // A planned task's run happens out of sight: it doesn't take the user's screen.
      const visible = !run && (setting === 'always' || (setting === 'ask' && show))
      if (visible) browser.reveal()
      await browser.settled()
      const { url: landed, title } = browser.state()
      // Where the address led: its redirects are part of opening it, when the user said yes to it in this
      // conversation. A run stops there; read again, one the user's message ended while the page loaded
      // stops here, adding nothing. Allowed ahead, the yes covers its own site: another one is asked on its own.
      if (landed && runOf(ctx)) await online(folderId, landed, reason, run)
      else if (landed && asked) consents.add(folderId, siteOf(landed))
      else if (landed && siteOf(landed) !== siteOf(url)) {
        try {
          await online(folderId, landed, reason, null, go)
        } catch (err) {
          browser.back()
          throw new ToolError(`The address led to ${siteOf(landed)}. ${(err as Error).message} Went back to the previous page.`)
        }
      }
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
      'Clicks an element of the page read (read_page). A click that commits the user (sign, pay, send, submit, confirm, declare, delete, certify…) waits for their yes on a card: Marianne judges from the element, and you must set consequential when you know it commits them whatever its label (a box « je certifie sur l’honneur »…). On a site Marianne’s services that are on act on, the steps on the way (search, validate, continue, go on to pay) need no card, since paying there goes through pay_by_card’s, while signing, sending, declaring, deleting and the like still ask. A click there whose label pays asks when the page holds card fields, or once the user’s account may be open on the site (sign_in, hand_over, the user took control), unless pay_by_card’s yes covers it. Set consequential on any click that would pay without pay_by_card (a card saved in the site’s account, a one-click payment). If they refuse, do not retry: ask them.',
    input: {
      element: ELEMENT,
      purpose: z.string().describe('What the click does, in one sentence for the user (in French): shown when it needs their yes'),
      consequential: z.boolean().default(false).describe('True when the click commits the user, or would pay without pay_by_card')
    },
    run: async ({ element: id, purpose, consequential: flagged }, ctx) => {
      const { folderId, url, title } = await current(ctx)
      const read = element(folderId, url, id)
      const label = (await act(() => browser.elementLabel(id))) || read.label
      const clicked = { ...read, label }
      // Judged where the click happens: the page as it is now.
      const here = browser.currentUrl()
      const version = browser.pageVersion()
      const run = runOf(ctx)
      let paid = false
      if (run) {
        // On a site its own service declares (and its task lists), a run clicks through a search short of what binds
        // the user: it has no sign-in, no card and no other site to pay with. Elsewhere, only what plainly reads.
        const own = run.origin.kind === 'service' && siteAllowed(run, here) && declared(here, services.declaredSites(run.origin.service))
        if (flagged || (own ? binding(clicked, purpose) : !reading(clicked, purpose))) throw beyondRun(`click « ${label || id} »`)
      } else if (flagged || consequential(clicked, purpose)) {
        // The pay click that follows a payment the user approved on this very page (pay_by_card) goes on that yes, once:
        // never one the engine says binds them beyond paying.
        paid = payGrants.take(folderId, url, version, label) && !binding(clicked, purpose)
        // Once that payment was pressed here, another click that pays would pay again: it asks, until the page changes.
        const again = !paid && paying(label) && payGrants.pressedOn(folderId, url, version)
        // On a site Marianne's own services declare, the steps on the way (searching, validating, going on to pay) need
        // no card: paying there takes pay_by_card's. What binds the user beyond paying, or what the engine flags, asks.
        // So does a click that reads as paying where something else could pay: a card in the page (the user's, typed
        // in a hand-over), or an account of theirs open on the site, which may keep a card of its own.
        const free =
          paid ||
          (!flagged && !again && declared(here) && !binding(clicked, purpose) && (!paying(label) || (!personal.has(siteOf(here)) && !(await holdsCard()))))
        const shown = label || 'cet élément'
        // The floor: a card for this one click, at every level, whatever the user allowed ahead.
        const { decision } = free
          ? { decision: 'accepted' as const }
          : await approvals.ask(
              folderId,
              { action: 'commit' },
              {
                kind: 'online',
                title: `Cliquer sur « ${shown} »`,
                reason: purpose,
                fields: [
                  { label: 'site', value: siteOf(url) },
                  { label: 'page', value: title || url },
                  { label: 'élément', value: shown }
                ]
              },
              { onCard: () => browser.setWaiting(`cliquer sur « ${shown} »`) }
            )
        browser.setWaiting('')
        if (decision !== 'accepted') throw refusal(decision, 'nothing was clicked')
        // The page may have changed while the card waited: click only what the user saw.
        if (browser.currentUrl() !== url) throw new ToolError('The page changed while the user was deciding: nothing was clicked. Read it again.')
      }
      // The pay click the payment's yes covered: what it leads to is part of that payment (the bank's 3-D Secure), and
      // the page is marked. Any other click is Marianne's own step: what follows is no longer the payment's.
      if (paid) payGrants.press(folderId, url, version, browser.arrival()?.url)
      else payGrants.land(folderId)
      await act(() => browser.click(id))
      const after = browser.state()
      // A run: still running (runOf stops it otherwise), and on one of its sites: its hosts, not
      // the whole registrable domain.
      if (run && runOf(ctx) && after.url && !siteAllowed(run, after.url)) {
        browser.back()
        throw beyondRun(`follow « ${label || id} » there`)
      }
      if (!run && after.url && siteOf(after.url) !== siteOf(url)) {
        try {
          await online(folderId, after.url, `Le clic sur « ${label || id} » mène à ce site.`, null, goAhead(ctx))
        } catch (err) {
          browser.back()
          throw new ToolError(`The click led to ${siteOf(after.url)}. ${(err as Error).message} Went back to the previous page.`)
        }
      }
      const covered = paid ? ', as part of the payment the user approved' : ''
      return `Clicked « ${label || id} »${covered}. Now on ${after.url}${after.title ? ` (« ${after.title} »)` : ''}: read_page to see it.`
    }
  }),

  tool({
    name: 'type_text',
    title: 'Typing',
    description:
      'Types a value into a field of the page read (read_page). Use tokens such as [[nir]] or [[last_name]] for the user’s identifiers: Marianne replaces them on their side. Never a password (sign_in fills it), nor card details (pay_by_card fills them). On a site one of Marianne’s services acts on, an identifier typed asks as a form filled there does: a card shows the field and the value, unless the user allowed that site’s forms ahead or the follow-up this turn started from covers it. Nothing is sent until the form is submitted.',
    input: { element: ELEMENT, value: z.string().max(10_000) },
    run: async ({ element: id, value }, ctx) => {
      const { folderId, url } = await current(ctx)
      const read = element(folderId, url, id)
      if (read.secret) throw new ToolError('Never type a password: sign_in fills the login from the keychain, or hand_over lets the user type it.')
      if (read.card)
        throw new ToolError('Never type card details: pay_by_card fills the card fields from the user’s saved card, or hand_over lets them type theirs.')
      if (read.role === 'link' || read.role === 'button') throw new ToolError(`${id} is a ${read.role}, not a field: use click.`)
      if (TOKEN.test(value)) throw new ToolError('Tokens with no value in the profile: use request_setup so the user fills them in.')
      // In a run, the one identifier the user agreed to on the sheet, exactly: its entity's. Nothing
      // else is typed (no other identifier, no text of the engine's), and nothing at all without one.
      const run = runOf(ctx)
      if (run && (!run.entity || value !== run.entity.label)) throw beyondRun('type this')
      // On a site Marianne's services declare, the submit that follows goes without a card (click): an identifier
      // typed there asks as a form filled there does (fill_form), unless the user allowed it ahead. Elsewhere,
      // nothing is sent before a submit that asks.
      if (!run && ctx.resolved && declared(url)) {
        const site = siteOf(url)
        const title = `Remplir ${plural(1, 'champ')} sur ${site}`
        const go = goAhead(ctx)
        const followUp = go && declared(url, services.declaredSites(go.service)) ? { followUp: go.label } : {}
        const { decision } = await approvals.ask(
          folderId,
          { action: 'form', site, known: known().has(site), ...followUp },
          { kind: 'form', title, fields: [{ label: read.label || id, value }] },
          { onCard: () => browser.setWaiting(title.toLowerCase()) }
        )
        browser.setWaiting('')
        if (decision !== 'accepted') throw refusal(decision, 'nothing was typed')
        // The page may have changed while the card waited: type only into the one the user saw.
        if (browser.currentUrl() !== url) throw new ToolError('The page changed while the user was deciding: nothing was typed. Read it again.')
      }
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
      // Their account, and whatever card it keeps, may now be open on this site: its pay buttons ask (click).
      personal.add(site)
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
      // The user takes it from here: where they go, they hand back (below), not as a payment's, and a pay click
      // approved before is no longer the page they approved it on. What they do there (sign in, type their card) is theirs.
      payGrants.end(folderId)
      personal.add(siteOf(state.url))
      browser.setWaiting(reason)
      browser.reveal()
      const outcome = await approvals.hold(folderId, handedBack(HAND_OVER_MS))
      browser.setWaiting('')
      if (outcome === 'locked') throw new ToolError('The session locked while waiting for the user.')
      const now = browser.state()
      if (now.url) personal.add(siteOf(now.url))
      if (outcome === 'timeout')
        throw new ToolError(
          'The user has not handed control back after 10 minutes: in your answer, ask them to click « rendre la main » once done, then carry on.'
        )
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
      'The fields of the form on the page (f1, f2…): label, type, options and current values. Passwords, a bank card’s fields (pay_by_card fills them) and files are left out. Call it before fill_form, and again when the page changes.',
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
      'Fills fields of the form read by read_form, once the user has confirmed on a card that shows every value, or allowed forms on this site ahead, or started this turn from a follow-up that covers them (the conversation then shows the values). Use tokens such as [[nir]] or [[tax_number]] for their identifiers: Marianne replaces them on their side. For a list or radio buttons, give the exact label of an option. Never fills a password, and never submits the form.',
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
      const site = siteOf(url)
      const title = `Remplir ${plural(fields.length, 'champ')} sur ${site}`
      // The follow-up the user started covers the forms of the sites its service declares, by host, for this turn.
      const go = goAhead(ctx)
      const followUp = go && declared(url, services.declaredSites(go.service)) ? { followUp: go.label } : {}
      const { decision } = await approvals.ask(
        folderId,
        { action: 'form', site, known: known().has(site), ...followUp },
        { kind: 'form', title, reason, fields: fields.map((f) => ({ label: byId.get(f.id)?.label || f.id, value: f.value })) },
        { run: !!ctx.run, onCard: () => browser.setWaiting(title.toLowerCase()) }
      )
      browser.setWaiting('')
      if (decision !== 'accepted') throw refusal(decision, 'nothing was filled')
      // The page may have changed while the card waited: fill only the one the user saw.
      if (browser.currentUrl() !== read.url) throw new ToolError('The page changed since the form was read: nothing was filled. Read it again.')
      const { filled, missing } = await act(() => browser.fillForm(Object.fromEntries(fields.map((f) => [f.id, f.value]))))
      return `Filled ${plural(filled.length, 'field')}${missing.length ? `; not filled (option not found or field gone): ${missing.join(', ')}` : ''}. Nothing was submitted: once the user has checked it, submit it with click, or let them send it.`
    }
  }),

  tool({
    name: 'pay_by_card',
    title: 'Card payment',
    description:
      'Pays by card on this folder’s page with one of the user’s saved cards (Réglages › Paiement). It finds the card fields, in the page and in its payment provider’s frames, and asks the user’s yes on a card that shows the site, the page, the card and the amount you read on the page (they type the security code there when it isn’t saved); then it fills the number, expiry, holder and code. The card’s details never reach you. Only on a site Marianne knows (the public sites, the sites her services that are on act on), or on a payment provider’s page that a page on a host her services act on sent the browser to (its form or its link); elsewhere, let the user pay (hand_over). That yes also covers the one pay click that follows on this page (click). Without card, it takes the only saved card that hasn’t expired, or lists them.',
    input: {
      card: z.string().max(80).optional().describe('The saved card to use: its label or its last four digits, as this tool lists them'),
      amount: z.string().min(1).max(60).describe('The amount to pay as the page shows it, e.g. « 12,40 € »: the user sees it as read on the page'),
      reason: z.string().max(300).describe('What is paid, in one sentence for the user (in French)')
    },
    run: async ({ card: wanted, amount, reason }, ctx) => {
      // Nobody watches a run, and a run never pays: the gate keeps this tool from runs (tasks.ts); this holds if it didn't.
      if (ctx.run) throw beyondRun('pay')
      const { folderId, url, title } = await current(ctx)
      // The page itself on a site Marianne knows; or a provider's page that a declared page sent the browser to, as
      // going online reads it (online), never one any page of a known site's domain sent it to.
      const route = paymentRoute(url, browser.arrival(), (site, page) => (page === url ? known().has(site) : declared(page)))
      if (!route)
        throw new ToolError(
          `${siteOf(url)} is not a site where Marianne pays by card: only the sites she knows (the public sites, the sites her services that are on act on), or a payment provider’s page that a page on a host her services act on sent the browser to. Let the user pay themselves: hand_over.`
        )
      const card = pickCard(wanted)
      const expiry = parseExpiry(card.expiry)!
      const frames = await act(() => browser.cardFields((origins) => frameMayReceive(origins, url)))
      // Once the page has settled (cardFields waits for it): the version of the page whose fields the card shows.
      const version = browser.pageVersion()
      const plan = planCard(frames, { ...expiry, holder: card.holder, digits: cards.secret(card.id)?.number.length ?? 0 })
      if (typeof plan === 'string')
        throw new ToolError(
          `Marianne can’t fill a card on this page: ${plan}. If the page asks for the card at a later step, go on to it and call this tool again; otherwise let the user type their card (hand_over).`
        )

      // What the user approves: where the card goes (the provider whose page or frame takes it), the card, the amount as read.
      const via = route.provider ?? plan.via
      const where = route.provider ? hostOf(url) : hostOf(plan.targets.find((t) => t.secret === 'number')!.origins.at(-1)!)
      const site = !via ? route.site : route.provider ? `via ${via.name} pour ${route.site} · ${where}` : `${route.site} · via ${via.name} · ${where}`
      const shown = `Payer par carte ${route.provider ? 'pour' : 'sur'} ${route.site}`
      // The security code typed in the card: kept here until the fields are filled, never in the card nor the conversation.
      let typed = ''
      const { decision } = await approvals.ask(
        folderId,
        { action: 'commit' },
        {
          kind: 'payment',
          title: shown,
          reason,
          fields: [
            { label: 'site', value: site },
            { label: 'page', value: title || url },
            { label: 'carte', value: cardTitle(card) },
            { label: 'montant lu sur la page', value: amount },
            { label: 'remplit', value: filledWords(plan, 0) },
            ...(plan.pay ? [{ label: 'puis', value: `appuie sur « ${plan.pay.label} » dans le formulaire de paiement` }] : [])
          ],
          ...(plan.cvv && !card.cvvStored ? { askCvv: true } : {})
        },
        { onCard: () => browser.setWaiting(shown.toLowerCase()), onCvv: (cvv) => (typed = cvv) }
      )
      browser.setWaiting('')
      if (decision !== 'accepted') throw refusal(decision, 'nothing was filled')
      // The page may have changed while the card waited: fill only the one the user saw.
      if (browser.currentUrl() !== url || browser.pageVersion() !== version)
        throw new ToolError('The page changed while the user was deciding: nothing was filled. Read it again.')
      const secret = cards.secret(card.id)
      if (!secret) throw new ToolError('The card was removed meanwhile: nothing was filled.')
      const cvv = plan.cvv ? (card.cvvStored ? secret.cvv : typed) : ''
      typed = ''
      if (plan.cvv && cvvProblem(cvv, card.brand))
        throw new ToolError('No valid security code came with the user’s yes: nothing was filled. Ask them whether to try again.')
      const whole = await act(() => browser.fillCard(cardFills(plan, { number: secret.number, cvv })))
      if (!whole)
        throw new ToolError(
          'The card form changed while it was being filled: nothing is left filled. Read the page again, or let the user type their card (hand_over).'
        )

      const filled = `Filled the ${filledWords(plan, 1)} of ${cardTitle(card)} on ${route.site}`
      const confirm = 'If the bank then asks for a confirmation (3-D Secure: a code, its app), use hand_over. Tell the user once the site confirms the payment.'
      if (plan.pay) {
        // The pay button lives in the provider's frame, where click can't reach: pressed here, on the same yes, once the form had a moment to check the card.
        await new Promise((resolve) => setTimeout(resolve, 500))
        const still = browser.pageVersion() === version
        // Marked before the press, as the click the grant covers is: what it leads to is part of this payment, and another pay click here asks.
        if (still) payGrants.press(folderId, url, version, browser.arrival()?.url)
        const pressed = still && (await act(() => browser.pressPay(plan.pay!)))
        if (!pressed)
          return `${filled}, but couldn’t press « ${plan.pay.label} » in the payment form: ask the user to press it themselves (hand_over). ${confirm}`
        return `${filled} and pressed « ${plan.pay.label} » in the payment form, as the user approved. Read the page (read_page). ${confirm}`
      }
      payGrants.give(folderId, url, browser.pageVersion())
      return `${filled}. Nothing is paid yet: read the page (read_page) and click its pay button (click): the user’s yes covers that one click, on this page, for ${PAY_GRANT_MS / 60_000} minutes. ${confirm}`
    }
  })
]
