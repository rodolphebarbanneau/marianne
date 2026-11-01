import type { Archive } from '@marianne/archive'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cards, maskCards } from '../src/main/cards'
import { session } from '../src/main/session'
import { cardBrand, cardTitle, cvvProblem, expired, expiryProblem, luhnValid, maskCardNumbers, numberProblem, parseExpiry } from '../src/shared/cards'

/**
 * The user's payment cards: a number checked as it is typed (its Luhn key, its length, its brand),
 * the expiry and the security code; what the window and the engines know of a card (never its number
 * nor its code), the code kept only when the user chooses it; and stored numbers masked out of text.
 * The numbers are the card networks' published test numbers, nobody's.
 */

const VISA = '4242 4242 4242 4242'
const MASTERCARD = '5555 5555 5555 4444'
const AMEX = '3782 822463 10005'

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

describe('a card number as it is typed', () => {
  it('passes its Luhn key, the number’s last digit', () => {
    expect(luhnValid('4242424242424242')).toBe(true)
    expect(luhnValid('4242424242424241')).toBe(false)
    // Two digits swapped.
    expect(luhnValid('4242424242424224')).toBe(false)
    expect(luhnValid('')).toBe(false)
  })

  it('tells its brand from its first digits', () => {
    expect(cardBrand('4242424242424242')).toBe('visa')
    expect(cardBrand('5555555555554444')).toBe('mastercard')
    expect(cardBrand('2223003122003222')).toBe('mastercard')
    expect(cardBrand('378282246310005')).toBe('amex')
    expect(cardBrand('6011111111111117')).toBe('discover')
    expect(cardBrand('3566002020360505')).toBe('jcb')
    expect(cardBrand('30569309025904')).toBe('diners')
    expect(cardBrand('6200000000000005')).toBe('unionpay')
    expect(cardBrand('6759649826438453')).toBe('maestro')
    expect(cardBrand('9999999999999995')).toBe('other')
  })

  it('says what is wrong with it, in French', () => {
    for (const ok of [VISA, '4242-4242-4242-4242', MASTERCARD, AMEX]) expect(numberProblem(ok), ok).toBeNull()
    expect(numberProblem('4242 4242 4242 4241')).toMatch(/pas valable/)
    expect(numberProblem('4242 4242 4242')).toMatch(/nombre de chiffres/)
    expect(numberProblem('3782 8224 6310 0050')).toMatch(/nombre de chiffres/)
    expect(numberProblem('4242 abcd')).toMatch(/chiffres/)
  })
})

describe('the expiry and the security code', () => {
  const now = new Date(2026, 10, 1)

  it('reads MM/AA as cards print it, and a card works to the end of its month', () => {
    expect(parseExpiry('09/28')).toEqual({ month: 9, year: 2028 })
    expect(parseExpiry('9 / 2028')).toEqual({ month: 9, year: 2028 })
    expect(parseExpiry('13/28')).toBeNull()
    expect(parseExpiry('0928')).toBeNull()
    expect(expired('11/26', now)).toBe(false)
    expect(expired('10/26', now)).toBe(true)
    expect(expiryProblem('10/26', now)).toBe('cette carte a expiré')
    expect(expiryProblem('septembre', now)).toMatch(/MM\/AA/)
  })

  it('wants 4 digits on an American Express, 3 on the others', () => {
    expect(cvvProblem('737', 'visa')).toBeNull()
    expect(cvvProblem('7373', 'visa')).not.toBeNull()
    expect(cvvProblem('7373', 'amex')).toBeNull()
    expect(cvvProblem('737', 'amex')).not.toBeNull()
    expect(cvvProblem('73a', 'mastercard')).not.toBeNull()
  })

  it('shows a card masked', () => {
    expect(cardTitle({ brand: 'visa', last4: '4242', label: 'perso', expiry: '09/28' })).toBe('Visa •••• 4242 · perso · 09/28')
  })
})

