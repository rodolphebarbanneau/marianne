import { useEffect, useState } from 'react'
import { ENGINE_BADGES, ENGINE_HOMES, ENGINE_LABELS } from '@shared/config'
import type { Site } from '@shared/sites'
import type { EngineId, EngineModel, EngineStatus, KeychainEntry, PublicSourceId } from '@shared/types'
import { PUBLIC_SOURCES } from '@shared/public'
import { useApp } from '../app/context'
import { Field, Modal, Spinner } from '../components/ui'
import { api, errorText, useLive } from '../lib/api'
import { useSites } from '../lib/content'
import { when } from '../lib/format'
import { useProfile } from '../lib/profile'

const siteOf = (url: string) => {
  try {
    const host = new URL(/^https?:/.test(url) ? url : `https://${url}`).hostname
    return host
      .split('.')
      .slice(host.endsWith('.gouv.fr') ? -3 : -2)
      .join('.')
  } catch {
    return ''
  }
}

/** Public-service websites and APIs: the login kept in the archive, the identifiers each one needs. */
export function SitesPane() {
  const profile = useProfile()
  const sites = useSites()
  const [entries, setEntries] = useState<KeychainEntry[]>([])
  const [editing, setEditing] = useState<Site | null>(null)
  const load = () => void api.listKeychain().then(setEntries)
  useEffect(() => {
    load()
    return api.onKeychain(load)
  }, [])
  const loginOf = (s: Site) => entries.find((e) => e.kind === 'login' && siteOf(e.url) === siteOf(s.url))
  const api_ = entries.filter((e) => e.kind === 'api')
  return (
    <>
      <div className="note">
        Facultatif. Avec une API, Marianne interroge le service directement. Sans API, elle ouvre le site dans son navigateur avec vos identifiants ; vous
        regardez, vous pouvez prendre la main, et rien n’est envoyé, payé ou signé sans votre accord.
      </div>
      <div className="rows">
        {sites.map((s) => {
          const login = loginOf(s)
          const fields = profile?.accounts.find((a) => a.siteId === s.id)?.fields ?? {}
          const filled = (s.fields ?? []).filter((f) => fields[f.key]).length
          return (
            <div key={s.id} className="row">
              <span>
                <span className="hi">{s.name}</span>
                <br />
                <span className="small dim">{s.description}</span>
              </span>
              <span className={login ? '' : 'dim'}>
                {login ? `identifiant enregistré · ${login.username || 'sans nom'}` : s.login === 'franceconnect' ? 'via FranceConnect' : 'non connecté'}
                {s.fields?.length ? ` · ${filled}/${s.fields.length} numéro${s.fields.length > 1 ? 's' : ''}` : ''}
              </span>
              <button className="btn small" onClick={() => setEditing(s)}>
                {login || filled ? 'modifier' : 'connecter'}
              </button>
            </div>
          )
        })}
      </div>
      <span className="label sub">Clés d’API</span>
      <div className="rows">
        {api_.map((e) => (
          <div key={e.id} className="row">
            <span>{e.label}</span>
            <span className="dim small">{e.url}</span>
            <button className="btn small danger" onClick={() => void api.deleteKeychain(e.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <ApiKeyForm />
      {editing && <SiteEditor site={editing} entry={loginOf(editing)} onClose={() => setEditing(null)} />}
    </>
  )
}

function SiteEditor({ site, entry, onClose }: { site: Site; entry?: KeychainEntry; onClose: () => void }) {
  const profile = useProfile()
  const account = profile?.accounts.find((a) => a.siteId === site.id)
  const [username, setUsername] = useState(entry?.username ?? '')
  const [password, setPassword] = useState('')
  const [fields, setFields] = useState<Record<string, string>>(account?.fields ?? {})
  const [error, setError] = useState('')
  const save = async () => {
    try {
      if (username || password || entry)
        await api.saveKeychain({ id: entry?.id, kind: 'login', label: site.name, url: site.url, username, ...(password ? { password } : {}) })
      if (site.fields?.length)
        await api.updateProfile({ type: 'account', account: { siteId: site.id, fields, since: account?.since ?? new Date().toISOString().slice(0, 10) } })
      onClose()
    } catch (err) {
      setError(errorText(err))
    }
  }
  return (
    <Modal onClose={onClose}>
      <div className="in">
        <span className="label">{site.name}</span>
        <p className="dim small">{site.description}</p>
        {site.login !== 'none' && (
          <>
            <Field label="identifiant">
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="mot de passe" hint={entry ? 'laissez vide pour garder celui enregistré' : 'gardé dans l’archive, jamais envoyé au moteur'}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </>
        )}
        {site.fields?.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <input value={fields[f.key] ?? ''} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value.replace(/\s+/g, '') })} />
          </Field>
        ))}
        {error && <p className="bad small">{error}</p>}
      </div>
      <div className="foot">
        <span>
          {entry && (
            <button className="btn danger" onClick={() => void api.deleteKeychain(entry.id).then(onClose)}>
              oublier l’identifiant
            </button>
          )}
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onClose}>
            annuler
          </button>
          <button className="btn primary" onClick={() => void save()}>
            enregistrer
          </button>
        </span>
      </div>
    </Modal>
  )
}

