import { useEffect, useState, type FormEvent } from 'react'
import { ENGINE_LABELS } from '@shared/config'
import { accelOf, matches, shortcutLabel } from '@shared/shortcuts'
import type { AccountInfo, AppInfo, DeviceConfig, EngineId, SessionState } from '@shared/types'
import { ArchivePath } from '../components/archive-path'
import { Guide } from '../app/guide'
import { ReloadIcon } from '../components/icons'
import { Logo } from '../components/logo'
import { Identicon, Meter, Modal, Spinner } from '../components/ui'
import { afterUnlock, lockIntent, opening } from '../lib/after-unlock'
import { api, errorText, isMac, useLive } from '../lib/api'
import { accountLabel, clock, shortDate } from '../lib/format'
import { NewPassword, PasswordInput, passwordProblem } from './password'

/**
 * The window while no account is open: choose where archives live, pick an account, unlock it.
 * An archive opened from the system (`opened`) takes the screen, whatever was on it.
 */
export function LockScreens({
  config,
  session,
  opened,
  onOpened
}: {
  config: DeviceConfig
  session: SessionState
  opened: string | null
  onOpened: () => void
}) {
  // null until listed: the first-run screen is for no account at all, not for accounts still on their way.
  const listed = useLive(api.listAccounts, api.onAccounts, [config.archiveFolder])
  const accounts = listed ?? []
  // '' = the list of accounts ("changer de compte"), null = the last account opened here.
  const [chosen, setChosen] = useState<string | null>(() => {
    const { list, account } = lockIntent
    lockIntent.list = false
    lockIntent.account = null
    return account ?? (list ? '' : null)
  })
  const [creating, setCreating] = useState(false)
  const [guide, setGuide] = useState(false)
  const last = accounts.find((a) => a.id === (chosen ?? config.lastAccount))
  const account = chosen === '' ? undefined : last

  // Locked: nothing the last account had to show on opening (its recovery key above all) waits for the next one.
  useEffect(() => afterUnlock.reset(), [])

  useEffect(() => {
    if (!opened) return
    setChosen(opened)
    setCreating(false)
    onOpened()
  }, [opened, onOpened])

  // Their shortcuts work here too, like the reload button and the GUIDE key.
  const reload = accelOf('reload', isMac, config.shortcuts)
  const help = accelOf('guide', isMac, config.shortcuts)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matches(e, reload, isMac)) api.reloadWindow()
      else if (matches(e, help, isMac)) setGuide((open) => !open)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reload, help])

  return (
    <div className="app bare">
      <header className="titlebar">
        <div className="brand">
          <span className="mark">
            <span className="wordmark">MARIANNE</span>
          </span>
        </div>
        <div className="right">
          <button className="icon-btn" title={`recharger la fenêtre (${shortcutLabel(reload, isMac)})`} onClick={() => api.reloadWindow()}>
            <ReloadIcon />
          </button>
        </div>
      </header>
      {!listed ? (
        <main className="lock-screen" aria-busy />
      ) : account && !creating ? (
        <Unlock
          key={account.id}
          account={account}
          pinAvailable={session.pinAvailable}
          engines={(Object.keys(ENGINE_LABELS) as EngineId[]).filter((id) => config.engines[id].enabled)}
          onOther={() => setChosen('')}
        />
      ) : (
        <Launch config={config} accounts={accounts} onOpen={(id) => setChosen(id)} onCreate={() => setCreating(true)} />
      )}
      {creating && <CreateAccount onClose={() => setCreating(false)} />}
      {guide && <Guide onClose={() => setGuide(false)} />}
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
          <span className="clickable" onClick={() => setGuide(true)}>
            <span className="key">GUIDE</span>
            <span className="what">aide</span>
            <span className="sc">{shortcutLabel(help, isMac)}</span>
          </span>
        </div>
      </footer>
    </div>
  )
}

