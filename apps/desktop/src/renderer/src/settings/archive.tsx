import { useEffect, useState } from 'react'
import type { Usage } from '@shared/types'
import { useApp } from '../app/context'
import { OfferPin, RecoveryKey } from '../app/after-unlock'
import { Field, Identicon, Spinner } from '../components/ui'
import { lockIntent } from '../lib/after-unlock'
import { api, errorText, useLive } from '../lib/api'
import { accountLabel, bytes } from '../lib/format'
import { useDocuments } from '../lib/profile'
import { NewPassword, passwordProblem } from '../screens/password'

const pct = (n: number, total: number) => `${Math.max(0.3, (n / total) * 100)}%`

export function SpacePane() {
  const app = useApp()
  const documents = useDocuments()
  const [usage, setUsage] = useState<Usage | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => void api.getUsage().then(setUsage), [documents])
  if (!usage) return null
  const left = Math.max(0, usage.capacity - usage.used)
  const ratio = usage.used / usage.capacity
  const biggest = [...documents].sort((a, b) => b.size - a.size).slice(0, 5)
  const run = (fn: () => Promise<string | null>, done: (path: string) => string) => async () => {
    try {
      const path = await fn()
      if (path) setMessage(done(path))
    } catch (err) {
      setMessage(errorText(err))
    }
  }
  return (
    <>
      <div className="space">
        <span className="big">il reste {bytes(left)}</span>
        <span className="dim">
          {bytes(usage.used)} utilisés sur {bytes(usage.capacity)} · comme une clé USB
        </span>
        <div className="sbar">
          <span className="documents" style={{ width: pct(usage.documents, usage.capacity) }} title={`pièces · ${bytes(usage.documents)}`} />
          <span className="conversations" style={{ width: pct(usage.conversations, usage.capacity) }} title={`conversations · ${bytes(usage.conversations)}`} />
          <span className="other" style={{ width: pct(usage.other, usage.capacity) }} title={`le reste · ${bytes(usage.other)}`} />
          <span className="tick">80 %</span>
        </div>
        <div className="legend">
          <span>
            <i style={{ background: 'var(--fg)' }} />
            pièces {bytes(usage.documents)}
          </span>
          <span>
            <i style={{ background: 'var(--cyan)' }} />
            conversations {bytes(usage.conversations)}
          </span>
          <span>
            <i style={{ background: 'var(--muted)' }} />
            le reste {bytes(usage.other)}
          </span>
          <span>
            <i />
            libre {bytes(left)}
          </span>
        </div>
        <span className={`small ${ratio >= 0.8 ? 'accent' : 'dim'}`}>
          {ratio >= 1
            ? 'L’archive est pleine : Marianne refuse les nouvelles pièces. Libérez de la place.'
            : ratio >= 0.8
              ? 'Plus de 80 % : pensez à libérer de la place.'
              : 'À 80 % Marianne vous prévient ; à 100 % elle refuse les nouvelles pièces.'}
        </span>
      </div>
      <span className="label sub">Les plus grosses pièces</span>
      <div className="rows">
        {biggest.map((d) => (
          <div key={d.id} className="row">
            <span>{d.title}</span>
            <span className="dim">{bytes(d.size)}</span>
            <button className="btn small danger" onClick={() => confirm(`Supprimer « ${d.title} » de l’archive ?`) && void api.deleteDocument(d.id)}>
              supprimer
            </button>
          </div>
        ))}
        <div className="row">
          <span>dossiers classés</span>
          <span className="dim">{app.folders.filter((f) => f.settledAt).length}</span>
          <span />
        </div>
      </div>
      <span className="label sub">Emplacement</span>
      <div className="rows">
        <div className="row">
          <span>archive</span>
          <span className="path">{app.session.account?.file}</span>
          <button className="btn small" onClick={() => api.showArchive()}>
            montrer
          </button>
        </div>
        <div className="row">
          <span>copie de sauvegarde</span>
          <span className="dim small">une copie de l’archive, toujours chiffrée, à ranger ailleurs</span>
          <button className="btn small" onClick={run(api.backupArchive, (p) => `copie enregistrée : ${p}`)}>
            exporter
          </button>
        </div>
        <div className="row">
          <span>tout exporter</span>
          <span className="dim small">des fichiers ordinaires, en clair : vos pièces, vos conversations, votre profil</span>
          <button className="btn small" onClick={run(api.exportAll, (p) => `exporté dans ${p}`)}>
            exporter
          </button>
        </div>
      </div>
      {message && <p className="small dim selectable">{message}</p>}
    </>
  )
}

