import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { BRAND_LABELS, cardBrand, cardDigits, cvvProblem, expiryProblem, expiryText, maskCardNumbers, numberProblem, parseExpiry } from '../shared/cards'
import type { PaymentCard, PaymentCardInput } from '../shared/types'
import { session } from './session'

/**
 * The user's payment cards (Réglages › Paiement), inside the account's archive like the keychain.
 * The number, and the security code when the user chose to keep it, are read in the main process
 * only, to fill a payment page after the user's yes on a card (tools/browser.ts, pay_by_card):
 * never sent back to the window once saved, never to an engine, never logged. What the others know
 * of a card is its label, holder, brand, last four digits and expiry.
 */

const KIND = 'payment-card'

interface StoredCard extends PaymentCard {
  /** Digits only. */
  number: string
  /** Only when the user chose to keep it for this card. */
  cvv?: string
  createdAt: string
}

const view = ({ number: _number, cvv: _cvv, createdAt: _createdAt, ...card }: StoredCard): PaymentCard => card

class Cards extends EventEmitter {
  private all(): StoredCard[] {
    return session.archive.list<StoredCard>(KIND)
  }

  list(): PaymentCard[] {
    return this.all()
      .map(view)
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }

  /** A card added or changed, checked here whatever the window checked: a wrong one is refused with why, in French. */
  save(input: PaymentCardInput): PaymentCard {
    const existing = input.id ? session.archive.get<StoredCard>(KIND, input.id) : null
    if (input.id && !existing) throw new Error('Cette carte n’est plus enregistrée.')
    const typed = typeof input.number === 'string' && input.number.trim() ? input.number : ''
    if (!typed && !existing) throw new Error('Tapez le numéro de la carte.')
    const numberWrong = typed ? numberProblem(typed) : null
    if (numberWrong) throw new Error(`Numéro de carte : ${numberWrong}.`)
    const number = typed ? cardDigits(typed) : existing!.number
    const brand = cardBrand(number)
    const expiry = String(input.expiry ?? '')
    const expiryWrong = expiryProblem(expiry)
    if (expiryWrong) throw new Error(`Date d’expiration : ${expiryWrong}.`)
    const holder = String(input.holder ?? '').trim()
    if (!holder) throw new Error('Tapez le nom du titulaire, comme sur la carte.')
    // The security code is kept only when the user chooses it, for this card; a new number drops the old card's.
    let cvv: string | undefined
    if (input.storeCvv) {
      const given = typeof input.cvv === 'string' ? input.cvv.trim() : ''
      cvv = given || (typed ? undefined : existing?.cvv)
      if (!cvv) throw new Error('Tapez le cryptogramme pour l’enregistrer, ou décochez « enregistrer le cryptogramme ».')
      const cvvWrong = cvvProblem(cvv, brand)
      if (cvvWrong) throw new Error(`Cryptogramme : ${cvvWrong}.`)
    }
    const at = new Date().toISOString()
    const card: StoredCard = {
      id: existing?.id ?? randomUUID(),
      label: String(input.label ?? '').trim() || BRAND_LABELS[brand],
      holder,
      brand,
      last4: number.slice(-4),
      expiry: expiryText(parseExpiry(expiry)!),
      cvvStored: !!cvv,
      updatedAt: at,
      number,
      ...(cvv ? { cvv } : {}),
      createdAt: existing?.createdAt ?? at
    }
    session.archive.put(KIND, card.id, card)
    this.emit('change')
    return view(card)
  }

  remove(id: string): void {
    session.archive.remove(KIND, id)
    this.emit('change')
  }

  /** The number and the stored security code ('' when the user types it at each payment), to fill a payment page. */
  secret(id: string): { number: string; cvv: string } | null {
    const card = session.archive.get<StoredCard>(KIND, id)
    return card ? { number: card.number, cvv: card.cvv ?? '' } : null
  }

  /** Every stored number, digits only: masked out of what the engines get. None while the archive is locked. */
  numbers(): string[] {
    return session.maybe ? this.all().map((c) => c.number) : []
  }
}

export const cards = new Cards()

/**
 * `text` without the stored card numbers, with or without spaces: pages read, forms, pages given to
 * the conversation, tool results. A card's security code needs no such pass: it is never in a page
 * Marianne reads (card fields are never read), nor anywhere she writes.
 */
export const maskCards = (text: string): string => maskCardNumbers(text, cards.numbers())
