import { useEffect, useState } from 'react'
import { BRAND_LABELS, cardBrand, cardDigits, cardTitle, cvvProblem, expired, expiryProblem, numberProblem } from '@shared/cards'
import type { PaymentCard } from '@shared/types'
import { Field, Spinner } from '../components/ui'
import { api, errorText } from '../lib/api'

/**
 * Réglages › Paiement: the cards Marianne pays with, after the user's yes on a card at each payment.
 * Shown masked: the number and the security code go to the main process and never come back, so
 * changing a number means typing it again. Keeping the code is the user's choice, card by card, off
 * by default.
 */
export function PaymentPane() {
  const [cards, setCards] = useState<PaymentCard[]>([])
  const [editing, setEditing] = useState<PaymentCard | 'new' | null>(null)
  const load = () => void api.listCards().then(setCards)
  useEffect(() => {
    load()
    return api.onCards(load)
  }, [])
  return (
    <>
      <div className="note">
        Marianne paie avec vos cartes sur la page de paiement d’un site qu’elle connaît, après votre oui sur une carte, à chaque paiement. Elles sont rangées
        dans votre archive chiffrée ; le moteur n’en connaît que le nom, la marque, les 4 derniers chiffres et l’expiration.
      </div>
      <div className="rows">
        {cards.map((c) => (
          <div key={c.id} className="row">
            <span>
              <span className="hi">{cardTitle(c)}</span>
              <br />
              <span className="small dim">{c.holder}</span>
            </span>
            <span className={`small ${expired(c.expiry) ? 'bad' : 'dim'}`}>
              {expired(c.expiry) ? 'expirée' : c.cvvStored ? 'cryptogramme enregistré' : 'cryptogramme demandé à chaque paiement'}
            </span>
            <span>
              <button className="btn small" onClick={() => setEditing(c)}>
                modifier
              </button>{' '}
              <button
                className="btn small danger"
                aria-label={`supprimer la carte ${cardTitle(c)}`}
                title="supprimer la carte"
                onClick={() => confirm(`Supprimer la carte « ${cardTitle(c)} » de l’archive ?`) && void api.deleteCard(c.id)}
              >
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
      {!cards.length && <p className="dim">Aucune carte pour l’instant.</p>}
      {editing ? (
        <CardForm key={editing === 'new' ? 'new' : editing.id} card={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
      ) : (
        <button className="btn small" onClick={() => setEditing('new')}>
          + ajouter une carte
        </button>
      )}
    </>
  )
}

/** A card added or changed: what is typed is checked as it is typed, then again by the main process. */
function CardForm({ card, onDone }: { card: PaymentCard | null; onDone: () => void }) {
  const [label, setLabel] = useState(card?.label ?? '')
  const [holder, setHolder] = useState(card?.holder ?? '')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState(card?.expiry ?? '')
  const [storeCvv, setStoreCvv] = useState(card?.cvvStored ?? false)
  const [cvv, setCvv] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const digits = cardDigits(number)
  const brand = digits ? cardBrand(digits) : (card?.brand ?? 'other')
  const numberWrong = number.trim() ? numberProblem(number) : card ? null : 'tapez les chiffres de la carte'
  const expiryWrong = expiry.trim() ? expiryProblem(expiry) : 'au format MM/AA, comme sur la carte'
  // A code already kept stays when the number does; a new number needs its own.
  const cvvKept = !!card?.cvvStored && !number.trim()
  const cvvWrong = storeCvv && (cvv || !cvvKept) ? cvvProblem(cvv, brand) : null
  const ready = !numberWrong && !expiryWrong && !!holder.trim() && !cvvWrong && !busy
  const save = () => {
    if (!ready) return
    setBusy(true)
    setError('')
    api
      .saveCard({ id: card?.id, label, holder, ...(number.trim() ? { number } : {}), expiry, storeCvv, ...(storeCvv && cvv ? { cvv } : {}) })
      .then(onDone)
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false))
  }
  return (
    <div className="inline-card">
      <div className="in">
        <div className="form-grid">
          <Field label="nom" hint="pour la reconnaître : « perso », « pro »…">
            <input value={label} placeholder={BRAND_LABELS[brand]} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="titulaire" hint="comme sur la carte">
            <input value={holder} autoComplete="off" onChange={(e) => setHolder(e.target.value)} />
          </Field>
          <Field
            label="numéro"
            error={number.trim() ? (numberWrong ?? undefined) : undefined}
            hint={
              card && !number.trim()
                ? `laissez vide pour garder •••• ${card.last4}`
                : digits && !numberWrong
                  ? BRAND_LABELS[brand]
                  : 'les 16 chiffres, en général'
            }
          >
            <input value={number} inputMode="numeric" autoComplete="off" onChange={(e) => setNumber(e.target.value)} />
          </Field>
          <Field label="expiration" error={expiry.trim() ? (expiryWrong ?? undefined) : undefined} hint="MM/AA, comme sur la carte">
            <input
              value={expiry}
              inputMode="numeric"
              autoComplete="off"
              placeholder="MM/AA"
              maxLength={7}
              onChange={(e) => setExpiry(e.target.value.replace(/^(\d{2})(\d{2})$/, '$1/$2'))}
            />
          </Field>
        </div>
        <label className="small" style={{ display: 'block', margin: '8px 0 4px' }}>
          <input type="checkbox" checked={storeCvv} onChange={(e) => setStoreCvv(e.target.checked)} /> enregistrer le cryptogramme
        </label>
        <p className="small dim">
          Plus simple : vous n’avez plus rien à taper. Mais qui ouvrirait votre archive aurait alors tout pour payer avec cette carte. Sinon, vous le tapez dans
          la carte de paiement de Marianne, à chaque fois.
        </p>
        {storeCvv && (
          <Field
            label="cryptogramme"
            error={cvv ? (cvvWrong ?? undefined) : undefined}
            hint={cvvKept ? 'laissez vide pour garder celui enregistré' : (cvvWrong ?? '')}
          >
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </Field>
        )}
        {error && <p className="bad small">{error}</p>}
        <div className="acts">
          <button className="btn primary" disabled={!ready} aria-busy={busy} onClick={save}>
            {busy && <Spinner />}
            enregistrer
          </button>
          <button className="btn" disabled={busy} onClick={onDone}>
            annuler
          </button>
        </div>
      </div>
    </div>
  )
}
