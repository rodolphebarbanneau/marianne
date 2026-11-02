import { useEffect, useState } from 'react'
import type { Usage } from '@shared/types'
import { useApp } from '../app/context'
import { OfferPin, RecoveryKey } from '../app/after-unlock'
import { ArchivePath } from '../components/archive-path'
import { Field, Identicon, Spinner } from '../components/ui'
import { lockIntent } from '../lib/after-unlock'
import { api, errorText, useLive } from '../lib/api'
import { accountLabel, bytes } from '../lib/format'
import { useDocuments } from '../lib/profile'
import { NewPassword, PasswordInput, passwordProblem } from '../screens/password'
import { LockScreenChoice } from './me'
import { ListHead } from './parts'

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
          {bytes(usage.used)} utilisés sur {bytes(usage.capacity)}
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
        {ratio >= 0.8 && (
          <span className="small accent">
            {ratio >= 1 ? 'L’archive est pleine : libérez de la place pour ajouter de nouvelles pièces.' : 'L’archive est remplie à plus de 80 %.'}
          </span>
        )}
      </div>
      <ListHead label="les plus grosses pièces">
        <button className="link small" onClick={() => app.openSettings('documents')}>
          toutes les pièces ›
        </button>
      </ListHead>
      {biggest.length ? (
        <div className="table-wrap">
          <table className="stable">
            <thead>
              <tr>
                <th>pièce</th>
                <th>dossier</th>
                <th className="r">taille</th>
                <th>
                  <span className="sr-only">actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {biggest.map((d) => (
                <tr key={d.id} onClick={() => void api.openDocument(d.id)}>
                  <td>
                    <span className="hi">{d.title}</span>
                  </td>
                  <td className="dim">{app.folders.find((f) => f.id === d.folderId)?.title ?? '—'}</td>
                  <td className="r">{bytes(d.size)}</td>
                  <td className="r" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn small danger"
                      aria-label={`supprimer ${d.title} de l’archive`}
                      title="supprimer de l’archive"
                      onClick={() => confirm(`Supprimer « ${d.title} » de l’archive ?`) && void api.deleteDocument(d.id)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small dim empty">aucune pièce</p>
      )}
      <ListHead label="sauvegarde" />
      <div className="rows">
        <div className="row">
          <span>copie de sauvegarde</span>
          <span className="dim small">une copie chiffrée de l’archive, à garder ailleurs</span>
          <button className="btn small" onClick={run(api.backupArchive, (p) => `copie enregistrée : ${p}`)}>
            exporter
          </button>
        </div>
        <div className="row">
          <span>tout exporter</span>
          <span className="dim small">vos pièces, vos conversations et votre profil, en fichiers ordinaires, non chiffrés</span>
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
  const [renewWith, setRenewWith] = useState('')
  const [renewing, setRenewing] = useState(false)
  const [renewMessage, setRenewMessage] = useState('')
  const [pin, setPin] = useState(false)
  const change = async () => {
    if (!current) return setMessage('Indiquez d’abord la phrase de passe actuelle.')
    if (problem) return setMessage(problem)
    setBusy(true)
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setMessage('Phrase de passe changée. Les codes déjà activés sur vos ordinateurs marchent toujours.')
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  // A recovery key opens the archive for good: the main process makes one only with the passphrase.
  const renew = async () => {
    if (!renewWith) return setRenewMessage('Indiquez d’abord votre phrase de passe.')
    setRenewing(true)
    try {
      setRecovery(await api.renewRecoveryKey(renewWith))
      setRenewWith('')
      setRenewMessage('')
    } catch (err) {
      setRenewMessage(errorText(err))
    } finally {
      setRenewing(false)
    }
  }
  return (
    <>
      <ListHead label="changer la phrase de passe" />
      <div className="form-grid">
        <Field label="phrase de passe actuelle" wide>
          <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} />
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
        <button className="btn primary" disabled={busy} aria-busy={busy} onClick={() => void change()}>
          {busy && <Spinner />}
          changer
        </button>
      </p>
      <ListHead label="clé de secours" />
      <div className="form-grid">
        <Field label="phrase de passe" wide>
          <PasswordInput
            value={renewWith}
            onChange={(e) => {
              setRenewWith(e.target.value)
              setRenewMessage('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && void renew()}
          />
        </Field>
      </div>
      <p>
        <button className="btn" disabled={renewing} aria-busy={renewing} onClick={() => void renew()}>
          {renewing && <Spinner />}
          refaire la clé de secours
        </button>
      </p>
      {renewMessage && <p className="small dim">{renewMessage}</p>}
      <ListHead label="code sur cet ordinateur" />
      {!app.session.pinAvailable ? (
        <p className="dim small">
          Le trousseau du système n’est pas disponible sur cet ordinateur : pas de code ici, la phrase de passe est demandée à chaque ouverture.
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
      <ListHead label="verrouillage" />
      <div className="rows">
        <div className="row">
          <span>verrouillage automatique</span>
          <select value={app.config.lockAfterMinutes} onChange={(e) => void app.setConfig({ lockAfterMinutes: Number(e.target.value) })}>
            {[5, 15, 30, 60, 0].map((m) => (
              <option key={m} value={m}>
                {m ? `après ${m} min sans vous en servir` : 'jamais'}
              </option>
            ))}
          </select>
          <span />
        </div>
        <div className="row">
          <span>avec l’ordinateur</span>
          <label>
            <input type="checkbox" checked={app.config.lockOnSleep} onChange={(e) => void app.setConfig({ lockOnSleep: e.target.checked })} />
            verrouiller l’archive quand la session de l’ordinateur se verrouille ou qu’il se met en veille
          </label>
          <span />
        </div>
      </div>
      {message && <p className="small dim">{message}</p>}
      {recovery && <RecoveryKey value={recovery} onDone={() => setRecovery('')} />}
      {pin && <OfferPin dismiss="annuler" onDone={() => setPin(false)} />}
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
      <ListHead label="comptes sur cet ordinateur" count={accounts.length}>
        <button className="btn small" onClick={switchTo}>
          changer de compte
        </button>
      </ListHead>
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
      <ListHead label="emplacement" />
      <div className="rows">
        <div className="row">
          <span>vos archives</span>
          <ArchivePath path={app.config.archiveFolder} boxed />
          <button className="btn small" onClick={() => void api.pickArchiveFolder()}>
            changer…
          </button>
        </div>
        <div className="row">
          <span>celle de ce compte</span>
          {app.session.account ? <ArchivePath path={app.session.account.file} boxed /> : <span />}
          <button className="btn small" onClick={() => api.showArchive()}>
            montrer
          </button>
        </div>
      </div>
      <ListHead label="écran de verrouillage" />
      <div className="rows">
        <div className="row">
          <span>ce compte s’y montre par</span>
          <LockScreenChoice />
          <span />
        </div>
      </div>
    </>
  )
}
