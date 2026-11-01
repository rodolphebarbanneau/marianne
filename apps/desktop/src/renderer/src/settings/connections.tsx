import { useEffect, useState } from 'react'
import { LEVELS, ruleLabel } from '@shared/approvals'
import { ENGINE_BADGES, ENGINE_HOMES, ENGINE_LABELS } from '@shared/config'
import { siteOf } from '@shared/hosts'
import type { Site } from '@shared/sites'
import type { EngineEnvKey, EngineId, EngineModel, EngineStatus, KeychainEntry, PublicSourceId } from '@shared/types'
import { PUBLIC_SOURCES } from '@shared/public'
import { useApp } from '../app/context'
import { Field, Modal, Spinner } from '../components/ui'
import { api, errorText, useLive } from '../lib/api'
import { useSites } from '../lib/content'
import { shortDate, when } from '../lib/format'
import { useProfile } from '../lib/profile'

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
        Tout est facultatif. Quand un service a une API, Marianne l’interroge directement. Sinon, elle ouvre le site dans son navigateur avec vos identifiants.
        Vous voyez ce qu’elle fait, vous pouvez prendre la main à tout moment, et rien n’est envoyé, payé ou signé sans votre accord.
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
            <button
              className="btn small danger"
              aria-label={`supprimer la clé d’API ${e.label}`}
              title="supprimer la clé"
              onClick={() => confirm(`Supprimer la clé d’API « ${e.label} » de l’archive ?`) && void api.deleteKeychain(e.id)}
            >
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
            <Field
              label="mot de passe"
              hint={entry ? 'laissez vide pour garder le mot de passe enregistré' : 'gardé dans votre archive, il n’est jamais envoyé au moteur'}
            >
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

const API_KEY_DEFAULTS = { label: 'Légifrance (PISTE)', url: 'https://piste.gouv.fr' }

function ApiKeyForm() {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState(API_KEY_DEFAULTS.label)
  const [url, setUrl] = useState(API_KEY_DEFAULTS.url)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Saved or given up, the form starts again empty: the secret doesn't stay in it, and opening it again doesn't add the same key twice.
  const done = () => {
    setLabel(API_KEY_DEFAULTS.label)
    setUrl(API_KEY_DEFAULTS.url)
    setUsername('')
    setPassword('')
    setError('')
    setOpen(false)
  }
  const save = () => {
    if (busy) return
    setBusy(true)
    setError('')
    api
      .saveKeychain({ kind: 'api', label, url, username, password })
      .then(done)
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false))
  }
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
          <Field label="secret client">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        {error && <p className="bad small">{error}</p>}
        <div className="acts">
          <button className="btn primary" disabled={!username || !password || busy} aria-busy={busy} onClick={save}>
            {busy && <Spinner />}
            enregistrer
          </button>
          <button className="btn" disabled={busy} onClick={done}>
            annuler
          </button>
        </div>
      </div>
    </div>
  )
}

const ENGINES: EngineId[] = ['claude', 'codex', 'vibe']

/**
 * An API key the computer's environment sets for the engine: the engine would take it ahead of the
 * user's own sign-in and bill it per use. Marianne leaves it out unless the user chooses it here.
 */
