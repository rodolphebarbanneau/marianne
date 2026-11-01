import { isSharedHost, siteOf } from '../../shared/hosts'
import { paidOnward, type Arrival } from '../browser/payment'
import { fold } from './tool'

/**
 * The two rules of acting online for the user. Going to a website needs their consent first: on a
 * card, once per folder or once per site of a folder, unless they allowed it ahead (the approval
 * policy, shared/approvals.ts). And a step that commits them (sign, pay, send, submit, confirm,
 * declare, delete…) needs their yes every time; on a site Marianne's own services declare, only
 * what binds them beyond paying does, paying there taking pay_by_card's card (`binding`).
 */

/** Whether a consent covers every site of its folder, or its own site only. */
export type AskOnline = 'folder' | 'site'

/**
 * The sites Marianne knows, where the « autonomie » level lets her go and fill forms without asking:
 * the content's public sites, reviewed with it, and the sites built-in services declare, reviewed
 * with them, by registrable domain. Never a whole hosting service or a public suffix.
 */
export function knownSites(urls: string[]): Set<string> {
  return new Set(urls.map(siteOf).filter((site) => site && !isSharedHost(site)))
}

/** The sites the user said yes to in each folder, in memory: forgotten when the session locks. What was allowed ahead isn't kept here. */
export class Consents {
  private sites = new Map<string, Set<string>>()

  /** "folder": any consent given in the folder covers every site; "site": each site needs its own. */
  has(folderId: string, site: string, ask: AskOnline): boolean {
    const given = this.sites.get(folderId)
    return !!given && (ask === 'folder' ? given.size > 0 : given.has(site))
  }

  add(folderId: string, site: string): void {
    const given = this.sites.get(folderId) ?? new Set<string>()
    given.add(site)
    this.sites.set(folderId, given)
  }

  clear(): void {
    this.sites.clear()
  }
}

/** How long the yes to a payment by card covers the pay click that follows it. */
export const PAY_GRANT_MS = 5 * 60_000

/**
 * The one pay click a payment the user approved covers (pay_by_card): on the folder's page as it
 * was when the card was filled (its address and its version, browser.pageVersion), for a few minutes,
 * once. In memory, forgotten when the session locks. The next click that commits takes it, used or
 * not: leaving the page, a second step that commits, or the time out end it.
 *
 * Once that payment is pressed (the click the grant covered, or pay_by_card's own press), the page is
 * marked: another click there that pays would pay again, and asks until the page changes. And the
 * pages the press leads to for a few minutes (the bank's 3-D Secure, the way back) are part of it,
 * until Marianne acts otherwise (another click, an address, a hand-over).
 */
export class PayGrants {
  private grants = new Map<string, { url: string; page: number; until: number }>()
  /** The page each folder's approved payment was pressed on. */
  private spent = new Map<string, { url: string; page: number }>()
  /** Where each folder's approved payment was pressed (its page's address as it loaded), until when what follows is part of it. */
  private flights = new Map<string, { from: string; until: number }>()

  give(folderId: string, url: string, page: number, now = Date.now()): void {
    this.grants.set(folderId, { url, page, until: now + PAY_GRANT_MS })
  }

  /** Whether a click that commits is the pay click the payment covers: on that page still, in time, and one that pays. Taken either way. */
  take(folderId: string, url: string, page: number, label: string, now = Date.now()): boolean {
    const grant = this.grants.get(folderId)
    this.grants.delete(folderId)
    return !!grant && grant.url === url && grant.page === page && now <= grant.until && paying(label)
  }

  /**
   * The approved payment is pressed on this page (`url` at version `page`), as the browser came to it
   * (`loaded`: the page's address as it loaded, browser.arrival; none, nothing follows on its yes).
   * Marked before the press: one that failed half-way still counts.
   */
  press(folderId: string, url: string, page: number, loaded: string | undefined, now = Date.now()): void {
    this.spent.set(folderId, { url, page })
    if (loaded) this.flights.set(folderId, { from: loaded, until: now + PAY_GRANT_MS })
    else this.flights.delete(folderId)
  }

  /** Whether the approved payment was already pressed on this page, unchanged since: a pay click there would pay again. */
  pressedOn(folderId: string, url: string, page: number): boolean {
    const spent = this.spent.get(folderId)
    return !!spent && spent.url === url && spent.page === page
  }

  /** Whether the page open (`url`, the browser came to it by `arrival`) is where the payment pressed led, in time (payment.ts, paidOnward). */
  onward(folderId: string, url: string, arrival: Arrival | null, now = Date.now()): boolean {
    const flight = this.flights.get(folderId)
    return !!flight && now <= flight.until && paidOnward(url, arrival, flight.from)
  }

  /** Marianne acts on her own again (another click, an address, a hand-over): what follows is no longer the payment's. */
  land(folderId: string): void {
    this.flights.delete(folderId)
  }

  clear(): void {
    this.grants.clear()
    this.spent.clear()
    this.flights.clear()
  }
}

