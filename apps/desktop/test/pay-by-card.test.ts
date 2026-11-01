import { rmSync } from 'node:fs'
import type { Archive } from '@marianne/archive'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Arrival, CardField, CardFrame } from '../src/main/browser/payment'

/**
 * pay_by_card, in a conversation: where Marianne pays (a site she knows, or a provider's page one of
 * them sent the browser to), the card of the floor and what it shows, the security code typed there
 * going to the page and nowhere else, nothing filled when the page changed or a field didn't hold,
 * the one pay click its yes covers, the pay button in a provider's frame, and never in a run. The
 * browser is faked; its frames hold the fields the page script would have tagged. The card numbers
 * are the networks' published test numbers.
 */

// ~/.marianne points at a temporary folder, before paths.ts reads it.
const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-pay-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

/**
 * The page: where it is, how the browser came there, its version, its card fields, what was filled or
 * pressed, where the next click or press leads (`next`: the address, and the origin of the frame
 * that sends the browser there), and whose hands it is in.
 */
const page = vi.hoisted(() => {
  const state = {
    url: '',
    title: '',
    folderId: '',
    controller: 'agent' as 'agent' | 'human',
    version: 1,
    arrival: null as Arrival | null,
    frames: [] as CardFrame[],
    fills: [] as Array<{ node: number; values: Record<string, string> }>,
    fillHolds: true,
    pressed: [] as string[],
    elements: [] as { id: string; role: string; label: string; type: string; secret: boolean; card: boolean }[],
    next: null as { url: string; initiator: string } | null
  }
  /** Goes where `next` says, as a form, a link or a script of the page does. */
  const go = () => {
    if (!state.next) return
    state.arrival = { url: state.next.url, initiator: state.next.initiator, hops: [state.next.url], previous: state.arrival }
    state.url = state.next.url
    state.version++
    state.next = null
  }
  /** Who listens to the browser's state: the tools, and a hand-over waiting for the page back. */
  const listeners = new Set<(state: unknown) => void>()
  /** The user takes the page (« prendre la main »), or gives it back: the browser tells its listeners. */
  const hands = (controller: 'agent' | 'human') => {
    state.controller = controller
    for (const listener of [...listeners]) listener({ url: state.url, folderId: state.folderId, controller })
  }
  return Object.assign(state, { go, listeners, hands })
})

vi.mock('electron', () => ({ app: { getVersion: () => '0' } }))
vi.mock('../src/main/browser', () => {
  class HumanControlError extends Error {}
  const browser = {
    state: () => ({
      url: page.url,
      title: page.title,
      folderId: page.folderId,
      controller: page.controller,
      visible: true,
      loading: false,
      canGoBack: true,
      canGoForward: false
    }),
    currentUrl: () => page.url,
    inRun: () => false,
    arrival: () => page.arrival,
    pageVersion: () => page.version,
    // The frames the rule lets through, as the browser asks it of each frame.
    cardFields: vi.fn(async (may: (origins: string[]) => boolean) => page.frames.filter((f) => may(f.origins))),
    fillCard: vi.fn(async (fills: Array<{ node: number; values: Record<string, string> }>) => {
      page.fills.push(...fills.map(({ node, values }) => ({ node, values })))
      return page.fillHolds
    }),
    pressPay: vi.fn(async (pay: { id: string }) => (page.pressed.push(pay.id), page.go(), true)),
    readPage: vi.fn(async () => ({ url: page.url, title: page.title, text: 'Montant à payer : 12,40 €', elements: page.elements })),
    elementLabel: vi.fn(async (id: string) => page.elements.find((e) => e.id === id)?.label ?? ''),
    click: vi.fn(async () => page.go()),
    fillLogin: vi.fn(async () => ['identifiant', 'mot de passe']),
    setWaiting: vi.fn(),
    settled: vi.fn(async () => undefined),
    reveal: vi.fn(),
    back: vi.fn(),
    on: vi.fn((event: string, listener: (state: unknown) => void) => void (event === 'state' && page.listeners.add(listener))),
    off: vi.fn((event: string, listener: (state: unknown) => void) => void (event === 'state' && page.listeners.delete(listener)))
  }
  return { browser, HumanControlError }
})

import { accounts } from '../src/main/account'
import { approvals } from '../src/main/approvals'
import { browser } from '../src/main/browser'
import { cards } from '../src/main/cards'
import { folders } from '../src/main/folders'
import { services } from '../src/main/host'
import { keychain } from '../src/main/keychain'
import { callTool } from '../src/main/mcp'
import { profile } from '../src/main/profile/store'
import { session } from '../src/main/session'
import { tasks } from '../src/main/tasks'
import { browserTools } from '../src/main/tools/browser'
import { PAY_GRANT_MS } from '../src/main/tools/online'
import type { Tool } from '../src/main/tools/tool'
import type { ApprovalPart, PlannedTask } from '../src/shared/types'

