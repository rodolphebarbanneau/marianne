import { useState, useSyncExternalStore } from 'react'
import { checkPin } from '@shared/password'
import { Modal, Spinner } from '../components/ui'
import { afterUnlock } from '../lib/after-unlock'
import { api, errorText } from '../lib/api'
import { NewPassword, passwordProblem } from '../screens/password'

/** Right after unlocking, in this order: the new account's recovery key, a new password after a recovery, a PIN for this computer. */
export function AfterUnlock() {
  const s = useSyncExternalStore(afterUnlock.subscribe, afterUnlock.get)
  if (s.recoveryKey) return <RecoveryKey value={s.recoveryKey} onDone={() => afterUnlock.set({ recoveryKey: '' })} />
  if (s.resetPassword) return <ResetPassword onDone={() => afterUnlock.set({ resetPassword: false })} />
  if (s.offerPin) return <OfferPin onDone={() => afterUnlock.set({ offerPin: false })} />
  return null
}

export function RecoveryKey({ value, onDone }: { value: string; onDone: () => void }) {
  const [kept, setKept] = useState(false)
  return (
    <Modal>
      <div className="in">
        <span className="label">Votre clé de secours</span>
        <p>Si vous oubliez votre phrase de passe, cette clé est le seul moyen d’ouvrir l’archive. Imprimez-la ou recopiez-la, et rangez-la à part.</p>
        <div className="recovery selectable">{value}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn small" onClick={() => void navigator.clipboard.writeText(value)}>
            copier
          </button>
          <button className="btn small" onClick={() => window.print()}>
            imprimer
          </button>
        </div>
        <label>
          <input type="checkbox" checked={kept} onChange={(e) => setKept(e.target.checked)} />
          j’ai noté ma clé de secours
        </label>
      </div>
      <div className="foot">
        <span />
        <button className="btn primary" disabled={!kept} onClick={onDone}>
          continuer
        </button>
      </div>
    </Modal>
  )
}

function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState(passwordProblem('', ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true)
    try {
      await api.resetPassword(password)
      onDone()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  return (
    <Modal>
      <div className="in">
        <span className="label">Nouvelle phrase de passe</span>
        <p>Vous avez ouvert l’archive avec la clé de secours : choisissez une nouvelle phrase de passe.</p>
        <NewPassword
          onChange={(next, why) => {
            setPassword(next)
            setProblem(why)
            setError('')
          }}
        />
        {error && <p className="bad small">{error}</p>}
      </div>
      <div className="foot">
        <span />
        <button className="btn primary" disabled={busy} aria-busy={busy} onClick={() => (problem ? setError(problem) : void save())}>
          {busy && <Spinner />}
          enregistrer
        </button>
      </div>
    </Modal>
  )
}

/** A PIN to open this account on this computer without the whole phrase: offered after unlocking ("plus tard"), or set from the settings ("annuler"). */
export function OfferPin({ dismiss = 'plus tard', onDone }: { dismiss?: string; onDone: () => void }) {
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const problem = pin ? checkPin(pin) : null
  const save = async () => {
    setBusy(true)
    try {
      await api.setPin(pin)
      onDone()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 12)
  return (
    <Modal onClose={busy ? undefined : onDone}>
      <div className="in">
        <span className="label">Déverrouiller avec un code sur cet ordinateur</span>
        <p>
          La prochaine fois, un simple code suffira pour ouvrir l’archive sur cet ordinateur. Il ne marche qu’ici, car il s’appuie sur le trousseau du système.
          Après 5 erreurs, il faudra de nouveau la phrase de passe.
        </p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          placeholder="code (6 chiffres ou plus)"
          value={pin}
          onChange={(e) => setPin(digits(e.target.value))}
        />
        <input type="password" inputMode="numeric" placeholder="retapez-le pour confirmer" value={again} onChange={(e) => setAgain(digits(e.target.value))} />
        {problem && <p className="dim small">{problem}</p>}
        {error && <p className="bad small">{error}</p>}
      </div>
      <div className="foot">
        <button className="btn" disabled={busy} onClick={onDone}>
          {dismiss}
        </button>
        <button className="btn primary" disabled={!pin || !!problem || pin !== again || busy} aria-busy={busy} onClick={() => void save()}>
          {busy && <Spinner />}
          activer le code
        </button>
      </div>
    </Modal>
  )
}
