import { describe, expect, it } from 'vitest'
import {
  ARRIVALS_KEPT,
  CARD_CLEAR_SCRIPT,
  CARD_FIELD,
  CARD_FILL_SCRIPT,
  CARD_KIND,
  CARD_SCAN_SCRIPT,
  cardFills,
  expiryValue,
  frameMayReceive,
  paidOnward,
  partValue,
  PAY_PRESS_SCRIPT,
  paymentRoute,
  planCard,
  providerOf,
  type Arrival,
  type CardField,
  type CardFrame,
  type CardPlan
} from '../src/main/browser/payment'
import { FORM_READ_SCRIPT, PAGE_READ_SCRIPT } from '../src/main/browser/scripts'
import { paying, PAY_GRANT_MS, PayGrants } from '../src/main/tools/online'

/**
 * Paying by card, the parts that hold without a page: which payment providers' hosts may receive a
 * card, which frames of a page may, whom a provider's page takes a payment for (the way the browser
 * came there), how a page's fields are told apart (the page script's own function, run here as the
 * pages run it), what goes in each, and the one pay click a payment's yes covers.
 */

const SANEF = 'https://www.sanef.com'
const PAYLINE = 'https://payment.cdn.payline.com'
const AXEPTA = 'https://paymentpage.axepta.bnpparibas'
const ALIAE = 'https://paiement.aliae.com'

describe('the payment providers', () => {
  it('are known by their own hosts, https only', () => {
    const name = (url: string) => providerOf(url)?.name ?? null
    expect(name(`${PAYLINE}/cdn/iframe.html`)).toBe('Payline (Monext)')
    expect(name(`${AXEPTA}/payssl.aspx`)).toBe('Axepta BNP Paribas')
    expect(name('https://tpeweb.paybox.com/cgi/MYchoix_pagepaiement.cgi')).toBe('Paybox (Verifone)')
    expect(name('https://secure.payzen.eu/vads-payment/')).toBe('PayZen (Lyra)')
    expect(name('https://paiement.systempay.fr/vads-payment/')).toBe('Systempay')
    expect(name('https://js.stripe.com/v3/elements-inner-card.html')).toBe('Stripe')
    expect(name('https://checkoutshopper-live.adyen.com/checkoutshopper/securedfields/')).toBe('Adyen')
    expect(name('https://checkout-web-components.checkout.com/')).toBe('Checkout.com')
    expect(name('https://payment-webinit.mercanet.bnpparibas.net/paymentInit')).toBe('Worldline')
    expect(name('https://p.monetico-services.com/paiement.cgi')).toBe('Monetico')
  })

  it('never a host that only looks like one, nor one over http', () => {
    for (const url of [
      'http://payment.payline.com',
      'https://payline.com.evil.example',
      'https://evilpayline.com',
      'https://stripe.com.evil.example/',
      'not a url',
      ''
    ])
      expect(providerOf(url), url).toBeNull()
  })
})

describe('the frames that may receive the card', () => {
  it('the page itself, a frame on its own site, a payment provider’s frame', () => {
    expect(frameMayReceive([SANEF], `${SANEF}/client/index.html#basket`)).toBe(true)
    expect(frameMayReceive([SANEF, PAYLINE], `${SANEF}/client/`)).toBe(true)
    expect(frameMayReceive([SANEF, 'https://paiement.sanef.com'], `${SANEF}/client/`)).toBe(true)
  })

  it('never another site’s frame, a provider’s frame inside it, an http or opaque one', () => {
    expect(frameMayReceive([SANEF, 'https://ads.example'], `${SANEF}/client/`)).toBe(false)
    expect(frameMayReceive([SANEF, 'https://ads.example', PAYLINE], `${SANEF}/client/`)).toBe(false)
    expect(frameMayReceive([SANEF, 'http://payment.cdn.payline.com'], `${SANEF}/client/`)).toBe(false)
    expect(frameMayReceive([SANEF, 'null'], `${SANEF}/client/`)).toBe(false)
    expect(frameMayReceive([], `${SANEF}/client/`)).toBe(false)
    // Another association under asso.fr is another site.
    expect(frameMayReceive(['https://x.asso.fr', 'https://evil.asso.fr'], 'https://x.asso.fr/payer')).toBe(false)
  })
})