function memoryArchive(): Archive {
  const records = new Map<string, Map<string, unknown>>()
  const of = (kind: string) => records.get(kind) ?? records.set(kind, new Map()).get(kind)!
  return {
    get: (kind: string, id: string) => structuredClone(of(kind).get(id) ?? null),
    put: (kind: string, id: string, value: unknown) => void of(kind).set(id, structuredClone(value)),
    remove: (kind: string, id: string) => void of(kind).delete(id),
    list: (kind: string) => [...of(kind).values()].map((v) => structuredClone(v)),
    close: () => undefined
  } as unknown as Archive
}

const SANEF = 'https://www.sanef.com'
const PAYLINE = 'https://payment.cdn.payline.com'
const AXEPTA = 'https://paymentpage.axepta.bnpparibas'
const ALIAE = 'https://paiement.aliae.com'
const NUMBER = '4242424242424242'
const CVV = '737'
const PAY = { amount: '12,40 €', reason: 'Payer les passages du 30 octobre.' }

const field = (id: string, kind: CardField['kind'], more: Partial<CardField> = {}): CardField => ({
  id,
  kind,
  tag: 'input',
  type: 'text',
  maxLength: 0,
  placeholder: '',
  ...more
})
/** Sanef's page: Payline's widget, the number and the code in its own frames, the rest in the page; and an advert with a card field of its own. */
const SANEF_FRAMES: CardFrame[] = [
  { node: 1, origins: [SANEF], fields: [field('c1', 'expiry', { placeholder: 'MM/AA' }), field('c2', 'holder')], pay: [] },
  { node: 2, origins: [SANEF, PAYLINE], fields: [field('c1', 'number')], pay: [] },
  { node: 3, origins: [SANEF, PAYLINE], fields: [field('c1', 'cvv')], pay: [] },
  { node: 4, origins: [SANEF, 'https://ads.example'], fields: [field('c1', 'number')], pay: [] }
]

const tool = (name: string) => browserTools.find((t) => t.name === name)!
async function call(folderId: string, name: string, args: Record<string, unknown> = {}, t: Tool = tool(name)): Promise<string> {
  const answer = await callTool(t, args, { folderId })
  const text = answer.content[0].text
  return answer.isError ? `refused: ${text}` : text
}

/** Every card and line shown, and how the next pending card is answered (with the code typed in it, if any). */
let parts: ApprovalPart[] = []
let reply: { answer: 'approve' | 'refuse'; cvv?: string; before?: () => void } = { answer: 'approve' }
const onPart = (_folderId: string, part: ApprovalPart) => {
  parts.push(part)
  if (part.status !== 'pending') return
  const { answer, cvv, before } = reply
  setTimeout(() => {
    before?.()
    approvals.respond(part.id, answer, cvv)
  })
}
const payments = () => parts.filter((p) => p.kind === 'payment')

/** A conversation's folder, its page open on `url`. */
function on(url: string, frames: CardFrame[] = SANEF_FRAMES): string {
  const folderId = folders.create({ title: 'Péages', engine: 'claude' }).id
  Object.assign(page, { url, title: 'Paiement', folderId, frames })
  return folderId
}

beforeEach(() => {
  session.open(memoryArchive())
  Object.assign(page, {
    url: '',
    title: '',
    folderId: '',
    controller: 'agent',
    version: 1,
    arrival: null,
    frames: [],
    fills: [],
    fillHolds: true,
    pressed: [],
    elements: [],
    next: null
  })
  vi.mocked(browser.fillCard).mockClear()
  vi.mocked(browser.pressPay).mockClear()
  vi.mocked(browser.cardFields).mockClear()
  parts = []
  reply = { answer: 'approve' }
  approvals.on('part', onPart)
  approvals.canShow = () => true
  // Going online to these sites was allowed ahead: the cards here are the payments' and the clicks'.
  const rule = (site: string) => ({ id: site, action: 'online' as const, site, at: '2026-10-30T08:00:00.000Z' })
  vi.spyOn(accounts, 'settings').mockReturnValue({
    approvals: { level: 'balanced', rules: ['sanef.com', 'aliae.com', 'axepta.bnpparibas', 'shop.example'].map(rule) },
    browser: { show: 'always' }
  } as never)
  vi.spyOn(services, 'declaredSites').mockReturnValue(['www.sanef.com', 'paiement.aliae.com'])
  vi.spyOn(profile, 'tokens').mockReturnValue([])
  cards.save({ label: 'perso', holder: 'Camille Martin', number: '4242 4242 4242 4242', expiry: '09/38', storeCvv: false })
})
afterEach(() => {
  approvals.off('part', onPart)
  approvals.canShow = () => false
  session.lock()
  vi.restoreAllMocks()
})

