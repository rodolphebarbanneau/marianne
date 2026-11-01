import { hostOf, siteOf } from '../../shared/hosts'

/**
 * Paying by card in the built-in browser, the parts that hold without a page (pay_by_card in
 * tools/browser.ts runs them): the payment providers whose pages and frames may receive a card,
 * whom a provider's page takes a payment for, how card fields are told apart in a page (the scripts
 * below, run in each frame that may receive the card) and what goes in each. Everything fails
 * closed: a frame, a field or a way there that can't be told apart gets nothing.
 */

export interface Provider {
  name: string
  hosts: string[]
}

/**
 * The payment providers that take cards for French merchants, by their own hosts (a host listed or
 * one under it, https only). Their frames, in a page Marianne pays on, receive the card as the page
 * itself does; their own pages, only when a site Marianne knows sent the browser there
 * (paymentRoute). Short on purpose: a provider missing here means the user types their card, never a
 * card sent to a host nobody checked.
 */
export const PROVIDERS: Provider[] = [
  // Monext's Payline: its widget's card frames (payment.cdn.payline.com) and its hosted pages.
  { name: 'Payline (Monext)', hosts: ['payline.com'] },
  // BNP Paribas' Axepta: its hosted payment page (paymentpage.axepta.bnpparibas).
  { name: 'Axepta BNP Paribas', hosts: ['axepta.bnpparibas'] },
  // Verifone's Paybox: its hosted pages (tpeweb.paybox.com).
  { name: 'Paybox (Verifone)', hosts: ['paybox.com'] },
  // Lyra's PayZen, and Systempay (Banque Populaire, Caisse d’Épargne) on the same platform: hosted pages and embedded fields.
  { name: 'PayZen (Lyra)', hosts: ['payzen.eu', 'lyra.com'] },
  { name: 'Systempay', hosts: ['systempay.fr'] },
  // Stripe: Elements' card frames (js.stripe.com) and Checkout's pages.
  { name: 'Stripe', hosts: ['stripe.com'] },
  // Adyen: its secured fields' frames and hosted pages (checkoutshopper-live.adyen.com).
  { name: 'Adyen', hosts: ['adyen.com'] },
  // Checkout.com: its Frames and Flow card frames.
  { name: 'Checkout.com', hosts: ['checkout.com'] },
  // Worldline: Sips (BNP Paribas' Mercanet runs on it), Ingenico's Ogone, Worldline Direct.
  { name: 'Worldline', hosts: ['sips-services.com', 'mercanet.bnpparibas.net', 'ogone.com', 'worldline-solutions.com'] },
  // Crédit Mutuel and CIC's Monetico.
  { name: 'Monetico', hosts: ['monetico-services.com'] }
]

const https = (url: string) => /^https:\/\//i.test(url)

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

/** The payment provider of an address (a page's, a frame's origin): https, on one of its hosts or under it; null for any other. */
export function providerOf(url: string): Provider | null {
  if (!https(url)) return null
  const host = hostOf(url)
  return (host && PROVIDERS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)))) || null
}

/**
 * Whether a frame may receive the card on a page Marianne pays on (`pageUrl`): every frame from the
 * page down to it (`origins`, the page's first) served over https, on the page's own site or a payment
 * provider's host. A provider's frame inside another one's (an advert's) isn't the merchant's.
 */
export function frameMayReceive(origins: string[], pageUrl: string): boolean {
  const site = siteOf(pageUrl)
  return !!site && origins.length > 0 && origins.every((o) => https(o) && (siteOf(o) === site || !!providerOf(o)))
}

/** How the browser came to a page: the browser keeps one for each page it opens, a few pages back (browser/index.ts). */
export interface Arrival {
  /** The page's address as it loaded. */
  url: string
  /** The origin of the frame that sent the browser there; '' when no page did (an address opened, back, forward, reload). */
  initiator: string
  /** The addresses the navigation went through, its redirects, the page's last. */
  hops: string[]
  /** The page before; null for the first, or past those kept. */
  previous: Arrival | null
}