describe('whom a payment is for', () => {
  const known = (site: string) => site === 'sanef.com' || site === 'aliae.com'
  const page = (url: string, initiator: string, previous: Arrival | null, hops: string[] = [url]): Arrival => ({ url, initiator, hops, previous })
  const journeys = page(`${ALIAE}/fr/journeys`, ALIAE, page(`${ALIAE}/fr/form/payment`, '', null))
  /** ALIAE's page sends the browser to its bank's page by a form it posts. */
  const posted = page(`${AXEPTA}/paymentPage.aspx`, ALIAE, journeys)

  it('a site Marianne knows, on its own page', () => {
    expect(paymentRoute(`${SANEF}/client/index.html#basket`, null, known)).toEqual({
      site: 'sanef.com',
      provider: null,
      from: `${SANEF}/client/index.html#basket`
    })
  })

  it('a provider’s page the site’s own page sent the browser to, its redirects on the site or the provider', () => {
    expect(paymentRoute(`${AXEPTA}/paymentPage.aspx`, posted, known)).toMatchObject({ site: 'aliae.com', provider: { name: 'Axepta BNP Paribas' } })
    const redirected = page(`${AXEPTA}/payssl.aspx`, ALIAE, journeys, [
      `${ALIAE}/services/v1/payments/psp`,
      `${AXEPTA}/paymentPage.aspx`,
      `${AXEPTA}/payssl.aspx`
    ])
    expect(paymentRoute(`${AXEPTA}/payssl.aspx`, redirected, known)?.site).toBe('aliae.com')
    // A same-page move on the provider's page keeps it.
    expect(paymentRoute(`${AXEPTA}/paymentPage.aspx#carte`, posted, known)?.site).toBe('aliae.com')
  })

  it('through that provider’s own pages, a few of them', () => {
    const second = page(`${AXEPTA}/payssl.aspx`, AXEPTA, posted)
    expect(paymentRoute(`${AXEPTA}/payssl.aspx`, second, known)?.site).toBe('aliae.com')
    let long: Arrival = posted
    for (let i = 0; i < ARRIVALS_KEPT; i++) long = page(`${AXEPTA}/step${i}`, AXEPTA, long)
    expect(paymentRoute(long.url, long, known)).toBeNull()
  })

  it('never a provider’s page an address opened, an advert sent, a redirect elsewhere led to, or another provider’s', () => {
    // Opened by Marianne or typed: no page sent it.
    expect(paymentRoute(`${AXEPTA}/paymentPage.aspx`, page(`${AXEPTA}/paymentPage.aspx`, '', journeys), known)).toBeNull()
    // An advert's frame in ALIAE's page navigated the page.
    expect(paymentRoute(`${AXEPTA}/paymentPage.aspx`, page(`${AXEPTA}/paymentPage.aspx`, 'https://ads.example', journeys), known)).toBeNull()
    // Through someone else's host on the way.
    const tracked = page(`${AXEPTA}/paymentPage.aspx`, ALIAE, journeys, ['https://tracker.example/r', `${AXEPTA}/paymentPage.aspx`])
    expect(paymentRoute(`${AXEPTA}/paymentPage.aspx`, tracked, known)).toBeNull()
    // From a site Marianne doesn't know.
    const shop = page('https://shop.example/panier', '', null)
    expect(paymentRoute(`${AXEPTA}/paymentPage.aspx`, page(`${AXEPTA}/paymentPage.aspx`, 'https://shop.example', shop), known)).toBeNull()
    // One provider's page sent to another's.
    const stripe = page('https://checkout.stripe.com/c/pay', ALIAE, journeys)
    expect(paymentRoute(`${AXEPTA}/paymentPage.aspx`, page(`${AXEPTA}/paymentPage.aspx`, 'https://checkout.stripe.com', stripe), known)).toBeNull()
  })

  it('never a page that isn’t the one the browser arrived on, an http page, or a page of nobody’s', () => {
    expect(paymentRoute('https://tpeweb.paybox.com/cgi', posted, known)).toBeNull()
    expect(paymentRoute(`http://paymentpage.axepta.bnpparibas/paymentPage.aspx`, posted, known)).toBeNull()
    expect(paymentRoute('https://shop.example/pay', null, known)).toBeNull()
    expect(paymentRoute(`${AXEPTA}/paymentPage.aspx`, null, known)).toBeNull()
  })

  it('names the site’s page that sent the browser on, for a rule that counts pages rather than sites (a declared host)', () => {
    expect(paymentRoute(`${AXEPTA}/paymentPage.aspx`, posted, known)?.from).toBe(`${ALIAE}/fr/journeys`)
    const declared = (_site: string, url: string) => url.startsWith(`${ALIAE}/`)
    expect(paymentRoute(`${AXEPTA}/paymentPage.aspx`, posted, declared)).toMatchObject({ site: 'aliae.com', from: `${ALIAE}/fr/journeys` })
    const corporate = page('https://www.aliae.com/fr/payer', '', null)
    expect(paymentRoute(`${AXEPTA}/paymentPage.aspx`, page(`${AXEPTA}/paymentPage.aspx`, 'https://www.aliae.com', corporate), declared)).toBeNull()
  })
})