describe('where Marianne pays', () => {
  it('nowhere she doesn’t know: the user pays themselves, nothing read', async () => {
    const result = await call(on('https://shop.example/panier'), 'pay_by_card', PAY)
    expect(result).toMatch(/^refused: shop\.example is not a site where Marianne pays by card.*hand_over/)
    expect(browser.cardFields).not.toHaveBeenCalled()
    expect(payments()).toEqual([])
  })

  it('on a provider’s page a site she knows sent the browser to, saying for whom', async () => {
    const f = on(`${AXEPTA}/paymentPage.aspx`, [
      { node: 1, origins: [AXEPTA], fields: [field('c1', 'number'), field('c2', 'expiry'), field('c3', 'holder'), field('c4', 'cvv')], pay: [] }
    ])
    const journeys: Arrival = { url: `${ALIAE}/fr/journeys`, initiator: ALIAE, hops: [`${ALIAE}/fr/journeys`], previous: null }
    page.arrival = { url: `${AXEPTA}/paymentPage.aspx`, initiator: ALIAE, hops: [`${AXEPTA}/paymentPage.aspx`], previous: journeys }
    reply = { answer: 'approve', cvv: CVV }
    expect(await call(f, 'pay_by_card', PAY)).toMatch(/^Filled the card number, expiry, holder and security code of Visa •••• 4242/)
    expect(payments()[0]).toMatchObject({
      title: 'Payer par carte pour aliae.com',
      fields: expect.arrayContaining([{ label: 'site', value: 'via Axepta BNP Paribas pour aliae.com · paymentpage.axepta.bnpparibas' }])
    })
  })

  it('never a provider’s page a page of a known site that no service declares sent the browser to', async () => {
    // aliae.com is a site Marianne knows (3615 PEAGE declares paiement.aliae.com), but www.aliae.com isn't declared.
    const f = on(`${AXEPTA}/paymentPage.aspx`, [])
    const journeys: Arrival = {
      url: 'https://www.aliae.com/fr/payer',
      initiator: 'https://www.aliae.com',
      hops: ['https://www.aliae.com/fr/payer'],
      previous: null
    }
    page.arrival = { url: `${AXEPTA}/paymentPage.aspx`, initiator: 'https://www.aliae.com', hops: [`${AXEPTA}/paymentPage.aspx`], previous: journeys }
    expect(await call(f, 'pay_by_card', PAY)).toMatch(/^refused: axepta\.bnpparibas is not a site/)
    expect(payments()).toEqual([])
  })

  it('never the same page opened by an address: no site sent it there', async () => {
    const f = on(`${AXEPTA}/paymentPage.aspx`, [])
    page.arrival = { url: `${AXEPTA}/paymentPage.aspx`, initiator: '', hops: [`${AXEPTA}/paymentPage.aspx`], previous: null }
    expect(await call(f, 'pay_by_card', PAY)).toMatch(/^refused: axepta\.bnpparibas is not a site/)
  })

  it('never in a planned task’s run, even if it reached the tool', async () => {
    const f = on(`${SANEF}/client/index.html#basket`)
    await expect(tool('pay_by_card').run(PAY, { folderId: f, run: {} as PlannedTask })).rejects.toThrow(/cannot pay/)
    expect(browser.cardFields).not.toHaveBeenCalled()
  })
})

describe('which card', () => {
  it('none saved: propose adding one, or let the user type it', async () => {
    cards.remove(cards.list()[0].id)
    expect(await call(on(`${SANEF}/client/`), 'pay_by_card', PAY)).toMatch(/No card is saved.*request_setup, target payment.*hand_over/)
  })

  it('several, none named: lists them as the user sees them, never their numbers', async () => {
    cards.save({ label: 'pro', holder: 'Camille Martin', number: '5555 5555 5555 4444', expiry: '10/39', storeCvv: false })
    const result = await call(on(`${SANEF}/client/`), 'pay_by_card', PAY)
    expect(result).toMatch(/Several saved cards/)
    expect(result).toContain('Mastercard •••• 4444 · pro · 10/39')
    expect(result).toContain('Visa •••• 4242 · perso · 09/38')
    expect(result).not.toMatch(/5555555555554444|4242424242424242/)
    // Named by its last four digits.
    reply = { answer: 'approve', cvv: CVV }
    expect(await call(on(`${SANEF}/client/`), 'pay_by_card', { ...PAY, card: '•••• 4444' })).toMatch(/^Filled .* of Mastercard •••• 4444 · pro/)
  })
})