export function SecurityPane() {
  const app = useApp()
  const account = app.session.account!
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [problem, setProblem] = useState(passwordProblem('', ''))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [recovery, setRecovery] = useState('')
  const [pin, setPin] = useState(false)
  const change = async () => {
    if (!current) return setMessage('Indiquez d’abord la phrase de passe actuelle.')
    if (problem) return setMessage(problem)
    setBusy(true)
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setMessage('Phrase de passe changée. Les codes des ordinateurs restent valables.')
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <span className="label sub">Changer la phrase de passe</span>
      <div className="form-grid">
        <Field label="phrase de passe actuelle" wide>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <div className="wide">
          <NewPassword
            onChange={(value, why) => {
              setNext(value)
              setProblem(why)
              setMessage('')
            }}
          />
        </div>
      </div>
      <p>
        <button className="btn primary" disabled={busy} onClick={() => void change()}>
          {busy ? <Spinner /> : 'changer'}
        </button>
      </p>
      <span className="label sub">Clé de secours</span>
      <p className="dim small">Une nouvelle clé remplace l’ancienne, qui ne marche plus.</p>
      <button className="btn" onClick={() => void api.renewRecoveryKey().then(setRecovery)}>
        refaire la clé de secours
      </button>
      <span className="label sub">Code sur cet ordinateur</span>
      {!app.session.pinAvailable ? (
        <p className="dim small">
          Le trousseau du système n’est pas disponible ici : pas de code possible, la phrase de passe est demandée à chaque ouverture.
        </p>
      ) : account.hasPin ? (
        <p>
          <span className="ok">code actif</span>{' '}
          <button className="btn small" onClick={() => setPin(true)}>
            changer
          </button>{' '}
          <button className="btn small danger" onClick={() => void api.removePin()}>
            retirer
          </button>
        </p>
      ) : (
        <button className="btn" onClick={() => setPin(true)}>
          activer un code
        </button>
      )}
      <span className="label sub">Verrouillage</span>
      <div className="rows">
        <div className="row">
          <span>verrouillage automatique</span>
          <select value={app.config.lockAfterMinutes} onChange={(e) => void app.setConfig({ lockAfterMinutes: Number(e.target.value) })}>
            {[5, 15, 30, 60, 0].map((m) => (
              <option key={m} value={m}>
                {m ? `après ${m} min sans activité` : 'jamais'}
              </option>
            ))}
          </select>
          <span />
        </div>
        <div className="row">
          <span>veille, écran verrouillé</span>
          <label>
            <input type="checkbox" checked={app.config.lockOnSleep} onChange={(e) => void app.setConfig({ lockOnSleep: e.target.checked })} />
            verrouiller aussi l’archive
          </label>
          <span />
        </div>
      </div>
      {message && <p className="small dim">{message}</p>}
      {recovery && <RecoveryKey value={recovery} onDone={() => setRecovery('')} />}
      {pin && <OfferPin onDone={() => setPin(false)} />}
    </>
  )
}

export function AccountsPane() {
  const app = useApp()
  const accounts = useLive(api.listAccounts, api.onAccounts) ?? []
  const switchTo = () => {
    lockIntent.list = true
    api.lock()
  }
  return (
    <>
      <div className="rows">
        {accounts.map((a) => (
          <div key={a.id} className="row">
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Identicon id={a.id} />
              {accountLabel(a.id)} {a.display && `· ${a.display}`}
            </span>
            <span className="dim small">
              {a.id === app.session.account?.id ? 'ouvert' : ''} · {bytes(a.size)}
              {a.hasPin ? ' · code sur cet ordinateur' : ''}
            </span>
            {a.id !== app.session.account?.id ? (
              <button className="btn small" onClick={switchTo}>
                ouvrir
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
      <p className="dim small">
        Archives rangées dans <span className="path">{app.config.archiveFolder}</span>
      </p>
      <p style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={switchTo}>
          changer de compte
        </button>
        <button className="btn" onClick={() => void api.pickArchiveFolder()}>
          changer d’emplacement…
        </button>
      </p>
    </>
  )
}