describe('where a payment pressed leads: the bank’s 3-D Secure', () => {
  const PAID = `${AXEPTA}/paymentPage.aspx`
  const ACS = 'https://acs.banque.example/challenge'
  const page = (url: string, initiator: string, previous: Arrival | null, hops: string[] = [url]): Arrival => ({ url, initiator, hops, previous })
  const paid = page(PAID, ALIAE, page(`${ALIAE}/fr/journeys`, '', null))
  const challenge = page(ACS, AXEPTA, paid)

  it('the pages each one sent the browser to, from the page the payment was pressed on: the bank’s, wherever its host, and back', () => {
    expect(paidOnward(ACS, challenge, PAID)).toBe(true)
    const code = page(`${ACS}/code`, 'https://acs.banque.example', challenge)
    expect(paidOnward(`${ACS}/code`, code, PAID)).toBe(true)
    const back = page(`${AXEPTA}/result.aspx`, 'https://acs.banque.example', code, ['https://acs.banque.example/r', `${AXEPTA}/result.aspx`])
    expect(paidOnward(`${AXEPTA}/result.aspx`, back, PAID)).toBe(true)
    expect(paidOnward(`${ALIAE}/fr/confirmation`, page(`${ALIAE}/fr/confirmation`, AXEPTA, back), PAID)).toBe(true)
    // A provider's frame in the merchant's page sends the whole page to the bank.
    const sanef = page(`${SANEF}/client/`, '', null)
    expect(paidOnward(ACS, page(ACS, PAYLINE, sanef), `${SANEF}/client/`)).toBe(true)
  })

  it('never a page no page sent the browser to, nor one an advert’s frame did, nor through http', () => {
    // Back, reload, an address typed or opened.
    expect(paidOnward(ACS, page(ACS, '', paid), PAID)).toBe(false)
    expect(paidOnward(`${ACS}/code`, page(`${ACS}/code`, '', challenge), PAID)).toBe(false)
    expect(paidOnward(ACS, page(ACS, 'https://ads.example', paid), PAID)).toBe(false)
    expect(paidOnward(ACS, page(ACS, AXEPTA, paid, ['http://acs.banque.example/challenge', ACS]), PAID)).toBe(false)
    expect(paidOnward('http://acs.banque.example/challenge', challenge, PAID)).toBe(false)
  })

  it('never from another page than the one paid on, a page that isn’t the one the browser arrived on, or too far', () => {
    expect(paidOnward(ACS, challenge, `${AXEPTA}/autre.aspx`)).toBe(false)
    expect(paidOnward(ACS, challenge, '')).toBe(false)
    expect(paidOnward('https://shop.example/', challenge, PAID)).toBe(false)
    expect(paidOnward(ACS, null, PAID)).toBe(false)
    let long: Arrival = challenge
    for (let i = 0; i < ARRIVALS_KEPT; i++) long = page(`${ACS}/${i}`, 'https://acs.banque.example', long)
    expect(paidOnward(long.url, long, PAID)).toBe(false)
  })
})