describe('the payment, on its card', () => {
  it('shows the site and its provider, the page, the card and the amount as read; the code typed there goes to the page only', async () => {
    reply = { answer: 'approve', cvv: CVV }
    const f = on(`${SANEF}/client/index.html#basket`)
    const result = await call(f, 'pay_by_card', PAY)
    const [card] = payments()
    expect(card).toMatchObject({
      action: 'commit',
      title: 'Payer par carte sur sanef.com',
      reason: PAY.reason,
      askCvv: true,
      status: 'accepted',
      fields: [
        { label: 'site', value: 'sanef.com · via Payline (Monext) · payment.cdn.payline.com' },
        { label: 'page', value: 'Paiement' },
        { label: 'carte', value: 'Visa •••• 4242 · perso · 09/38' },
        { label: 'montant lu sur la page', value: '12,40 €' },
        { label: 'remplit', value: 'numéro, date d’expiration, titulaire, cryptogramme' }
      ]
    })
    expect(card.always).toBeUndefined()
    // Each field in its own frame; the advert's never.
    expect(page.fills).toEqual([
      { node: 2, values: { c1: NUMBER } },
      { node: 1, values: { c1: '09/38', c2: 'Camille Martin' } },
      { node: 3, values: { c1: CVV } }
    ])
    // Neither the code nor the number in the card the conversation keeps, nor in what the engine reads. Without the
    // cards' ids: random, their hexadecimal digits may hold the code by chance.
    const kept = JSON.stringify(parts, (key, value) => (key === 'id' ? undefined : value))
    expect(kept).not.toContain(CVV)
    expect(kept).not.toContain(NUMBER)
    expect(result).not.toContain(CVV)
    expect(result).not.toContain(NUMBER)
    expect(result).toMatch(/Nothing is paid yet.*click.*one click, on this page, for 5 minutes.*3-D Secure.*hand_over/)
  })

  it('a code the user chose to keep fills without asking', async () => {
    const id = cards.list()[0].id
    cards.save({ id, label: 'perso', holder: 'Camille Martin', expiry: '09/38', storeCvv: true, cvv: '123' })
    await call(on(`${SANEF}/client/`), 'pay_by_card', PAY)
    expect(payments()[0].askCvv).toBeUndefined()
    expect(page.fills.at(-1)).toEqual({ node: 3, values: { c1: '123' } })
  })

  it('refused, or the code missing: nothing filled', async () => {
    reply = { answer: 'refuse' }
    expect(await call(on(`${SANEF}/client/`), 'pay_by_card', PAY)).toMatch(/^refused: The user refused: nothing was filled/)
    reply = { answer: 'approve' }
    expect(await call(on(`${SANEF}/client/`), 'pay_by_card', PAY)).toMatch(/^refused: No valid security code/)
    expect(browser.fillCard).not.toHaveBeenCalled()
  })

  it('a page that changed while its fields were looked for (it settles first) is the page the card shows', async () => {
    reply = { answer: 'approve', cvv: CVV }
    vi.mocked(browser.cardFields).mockImplementationOnce(async (may) => {
      page.version++
      return page.frames.filter((f) => may(f.origins))
    })
    expect(await call(on(`${SANEF}/client/`), 'pay_by_card', PAY)).toMatch(/^Filled/)
  })

  it('the page changed while the card waited: nothing filled', async () => {
    reply = { answer: 'approve', cvv: CVV, before: () => page.version++ }
    expect(await call(on(`${SANEF}/client/`), 'pay_by_card', PAY)).toMatch(/^refused: The page changed while the user was deciding: nothing was filled/)
    expect(browser.fillCard).not.toHaveBeenCalled()
  })

  it('fields that can’t be told apart, or that didn’t hold: nothing left filled, the engine told why', async () => {
    reply = { answer: 'approve', cvv: CVV }
    const twice = [...SANEF_FRAMES, { node: 5, origins: [SANEF, PAYLINE], fields: [field('c1', 'number')], pay: [] }]
    expect(await call(on(`${SANEF}/client/`, twice), 'pay_by_card', PAY)).toMatch(
      /^refused: Marianne can’t fill a card on this page: there are several card number fields/
    )
    expect(payments()).toEqual([])
    page.fillHolds = false
    expect(await call(on(`${SANEF}/client/`), 'pay_by_card', PAY)).toMatch(/^refused: The card form changed while it was being filled: nothing is left filled/)
  })
})

