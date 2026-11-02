import { useEffect, useState } from 'react'
import { BRAND_LABELS, cardBrand, cardDigits, cardTitle, cvvProblem, expired, expiryProblem, numberProblem } from '@shared/cards'
import type { PaymentCard } from '@shared/types'
import { Field, Spinner } from '../components/ui'
import { api, errorText } from '../lib/api'
import { IbanField } from './me'
import { FormDialog, ListHead, RowActions } from './parts'

/**
 * Réglages › Banque et paiement: the account the user is paid on, and the cards Marianne pays with, after
 * the user's yes on a card at each payment. Shown masked: the number and the security code go to the main
 * process and never come back, so changing a number means typing it again. Keeping the code is the user's
 * choice, card by card, off by default.
 */
export function MoneyPane() {
  const [cards, setCards] = useState<PaymentCard[]>([])
  const [editing, setEditing] = useState<PaymentCard | 'new' | null>(null)
  const load = () => void api.listCards().then(setCards)
  useEffect(() => {
    load()
    return api.onCards(load)
  }, [])
  const remove = (c: PaymentCard) => confirm(`Supprimer la carte « ${cardTitle(c)} » de l’archive ?`) && void api.deleteCard(c.id)
  return (
    <>
      <ListHead label="compte bancaire" />
      <IbanField />
      <ListHead label="cartes de paiement" count={cards.length}>
        <button className="btn small" onClick={() => setEditing('new')}>
          + ajouter une carte
        </button>
      </ListHead>
      {cards.length ? (
        <div className="table-wrap">
          <table className="stable">
            <thead>
              <tr>
                <th>carte</th>
                <th>titulaire</th>
                <th>cryptogramme</th>
                <th>
                  <span className="sr-only">actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} onClick={() => setEditing(c)}>
                  <td>
                    <span className="hi">{cardTitle(c)}</span>
                  </td>
                  <td>{c.holder}</td>
                  <td className={expired(c.expiry) ? 'bad' : 'dim'}>
                    {expired(c.expiry) ? 'carte expirée' : c.cvvStored ? 'enregistré' : 'demandé à chaque paiement'}
                  </td>
                  <td className="r" onClick={(e) => e.stopPropagation()}>
                    <RowActions name={`la carte ${cardTitle(c)}`} onEdit={() => setEditing(c)} onDelete={() => remove(c)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small dim empty">aucune carte</p>
      )}
      {editing && <CardDialog key={editing === 'new' ? 'new' : editing.id} card={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
    </>
  )
}

/** A card added or changed: what is typed is checked as it is typed, then again by the main process. */
function CardDialog({ card, onDone }: { card: PaymentCard | null; onDone: () => void }) {
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
    <FormDialog
      title={card ? cardTitle(card) : 'ajouter une carte'}
      onClose={onDone}
      actions={
        <>
          <button className="btn" disabled={busy} onClick={onDone}>
            annuler
          </button>
          <button className="btn primary" disabled={!ready} aria-busy={busy} onClick={save}>
            {busy && <Spinner />}
            enregistrer
          </button>
        </>
      }
    >
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
      <label className="check-field">
        <input type="checkbox" checked={storeCvv} onChange={(e) => setStoreCvv(e.target.checked)} /> enregistrer le cryptogramme
        <span className="small dim"> · plus rien à taper, mais qui ouvrirait votre archive aurait tout pour payer avec cette carte</span>
      </label>
      {storeCvv && (
        <div className="form-grid">
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
        </div>
      )}
      {error && <p className="bad small">{error}</p>}
    </FormDialog>
  )
}