/** How many pages the browser remembers having come through: a provider's page may follow the site's after a few of its own. */
export const ARRIVALS_KEPT = 5

export interface PaymentRoute {
  /** The site the payment is for: the page's own, or the site that sent the browser to the provider's page. */
  site: string
  /** The provider whose page it is; null on the site's own page. */
  provider: Provider | null
}

/**
 * Whom a payment on the page `url` is for; null when Marianne doesn't pay there. A site she knows
 * (`known`, by registrable domain: the content's public sites, those her services that are on
 * declare); or a payment provider's page that such a site's own page sent the browser to (its form
 * or its link, not an advert's frame in it, not an address typed or opened), directly or through
 * that provider's own pages, every redirect on the way on that site or the provider's hosts.
 */
export function paymentRoute(url: string, arrival: Arrival | null, known: (site: string) => boolean): PaymentRoute | null {
  if (!https(url)) return null
  const site = siteOf(url)
  if (site && known(site)) return { site, provider: null }
  const provider = providerOf(url)
  if (!provider || !arrival || originOf(arrival.url) !== originOf(url)) return null
  let page: Arrival | null = arrival
  for (let depth = 0; page && depth < ARRIVALS_KEPT; depth++) {
    const before: Arrival | null = page.previous
    if (providerOf(page.url) !== provider || !before || !https(before.url)) return null
    const from = siteOf(before.url)
    if (!from || !https(page.initiator) || siteOf(page.initiator) !== from) return null
    if (!page.hops.every((hop) => https(hop) && (siteOf(hop) === from || providerOf(hop) === provider))) return null
    if (known(from)) return { site: from, provider }
    page = before
  }
  return null
}

// ---------------------------------------------------------------- card fields

export type CardFieldKind = 'number' | 'expiry' | 'month' | 'year' | 'cvv' | 'holder'

/**
 * Which card field an element is, from its clues: its autocomplete, the words that name it (its name,
 * id, label, placeholder…), its tag and type. A page script's function, as source, so that the pages
 * run exactly what the tests do: `sure` when nothing but a bank card's field reads so (« titulaire »
 * alone may be a bank account's holder, « date d’expiration » an identity card's). Other cards (vitale,
 * grise, d’identité, cadeau, carburant…) are none.
 */