function EnvKeyLine({ id, envKey, useEnvKey }: { id: EngineId; envKey: EngineEnvKey; useEnvKey: boolean }) {
  const { setConfig } = useApp()
  const name = <code>{envKey.name}</code>
  if (!envKey.login)
    return (
      <span className="hint key-line">
        Marianne passe par la clé de la variable {name} de cet ordinateur : une clé d’API est facturée à l’usage. « se connecter » pour utiliser votre compte.
      </span>
    )
  return (
    <>
      <label className="home key-line">
        <input type="checkbox" checked={useEnvKey} onChange={(e) => void setConfig({ engines: { [id]: { useEnvKey: e.target.checked } } })} />
        <span>utiliser la clé de la variable {name}, facturée à l’usage, plutôt que votre connexion</span>
      </label>
      <span className="hint key-line">
        {useEnvKey
          ? 'Marianne passe par cette clé, pas par votre connexion.'
          : 'Cette variable de votre ordinateur passerait avant votre connexion : Marianne la laisse de côté.'}
      </span>
    </>
  )
}

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
    // The configuration folder, or the choice of an API key, changes what each engine says of its sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.engines.claude.home,
    config.engines.codex.home,
    config.engines.vibe.home,
    config.engines.claude.useEnvKey,
    config.engines.codex.useEnvKey,
    config.engines.vibe.useEnvKey
  ])

  return (
    <>
      <div className="note">
        Quel que soit le moteur, c’est Marianne qui répond, avec les mêmes outils et la même protection de vos données. Si vous en avez plusieurs, vous
        choisissez lequel utiliser pour chaque dossier, à côté du bouton envoyer.
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
              {engine.enabled && s?.found && (s.loggedIn === false || (s.envKey && !s.envKey.login)) && (
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
              {ENGINE_HOMES[id].env} · {engine.home ? 'dossier personnalisé' : 'dossier par défaut'} · c’est là que le moteur garde votre connexion et ses
              réglages
              {engine.enabled && s && !s.found ? ' · installez-le, puis réessayez' : ''}
              {s?.error ? ` · ${s.error}` : ''}
            </span>
            {engine.enabled && s?.envKey && <EnvKeyLine id={id} envKey={s.envKey} useEnvKey={engine.useEnvKey} />}
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
      <p className="small dim">
        Dans la barre du bas : ● prêt, ◐ au travail, ✕ grisé si le moteur est introuvable ou déconnecté. Un moteur désactivé n’y apparaît pas.
      </p>
    </>
  )
}

export function BrowserPane() {
  const { settings, setSettings, openSettings } = useApp()
  if (!settings) return null
  return (
    <div className="rows">
      <div className="row">
        <span>aller en ligne</span>
        <span className="dim">ce que Marianne fait sans vous demander se règle dans Autorisations</span>
        <button className="btn small" onClick={() => openSettings('approvals')}>
          autorisations →
        </button>
      </div>
      <div className="row">
        <span>afficher le navigateur</span>
        <select value={settings.browser.show} onChange={(e) => void setSettings({ browser: { show: e.target.value as 'ask' | 'always' | 'never' } })}>
          <option value="ask">quand Marianne le propose</option>
          <option value="always">toujours</option>
          <option value="never">jamais, il travaille hors de vue</option>
        </select>
        <span />
      </div>
      <div className="row">
        <span>connexions aux sites</span>
        <span className="dim">gardées le temps de la session, oubliées dès que vous verrouillez</span>
        <span />
      </div>
    </div>
  )
}

/**
 * How much Marianne asks before acting for the user: the level, the floor no level lowers, and the
 * standing permissions given on cards (« toujours… »), each with the way to take it back.
 */
export function ApprovalsPane() {
  const { settings, setSettings } = useApp()
  const [error, setError] = useState('')
  if (!settings) return null
  const { level, rules } = settings.approvals
  const remove = (id: string) => {
    setError('')
    void api.removeApprovalRule(id).catch((err) => setError(errorText(err)))
  }
  return (
    <>
      <div className="note">
        Avant d’agir pour vous, Marianne vous demande votre accord sur une carte. Vous choisissez ici ce qu’elle peut faire sans demander : ce qu’elle fait
        ainsi reste écrit dans la conversation, « autorisé d’office ».
      </div>
      <div className="rows">
        <div className="row">
          <span>niveau</span>
          <span>
            {LEVELS.map((l) => (
              <label key={l.id} style={{ display: 'block', marginBottom: 6 }}>
                <input type="radio" name="approvals-level" checked={level === l.id} onChange={() => void setSettings({ approvals: { level: l.id } })} />{' '}
                {l.label}
                {l.id === 'balanced' && <span className="small dim"> (par défaut)</span>}
                <br />
                <span className="small dim">{l.text}</span>
              </label>
            ))}
          </span>
          <span />
        </div>
        <div className="row">
          <span>payer, signer, envoyer</span>
          <span className="dim">
            déposer, déclarer, certifier et supprimer aussi : votre oui sur une carte, à chaque fois, à tous les niveaux. Aucune autorisation ne s’y applique.
          </span>
          <span />
        </div>
        <div className="row">
          <span>votre profil</span>
          <span className="dim">
            seules les échéances peuvent s’enregistrer sans demander. Tout autre changement, et toute suppression, vous est demandé à chaque fois.
          </span>
          <span />
        </div>
      </div>
      <span className="label sub">autorisations données</span>
      <div className="rows">
        {rules.map((r) => (
          <div key={r.id} className="row">
            <span>{ruleLabel(r)}</span>
            <span className="small dim">donnée le {shortDate(r.at)}, dans tous vos dossiers</span>
            <button className="link small" onClick={() => remove(r.id)}>
              retirer
            </button>
          </div>
        ))}
      </div>
      {!rules.length && (
        <p className="small dim">
          Aucune pour l’instant. Une carte vous en propose une avec « toujours… » : aller sur un site, remplir ses formulaires, enregistrer vos échéances.
        </p>
      )}
      {error && <p className="small bad">{error}</p>}
      <p className="small dim">
        Les tâches planifiées ne s’en servent jamais : elles vont seulement sur les sites de leur fiche, pour regarder et vous rendre compte.
      </p>
    </>
  )
}

export function PrivacyPane() {
  return (
    <>
      <div className="note">
        Avant d’envoyer quoi que ce soit au moteur, Marianne remplace vos identifiants par des jetons, comme [[nir]] ou [[iban]]. Elle remet les vrais numéros
        chez vous, dans les courriers et les formulaires.
      </div>
      <div className="rows">
        <div className="row">
          <span>toujours masqués</span>
          <span>sécurité sociale, n° fiscal, IBAN, téléphone, courriel, adresse, n° de pièce d’identité, numéros d’allocataire</span>
          <span />
        </div>
        <div className="row">
          <span>vos cartes de paiement</span>
          <span>
            le moteur n’en connaît que le nom, la marque, les 4 derniers chiffres et l’expiration. Le numéro et le cryptogramme ne lui parviennent jamais, ni
            sur une page qu’il lit.
          </span>
          <span />
        </div>
        <div className="row">
          <span>les pièces</span>
          <span>Marianne les lit et les masque avant de les donner au moteur. Un scan sans texte n’est envoyé qu’avec votre accord.</span>
          <span />
        </div>
        <div className="row">
          <span>ce que le moteur voit quand même</span>
          <span className="dim">le reste du contenu : montants, situation familiale, santé…</span>
          <span />
        </div>
        <div className="row">
          <span>sur le disque</span>
          <span className="dim">rien en clair. L’archive est chiffrée, et les copies de travail des moteurs sont effacées dès que vous verrouillez.</span>
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
              <button className="btn small" disabled={!!st?.syncing} aria-busy={!!st?.syncing} onClick={() => void api.syncPublicSource(s.id)}>
                {st?.syncing && <Spinner />}
                mettre à jour
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
