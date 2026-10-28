import { useEffect, useState } from 'react'
import type { VaultStatus } from '@shared/types'
import { Action, Row, Sep, Spinner } from '../../components/ui'
import { useApp } from '../context'

const api = window.marianne

/**
 * Encrypted backups. The vault key belongs to this computer's keystore: without a backup, a
 * reinstall or a new computer means starting over.
 */
export function Backup() {
  const { dossierState, dossierError } = useApp()
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [restorePass, setRestorePass] = useState('')
  const [busy, setBusy] = useState<'' | 'export' | 'import'>('')
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => void api.vaultStatus().then(setStatus), [])

  const exportIt = () => {
    setBusy('export')
    setResult(null)
    void api
      .exportBackup(pass)
      .then((r) => {
        if (r.ok) {
          setResult({ ok: true, text: `sauvegarde enregistrée : ${r.path}` })
          setPass('')
          setConfirm('')
        } else if (r.error) setResult({ ok: false, text: r.error })
      })
      .finally(() => setBusy(''))
  }
  const importIt = () => {
    setBusy('import')
    setResult(null)
    void api
      .importBackup(restorePass)
      .then((r) => {
        if (r.ok) {
          setResult({ ok: true, text: 'sauvegarde restaurée' })
          setRestorePass('')
        } else if (r.error) setResult({ ok: false, text: r.error })
      })
      .finally(() => setBusy(''))
  }

  const tooShort = pass.length > 0 && pass.length < 10
  const mismatch = confirm.length > 0 && confirm !== pass

  return (
    <>
      <section>
        <Sep>coffre</Sep>
        <Row label="état" hint="votre dossier, vos documents et vos conversations sont chiffrés avec une clé gardée par le système">
          {dossierState === 'ok' ? (
            <span>
              <span className="green">ouvert</span> <span className="dim">· chiffrement aes-256 · clé protégée par {status?.backend ?? '…'}</span>
            </span>
          ) : (
            <span className="red">verrouillé : {dossierError}</span>
          )}
        </Row>
        {status?.weak && <p className="under yellow">Sur ce système, la clé n’est qu’obfusquée : installez gnome-keyring ou kwallet.</p>}
      </section>

      <section>
        <Sep>sauvegarder</Sep>
        <p className="note" style={{ paddingTop: 0, marginBottom: 6 }}>
          Un seul fichier contient votre dossier, vos documents, vos conversations et votre trousseau, chiffrés avec une phrase de passe. Gardez-le hors de cet
          ordinateur (clé usb, cloud) : c’est lui qui vous permet de tout retrouver sur un nouvel ordinateur. Sans la phrase de passe, il est illisible.
        </p>
        <Row label="phrase de passe" hint="au moins 10 caractères : plusieurs mots faciles à retenir">
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
        </Row>
        <Row label="confirmation">
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Row>
        {(tooShort || mismatch) && <p className="under error">{tooShort ? 'trop courte : au moins 10 caractères' : 'les deux phrases diffèrent'}</p>}
        <p className="line">
          {busy === 'export' ? (
            <span>
              <Spinner /> chiffrement…
            </span>
          ) : (
            <Action onClick={exportIt} disabled={pass.length < 10 || confirm !== pass || dossierState !== 'ok'}>
              enregistrer une sauvegarde…
            </Action>
          )}
        </p>
      </section>

      <section>
        <Sep>restaurer</Sep>
        <p className="note" style={{ paddingTop: 0, marginBottom: 6 }}>
          Remplace le dossier, les documents, les conversations et le trousseau de cet ordinateur par ceux de la sauvegarde.
        </p>
        <Row label="phrase de passe">
          <input type="password" value={restorePass} onChange={(e) => setRestorePass(e.target.value)} autoComplete="off" />
        </Row>
        <p className="line">
          {busy === 'import' ? (
            <span>
              <Spinner /> déchiffrement…
            </span>
          ) : (
            <Action onClick={importIt} disabled={!restorePass}>
              choisir une sauvegarde…
            </Action>
          )}
        </p>
      </section>
      {result && (
        <p className={`line ${result.ok ? 'green' : 'error'} selectable`}>
          {result.ok ? '✓' : '✗'} {result.text}
        </p>
      )}
    </>
  )
}