export const CARD_FIELD = `((c) => {
  const fold = (s) => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\\/]+/g, ' ').trim()
  const tag = String(c.tag || 'input').toLowerCase()
  const type = String(c.type || 'text').toLowerCase()
  const textual = tag === 'input' && ['text', 'tel', 'number', 'search', ''].includes(type)
  const listed = textual || tag === 'select'
  const fits = { number: textual, holder: textual, cvv: textual || (tag === 'input' && type === 'password'), expiry: listed || (tag === 'input' && type === 'month'), month: listed, year: listed }
  const as = (kind, sure) => (fits[kind] ? { kind, sure } : null)
  const cc = String(c.autocomplete || '').toLowerCase().split(/\\s+/).find((t) => t.startsWith('cc-'))
  if (cc) {
    const kind = { 'cc-number': 'number', 'cc-csc': 'cvv', 'cc-exp': 'expiry', 'cc-exp-month': 'month', 'cc-exp-year': 'year', 'cc-name': 'holder' }[cc]
    return kind ? as(kind, true) : null
  }
  const w = fold(c.words)
  if (/\\b(cartes? (vitale|grise|d identite|nationale|de sejour|de resident|europeenne|mobilite|de stationnement|d invalidite|d electeur|electorale|professionnelle|d etudiant|etudiante?|navigo|de transport|de fidelite|fidelite|cadeau|carburant|totalenergies|total|msts|d adherent|de membre)|(identity|id|gift|loyalty|fuel|membership|library|student) card|passeport|passport|permis|titre de sejour)\\b/.test(w)) return null
  const card = /\\b(carte|card|cc|cb|credit|debit)\\b/.test(w)
  if (/\\b(cvv2?|cvc2?|cvn|csc|cvx|cryptogramme|crypto|code (de )?(securite|verification)|(security|verification) (code|value|number)|card code)\\b/.test(w)) return as('cvv', true)
  if (/\\b(expir\\w*|validite|valable jusqu\\w*|valid (thru|until|through)|exp|mm ?\\/? ?(aa|yy){1,2})\\b/.test(w)) {
    const month = /\\b(mois|month|mm)\\b/.test(w)
    const year = /\\b(annee|year|aa|yy|aaaa|yyyy)\\b/.test(w)
    return as(month && !year ? 'month' : year && !month ? 'year' : 'expiry', card)
  }
  if (/\\b(titulaire|porteur|holder|cardholder|name on (the )?card|nom (sur|de) (la )?carte|card ?name|cc ?name|ccname)\\b/.test(w)) return as('holder', card)
  if (/\\b(card ?(number|num|no|nr)|cardno|cc ?(number|num|no)|ccnum(ber)?|(credit|debit|bank|payment) card|cartes? (bancaire|de credit|de debit|de paiement)|pan|(numero|n) (de )?cb)\\b/.test(w)) return as('number', true)
  if (/\\b(numero|n|no|num|nr)( de)?( la| votre| ta)? carte\\b/.test(w)) return as('number', false)
  return null
})`

/** In a page script: the clues of an element for CARD_FIELD, from the element and its labels. */
export const CARD_CLUES = `((el) => {
  const text = (x) => (x ? x.innerText || x.textContent || '' : '').replace(/\\s+/g, ' ').trim()
  const byFor = el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null
  const wrap = el.closest('label')
  const labelled = (el.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean).map((i) => text(document.getElementById(i))).join(' ')
  // A label around a list holds its options too: only what is its own.
  const own = wrap ? text(wrap).replace(text(el), '') : ''
  const words = [el.name, el.id, text(byFor), own, el.getAttribute('aria-label'), labelled, el.placeholder, el.title].filter(Boolean).join(' ').slice(0, 300)
  return { autocomplete: el.getAttribute('autocomplete') || '', words, tag: el.tagName, type: el.type || '' }
})`

/** In a page script: the card field an element is (CARD_FIELD from its CARD_CLUES), or null. */
export const CARD_KIND = `((el) => (${CARD_FIELD})((${CARD_CLUES})(el)))`

const VISIBLE = `(el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden'`

/** A card field found in a frame (CARD_SCAN_SCRIPT), tagged there with its id. */
export interface CardField {
  id: string
  kind: CardFieldKind
  tag: string
  type: string
  /** 0: none. */
  maxLength: number
  placeholder: string
  options?: Array<{ value: string; text: string }>
}

/** A frame's card fields: the frame (its tree node, the origins from the page down to it) and, in a frame of its own, its pay buttons. */
export interface CardFrame {
  node: number
  origins: string[]
  fields: CardField[]
  /** The labels of its pay buttons (tagged p1, p2…), in a frame other than the page itself; none in the page, where click reaches. */
  pay: string[]
}

/**
 * The card fields of a frame, each tagged with a data-marianne-card id; `frameName`: null in the page
 * itself, the frame's name in one of its frames. A frame of its own around one field nothing names
 * (a provider's hosted field) is read by the frame's name and title. In such a frame, the buttons
 * that pay are tagged too (data-marianne-pay): click can't reach into it.
 */