/** The page script's own function, as the pages run it. */
const cardField = new Function(`return ${CARD_FIELD}`)() as (c: { autocomplete?: string; words: string; tag?: string; type?: string }) => {
  kind: string
  sure: boolean
} | null
const kind = (words: string, more: { autocomplete?: string; tag?: string; type?: string } = {}) => cardField({ words, tag: 'INPUT', type: 'text', ...more })

describe('telling card fields apart in a page', () => {
  it('in scripts that compile, those that read pages included', () => {
    const scripts = [
      CARD_KIND,
      CARD_SCAN_SCRIPT(null),
      CARD_SCAN_SCRIPT('cardNumber'),
      CARD_FILL_SCRIPT({ c1: '4242424242424242', c2: 'O’Brien "Jo"' }),
      CARD_CLEAR_SCRIPT(['c1']),
      PAY_PRESS_SCRIPT('p1'),
      FORM_READ_SCRIPT,
      PAGE_READ_SCRIPT
    ]
    // Compiled, not run: a slip in a script would otherwise only show in a page.
    for (const script of scripts) expect(() => new Function(`return ${script}`)).not.toThrow()
  })

  it('by their autocomplete first, as browsers fill cards', () => {
    expect(kind('x', { autocomplete: 'cc-number' })).toEqual({ kind: 'number', sure: true })
    expect(kind('x', { autocomplete: 'section-pay billing cc-csc' })).toEqual({ kind: 'cvv', sure: true })
    expect(kind('x', { autocomplete: 'cc-exp' })?.kind).toBe('expiry')
    expect(kind('x', { autocomplete: 'cc-exp-month', tag: 'SELECT', type: 'select-one' })?.kind).toBe('month')
    expect(kind('x', { autocomplete: 'cc-exp-year' })?.kind).toBe('year')
    expect(kind('x', { autocomplete: 'cc-name' })).toEqual({ kind: 'holder', sure: true })
    // A card part it doesn't fill, or a field of the wrong type: none.
    expect(kind('x', { autocomplete: 'cc-given-name' })).toBeNull()
    expect(kind('x', { autocomplete: 'cc-number', type: 'email' })).toBeNull()
  })

  it('by their words, French or English, whatever their random names (as Sanef’s)', () => {
    expect(kind('3f2c9a10-77e1 Numéro de carte', { type: 'tel' })).toEqual({ kind: 'number', sure: false })
    expect(kind('N° de carte bancaire')).toEqual({ kind: 'number', sure: true })
    expect(kind('cardNumber')).toEqual({ kind: 'number', sure: true })
    expect(kind('Card number')?.kind).toBe('number')
    expect(kind('Date d’expiration MM/AA')?.kind).toBe('expiry')
    expect(kind('Expiry date')?.kind).toBe('expiry')
    expect(kind('expMonth', { tag: 'SELECT', type: 'select-one' })?.kind).toBe('month')
    expect(kind('Année d’expiration', { tag: 'SELECT', type: 'select-one' })?.kind).toBe('year')
    expect(kind('MMAA')?.kind).toBe('expiry')
    expect(kind('Cryptogramme visuel', { type: 'password' })).toEqual({ kind: 'cvv', sure: true })
    expect(kind('cvc')?.kind).toBe('cvv')
    expect(kind('Security code')?.kind).toBe('cvv')
    expect(kind('Titulaire de la carte')).toEqual({ kind: 'holder', sure: true })
    expect(kind('Name on card')?.kind).toBe('holder')
  })

  it('sure only of what nothing but a bank card’s field would say: the others stay readable to fill forms', () => {
    expect(kind('Nom du titulaire')).toEqual({ kind: 'holder', sure: false })
    expect(kind('Date d’expiration')).toEqual({ kind: 'expiry', sure: false })
    expect(kind('Date d’expiration de la carte')).toEqual({ kind: 'expiry', sure: true })
  })

  it('never another card, nor a field that isn’t one', () => {
    for (const words of [
      'Numéro de carte vitale',
      'Numéro de carte grise',
      'Date d’expiration de la carte d’identité',
      'Date d’expiration du passeport',
      'Numéro de carte TotalEnergies',
      'Gift card number',
      'Date de fin',
      'Numéro fiscal',
      'IBAN',
      'Immatriculation'
    ])
      expect(kind(words), words).toBeNull()
    expect(kind('Numéro de carte', { type: 'checkbox' })).toBeNull()
    expect(kind('Numéro de carte', { type: 'password' })).toBeNull()
  })
})