describe('stored numbers masked out of a text', () => {
  it('with or without spaces, dots or dashes, never inside a longer number', () => {
    const numbers = ['4242424242424242']
    expect(maskCardNumbers('Carte 4242 4242 4242 4242 acceptée', numbers)).toBe('Carte •••• 4242 acceptée')
    expect(maskCardNumbers('4242424242424242', numbers)).toBe('•••• 4242')
    expect(maskCardNumbers('n°4242-4242-4242-4242.', numbers)).toBe('n°•••• 4242.')
    expect(maskCardNumbers('4242.4242.4242.4242', numbers, () => '<card>')).toBe('<card>')
    expect(maskCardNumbers('942424242424242421', numbers)).toBe('942424242424242421')
    expect(maskCardNumbers('5555 5555 5555 4444', numbers)).toBe('5555 5555 5555 4444')
  })

  it('however a page sets the digits apart: a few spaces, no-break spaces, line breaks or slashes, characters that show nothing', () => {
    const numbers = ['4242424242424242']
    expect(maskCardNumbers('Carte 4242  4242  4242  4242 acceptée', numbers)).toBe('Carte •••• 4242 acceptée')
    expect(maskCardNumbers('4242  4242 4242 4242', numbers)).toBe('•••• 4242')
    expect(maskCardNumbers('4242 /\n4242 /\n4242 /\n4242', numbers)).toBe('•••• 4242')
    expect(maskCardNumbers('4242​4242‌4242‍4242', numbers)).toBe('•••• 4242')
    expect(maskCardNumbers('carte : 4⁠2﻿4 2 4242 4242 4242 !', numbers)).toBe('carte : •••• 4242 !')
    // A soft hyphen, direction marks and controls, invisible operators.
    for (const code of [0xad, 0x200e, 0x200f, 0x2061, 0x2062, 0x2063, 0x2064, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
      const hidden = String.fromCodePoint(code)
      expect(maskCardNumbers(`n° 4242${hidden}4242 4242${hidden}${hidden}4242`, numbers), code.toString(16)).toBe('n° •••• 4242')
    }
    // Not across a wider gap, and a text with no number in it keeps what it had, invisible characters included.
    expect(maskCardNumbers('4242    4242    4242    4242', numbers)).toBe('4242    4242    4242    4242')
    expect(maskCardNumbers('Famille 👩‍👧, 4242 €', numbers)).toBe('Famille 👩‍👧, 4242 €')
  })
})

describe('the cards in the archive', () => {
  beforeEach(() => session.open(memoryArchive()))
  afterEach(() => session.lock())

  const input = { label: 'perso', holder: 'Camille Martin', number: VISA, expiry: '09/38', storeCvv: false }

  it('give the window and the engines its label, holder, brand, last four digits and expiry only', () => {
    const saved = cards.save(input)
    expect(saved).toMatchObject({ label: 'perso', holder: 'Camille Martin', brand: 'visa', last4: '4242', expiry: '09/38', cvvStored: false })
    expect(JSON.stringify(cards.list())).not.toContain('4242424242424242')
    expect(JSON.stringify(saved)).not.toMatch(/number|cvv"/)
    expect(cards.secret(saved.id)).toEqual({ number: '4242424242424242', cvv: '' })
    expect(cards.numbers()).toEqual(['4242424242424242'])
  })

  it('keep the security code only when the user chooses it, for that card', () => {
    const first = cards.save({ ...input, storeCvv: true, cvv: '737' })
    expect(first.cvvStored).toBe(true)
    expect(cards.secret(first.id)?.cvv).toBe('737')
    // Kept as long as the box stays ticked and the number the same; gone once unticked.
    expect(cards.save({ ...input, number: undefined, id: first.id, storeCvv: true }).cvvStored).toBe(true)
    expect(cards.save({ ...input, number: undefined, id: first.id, storeCvv: false }).cvvStored).toBe(false)
    expect(cards.secret(first.id)?.cvv).toBe('')
    // A new number needs its own.
    cards.save({ ...input, number: undefined, id: first.id, storeCvv: true, cvv: '737' })
    expect(() => cards.save({ ...input, number: MASTERCARD, id: first.id, storeCvv: true })).toThrow(/cryptogramme/)
  })

  it('keep the number when editing without typing it again, and check what is typed', () => {
    const saved = cards.save(input)
    expect(cards.save({ ...input, id: saved.id, number: undefined, label: 'pro', expiry: '10/39' })).toMatchObject({
      label: 'pro',
      last4: '4242',
      expiry: '10/39'
    })
    expect(cards.secret(saved.id)?.number).toBe('4242424242424242')
    expect(() => cards.save({ ...input, number: '4242 4242 4242 4241' })).toThrow(/Numéro de carte/)
    expect(() => cards.save({ ...input, number: undefined })).toThrow(/numéro/)
    expect(() => cards.save({ ...input, expiry: '01/20' })).toThrow(/expiré/)
    expect(() => cards.save({ ...input, holder: ' ' })).toThrow(/titulaire/)
    expect(() => cards.save({ ...input, number: AMEX, storeCvv: true, cvv: '737' })).toThrow(/Cryptogramme/)
    expect(cards.save({ ...input, label: '', number: AMEX }).label).toBe('American Express')
  })

  it('are masked out of any text while the archive is open, and nothing is masked once it locks', () => {
    cards.save(input)
    expect(maskCards('Payé avec 4242 4242 4242 4242.')).toBe('Payé avec •••• 4242.')
    session.lock()
    expect(cards.numbers()).toEqual([])
    session.open(memoryArchive())
  })
})