export const CARD_SCAN_SCRIPT = (frameName: string | null) => `(() => {
  const clues = ${CARD_CLUES}
  const kindOf = ${CARD_FIELD}
  const visible = ${VISIBLE}
  const fold = (s) => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  for (const el of document.querySelectorAll('[data-marianne-card], [data-marianne-pay]')) {
    el.removeAttribute('data-marianne-card')
    el.removeAttribute('data-marianne-pay')
  }
  const skip = ['hidden', 'checkbox', 'radio', 'file', 'submit', 'button', 'image', 'reset']
  const usable = [...document.querySelectorAll('input, select')].filter((el) => !skip.includes(el.type) && !el.disabled && !el.readOnly && visible(el))
  const found = []
  for (const el of usable) {
    const kind = kindOf(clues(el))
    if (kind) found.push([el, kind.kind])
  }
  const frame = ${JSON.stringify(frameName)}
  if (frame !== null && !found.length && usable.length === 1) {
    const c = clues(usable[0])
    const kind = kindOf({ ...c, words: [c.words, frame, document.title].join(' ') })
    if (kind) found.push([usable[0], kind.kind])
  }
  const fields = found.map(([el, kind], i) => {
    el.setAttribute('data-marianne-card', 'c' + (i + 1))
    const options = el.tagName === 'SELECT' ? [...el.options].slice(0, 120).map((o) => ({ value: o.value, text: (o.text || '').trim() })) : undefined
    return { id: 'c' + (i + 1), kind, tag: el.tagName.toLowerCase(), type: el.type || '', maxLength: el.maxLength > 0 ? el.maxLength : 0, placeholder: el.placeholder || '', options }
  })
  const pay = []
  if (frame !== null && fields.length) {
    for (const el of document.querySelectorAll('button, input[type=submit], input[type=button], [role=button]')) {
      if (el.disabled || !visible(el)) continue
      const label = (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
      const words = fold(label)
      if (!/\\b(pay|payer|payez|paiement|payment|regler|reglez|valider|validez|confirmer|confirmez|confirm)\\b/.test(words)) continue
      if (/\\b(annuler|annulez|cancel|retour|back|supprimer|delete|modifier|changer|change)\\b/.test(words)) continue
      el.setAttribute('data-marianne-pay', 'p' + (pay.length + 1))
      pay.push(label)
    }
  }
  return { fields, pay }
})()`

/**
 * Fill card fields tagged by CARD_SCAN_SCRIPT: a value typed, or a list's option by its exact value.
 * The ids of the fields that hold their value once filled; a field gone, hidden or that didn't keep
 * the value is left out (and pay_by_card empties the others).
 */
export const CARD_FILL_SCRIPT = (values: Record<string, string>) => `(() => {
  const values = ${JSON.stringify(values)}
  const visible = ${VISIBLE}
  const filled = []
  for (const [id, value] of Object.entries(values)) {
    const el = document.querySelector('[data-marianne-card="' + id + '"]')
    if (!el || el.disabled || el.readOnly || !visible(el)) continue
    el.focus()
    if (el.tagName === 'SELECT') {
      if (![...el.options].some((o) => o.value === value)) continue
      el.value = value
    } else Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.blur()
    if (el.value) filled.push(id)
  }
  return filled
})()`

/** Empty card fields filled by CARD_FILL_SCRIPT: a card is filled whole or not at all. */
export const CARD_CLEAR_SCRIPT = (ids: string[]) => `(() => {
  for (const id of ${JSON.stringify(ids)}) {
    const el = document.querySelector('[data-marianne-card="' + id + '"]')
    if (!el || el.tagName === 'SELECT') continue
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  return true
})()`

/** Press a pay button tagged by CARD_SCAN_SCRIPT in a frame. */
export const PAY_PRESS_SCRIPT = (id: string) => `(() => {
  const el = document.querySelector('[data-marianne-pay="' + ${JSON.stringify(id)} + '"]')
  if (!el || el.disabled) return false
  el.scrollIntoView({ block: 'center' })
  el.click()
  return true
})()`

// ---------------------------------------------------------------- what goes where