const field = (id: string, kind: CardField['kind'], more: Partial<CardField> = {}): CardField => ({
  id,
  kind,
  tag: 'input',
  type: 'text',
  maxLength: 0,
  placeholder: '',
  ...more
})
const frame = (node: number, origins: string[], fields: CardField[], pay: string[] = []): CardFrame => ({ node, origins, fields, pay })
const CARD = { month: 9, year: 2028, holder: 'Camille Martin', digits: 16 }
const MONTHS = [
  { value: '', text: 'Mois' },
  ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), text: String(i + 1).padStart(2, '0') }))
]
const YEARS = [{ value: '', text: 'Année' }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(2026 + i), text: String(2026 + i) }))]

describe('what goes in which field', () => {
  /** Sanef's page: Payline's widget, the number and the code in frames of its own, the rest in the page. */
  const sanef = [
    frame(1, [SANEF], [field('c1', 'expiry', { placeholder: 'MM/AA' }), field('c2', 'holder')]),
    frame(2, [SANEF, PAYLINE], [field('c1', 'number')]),
    frame(3, [SANEF, PAYLINE], [field('c1', 'cvv')])
  ]

  it('fills each field in its own frame, the number and the code put in at the last moment', () => {
    const plan = planCard(sanef, CARD) as CardPlan
    expect(plan.targets).toEqual([
      { node: 2, origins: [SANEF, PAYLINE], id: 'c1', kind: 'number', secret: 'number' },
      { node: 1, origins: [SANEF], id: 'c1', kind: 'expiry', value: '09/28' },
      { node: 1, origins: [SANEF], id: 'c2', kind: 'holder', value: 'Camille Martin' },
      { node: 3, origins: [SANEF, PAYLINE], id: 'c1', kind: 'cvv', secret: 'cvv' }
    ])
    expect(plan).toMatchObject({ cvv: true, via: { name: 'Payline (Monext)' }, pay: null })
    expect(cardFills(plan, { number: '4242424242424242', cvv: '737' })).toEqual([
      { node: 2, origins: [SANEF, PAYLINE], values: { c1: '4242424242424242' } },
      { node: 1, origins: [SANEF], values: { c1: '09/28', c2: 'Camille Martin' } },
      { node: 3, origins: [SANEF, PAYLINE], values: { c1: '737' } }
    ])
  })

  it('a provider’s whole form in its frame: its lists, and its pay button, which click can’t reach', () => {
    const frames = [
      frame(
        4,
        [SANEF, 'https://p.monetico-services.com'],
        [
          field('c1', 'number'),
          field('c2', 'expiry', { tag: 'select', options: MONTHS }),
          field('c3', 'expiry', { tag: 'select', options: YEARS }),
          field('c4', 'cvv')
        ],
        ['Payer 12,40 €']
      )
    ]
    const plan = planCard(frames, CARD) as CardPlan
    expect(plan.targets.map((t) => [t.kind, t.value ?? t.secret])).toEqual([
      ['number', 'number'],
      ['month', '09'],
      ['year', '2028'],
      ['cvv', 'cvv']
    ])
    expect(plan.pay).toEqual({ node: 4, origins: frames[0].origins, id: 'p1', label: 'Payer 12,40 €' })
    // In the page itself, click reaches it: never pressed here.
    expect((planCard([frame(1, [SANEF], frames[0].fields, ['Payer'])], CARD) as CardPlan).pay).toBeNull()
    // Two that could be it: none.
    expect((planCard([{ ...frames[0], pay: ['Payer', 'Valider'] }], CARD) as CardPlan).pay).toBeNull()
  })

  it('prefers what is in the number’s own frame', () => {
    const plan = planCard(
      [frame(1, [SANEF], [field('c1', 'holder')]), frame(2, [SANEF, PAYLINE], [field('c1', 'number'), field('c2', 'holder'), field('c3', 'expiry')])],
      CARD
    )
    expect((plan as CardPlan).targets.find((t) => t.kind === 'holder')).toMatchObject({ node: 2, id: 'c2' })
  })

  it('fills nothing when what goes where can’t be told', () => {
    expect(planCard([], CARD)).toBe('there is no card number field')
    expect(planCard([frame(1, [SANEF], [field('c1', 'number'), field('c2', 'number'), field('c3', 'expiry')])], CARD)).toBe(
      'there are several card number fields'
    )
    expect(planCard([frame(1, [SANEF], [field('c1', 'number')])], CARD)).toBe('there is no expiry field')
    expect(planCard([frame(1, [SANEF], [field('c1', 'number'), field('c2', 'expiry'), field('c3', 'month')])], CARD)).toBe(
      'its expiry fields can’t be told apart'
    )
    expect(planCard([frame(1, [SANEF], [field('c1', 'number'), field('c2', 'expiry'), field('c3', 'cvv'), field('c4', 'cvv')])], CARD)).toBe(
      'there are several security code fields'
    )
    expect(planCard([frame(1, [SANEF], [field('c1', 'number', { maxLength: 4 }), field('c2', 'expiry')])], CARD)).toMatch(/too short/)
    const pastYears = YEARS.filter((o) => o.value !== '2028')
    expect(
      planCard(
        [
          frame(
            1,
            [SANEF],
            [field('c1', 'number'), field('c2', 'month', { tag: 'select', options: MONTHS }), field('c3', 'year', { tag: 'select', options: pastYears })]
          )
        ],
        CARD
      )
    ).toMatch(/no place for this card’s month or year/)
  })

  it('writes the expiry as the field asks', () => {
    expect(expiryValue(field('c', 'expiry'), CARD)).toBe('09/28')
    expect(expiryValue(field('c', 'expiry', { maxLength: 4 }), CARD)).toBe('0928')
    expect(expiryValue(field('c', 'expiry', { placeholder: 'MM / AAAA' }), CARD)).toBe('09 / 2028')
    expect(expiryValue(field('c', 'expiry', { placeholder: 'MMAA' }), CARD)).toBe('0928')
    expect(expiryValue(field('c', 'expiry', { type: 'month' }), CARD)).toBe('2028-09')
    expect(
      expiryValue(
        field('c', 'expiry', {
          tag: 'select',
          options: [
            { value: 'a', text: '08/28' },
            { value: 'b', text: '09/28' }
          ]
        }),
        CARD
      )
    ).toBe('b')
    expect(partValue(field('c', 'year', { maxLength: 4 }), 'year', CARD)).toBe('2028')
    expect(partValue(field('c', 'year', { placeholder: 'AA' }), 'year', CARD)).toBe('28')
    expect(
      partValue(
        field('c', 'year', {
          tag: 'select',
          options: [
            { value: '27', text: '2027' },
            { value: '28', text: '2028' }
          ]
        }),
        'year',
        CARD
      )
    ).toBe('28')
  })
})

