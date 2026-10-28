import { useEffect, useState } from 'react'
import { SERVICES } from '@shared/constants'
import type { VaultEntry, VaultEntryInput, VaultKind, VaultStatus } from '@shared/types'
import { Dropdown } from '../../components/dropdown'
import { Action, List, ListRow, Row, Sep } from '../../components/ui'
import { ipcError } from '../hooks'

const api = window.marianne

const EMPTY: VaultEntryInput = { kind: 'login', label: '', url: '', username: '', password: '' }

/** Sites people most often store a login for. */
const SUGGESTED = SERVICES.filter((s) => s.login !== 'aucun')

function Editor({ initial, onDone }: { initial: VaultEntryInput; onDone: () => void }) {
  const [entry, setEntry] = useState<VaultEntryInput>(initial)
  const [error, setError] = useState('')
  const editing = !!initial.id
  const set = (patch: Partial<VaultEntryInput>) => setEntry((e) => ({ ...e, ...patch }))
  const api_ = entry.kind === 'api'
  const valid = entry.url.trim() && entry.username.trim() && (editing || entry.password)
  const save = () =>
    void api
      .saveVaultEntry({ ...entry, password: entry.password || undefined })
      .then(onDone)
      .catch((e: Error) => setError(ipcError(e)))

  return (
    <section>
      <Sep tail={<Action onClick={onDone}>annuler</Action>}>{editing ? 'modifier' : 'ajouter'}</Sep>
      <Row label="type" hint="connexion : un compte sur un site · clé api : des identifiants d’api, comme ceux de piste pour légifrance">
        <Dropdown<VaultKind>
          value={entry.kind}
          onChange={(kind) =>
            set({ kind, ...(kind === 'api' && !entry.url ? { url: 'https://piste.gouv.fr', label: entry.label || 'PISTE · Légifrance' } : {}) })
          }
          options={[
            { value: 'login', label: 'connexion à un site' },
            { value: 'api', label: 'clé api' }
          ]}
        />
      </Row>
      {!api_ && !editing && (
        <Row label="site" hint="choisir un site du catalogue remplit son adresse">
          <Dropdown
            value=""
            onChange={(id) => {
              const s = SUGGESTED.find((x) => x.id === id)
              if (s) set({ url: s.url, label: s.name })
            }}
            options={[{ value: '', label: 'choisir dans le catalogue…' }, ...SUGGESTED.map((s) => ({ value: s.id, label: s.name }))]}
          />
        </Row>
      )}
      <Row label="libellé">
        <input value={entry.label} onChange={(e) => set({ label: e.target.value })} placeholder={api_ ? 'PISTE · Légifrance' : 'ex. impots.gouv.fr'} />
      </Row>
      <Row label="adresse" hint="le remplissage automatique s’applique à ce site et à ses sous-domaines (cfspart.impots.gouv.fr pour www.impots.gouv.fr)">
        <input value={entry.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" spellCheck={false} />
      </Row>
      <Row
        label={api_ ? 'client id' : 'identifiant'}
        hint={api_ ? 'client_id de votre application piste' : 'numéro fiscal, adresse e-mail, numéro allocataire…'}
      >
        <input value={entry.username} onChange={(e) => set({ username: e.target.value })} spellCheck={false} autoComplete="off" />
      </Row>
      <Row label={api_ ? 'client secret' : 'mot de passe'} hint={editing ? 'laisser vide pour garder le secret enregistré' : undefined}>
        <input
          type="password"
          value={entry.password ?? ''}
          onChange={(e) => set({ password: e.target.value })}
          placeholder={editing ? 'inchangé' : ''}
          autoComplete="new-password"
        />
      </Row>
      <div className="line" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Action onClick={save} disabled={!valid}>
          enregistrer
        </Action>
        {error && <span className="error">✗ {error}</span>}
      </div>
    </section>
  )
}

function Secret({ id }: { id: string }) {
  const [value, setValue] = useState<string | null>(null)
  if (value === null) return <Action onClick={() => void api.revealVaultSecret(id).then(setValue)}>voir</Action>
  return (
    <>
      <span className="hi selectable">{value}</span>
      <Action onClick={() => void navigator.clipboard.writeText(value)}>copier</Action>
      <Action onClick={() => setValue(null)}>masquer</Action>
    </>
  )
}

export function Keychain() {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [editing, setEditing] = useState<VaultEntryInput | null>(null)

  useEffect(() => {
    const load = () => {
      void api.vaultStatus().then(setStatus)
      void api.listVault().then(setEntries)
    }
    load()
    return api.onVault(load)
  }, [])

  return (
    <>
      <section>
        <Sep tail={!editing && <Action onClick={() => setEditing(EMPTY)}>ajouter</Action>}>trousseau</Sep>
        <Row
          label="chiffrement"
          hint="les identifiants et mots de passe sont chiffrés par le système (trousseau macOS, dpapi windows, libsecret / kwallet linux)"
        >
          {!status ? null : !status.available ? (
            <span className="red">indisponible : impossible d’enregistrer des secrets</span>
          ) : status.weak ? (
            <span className="yellow">faible ({status.backend}) : installez gnome-keyring ou kwallet</span>
          ) : (
            <span>
              <span className="green">actif</span> <span className="dim">· {status.backend}</span>
            </span>
          )}
        </Row>
        <p className="note">
          vos identifiants ne quittent jamais cet ordinateur et ne sont jamais envoyés à l’agent : marianne les saisit pour vous dans son navigateur, quand vous
          le demandez.
        </p>
      </section>

      {editing && (
        <Editor
          key={editing.id ?? 'new'}
          initial={editing}
          onDone={() => {
            setEditing(null)
            void api.listVault().then(setEntries)
          }}
        />
      )}

      <section>
        <Sep>{entries.length ? `${entries.length} élément${entries.length > 1 ? 's' : ''}` : 'vide'}</Sep>
        {entries.length === 0 && <p className="note">ajoutez vos connexions aux sites publics (impots.gouv.fr, ameli, caf…) pour les remplir en un clic.</p>}
        <List>
          {entries.map((e) => (
            <ListRow
              key={e.id}
              hint={e.url}
              meta={
                <span>
                  <span className={`badge ${e.kind === 'api' ? 'fc' : 'compte'}`}>{e.kind === 'api' ? 'api' : 'site'}</span> {e.username}
                </span>
              }
              actions={
                <>
                  <Secret id={e.id} />
                  <Action onClick={() => setEditing({ id: e.id, kind: e.kind, label: e.label, url: e.url, username: e.username })}>modifier</Action>
                  <Action danger onClick={() => void api.deleteVaultEntry(e.id)}>
                    supprimer
                  </Action>
                </>
              }
            >
              <span className="hi">{e.label}</span> <span className="dim">{e.url.replace(/^https?:\/\//, '')}</span>
            </ListRow>
          ))}
        </List>
      </section>

      <section>
        <Sep>légifrance</Sep>
        <p className="note">
          pour que l’agent lise les codes et la jurisprudence : créez gratuitement un compte sur piste.gouv.fr, acceptez les conditions de l’api légifrance,
          puis ajoutez ici une « clé api » avec l’adresse piste.gouv.fr, le client_id de votre application comme identifiant et son client_secret comme secret.
        </p>
      </section>
    </>
  )
}