/** What each of these screens opens with: the logo, large, and the name under it. */
function BigMark() {
  return (
    <div className="big-mark">
      <Logo size={96} />
      <span>MARIANNE</span>
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
  const pickFolder = () => void api.pickArchiveFolder()

  // Rows like the accounts': what it is, a line under it, the button on the right.
  if (!accounts.length)
    return (
      <main className="lock-screen">
        <BigMark />
        <p className="lead">Vos droits, vos démarches et vos papiers, avec l’assistant de votre choix.</p>
        <section className="step">
          <span className="label">Commencer</span>
          <div className="in">
            <div className="choice">
              <span className="grow">
                <span className="hi">Une archive chiffrée, sur cet ordinateur</span>
                <span className="small dim">
                  Marianne y garde tout ce que vous lui confiez. Vous êtes la seule personne à pouvoir l’ouvrir, avec votre phrase de passe.
                </span>
              </span>
              <button className="btn primary" onClick={onCreate}>
                créer mon archive
              </button>
            </div>
            <div className="choice">
              <span className="grow">
                <span className="small dim">elle sera rangée dans</span>
                <ArchivePath path={config.archiveFolder} />
              </span>
              <button className="btn small" onClick={pickFolder}>
                modifier
              </button>
            </div>
          </div>
        </section>
        <section className="step quiet">
          <span className="label">Vous avez déjà une archive ?</span>
          <div className="in">
            <div className="choice">
              <span className="grow">
                <span className="hi">Sur une clé USB, un autre disque ou ailleurs</span>
                <span className="small dim">
                  Choisissez son fichier <span className="hi">.marianne</span>, Marianne l’ajoute à vos comptes.
                </span>
              </span>
              <button className="btn" onClick={() => void elsewhere()}>
                ouvrir mon archive…
              </button>
            </div>
            {error && <p className="bad small choice-note">{error}</p>}
          </div>
        </section>
        <span className="small dim">rien ne quitte cet ordinateur · pas de compte en ligne</span>
      </main>
    )

  // The last one opened here first, then the most recently changed.
  const sorted = [...accounts].sort((x, y) => Number(y.id === config.lastAccount) - Number(x.id === config.lastAccount) || y.modified.localeCompare(x.modified))
  return (
    <main className="lock-screen">
      <BigMark />
      <section className="step">
        <span className="label">Vos comptes</span>
        <div className="in">
          {sorted.map((a, i) => (
            <button key={a.id} className="choice" onClick={() => onOpen(a.id)}>
              <Identicon id={a.id} />
              <span className="grow">
                <span className="hi">
                  {accountLabel(a.id)}
                  {a.display && ` · ${a.display}`}
                </span>
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
      {/* The folder in full, on its own line: a long path doesn't push the sentence around. */}
      <div className="folder-note small dim">
        <span>vos archives sont rangées dans</span>
        <ArchivePath path={config.archiveFolder} boxed />
        <button className="link" onClick={pickFolder}>
          modifier
        </button>
      </div>
      {error && <p className="bad small">{error}</p>}
    </main>
  )
}

/** The steps of the opening bar: the archive, then each assistant in use. */
interface Opening {
  steps: string[]
  done: number
}

/** After this long on a step, the user may go in without waiting for the last assistants. */
const SKIP_AFTER_MS = 10_000

function Unlock({ account, pinAvailable, engines, onOther }: { account: AccountInfo; pinAvailable: boolean; engines: EngineId[]; onOther: () => void }) {
  const [mode, setMode] = useState<'pin' | 'password' | 'recovery'>(account.hasPin ? 'pin' : 'password')
  const [value, setValue] = useState('')
  const [progress, setProgress] = useState<Opening | null>(null)
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setMode(account.hasPin ? 'pin' : 'password'), [account.id, account.hasPin])
  // Left mid-way (another account, the window closing): the application isn't held back any more.
  useEffect(() => () => opening.set(false), [])
  const running = !!progress
  useEffect(() => {
    if (!running) return setSlow(false)
    const timer = setTimeout(() => setSlow(true), SKIP_AFTER_MS)
    return () => clearTimeout(timer)
  }, [running])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!value || progress) return
    setError('')
    const steps = ['ouverture de l’archive', ...engines.map((id) => `vérification de ${ENGINE_LABELS[id]}`)]
    setProgress({ steps, done: 0 })
    // The session opens first; the window stays here until the assistants are checked.
    opening.set(true)
    try {
      const secret = mode === 'pin' ? { pin: value } : mode === 'password' ? { password: value } : { recoveryKey: value }
      // Before the session opens: the application reads these on its first screen.
      afterUnlock.set({ resetPassword: mode === 'recovery', offerPin: mode === 'password' && pinAvailable && !account.hasPin })
      await api.unlock(account.id, secret)
    } catch (err) {
      opening.set(false)
      afterUnlock.set({ resetPassword: false, offerPin: false })
      const message = errorText(err)
      setError(message)
      setValue('')
      // Too many wrong PINs: the PIN is gone, only the password opens now.
      if (mode === 'pin' && /phrase de passe/.test(message) && !/essai/.test(message)) setMode('password')
      setProgress(null)
      return
    }
    // Checked here, their state is kept: the application opens with it, without checking again.
    for (const [i, id] of engines.entries()) {
      if (!opening.get()) return
      setProgress({ steps, done: i + 1 })
      await api.engineStatus(id).catch(() => undefined)
    }
    opening.set(false)
  }

  const wayIn = (next: typeof mode) => () => (setMode(next), setValue(''), setError(''))

  return (
    <main className="lock-screen">
      <form className="unlock-box" onSubmit={(e) => void submit(e)}>
        <div className="account-panel">
          <Identicon id={account.id} size={56} />
          <div className="account-name">
            <span className="hi">{accountLabel(account.id)}</span>
            {account.display && <span>{account.display}</span>}
          </div>
        </div>
        <ArchivePath path={account.file} className="small dim" />
        {/* The bar takes the place of the field, the button and the links; they keep their room, so nothing moves. */}
        <div className="unlock-zone">
          <div className={`unlock-controls${progress ? ' away' : ''}`}>
            <UnlockField mode={mode} value={value} onChange={setValue} />
            <button className="btn primary" type="submit" disabled={!value || !!progress}>
              ouvrir
            </button>
            {error && <span className="bad small">{error}</span>}
            {/* The other ways in: another account and the passphrase on a line, the recovery key under them. */}
            <div className="unlock-ways small dim">
              <span>
                <button type="button" className="link" onClick={onOther}>
                  changer de compte
                </button>
                {mode !== 'password' && (
                  <>
                    {' · '}
                    <button type="button" className="link" onClick={wayIn('password')}>
                      phrase de passe
                    </button>
                  </>
                )}
              </span>
              {mode !== 'recovery' && (
                <button type="button" className="link" onClick={wayIn('recovery')}>
                  phrase oubliée ? utiliser la clé de secours
                </button>
              )}
            </div>
          </div>
          {progress && (
            <div className="unlock-opening">
              <OpeningBar {...progress} />
              {slow && progress.done > 0 && (
                <button type="button" className="link small" onClick={() => opening.set(false)}>
                  ouvrir sans attendre
                </button>
              )}
            </div>
          )}
        </div>
      </form>
    </main>
  )
}

/** The field of the way in: the PIN, the passphrase, or the recovery key. */
function UnlockField({ mode, value, onChange }: { mode: 'pin' | 'password' | 'recovery'; value: string; onChange: (value: string) => void }) {
  return mode === 'pin' ? (
    <input
      key="pin"
      type="password"
      inputMode="numeric"
      autoFocus
      maxLength={12}
      placeholder="code"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
    />
  ) : mode === 'password' ? (
    <PasswordInput key="password" autoFocus placeholder="phrase de passe" value={value} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input key="recovery" autoFocus spellCheck={false} placeholder="clé de secours (XXXXX-XXXXX-…)" value={value} onChange={(e) => onChange(e.target.value)} />
  )
}

/** The opening bar, in place of the field: filled step by step, the next block blinking (a Meter, as every wait), what it's doing under it. */
function OpeningBar({ steps, done }: Opening) {
  return (
    <div className="opening-bar">
      <Meter share={done / steps.length} />
      <span>
        {steps[done]}… <span className="dim">{`${done + 1}/${steps.length}`}</span>
      </span>
    </div>
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
      <div className="in roomy">
        <span className="label">Créer un compte</span>
        <p className="dim small">
          Le compte reçoit un identifiant tiré au hasard, qui ne dit rien de vous. Sur l’écran de verrouillage, vous pouvez aussi montrer vos initiales ou votre
          prénom.
        </p>
        <div className="field">
          <span>affichage sur l’écran de verrouillage</span>
          <div className="radios">
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
              identifiant
            </label>
          </div>
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
          Votre archive pourrait être copiée puis attaquée sans limite de temps, c’est pourquoi la phrase de passe doit être solide. Rassurez-vous, vous ne la
          taperez qu’une fois par ordinateur. Ensuite, un code suffit.
        </p>
        {error && <p className="bad small">{error}</p>}
      </div>
      <div className="foot">
        <button className="btn" onClick={onClose} disabled={busy}>
          annuler
        </button>
        <button className="btn primary" disabled={busy} aria-busy={busy} onClick={() => void create()}>
          {busy && <Spinner />}
          créer l’archive
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