/** Words that commit the user, folded (no accents, lower case): French stems and words, then English. */
const COMMITS = [
  /\b(valid|envo[iy]|pay(er|ez)|paiement|sign(er|ez|ature)|confirm|transm|suppr|soumet|termin(er|ez)|finali|enregistr|accept|souscri|command(er|ez)|achet(er|ez)|resili|depos(er|ez)|reserv(er|ez)|certifi(er|e)|attest(er|e)|honneur)/,
  /\b(regl(er|ez|ement)|declar(er|ez|e))(?![a-z])/,
  /\bannuler (ma|mon|mes|la|le|les|l'|votre|vos|cette|ce)\b/,
  /\b(submit|send|payment|delete|remove|finish|save|agree|purchase|checkout|(pay|buy|book|sign(?! ?(in|up|on|out)\b))(?![a-z]))/
]

/** Folded, with straight apostrophes. */
const plain = (text: string) => fold(text).replace(/[’`]/g, "'")
const commits = (text: string) => COMMITS.some((re) => re.test(plain(text)))

/** What a submit button may do without committing: move, search, show, sign in. */
const MOVES =
  /\b(recherch|cherch|search|filtr|filter|trier|sort|afficher|voir|show|masquer|hide|ouvrir|open|fermer|close|menu|suivant|next|precedent|previous|retour|back|continuer|continue|accueil|home|connexion|connecter|identifier|sign ?in|log ?in|login|aide|help|langue|language|imprimer|print|telecharger|download)/

/**
 * What a run may click with nobody watching: searching and moving through a page. Narrower than
 * MOVES: no signing in, no « continuer », no download.
 */
const READS =
  /\b(recherch|cherch|search|filtr|filter|trier|sort|afficher|voir|show|masquer|hide|fermer|close|menu|suivant|next|precedent|previous|retour|back|accueil|home|langue|language)/
/**
 * Saying no to a cookie banner, which stands in front of most pages; « sans accepter » isn't
 * accepting. The whole label: « tout refuser et payer » is paying.
 */
const DECLINES = /^\W*(tout refuser|continuer sans accepter)\W*$/

export interface Clickable {
  role: string
  type: string
  label: string
}

/** Whether a planned task's run may click an element: only what plainly reads, whatever the engine says it is for. */
export function reading(element: Clickable, purpose = ''): boolean {
  const label = plain(element.label)
  return !commits(purpose) && (DECLINES.test(label) || (!commits(label) && READS.test(label)))
}

/**
 * What binds the user beyond paying, folded: signing; sending, transmitting, submitting, filing;
 * declaring; deleting; certifying, attesting, « sur l'honneur », « je m'engage »; subscribing;
 * cancelling a contract (résilier, annuler mon…, clôturer); waiving a right; a direct debit's
 * mandate, which pays without a card. French stems and words, then English.
 */
const BINDS = [
  /\b(envo[iy]|transm|soum(et|is)|suppr|souscri|resili|renonc|prelev)/,
  /\b(sign(er|ez|e|es|ature|atures)|depos(er|ez|e)|declar(er|ez|e)|certifi(er|ez|e|es)|attest(er|ez|e)|honneur|m'engag(e|er)|abonn(er|ez)|m'abonne|clotur(er|ez)|mandat)(?![a-z])/,
  /\bannuler (ma|mon|mes|la|le|les|l'|votre|vos|cette|ce)\b/,
  /\b(send|submit|transmit|delete|remove|(declare|certify|attest(s|ed)?|hono(u)?r|(un)?subscribe|terminate|waive|mandate|direct debit|sign(?! ?(in|up|on|out)\b))(?![a-z]))/,
  /\bcancel (my|the|your|this)\b/
]
const binds = (text: string) => BINDS.some((re) => re.test(plain(text)))

/**
 * Whether clicking an element binds the user beyond paying (BINDS), from its label or what the
 * engine says it is for. On a site Marianne's own services declare, it is what still asks in a
 * conversation, and what a run of one of their tasks may not click: the steps on the way there
 * (searching, validating, going on to pay) don't, and paying takes pay_by_card's card.
 */
export function binding(element: Clickable, purpose = ''): boolean {
  return binds(purpose) || binds(element.label)
}

/** A button that pays (or confirms the payment) and does nothing else of the floor: no sending, signing, deleting, cancelling. */
const PAYS = /\b(pa(y|yer|yez|iement)|payment|regl(er|ez)|valid(er|ez)?|confirm(er|ez)?|checkout|purchase|buy|achet(er|ez))(?![a-z])/
const NOT_PAYING = /\b(envo[iy]|send|sign|suppr|delete|remove|annul|cancel|resili|declar|certifi|attest|retour|back)/

/**
 * Whether an element's label reads as the pay button: what the yes to a payment by card covers once
 * (PayGrants). Never one that also binds the user beyond paying (« Payer et souscrire »): that asks.
 */
export function paying(label: string): boolean {
  const words = plain(label)
  return PAYS.test(words) && !NOT_PAYING.test(words) && !binds(label)
}

/**
 * Whether clicking an element commits the user. From its label (and what the engine says it is
 * for): signing, paying, sending, submitting… And a button that submits a form commits, unless
 * it plainly moves on or searches. When in doubt, it does: asking costs one click. Saying no to a
 * cookie banner doesn't, as a run already knows.
 */
export function consequential(element: Clickable, purpose = ''): boolean {
  if (commits(purpose)) return true
  if (DECLINES.test(plain(element.label))) return false
  if (commits(element.label)) return true
  return (element.type === 'submit' || element.type === 'image') && !MOVES.test(plain(element.label))
}
