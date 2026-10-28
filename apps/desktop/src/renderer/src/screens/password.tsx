import { useMemo, useState } from 'react'
import { checkPassword, crackTime, generatePassword, type Strength } from '@shared/password'

const STRENGTH_LABELS: Record<Strength, string> = { weak: 'faible', fair: 'moyenne', good: 'bonne', strong: 'suffisante' }

/** What still stops a new password, in French; '' when it is strong enough and confirmed. */
export function passwordProblem(password: string, confirm: string, avoid: string[] = []): string {
  if (!password) return 'Choisissez une phrase de passe.'
  if (!checkPassword(password, avoid).ok) return 'Cette phrase de passe n’est pas encore assez solide : voyez l’indication sous le champ.'
  if (!confirm) return 'Confirmez la phrase de passe dans le second champ.'
  if (confirm !== password) return 'Les deux saisies de la phrase de passe diffèrent.'
  return ''
}

/**
 * A new master password, judged by its estimated strength against the target (no rule on which
 * characters to use). Calls `onChange` with the password and what still stops it ('' once it is
 * strong enough and confirmed): forms keep their button active and say why when it is pressed.
 */
export function NewPassword({ avoid = [], onChange }: { avoid?: string[]; onChange: (password: string, problem: string) => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [shown, setShown] = useState(false)
  const check = useMemo(() => checkPassword(password, avoid), [password, avoid])
  const confirmed = !!password && password === confirm

  const update = (next: string, nextConfirm: string) => {
    setPassword(next)
    setConfirm(nextConfirm)
    onChange(next, passwordProblem(next, nextConfirm, avoid))
  }
  const suggest = () => {
    const generated = generatePassword()
    setShown(true)
    update(generated, generated)
  }

  return (
    <div className="field">
      <span>phrase de passe</span>
      <input
        type={shown ? 'text' : 'password'}
        value={password}
        autoFocus
        spellCheck={false}
        placeholder="une longue suite de caractères, ou plusieurs mots peu courants"
        onChange={(e) => update(e.target.value, confirm)}
      />
      <input
        type={shown ? 'text' : 'password'}
        value={confirm}
        spellCheck={false}
        placeholder="la même, une seconde fois"
        onChange={(e) => update(password, e.target.value)}
      />
      <div className="strength">
        <div className="pw-meter" title="solidité estimée, jusqu’à l’objectif">
          <i className={check.strength} style={{ width: `${Math.round(check.progress * 100)}%` }} />
        </div>
        {!password ? (
          <span className="dim">Aucun caractère n’est imposé : seule compte la solidité, estimée d’après ce qui la rend facile à deviner.</span>
        ) : check.ok ? (
          <span className="ok">Solidité suffisante : il faudrait {crackTime(check.years)} pour la trouver, même avec de gros moyens.</span>
        ) : (
          <span>
            Solidité {STRENGTH_LABELS[check.strength]} : il faudrait {crackTime(check.years)} pour la trouver ; l’objectif est plus d’un milliard d’années.
            {check.warning && <span className="dim"> {check.warning}</span>}
            {check.suggestions[0] && <span className="dim"> {check.suggestions[0]}</span>}
          </span>
        )}
        <span className={confirmed ? 'ok' : 'dim'}>{confirmed ? '✓ confirmée' : confirm ? 'les deux saisies diffèrent' : 'à confirmer'}</span>
        <span>
          <button className="link" type="button" onClick={suggest}>
            proposer une phrase de passe
          </button>
          {' · '}
          <button className="link" type="button" onClick={() => setShown(!shown)}>
            {shown ? 'masquer' : 'afficher'}
          </button>
        </span>
      </div>
    </div>
  )
}
