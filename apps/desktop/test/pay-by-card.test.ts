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

/** The page: where it is, how the browser came there, its version, its card fields, and what was filled or pressed. */
const page = vi.hoisted(() => ({
  url: '',
  title: '',
  folderId: '',
  version: 1,
  arrival: null as Arrival | null,
  frames: [] as CardFrame[],
  fills: [] as Array<{ node: number; values: Record<string, string> }>,
  fillHolds: true,
  pressed: [] as string[],
  elements: [] as { id: string; role: string; label: string; type: string; secret: boolean; card: boolean }[]
}))

vi.mock('electron', () => ({ app: { getVersion: () => '0' } }))
vi.mock('../src/main/browser', () => {
  class HumanControlError extends Error {}
  const browser = {
    state: () => ({
      url: page.url,
      title: page.title,
      folderId: page.folderId,
      controller: 'agent',
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
    pressPay: vi.fn(async (pay: { id: string }) => (page.pressed.push(pay.id), true)),
    readPage: vi.fn(async () => ({ url: page.url, title: page.title, text: 'Montant à payer : 12,40 €', elements: page.elements })),
    elementLabel: vi.fn(async (id: string) => page.elements.find((e) => e.id === id)?.label ?? ''),
    click: vi.fn(async () => undefined),
    setWaiting: vi.fn(),
    settled: vi.fn(async () => undefined),
    reveal: vi.fn(),
    back: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
  return { browser, HumanControlError }
})

import { accounts } from '../src/main/account'
import { approvals } from '../src/main/approvals'
import { browser } from '../src/main/browser'
import { cards } from '../src/main/cards'
import { folders } from '../src/main/folders'
import { services } from '../src/main/host'
import { callTool } from '../src/main/mcp'
import { profile } from '../src/main/profile/store'
import { session } from '../src/main/session'
import { browserTools } from '../src/main/tools/browser'
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
  Object.assign(page, { url: '', title: '', folderId: '', version: 1, arrival: null, frames: [], fills: [], fillHolds: true, pressed: [], elements: [] })
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
    // Neither the code nor the number in the card the conversation keeps, nor in what the engine reads.
    expect(JSON.stringify(parts)).not.toContain(CVV)
    expect(JSON.stringify(parts)).not.toContain(NUMBER)
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
  const click = (f: string) => call(f, 'click', { element: 'e1', purpose: 'payer les passages', consequential: false })

  it('goes on the payment’s yes, once; the next one asks again', async () => {
    reply = { answer: 'approve', cvv: CVV }
    const f = on(`${SANEF}/client/index.html#basket`)
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
    const f = on(`${SANEF}/client/index.html#basket`)
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
    // No pay click left to cover.
    page.elements = [PAY_BUTTON]
    await call(f, 'read_page')
    const asked = parts.length
    await click(f)
    expect(parts).toHaveLength(asked + 1)
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