describe('the pay click that follows', () => {
  const PAY_BUTTON = { id: 'e1', role: 'button', label: 'Payer 12,40 €', type: 'submit', secret: false, card: false }
  const click = (f: string, consequential = false) => call(f, 'click', { element: 'e1', purpose: 'payer les passages', consequential })
  /** Axepta's page, where ALIAE's own page sent the browser: a provider's page no service declares, where every click that pays asks. */
  function onAxepta(): string {
    const f = on(`${AXEPTA}/paymentPage.aspx`, [
      { node: 1, origins: [AXEPTA], fields: [field('c1', 'number'), field('c2', 'expiry'), field('c3', 'holder'), field('c4', 'cvv')], pay: [] }
    ])
    const journeys: Arrival = { url: `${ALIAE}/fr/journeys`, initiator: ALIAE, hops: [`${ALIAE}/fr/journeys`], previous: null }
    page.arrival = { url: `${AXEPTA}/paymentPage.aspx`, initiator: ALIAE, hops: [`${AXEPTA}/paymentPage.aspx`], previous: journeys }
    return f
  }

  it('goes on the payment’s yes, once; the next one asks again', async () => {
    reply = { answer: 'approve', cvv: CVV }
    const f = onAxepta()
    await call(f, 'pay_by_card', PAY)
    page.elements = [PAY_BUTTON]
    await call(f, 'read_page')
    const asked = parts.length
    expect(await click(f)).toMatch(/^Clicked « Payer 12,40 € », as part of the payment the user approved/)
    expect(parts).toHaveLength(asked)
    await click(f)
    expect(parts).toHaveLength(asked + 1)
    expect(parts.at(-1)).toMatchObject({ action: 'commit', title: 'Cliquer sur « Payer 12,40 € »' })
  })

  it('ends with leaving the page', async () => {
    reply = { answer: 'approve', cvv: CVV }
    const f = onAxepta()
    await call(f, 'pay_by_card', PAY)
    page.version++
    page.elements = [PAY_BUTTON]
    await call(f, 'read_page')
    const asked = parts.length
    expect(await click(f)).not.toMatch(/as part of the payment/)
    expect(parts).toHaveLength(asked + 1)
  })

  it('in a provider’s frame, where click can’t reach, is pressed by the payment itself, on the same yes', async () => {
    reply = { answer: 'approve', cvv: CVV }
    const monetico = 'https://p.monetico-services.com'
    const f = on(`${SANEF}/client/`, [
      { node: 7, origins: [SANEF, monetico], fields: [field('c1', 'number'), field('c2', 'expiry'), field('c3', 'cvv')], pay: ['Payer'] }
    ])
    const result = await call(f, 'pay_by_card', PAY)
    expect(result).toMatch(/and pressed « Payer » in the payment form, as the user approved/)
    expect(page.pressed).toEqual(['p1'])
    expect(payments()[0].fields).toContainEqual({ label: 'puis', value: 'appuie sur « Payer » dans le formulaire de paiement' })
    // No pay click left to cover, and the payment pressed on this page: another pay button asks, though Sanef is declared.
    page.elements = [PAY_BUTTON]
    await call(f, 'read_page')
    const asked = parts.length
    await click(f)
    expect(parts).toHaveLength(asked + 1)
    expect(parts.at(-1)).toMatchObject({ action: 'commit', title: 'Cliquer sur « Payer 12,40 € »' })
  })

  it('on a site Marianne’s own services declare, needs no card of its own; pressed again on that page, asks, until the page changes', async () => {
    reply = { answer: 'approve', cvv: CVV }
    const f = on(`${SANEF}/client/index.html#basket`)
    await call(f, 'pay_by_card', PAY)
    page.elements = [PAY_BUTTON]
    await call(f, 'read_page')
    const asked = parts.length
    expect(await click(f)).toMatch(/^Clicked « Payer 12,40 € », as part of the payment the user approved/)
    expect(parts).toHaveLength(asked)
    // The same page would pay again: the floor's card.
    await click(f)
    expect(parts).toHaveLength(asked + 1)
    expect(parts.at(-1)).toMatchObject({ action: 'commit', title: 'Cliquer sur « Payer 12,40 € »' })
    // A step that doesn't pay goes as on any declared page. Once the page changed, a pay button still asks while the
    // card's fields are on it (the card filled may pay again), and goes as a step on the way once they are gone.
    page.elements = [{ ...PAY_BUTTON, label: 'Accepter les conditions' }]
    await call(f, 'read_page')
    expect(await click(f)).toMatch(/^Clicked « Accepter les conditions »/)
    page.version++
    page.elements = [PAY_BUTTON]
    await call(f, 'read_page')
    expect(await click(f)).toMatch(/^Clicked « Payer 12,40 € »\. Now on/)
    expect(parts).toHaveLength(asked + 2)
    expect(parts.at(-1)).toMatchObject({ action: 'commit', title: 'Cliquer sur « Payer 12,40 € »' })
    page.version++
    page.frames = []
    await call(f, 'read_page')
    expect(await click(f)).toMatch(/^Clicked « Payer 12,40 € »\. Now on/)
    expect(parts).toHaveLength(asked + 2)
  })

  it('ends with the turn it was given in, and with a hand-over', async () => {
    reply = { answer: 'approve', cvv: CVV }
    const f = onAxepta()
    await call(f, 'pay_by_card', PAY)
    page.elements = [PAY_BUTTON]
    await call(f, 'read_page')
    // The turn is over: the user's next message asks again before paying.
    approvals.expire(f)
    const asked = parts.length
    expect(await click(f)).not.toMatch(/as part of the payment/)
    expect(parts).toHaveLength(asked + 1)
    // Handed to the user, the page isn't the one they approved the payment on any more.
    const g = onAxepta()
    await call(g, 'pay_by_card', PAY)
    page.elements = [PAY_BUTTON]
    await call(g, 'read_page')
    const handing = call(g, 'hand_over', { reason: 'Vérifiez le montant, puis rendez-moi la main.' })
    await vi.waitFor(() => expect(browser.setWaiting).toHaveBeenCalledWith('Vérifiez le montant, puis rendez-moi la main.'))
    page.hands('human')
    page.hands('agent')
    expect(await handing).toMatch(/^The user handed control back/)
    const handed = parts.length
    expect(await click(g)).not.toMatch(/as part of the payment/)
    expect(parts).toHaveLength(handed + 1)
    expect(parts.at(-1)).toMatchObject({ action: 'commit', title: 'Cliquer sur « Payer 12,40 € »' })
  })

  it('never one that also binds the user: « Payer et souscrire » asks, on a declared site too', async () => {
    reply = { answer: 'approve', cvv: CVV }
    for (const open of [onAxepta, () => on(`${SANEF}/client/index.html#basket`)]) {
      const f = open()
      expect(await call(f, 'pay_by_card', PAY)).toMatch(/^Filled/)
      page.elements = [{ ...PAY_BUTTON, label: 'Payer et souscrire' }]
      await call(f, 'read_page')
      const asked = parts.length
      expect(await click(f)).not.toMatch(/as part of the payment/)
      expect(parts).toHaveLength(asked + 1)
      expect(parts.at(-1)).toMatchObject({ action: 'commit', title: 'Cliquer sur « Payer et souscrire »' })
    }
    // Nor a pay button the engine says binds them.
    const f = onAxepta()
    await call(f, 'pay_by_card', PAY)
    page.elements = [PAY_BUTTON]
    await call(f, 'read_page')
    const asked = parts.length
    await call(f, 'click', { element: 'e1', purpose: 'payer et souscrire l’abonnement annuel', consequential: false })
    expect(parts).toHaveLength(asked + 1)
  })
})

