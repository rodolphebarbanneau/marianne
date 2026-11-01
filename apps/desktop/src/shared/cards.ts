import type { CardBrand, PaymentCard } from './types'

/**
 * Payment cards, the pure part: checking a number as it is typed (its length, its Luhn key, its
 * brand), the expiry and the security code, how a card is shown (« Visa •••• 4242 · perso · 09/28 »),
 * and masking stored numbers out of a text. Shared: Réglages › Paiement checks as the user types,
 * the main process checks again before it stores anything (main/cards.ts).
 */

export const BRAND_LABELS: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  maestro: 'Maestro',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  other: 'Carte'
}

/** The digits of a number as typed, spaces and dashes taken out; '' when anything else is in it. */
export function cardDigits(typed: string): string {
  const digits = typed.replace(/[\s.-]/g, '')
  return /^\d+$/.test(digits) ? digits : ''
}

/** The Luhn key every card number ends with: one digit mistyped, or two swapped, fails it. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2
    sum += d
  }
  return sum % 10 === 0
}

/** The brand, from the number's first digits (a French « CB » card is also a Visa or a Mastercard). */
export function cardBrand(digits: string): CardBrand {
  const two = Number(digits.slice(0, 2))
  const four = Number(digits.slice(0, 4))
  if (/^3[47]/.test(digits)) return 'amex'
  if (/^3(0[0-5]|09|[689])/.test(digits)) return 'diners'
  if (/^35(2[89]|[3-8])/.test(digits)) return 'jcb'
  if (/^4/.test(digits)) return 'visa'
  if ((two >= 51 && two <= 55) || (four >= 2221 && four <= 2720)) return 'mastercard'
  if (/^(6011|65|64[4-9])/.test(digits)) return 'discover'
  if (/^62/.test(digits)) return 'unionpay'
  if (/^(50|5[6-9]|6)/.test(digits)) return 'maestro'
  return 'other'
}

/** The lengths each brand's numbers have; the others, 12 to 19 digits. */
const LENGTHS: Partial<Record<CardBrand, number[]>> = { visa: [13, 16, 19], mastercard: [16], amex: [15] }

/** What is wrong with a typed card number, in French; null when it is a card's. */
export function numberProblem(typed: string): string | null {
  const digits = cardDigits(typed)
  if (!digits) return 'tapez les chiffres de la carte'
  const lengths = LENGTHS[cardBrand(digits)]
  if (lengths ? !lengths.includes(digits.length) : digits.length < 12 || digits.length > 19) return 'ce numéro n’a pas le bon nombre de chiffres'
  return luhnValid(digits) ? null : 'ce numéro n’est pas valable : vérifiez-le'
}

/** An expiry as typed (« 09/28 », « 9 / 2028 »): its month and its year (four digits); null when it isn't one. */
export function parseExpiry(typed: string): { month: number; year: number } | null {
  const m = typed.trim().match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/)
  if (!m) return null
  const month = Number(m[1])
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
  return month >= 1 && month <= 12 ? { month, year } : null
}

/** An expiry as cards print it and Marianne keeps it: MM/AA. */
export const expiryText = ({ month, year }: { month: number; year: number }) => `${String(month).padStart(2, '0')}/${String(year % 100).padStart(2, '0')}`

/** Whether a card is past its expiry: it works until the end of its month. */
export function expired(expiry: string, now = new Date()): boolean {
  const e = parseExpiry(expiry)
  return !e || e.year * 12 + e.month < now.getFullYear() * 12 + now.getMonth() + 1
}

/** What is wrong with a typed expiry, in French; null when it is right. */
export function expiryProblem(typed: string, now = new Date()): string | null {
  if (!parseExpiry(typed)) return 'au format MM/AA, comme sur la carte'
  return expired(typed, now) ? 'cette carte a expiré' : null
}

/** What is wrong with a typed security code, in French; null when it is right: 4 digits on an American Express, 3 on the others. */
export function cvvProblem(typed: string, brand: CardBrand): string | null {
  const length = brand === 'amex' ? [4] : brand === 'other' ? [3, 4] : [3]
  return /^\d+$/.test(typed) && length.includes(typed.length)
    ? null
    : brand === 'amex'
      ? 'les 4 chiffres au recto de la carte'
      : 'les 3 chiffres au dos de la carte'
}

/** A card as Marianne shows it: « Visa •••• 4242 · perso · 09/28 ». */
export const cardTitle = (card: Pick<PaymentCard, 'brand' | 'last4' | 'label' | 'expiry'>) =>
  [`${BRAND_LABELS[card.brand]} •••• ${card.last4}`, card.label, card.expiry].filter(Boolean).join(' · ')

/** Characters that show nothing, which a page may slip between digits (zero-width spaces and joiners, the word joiner, the byte order mark). */
const ZERO_WIDTH = /[​-‍⁠﻿]/g

/**
 * `text` with each of `numbers` (digits only) masked wherever it appears, its digits run together or
 * apart (up to three spaces, no-break spaces, line breaks, dots, dashes or slashes between two), never
 * inside a longer number. Characters that show nothing are taken out first, where a number is masked.
 * The mark keeps the last four digits, all an engine knows of a card.
 */
export function maskCardNumbers(text: string, numbers: string[], mark = (last4: string) => `•••• ${last4}`): string {
  const visible = text.replace(ZERO_WIDTH, '')
  let out = visible
  for (const digits of numbers) {
    if (!/^\d{12,19}$/.test(digits) || !out) continue
    const spaced = digits.split('').join('[\\s.\\-/]{0,3}')
    out = out.replace(new RegExp(`(?<!\\d)${spaced}(?!\\d)`, 'g'), mark(digits.slice(-4)))
  }
  // A text with no number in it stays as it was, invisible characters included.
  return out === visible ? text : out
}