/** A field to fill: where it is, and what it takes; the number and the security code are put in at the last moment (`secret`). */
export interface CardTarget {
  node: number
  origins: string[]
  id: string
  kind: CardFieldKind
  value?: string
  secret?: 'number' | 'cvv'
}

export interface CardPlan {
  targets: CardTarget[]
  /** The page asks for the security code. */
  cvv: boolean
  /** The provider whose frame takes the number; null when the page itself does. */
  via: Provider | null
  /** The one pay button in the number's own frame, where click can't reach: pay_by_card presses it, as part of the payment approved. */
  pay: { node: number; origins: string[]; id: string; label: string } | null
}

/** What a card puts in its fields: its expiry, its holder, how many digits its number has. */
export interface CardFacts {
  month: number
  year: number
  holder: string
  digits: number
}

/** The number a list's option starts with (« 09 », « 2028 », « 09 - septembre »); NaN for none. */
const lead = (s: string) => Number(s.match(/^\s*(\d{1,4})(?!\d)/)?.[1] ?? NaN)

/** A list's option for one of `wanted`, by its value or its text: exactly one, or null. */
function optionFor(options: CardField['options'], wanted: number[]): string | null {
  const matches = (options ?? []).filter((o) => wanted.includes(lead(o.value)) || wanted.includes(lead(o.text)))
  return matches.length === 1 ? matches[0].value : null
}

/** A list named for the expiry as a whole: its months (1 to 12), or its years; null when it holds whole dates or can't be told. */
function listPart(options: CardField['options']): 'month' | 'year' | null {
  const all = options ?? []
  if (all.some((o) => /\d\s*\/\s*\d/.test(`${o.value} ${o.text}`))) return null
  const numbers = all.map((o) => (Number.isFinite(lead(o.value)) ? lead(o.value) : lead(o.text))).filter(Number.isFinite)
  if (!numbers.length) return null
  if (numbers.every((n) => n >= 1 && n <= 12)) return 'month'
  return numbers.every((n) => n > 12) ? 'year' : null
}

/** What an expiry field takes, as its type, length and placeholder say: MM/AA by default. Null for a list without the card's date. */
export function expiryValue(field: CardField, card: Pick<CardFacts, 'month' | 'year'>): string | null {
  const mm = String(card.month).padStart(2, '0')
  const yy = String(card.year % 100).padStart(2, '0')
  const yyyy = String(card.year)
  if (field.tag === 'select') {
    const matches = (field.options ?? []).filter((o) =>
      [o.value, o.text].some((s) => {
        const m = s.match(/^\s*(\d{1,2})\s*\/?\s*(\d{2}|\d{4})\s*$/)
        return !!m && Number(m[1]) === card.month && Number(m[2]) % 100 === card.year % 100
      })
    )
    return matches.length === 1 ? matches[0].value : null
  }
  if (field.type === 'month') return `${yyyy}-${mm}`
  const hint = field.placeholder.toLowerCase()
  const spaced = /\s\/\s/.test(hint)
  const value = /aaaa|yyyy/.test(hint)
    ? `${mm}${spaced ? ' / ' : '/'}${yyyy}`
    : field.maxLength === 4 || /^\s*mm\s*(aa|yy)\s*$/.test(hint)
      ? `${mm}${yy}`
      : `${mm}${spaced ? ' / ' : '/'}${yy}`
  if (!field.maxLength || value.length <= field.maxLength) return value
  return `${mm}${yy}`.length <= field.maxLength ? `${mm}${yy}` : null
}

/** What a month or a year field takes: two digits for a month; a year as its length or placeholder says, two digits by default. */
export function partValue(field: CardField, part: 'month' | 'year', card: Pick<CardFacts, 'month' | 'year'>): string | null {
  if (field.tag === 'select') return optionFor(field.options, part === 'month' ? [card.month] : [card.year, card.year % 100])
  if (part === 'month') return String(card.month).padStart(2, '0')
  const four = field.maxLength === 4 || /aaaa|yyyy/i.test(field.placeholder)
  return four ? String(card.year) : String(card.year % 100).padStart(2, '0')
}

