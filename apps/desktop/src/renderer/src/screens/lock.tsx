import { useEffect, useState, type FormEvent } from 'react'
import type { AccountInfo, AppInfo, DeviceConfig, SessionState } from '@shared/types'
import { Logo } from '../components/logo'
import { Identicon, Modal, Spinner } from '../components/ui'
import { afterUnlock, lockIntent } from '../lib/after-unlock'
import { api, errorText, useLive } from '../lib/api'
import { accountLabel, clock, shortDate } from '../lib/format'
import { NewPassword, passwordProblem } from './password'

/** The window while no account is open: choose where archives live, pick an account, unlock it. */
export function LockScreens({ config, session }: { config: DeviceConfig; session: SessionState }) {
  const accounts = useLive(api.listAccounts, api.onAccounts, [config.archiveFolder]) ?? []
  // '' = the list of accounts ("changer de compte"), null = the last account opened here.
  const [chosen, setChosen] = useState<string | null>(() => {
    const list = lockIntent.list
    lockIntent.list = false
    return list ? '' : null
  })
  const [creating, setCreating] = useState(false)
  const last = accounts.find((a) => a.id === (chosen ?? config.lastAccount))
  const account = chosen === '' ? undefined : last

  return (
    <div className="app bare">
      <header className="titlebar">
        <div className="brand">
          <span className="mark">
            <Logo />
            <span className="wordmark">MARIANNE</span>
          </span>
        </div>
      </header>
      {account && !creating ? (
        <Unlock account={account} pinAvailable={session.pinAvailable} onOther={() => setChosen('')} />
      ) : (
        <Launch config={config} accounts={accounts} onOpen={(id) => setChosen(id)} onCreate={() => setCreating(true)} />
      )}
      {creating && <CreateAccount onClose={() => setCreating(false)} />}
      <footer className="bottombar">
        <div className="status">
          <span className="dim" style={{ paddingLeft: 8 }}>
            archive verrouillée
          </span>
          <Version />
        </div>
        <div className="keys">
          <span>
            <span className="key">ENVOI</span>
            <span className="what">ouvrir</span>
            <span className="sc">entrée</span>
          </span>
          <span>
            <span className="key">GUIDE</span>
            <span className="what">aide</span>
            <span className="sc">F1</span>
          </span>
        </div>
      </footer>
    </div>
  )
}

/**
 * Before any account is open. The first time, one obvious thing to do: create the archive (its
 * folder already chosen, changeable), or open one from elsewhere. Afterwards, the accounts first.
 */
function Launch({ config, accounts, onOpen, onCreate }: { config: DeviceConfig; accounts: AccountInfo[]; onOpen: (id: string) => void; onCreate: () => void }) {
  const [error, setError] = useState('')
  const elsewhere = async () => {
    try {
      const account = await api.pickArchiveFile()
      if (account) onOpen(account.id)
    } catch (err) {
      setError(errorText(err))
    }
  }
  const folder = (
    <>
      <span className="path">{config.archiveFolder}</span> ·{' '}
      <button className="link" onClick={() => void api.pickArchiveFolder()}>
        modifier
      </button>
    </>
  )

  if (!accounts.length)
    return (
      <main className="lock-screen">
        <div className="big-mark">MARIANNE</div>
        <p className="lead">Vos droits, vos démarches et vos papiers, avec l’assistant de votre choix.</p>
        <section className="step">
          <span className="label">Commencer</span>
          <div className="in">
            <p>
              Marianne garde tout ce que vous lui confiez dans une archive chiffrée, sur cet ordinateur. Vous seul pouvez l’ouvrir, avec votre phrase de passe.
            </p>
            <button className="btn primary big-btn" onClick={onCreate}>
              créer mon archive
            </button>
            <span className="small dim">elle sera rangée dans {folder}</span>
          </div>
        </section>
        <section className="step quiet">
          <span className="label">Vous avez déjà une archive ?</span>
          <div className="in">
            <p className="small">
              Sur une clé USB, un disque, un autre dossier : ouvrez son fichier <span className="code">.marianne</span>.
            </p>
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void elsewhere()}>
              ouvrir mon archive…
            </button>
            {error && <p className="bad small">{error}</p>}
          </div>
        </section>
        <span className="small dim">rien ne quitte cet ordinateur · pas de compte en ligne</span>
      </main>
    )

  // The last one opened here first, then the most recently changed.
  const sorted = [...accounts].sort((x, y) => Number(y.id === config.lastAccount) - Number(x.id === config.lastAccount) || y.modified.localeCompare(x.modified))
  return (
    <main className="lock-screen">
      <div className="big-mark">MARIANNE</div>
      <section className="step">
        <span className="label">Vos comptes</span>
        <div className="in">
          {sorted.map((a, i) => (
            <button key={a.id} className="acc-row" onClick={() => onOpen(a.id)}>
              <Identicon id={a.id} />
              <span className="grow">
                <span className="hi">
                  {accountLabel(a.id)}
                  {a.display && ` · ${a.display}`}
                </span>
                <br />
                <span className="small dim">
                  {a.modified ? `ouvert le ${shortDate(a.modified)}` : a.file.split(/[\\/]/).pop()}
                  {a.hasPin && ' · code sur cet ordinateur'}
                </span>
              </span>
              <span className={`btn small${i === 0 ? ' primary' : ''}`}>ouvrir</span>
            </button>
          ))}
        </div>
      </section>
      <span className="small">
        <button className="link" onClick={onCreate}>
          + créer un autre compte
        </button>{' '}
        ·{' '}
        <button className="link" onClick={() => void elsewhere()}>
          ouvrir une archive ailleurs…
        </button>
      </span>
      <span className="small dim">archives rangées dans {folder}</span>
      {error && <p className="bad small">{error}</p>}
    </main>
  )
}