describe('a pay button on a declared site, without a payment’s yes', () => {
  const PAY_BUTTON = { id: 'e1', role: 'button', label: 'Payer 12,40 €', type: 'submit', secret: false, card: false }
  const click = (f: string) => call(f, 'click', { element: 'e1', purpose: 'payer les passages', consequential: false })
  /** On Sanef's page with `frames`, its pay button read: a click there, and whether it asked. */
  async function payOn(f: string, frames: CardFrame[] = []): Promise<{ result: string; asked: boolean }> {
    Object.assign(page, { url: `${SANEF}/client/index.html#basket`, title: 'Paiement', folderId: f, frames, elements: [PAY_BUTTON] })
    await call(f, 'read_page')
    const before = parts.length
    const result = await click(f)
    return { result, asked: parts.length > before && parts.at(-1)!.title === 'Cliquer sur « Payer 12,40 € »' }
  }
  const folder = () => folders.create({ title: 'Péages', engine: 'claude' }).id

  it('goes as a step on the way while nothing but the payment card could pay', async () => {
    expect(await payOn(folder())).toEqual({ result: expect.stringMatching(/^Clicked « Payer 12,40 € »/), asked: false })
  })

  it('asks while a frame of the page holds a card’s fields: the user may have typed theirs', async () => {
    expect((await payOn(folder(), SANEF_FRAMES)).asked).toBe(true)
    // Not a step that doesn't read as paying.
    const f = folder()
    Object.assign(page, { folderId: f, frames: SANEF_FRAMES, elements: [{ ...PAY_BUTTON, label: 'Accepter les conditions' }] })
    await call(f, 'read_page')
    expect(await click(f)).toMatch(/^Clicked « Accepter les conditions »/)
  })

  it('asks once Marianne signed in on the site, in any folder, until the lock', async () => {
    vi.spyOn(keychain, 'forUrl').mockReturnValue([{ id: 'k1', label: 'perso' }] as never)
    const f = on(`${SANEF}/connexion`)
    expect(await call(f, 'sign_in')).toMatch(/^Filled the username and password/)
    expect((await payOn(f)).asked).toBe(true)
    // The browser's sign-in is every folder's.
    expect((await payOn(folder())).asked).toBe(true)
    session.lock()
    session.open(memoryArchive())
    expect((await payOn(folder())).asked).toBe(false)
  })

  it('asks once the user had the page in hand there: handed over, or taken', async () => {
    const f = on(`${SANEF}/client/index.html#basket`, [])
    const handing = call(f, 'hand_over', { reason: 'Saisissez votre carte, puis rendez-moi la main.' })
    await vi.waitFor(() => expect(browser.setWaiting).toHaveBeenCalledWith('Saisissez votre carte, puis rendez-moi la main.'))
    page.hands('human')
    page.hands('agent')
    expect(await handing).toMatch(/^The user handed control back/)
    expect((await payOn(f)).asked).toBe(true)
    // « prendre la main », with no hand-over asked.
    session.lock()
    session.open(memoryArchive())
    const g = on(`${SANEF}/client/index.html#basket`, [])
    page.hands('human')
    page.hands('agent')
    expect((await payOn(g)).asked).toBe(true)
  })
})