function ApiKeyForm() {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('Légifrance (PISTE)')
  const [url, setUrl] = useState('https://piste.gouv.fr')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  if (!open)
    return (
      <button className="btn small" onClick={() => setOpen(true)}>
        + ajouter une clé d’API
      </button>
    )
  return (
    <div className="inline-card">
      <div className="in">
        <div className="form-grid">
          <Field label="service">
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="adresse">
            <input value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field label="identifiant client">
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="secret">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        <div className="acts">
          <button
            className="btn primary"
            disabled={!username || !password}
            onClick={() => void api.saveKeychain({ kind: 'api', label, url, username, password }).then(() => setOpen(false))}
          >
            enregistrer
          </button>
          <button className="btn" onClick={() => setOpen(false)}>
            annuler
          </button>
        </div>
      </div>
    </div>
  )
}

const ENGINES: EngineId[] = ['claude', 'codex', 'vibe']

/** Each engine: on or off, its configuration folder (where its login lives), its model. */
export function EnginesPane() {
  const { config, setConfig } = useApp()
  const [status, setStatus] = useState<Partial<Record<EngineId, EngineStatus>>>({})
  const [models, setModels] = useState<Partial<Record<EngineId, EngineModel[]>>>({})
  const refresh = (id: EngineId, force = false) => void api.engineStatus(id, force).then((s) => setStatus((prev) => ({ ...prev, [id]: s })))
  useEffect(() => {
    for (const id of ENGINES) {
      refresh(id)
      void api.engineModels(id).then((m) => setModels((prev) => ({ ...prev, [id]: m })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.engines.claude.home, config.engines.codex.home, config.engines.vibe.home])

  return (
    <>
      <div className="note">
        Quel que soit le moteur, c’est Marianne qui répond, avec les mêmes outils et le même masquage. Avec plusieurs moteurs, vous choisissez dans le champ de
        saisie, pour chaque dossier.
      </div>
      {ENGINES.map((id) => {
        const engine = config.engines[id]
        const s = status[id]
        const home = engine.home || `~/${ENGINE_HOMES[id].folder}`
        const state = !engine.enabled
          ? 'désactivé'
          : !s
            ? 'vérification…'
            : !s.found
              ? 'introuvable sur cet ordinateur'
              : s.loggedIn === false
                ? 'pas connecté'
                : 'connecté · prêt'
        return (
          <div key={id} className="engine-row">
            <input
              type="checkbox"
              checked={engine.enabled}
              onChange={(e) => void setConfig({ engines: { [id]: { enabled: e.target.checked } } })}
              title="activer ou désactiver"
            />
            <span className={`eng${engine.enabled && s?.found && s.loggedIn !== false ? '' : ' off'}`}>{ENGINE_BADGES[id]}</span>
            <span className={engine.enabled ? 'hi' : 'dim'}>
              {ENGINE_LABELS[id]} · {state}
              {s?.account && <span className="dim"> · {s.account}</span>}
              {s?.version && <span className="muted"> · {s.version}</span>}
              {config.engines.default === id && <span className="accent"> · par défaut</span>}
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              {engine.enabled && s?.found && s.loggedIn === false && (
                <button className="btn small" onClick={() => void api.engineLogin(id)}>
                  se connecter
                </button>
              )}
              {engine.enabled && config.engines.default !== id && (
                <button className="btn small" onClick={() => void setConfig({ engines: { default: id } })}>
                  par défaut
                </button>
              )}
            </span>
            <span className="home">
              <span className="dim">configuration</span>
              <code>{home}</code>
              <button className="btn small" onClick={() => void api.pickEngineHome(id)}>
                changer…
              </button>
              <button className="btn small" disabled={!engine.home} onClick={() => void setConfig({ engines: { [id]: { home: '' } } })}>
                par défaut
              </button>
              {engine.enabled && !s?.found && (
                <button className="btn small" onClick={() => refresh(id, true)}>
                  réessayer
                </button>
              )}
            </span>
            <span className="hint">
              {ENGINE_HOMES[id].env} · {engine.home ? 'personnalisé' : 'par défaut'} · la connexion du moteur et ses réglages sont dans ce dossier
              {engine.enabled && s && !s.found ? ' · installez le programme, puis réessayez' : ''}
              {s?.error ? ` · ${s.error}` : ''}
            </span>
            {(models[id]?.length ?? 0) > 0 && (
              <span className="home">
                <span className="dim">modèle</span>
                <select value={engine.model} onChange={(e) => void setConfig({ engines: { [id]: { model: e.target.value } } })}>
                  {!models[id]!.some((m) => m.id === engine.model) && <option value={engine.model}>{engine.model || 'par défaut'}</option>}
                  {models[id]!.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <span className="dim">effort</span>
                <select value={engine.effort} onChange={(e) => void setConfig({ engines: { [id]: { effort: e.target.value as 'low' | 'medium' | 'high' } } })}>
                  <option value="low">faible</option>
                  <option value="medium">moyen</option>
                  <option value="high">élevé</option>
                </select>
              </span>
            )}
          </div>
        )
      })}
      <div className="rows" style={{ marginTop: 14 }}>
        <div className="row">
          <span>résumer une conversation après</span>
          <select value={config.engines.compactAt} onChange={(e) => void setConfig({ engines: { compactAt: Number(e.target.value) } })}>
            {[150_000, 200_000, 300_000, 500_000, 800_000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString('fr-FR')} jetons
              </option>
            ))}
          </select>
          <span className="dim small">Claude Code</span>
        </div>
        <div className="row">
          <span>recherche sur le web</span>
          <select value={config.web} onChange={(e) => void setConfig({ web: e.target.value as 'off' | 'public' | 'all' })}>
            <option value="off">jamais</option>
            <option value="public">sites publics seulement</option>
            <option value="all">tout le web</option>
          </select>
          <span />
        </div>
      </div>
      <p className="small dim">barre du bas : ● prêt · ◐ travaille · grisé ✕ activé mais introuvable ou déconnecté · un moteur désactivé n’y apparaît pas</p>
    </>
  )
}

export function BrowserPane() {
  const { settings, setSettings } = useApp()
  if (!settings) return null
  return (
    <div className="rows">
      <div className="row">
        <span>aller en ligne</span>
        <span>
          <label style={{ marginRight: 14 }}>
            <input type="radio" checked={settings.browser.askOnline === 'folder'} onChange={() => void setSettings({ browser: { askOnline: 'folder' } })} />
            demander une fois par dossier
          </label>
          <label>
            <input type="radio" checked={settings.browser.askOnline === 'site'} onChange={() => void setSettings({ browser: { askOnline: 'site' } })} />à chaque
            site
          </label>
        </span>
        <span />
      </div>
      <div className="row">
        <span>signer, payer, envoyer</span>
        <span className="dim">toujours votre accord (non modifiable)</span>
        <span />
      </div>
      <div className="row">
        <span>afficher le navigateur</span>
        <select value={settings.browser.show} onChange={(e) => void setSettings({ browser: { show: e.target.value as 'ask' | 'always' | 'never' } })}>
          <option value="ask">quand Marianne le propose</option>
          <option value="always">toujours</option>
          <option value="never">jamais (hors de vue)</option>
        </select>
        <span />
      </div>
      <div className="row">
        <span>connexions aux sites</span>
        <span className="dim">gardées en mémoire, oubliées au verrouillage</span>
        <span />
      </div>
    </div>
  )
}

export function PrivacyPane() {
  return (
    <>
      <div className="note">
        Avant d’envoyer quoi que ce soit au moteur, Marianne remplace vos identifiants par des jetons ([[nir]], [[iban]]…) et les remet chez vous, dans les
        courriers et les formulaires.
      </div>
      <div className="rows">
        <div className="row">
          <span>toujours masqués</span>
          <span>sécurité sociale, n° fiscal, IBAN, téléphone, courriel, adresse, n° de pièce d’identité, numéros d’allocataire</span>
          <span />
        </div>
        <div className="row">
          <span>les pièces</span>
          <span>lues par Marianne, masquées, puis données au moteur ; les scans sans texte ne partent qu’avec votre accord</span>
          <span />
        </div>
        <div className="row">
          <span>ce que le moteur voit quand même</span>
          <span className="dim">le contenu : montants, situation, santé…</span>
          <span />
        </div>
        <div className="row">
          <span>sur le disque</span>
          <span className="dim">rien en clair : l’archive est chiffrée ; les copies de travail des moteurs sont effacées au verrouillage</span>
          <span />
        </div>
      </div>
    </>
  )
}

/** The public data Marianne keeps on this computer, or queries live. */
export function DataPane() {
  const { config, setConfig } = useApp()
  const statuses = useLive(api.listPublicSources, api.onPublicSources) ?? []
  return (
    <div className="rows">
      {PUBLIC_SOURCES.map((s) => {
        const st = statuses.find((x) => x.id === s.id)
        const enabled = config.sources[s.id as PublicSourceId]?.enabled
        return (
          <div key={s.id} className="row">
            <span>
              <label>
                <input type="checkbox" checked={!!enabled} onChange={(e) => void setConfig({ sources: { [s.id]: { enabled: e.target.checked } } })} />
                <span className="hi">{s.label}</span>
              </label>
              <br />
              <span className="small dim">{s.description}</span>
            </span>
            <span className="small dim">
              {s.kind === 'offline'
                ? st?.syncing
                  ? `${st.syncing.phase === 'download' ? 'téléchargement' : 'indexation'} ${Math.round((st.syncing.done / Math.max(1, st.syncing.total)) * 100)} %`
                  : st?.syncedAt
                    ? `sur cet ordinateur · ${when(st.syncedAt)}`
                    : 'pas encore téléchargé'
                : 'interrogé en direct'}
              {st?.error && <span className="bad"> · {st.error}</span>}
            </span>
            {s.kind === 'offline' && enabled ? (
              <button className="btn small" disabled={!!st?.syncing} onClick={() => void api.syncPublicSource(s.id)}>
                {st?.syncing ? <Spinner /> : 'mettre à jour'}
              </button>
            ) : (
              <span />
            )}
          </div>
        )
      })}
    </div>
  )
}