describe('the one pay click a payment’s yes covers', () => {
  const PAGE = `${SANEF}/client/index.html#basket`

  it('once, on that page as it was, for a few minutes, and only a click that pays', () => {
    const grants = new PayGrants()
    grants.give('f1', PAGE, 7, 0)
    expect(grants.take('f1', PAGE, 7, 'Payer 12,40 €', 1000)).toBe(true)
    expect(grants.take('f1', PAGE, 7, 'Payer 12,40 €', 2000)).toBe(false)

    grants.give('f1', PAGE, 7, 0)
    expect(grants.take('f2', PAGE, 7, 'Payer', 1000)).toBe(false)
    expect(grants.take('f1', PAGE, 7, 'Payer', PAY_GRANT_MS + 1)).toBe(false)
  })

  it('ends with leaving the page, or with another click that commits', () => {
    const grants = new PayGrants()
    grants.give('f1', PAGE, 7, 0)
    expect(grants.take('f1', PAGE, 8, 'Payer', 1000)).toBe(false)
    grants.give('f1', PAGE, 7, 0)
    expect(grants.take('f1', `${SANEF}/client/index.html#profile`, 7, 'Payer', 1000)).toBe(false)
    grants.give('f1', PAGE, 7, 0)
    expect(grants.take('f1', PAGE, 7, 'Supprimer mon compte', 1000)).toBe(false)
    expect(grants.take('f1', PAGE, 7, 'Payer', 1000)).toBe(false)
  })

  it('a button that pays, and nothing else of the floor, nor anything that binds the user beyond paying', () => {
    for (const label of ['Payer 12,40 €', 'Valider le paiement', 'Pay now', 'Confirmer', 'Régler']) expect(paying(label), label).toBe(true)
    for (const label of ['Envoyer et payer', 'Supprimer', 'Annuler le paiement', 'Signer', '', 'Retour']) expect(paying(label), label).toBe(false)
    for (const label of ['Payer et souscrire', 'Payer et transmettre', 'Valider et soumettre', 'Confirmer le mandat de prélèvement', 'Pay and subscribe'])
      expect(paying(label), label).toBe(false)
  })

  it('once pressed, marks its page: a pay click there would pay again, until the page changes', () => {
    const grants = new PayGrants()
    grants.press('f1', PAGE, 7, PAGE, 0)
    expect(grants.pressedOn('f1', PAGE, 7)).toBe(true)
    expect(grants.pressedOn('f1', PAGE, 8)).toBe(false)
    expect(grants.pressedOn('f1', `${SANEF}/client/index.html#profile`, 7)).toBe(false)
    expect(grants.pressedOn('f2', PAGE, 7)).toBe(false)
    // Marianne acting otherwise ends what follows the payment, not the mark.
    grants.land('f1')
    expect(grants.pressedOn('f1', PAGE, 7)).toBe(true)
    grants.clear()
    expect(grants.pressedOn('f1', PAGE, 7)).toBe(false)
  })

  it('what the press leads to is part of it for a few minutes, until Marianne acts otherwise', () => {
    const ACS = 'https://acs.banque.example/challenge'
    const paid: Arrival = { url: PAGE, initiator: '', hops: [PAGE], previous: null }
    const challenge: Arrival = { url: ACS, initiator: PAYLINE, hops: [ACS], previous: paid }
    const grants = new PayGrants()
    expect(grants.onward('f1', ACS, challenge, 0)).toBe(false)
    grants.press('f1', PAGE, 7, PAGE, 0)
    expect(grants.onward('f1', ACS, challenge, PAY_GRANT_MS)).toBe(true)
    expect(grants.onward('f2', ACS, challenge, 1000)).toBe(false)
    expect(grants.onward('f1', ACS, challenge, PAY_GRANT_MS + 1)).toBe(false)
    grants.land('f1')
    expect(grants.onward('f1', ACS, challenge, 1000)).toBe(false)
    // Pressed on a page the browser can't say how it came to: nothing follows on its yes.
    grants.press('f1', PAGE, 7, undefined, 0)
    expect(grants.onward('f1', ACS, challenge, 1000)).toBe(false)
  })
})