describe('what the payment leads to: the bank’s 3-D Secure', () => {
  const ACS = 'https://acs.banque.example/challenge'
  const PAY_BUTTON = { id: 'e1', role: 'button', label: 'Payer 12,40 €', type: 'submit', secret: false, card: false }
  const click = (f: string) => call(f, 'click', { element: 'e1', purpose: 'payer les passages', consequential: false })
  /** The going-online cards asked: not the lines of what was allowed ahead. */
  const goingOnline = () => parts.filter((p) => p.action === 'online' && !p.given).map((p) => p.title)
  /** Axepta's page, ALIAE's own page having sent the browser there, the card filled and its pay button read. */
  async function paying(): Promise<string> {
    const f = on(`${AXEPTA}/paymentPage.aspx`, [
      { node: 1, origins: [AXEPTA], fields: [field('c1', 'number'), field('c2', 'expiry'), field('c3', 'holder'), field('c4', 'cvv')], pay: [] }
    ])
    const journeys: Arrival = { url: `${ALIAE}/fr/journeys`, initiator: ALIAE, hops: [`${ALIAE}/fr/journeys`], previous: null }
    page.arrival = { url: `${AXEPTA}/paymentPage.aspx`, initiator: ALIAE, hops: [`${AXEPTA}/paymentPage.aspx`], previous: journeys }
    await call(f, 'pay_by_card', PAY)
    page.elements = [PAY_BUTTON]
    await call(f, 'read_page')
    return f
  }
  beforeEach(() => (reply = { answer: 'approve', cvv: CVV }))

  it('after the pay click the yes covered: the bank’s pages, and the way back, need no going-online card', async () => {
    const f = await paying()
    page.next = { url: ACS, initiator: AXEPTA }
    expect(await click(f)).toMatch(/^Clicked « Payer 12,40 € », as part of the payment the user approved\. Now on https:\/\/acs\.banque\.example/)
    expect(await call(f, 'read_page')).toMatch(/^# Paiement/)
    // The bank's own next page, then back to the provider's.
    page.next = { url: `${ACS}/code`, initiator: 'https://acs.banque.example' }
    page.go()
    await call(f, 'read_page')
    page.next = { url: `${AXEPTA}/result.aspx`, initiator: 'https://acs.banque.example' }
    page.go()
    await call(f, 'read_page')
    expect(goingOnline()).toEqual([])
  })

  it('after pay_by_card’s own press in the provider’s frame too', async () => {
    const monetico = 'https://p.monetico-services.com'
    const f = on(`${SANEF}/client/`, [
      { node: 7, origins: [SANEF, monetico], fields: [field('c1', 'number'), field('c2', 'expiry'), field('c3', 'cvv')], pay: ['Payer'] }
    ])
    page.arrival = { url: `${SANEF}/client/`, initiator: '', hops: [`${SANEF}/client/`], previous: null }
    // The provider's frame sends the whole page to the bank.
    page.next = { url: ACS, initiator: monetico }
    expect(await call(f, 'pay_by_card', PAY)).toMatch(/pressed « Payer »/)
    expect(await call(f, 'read_page')).toMatch(/^# Paiement\nhttps:\/\/acs\.banque\.example/)
    expect(goingOnline()).toEqual([])
  })

  it('not once the turn it was approved in is over', async () => {
    const f = await paying()
    page.next = { url: ACS, initiator: AXEPTA }
    await click(f)
    approvals.expire(f)
    await call(f, 'read_page')
    expect(goingOnline()).toEqual(['Aller sur banque.example'])
  })

  it('not after another click, nor for a page no page of the payment sent the browser to, nor once its few minutes are over', async () => {
    // Another click, Marianne's own step, after the one the yes covered.
    const f = await paying()
    await click(f)
    page.elements = [{ id: 'e1', role: 'link', label: 'Aide', type: '', secret: false, card: false }]
    await call(f, 'read_page')
    page.next = { url: ACS, initiator: AXEPTA }
    await call(f, 'click', { element: 'e1', purpose: 'lire l’aide', consequential: false })
    expect(goingOnline()).toEqual(['Aller sur banque.example'])
    // Back, or an address typed: no page sent the browser there.
    const g = await paying()
    await click(g)
    page.next = { url: ACS, initiator: '' }
    page.go()
    await call(g, 'read_page')
    expect(goingOnline()).toHaveLength(2)
    // The bank's page, reached in time; read again once the few minutes are over.
    const h = await paying()
    page.next = { url: ACS, initiator: AXEPTA }
    await click(h)
    expect(goingOnline()).toHaveLength(2)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + PAY_GRANT_MS + 1)
    await call(h, 'read_page')
    expect(goingOnline()).toEqual(['Aller sur banque.example', 'Aller sur banque.example', 'Aller sur banque.example'])
  })
})

describe('in a planned task’s follow-up', () => {
  it('the payment card still asks: the follow-up’s go-ahead never covers it', async () => {
    reply = { answer: 'approve', cvv: CVV }
    const task = tasks.create({
      title: 'Péages en flux libre',
      domain: 'mobility',
      runner: 'marianne',
      origin: { kind: 'service', service: 'peage', template: 'tolls:v1' },
      every: { unit: 'day', n: 2 },
      everyLabel: 'tous les 2 jours',
      sites: ['www.sanef.com', 'paiement.aliae.com'],
      followUp: { label: 'payer maintenant', instruction: 'Pay the passages found.' }
    })
    tasks.followingUp = (id) => (id === task.folderId ? task : null)
    try {
      Object.assign(page, { url: `${SANEF}/client/index.html#basket`, title: 'Paiement', folderId: task.folderId, frames: SANEF_FRAMES })
      expect(await call(task.folderId, 'pay_by_card', PAY)).toMatch(/^Filled/)
      expect(payments()).toMatchObject([{ action: 'commit', status: 'accepted', title: 'Payer par carte sur sanef.com' }])
    } finally {
      tasks.followingUp = () => null
    }
  })
})

describe('what reaches the engine', () => {
  it('a tool’s result never holds a stored card number, however written', async () => {
    const leaky = {
      name: 'leaky',
      title: 'Leaky',
      description: 'A tool of the test.',
      readOnly: true,
      input: {},
      run: async () => 'Carte 4242-4242-4242-4242 et 4242 4242 4242 4242.'
    } as unknown as Tool
    const result = await callTool(leaky, {}, {})
    expect(result.content[0].text).toBe('Carte •••• 4242 et •••• 4242.')
  })

  it('a field the page reads as a card’s is never typed into', async () => {
    const f = on(`${SANEF}/client/`)
    page.elements = [{ id: 'e1', role: 'field', label: 'Numéro de carte', type: 'tel', secret: false, card: true }]
    await call(f, 'read_page')
    expect(await call(f, 'type_text', { element: 'e1', value: '4000 0000 0000 0002' })).toMatch(/^refused: Never type card details/)
  })
})