/**
 * Which field takes what, from the card fields of the page's frames that may receive the card; a
 * reason (for the engine) when the card can't be filled whole. One number field; one expiry, or one
 * month and one year; at most one security code and one holder. Where several could do, those in the
 * number's own frame. Anything else can't be told apart: nothing is filled.
 */
export function planCard(frames: CardFrame[], card: CardFacts): CardPlan | string {
  const found = frames.flatMap((frame) =>
    frame.fields.map((field) => ({
      frame,
      field: { ...field, kind: field.kind === 'expiry' && field.tag === 'select' ? (listPart(field.options) ?? field.kind) : field.kind }
    }))
  )
  type Found = (typeof found)[number]
  const of = (kind: CardFieldKind, near?: CardFrame): Found[] => {
    const all = found.filter((f) => f.field.kind === kind)
    const close = near ? all.filter((f) => f.frame === near) : []
    return close.length ? close : all
  }
  const numbers = of('number')
  if (numbers.length !== 1) return numbers.length ? 'there are several card number fields' : 'there is no card number field'
  const [number] = numbers
  const near = number.frame
  const [expiry, month, year, cvv, holder] = (['expiry', 'month', 'year', 'cvv', 'holder'] as const).map((kind) => of(kind, near))
  const single = expiry.length === 1 && !month.length && !year.length
  const pair = !expiry.length && month.length === 1 && year.length === 1
  if (!single && !pair) return expiry.length + month.length + year.length ? 'its expiry fields can’t be told apart' : 'there is no expiry field'
  if (cvv.length > 1) return 'there are several security code fields'
  if (holder.length > 1) return 'there are several cardholder fields'
  if (holder.length && !card.holder) return 'the card has no holder’s name for its cardholder field'
  if (number.field.maxLength && number.field.maxLength < card.digits) return 'its card number field is too short for this card'

  const targets: CardTarget[] = []
  const at = ({ frame, field }: Found, what: Pick<CardTarget, 'value' | 'secret'>) =>
    targets.push({ node: frame.node, origins: frame.origins, id: field.id, kind: field.kind, ...what })
  at(number, { secret: 'number' })
  if (single) {
    const value = expiryValue(expiry[0].field, card)
    if (!value) return 'its expiry field has no place for this card’s date'
    at(expiry[0], { value })
  } else {
    const [m, y] = [partValue(month[0].field, 'month', card), partValue(year[0].field, 'year', card)]
    if (!m || !y) return 'its expiry lists have no place for this card’s month or year'
    at(month[0], { value: m })
    at(year[0], { value: y })
  }
  if (holder.length) at(holder[0], { value: card.holder })
  if (cvv.length) at(cvv[0], { secret: 'cvv' })
  const pay = near.origins.length > 1 && near.pay.length === 1 ? { node: near.node, origins: near.origins, id: 'p1', label: near.pay[0] } : null
  return { targets, cvv: cvv.length > 0, via: providerOf(near.origins.at(-1) ?? ''), pay }
}

/** The values of a plan, frame by frame, the number and the security code put in: for the browser to fill, at once. */
export function cardFills(plan: CardPlan, secret: { number: string; cvv: string }): Array<{ node: number; origins: string[]; values: Record<string, string> }> {
  const frames = new Map<number, { node: number; origins: string[]; values: Record<string, string> }>()
  for (const t of plan.targets) {
    const frame = frames.get(t.node) ?? frames.set(t.node, { node: t.node, origins: t.origins, values: {} }).get(t.node)!
    frame.values[t.id] = t.secret === 'number' ? secret.number : t.secret === 'cvv' ? secret.cvv : (t.value ?? '')
  }
  return [...frames.values()]
}