function Unlock({ account, pinAvailable, onOther }: { account: AccountInfo; pinAvailable: boolean; onOther: () => void }) {
  const [mode, setMode] = useState<'pin' | 'password' | 'recovery'>(account.hasPin ? 'pin' : 'password')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setMode(account.hasPin ? 'pin' : 'password'), [account.id, account.hasPin])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!value || busy) return
    setBusy(true)
    setError('')
    try {
      const secret = mode === 'pin' ? { pin: value } : mode === 'password' ? { password: value } : { recoveryKey: value }
      // Before the session opens: the application reads these on its first screen.
      afterUnlock.set({ resetPassword: mode === 'recovery', offerPin: mode === 'password' && pinAvailable && !account.hasPin })
      await api.unlock(account.id, secret)
    } catch (err) {
      afterUnlock.set({ resetPassword: false, offerPin: false })
      const message = errorText(err)
      setError(message)
      setValue('')
      // Too many wrong PINs: the PIN is gone, only the password opens now.
      if (mode === 'pin' && /phrase de passe/.test(message) && !/essai/.test(message)) setMode('password')
      setBusy(false)
    }
  }

  return (
    <main className="lock-screen">
      <form className="unlock-box" onSubmit={(e) => void submit(e)}>
        <Identicon id={account.id} size={56} />
        <div className="hi">
          {accountLabel(account.id)}
          {account.display && ` · ${account.display}`}
        </div>
        <span className="small dim">{account.file}</span>
        {mode === 'pin' ? (
          <input
            key="pin"
            className="pin-input"
            type="password"
            inputMode="numeric"
            autoFocus
            maxLength={12}
            placeholder="code"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
          />
        ) : (
          <input
            key={mode}
            type={mode === 'recovery' ? 'text' : 'password'}
            autoFocus
            spellCheck={false}
            placeholder={mode === 'recovery' ? 'clé de secours (XXXXX-XXXXX-…)' : 'phrase de passe'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        <button className="btn primary" type="submit" disabled={!value || busy}>
          {busy ? <Spinner /> : 'ouvrir'}
        </button>
        {error && <span className="bad small">{error}</span>}
        <span className="small dim">
          <button type="button" className="link" onClick={onOther}>
            changer de compte
          </button>
          {mode !== 'password' && (
            <>
              {' · '}
              <button type="button" className="link" onClick={() => (setMode('password'), setValue(''), setError(''))}>
                phrase de passe
              </button>
            </>
          )}
          {mode !== 'recovery' && (
            <>
              {' · '}
              <button type="button" className="link" onClick={() => (setMode('recovery'), setValue(''), setError(''))}>
                phrase oubliée ? clé de secours
              </button>
            </>
          )}
        </span>
      </form>
    </main>
  )
}

const initialsOf = (names: string) =>
  names
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => `${w[0].toUpperCase()}.`)
    .join('')

function CreateAccount({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState<'initials' | 'firstName' | 'none'>('initials')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState(passwordProblem('', ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const label = display === 'none' ? '' : display === 'initials' ? initialsOf(name) : (name.trim().split(/\s+/)[0] ?? '')

  const create = async () => {
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      const { recoveryKey, state } = await api.createAccount({ password, display: label, avoid: name.split(/\s+/).filter(Boolean) })
      afterUnlock.set({ recoveryKey, offerPin: state.pinAvailable })
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Modal onClose={busy ? undefined : onClose}>
      <div className="in">
        <span className="label">Créer un compte</span>
        <p className="dim small">
          Le compte reçoit un identifiant tiré au hasard, qui ne dit rien de vous. Sur l’écran de verrouillage, vous pouvez aussi montrer vos initiales ou votre
          prénom.
        </p>
        <div className="field">
          <span>affichage sur l’écran de verrouillage</span>
          <label>
            <input type="radio" checked={display === 'initials'} onChange={() => setDisplay('initials')} />
            initiales
          </label>
          <label>
            <input type="radio" checked={display === 'firstName'} onChange={() => setDisplay('firstName')} />
            prénom
          </label>
          <label>
            <input type="radio" checked={display === 'none'} onChange={() => setDisplay('none')} />
            rien, l’identifiant seul
          </label>
          {display !== 'none' && <input placeholder="prénom et nom" value={name} onChange={(e) => setName(e.target.value)} />}
          {label && <span className="hint">affiché : {label}</span>}
        </div>
        <NewPassword
          avoid={name.split(/\s+/).filter(Boolean)}
          onChange={(next, why) => {
            setPassword(next)
            setProblem(why)
            setError('')
          }}
        />
        <p className="small dim">
          Cette phrase de passe protège une archive qu’on pourrait copier et attaquer sans limite : d’où cette exigence de solidité. Vous ne la taperez qu’une
          fois par ordinateur, ensuite un code suffit.
        </p>
        {error && <p className="bad small">{error}</p>}
      </div>
      <div className="foot">
        <button className="btn" onClick={onClose} disabled={busy}>
          annuler
        </button>
        <button className="btn primary" disabled={busy} onClick={() => void create()}>
          {busy ? <Spinner /> : 'créer l’archive'}
        </button>
      </div>
    </Modal>
  )
}

/** Which Marianne this is: its version and, for a development run, when it started (an old window shows an old time). */
function Version() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => void api.getInfo().then(setInfo), [])
  if (!info) return null
  return (
    <span className="small muted" style={{ paddingLeft: 14 }}>
      version {info.version}
      {info.dev && ` · développement, lancée à ${clock(info.startedAt)}`}
    </span>
  )
}
