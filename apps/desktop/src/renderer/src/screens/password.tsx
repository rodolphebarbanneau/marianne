import { useMemo, useState, type InputHTMLAttributes } from 'react'
import { checkPassword, crackTime, generatePassword, type Strength } from '@shared/password'

const STRENGTH_LABELS: Record<Strength, string> = { weak: 'faible', fair: 'moyenne', good: 'bonne', strong: 'suffisante' }

/** What still stops a new password, in French; '' when it is strong enough and confirmed. */
export function passwordProblem(password: string, confirm: string, avoid: string[] = []): string {
  if (!password) return 'Choisissez une phrase de passe.'
  if (!checkPassword(password, avoid).ok) return 'Cette phrase de passe n’est pas encore assez solide. Regardez l’indication sous le champ.'
  if (!confirm) return 'Retapez la phrase de passe dans le second champ pour la confirmer.'
  if (confirm !== password) return 'Les deux phrases de passe tapées ne sont pas identiques.'
  return ''
}

/**
 * A password field with its button to show what is typed, inside the frame on the right. `shown`
 * and `onShownChange` let a form show several fields at once.
 */
export function PasswordInput({
  shown,
  onShownChange,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { shown?: boolean; onShownChange?: (shown: boolean) => void }) {
  const [own, setOwn] = useState(false)
  const visible = shown ?? own
  return (
    <span className="reveal">
      <input spellCheck={false} {...input} type={visible ? 'text' : 'password'} />
      {/* Pressed, it leaves the focus in the field: the typing goes on. */}
      <button type="button" aria-pressed={visible} onMouseDown={(e) => e.preventDefault()} onClick={() => (onShownChange ?? setOwn)(!visible)}>
        {visible ? 'masquer' : 'afficher'}
      </button>
    </span>
  )
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
      <PasswordInput
        shown={shown}
        onShownChange={setShown}
        value={password}
        autoFocus
        placeholder="une longue suite de caractères, ou plusieurs mots peu courants"
        onChange={(e) => update(e.target.value, confirm)}
      />
      <input
        type={shown ? 'text' : 'password'}
        value={confirm}
        spellCheck={false}
        placeholder="retapez-la pour confirmer"
        onChange={(e) => update(password, e.target.value)}
      />
      <div className="strength">
        <div className="pw-meter" title="solidité estimée, jusqu’à l’objectif">
          <i className={check.strength} style={{ width: `${Math.round(check.progress * 100)}%` }} />
        </div>
        {!password ? (
          <span className="dim">Aucune règle sur les caractères à utiliser. Seule compte la solidité, c’est-à-dire la difficulté à la deviner.</span>
        ) : check.ok ? (
          <span className="ok">Solidité suffisante : il faudrait {crackTime(check.years)} pour la trouver, même avec de gros moyens.</span>
        ) : (
          <span>
            Solidité {STRENGTH_LABELS[check.strength]} : il faudrait {crackTime(check.years)} pour la trouver. Visez plus d’un milliard d’années.
            {check.warning && <span className="dim"> {check.warning}</span>}
            {check.suggestions[0] && <span className="dim"> {check.suggestions[0]}</span>}
          </span>
        )}
        <span className={confirmed ? 'ok' : 'dim'}>{confirmed ? '✓ confirmée' : confirm ? 'les deux saisies diffèrent' : 'à confirmer'}</span>
        <span>
          <button className="link" type="button" onClick={suggest}>
            proposer une phrase de passe
          </button>
        </span>
      </div>
    </div>
  )
}
