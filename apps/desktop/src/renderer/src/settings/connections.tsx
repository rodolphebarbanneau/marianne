import { Fragment, useEffect, useState } from 'react'
import { DOMAINS } from '@marianne/profile'
import { LEVELS, ruleLabel } from '@shared/approvals'
import { ENGINE_BADGES, ENGINE_HOMES, ENGINE_LABELS } from '@shared/config'
import { siteOf } from '@shared/hosts'
import type { Site } from '@shared/sites'
import type { EngineEnvKey, EngineId, EngineModel, EngineStatus, KeychainEntry, PublicSourceId } from '@shared/types'
import { PUBLIC_SOURCES } from '@shared/public'
import { useApp } from '../app/context'
import { Field, SearchField, Spinner } from '../components/ui'
import { api, errorText, useLive } from '../lib/api'
import { useSites } from '../lib/content'
import { shortDate, when } from '../lib/format'
import { useProfile } from '../lib/profile'
import { filterSites, settableSites, siteState } from './lists'
import { Filter, FormDialog, ListHead } from './parts'

/**
 * Réglages › Sites et API: the sites where Marianne keeps something for the user (an identifier and its
 * password, numbers, the social security number they need), grouped by domain, with a search and a filter;
 * then the API keys. FranceConnect's sites and those without an account have nothing to set: not listed.
 */
export function SitesPane() {
  const profile = useProfile()
  const sites = useSites()
  const [entries, setEntries] = useState<KeychainEntry[]>([])
  const [editing, setEditing] = useState<Site | null>(null)
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [which, setWhich] = useState<'all' | 'done' | 'todo'>('all')
  const load = () => void api.listKeychain().then(setEntries)
  useEffect(() => {
    load()
    return api.onKeychain(load)
  }, [])
  const loginOf = (s: Site) => entries.find((e) => e.kind === 'login' && siteOf(e.url) === siteOf(s.url))
  const keys = entries.filter((e) => e.kind === 'api')
  const rows = settableSites(sites).map((site) => ({ site, state: siteState(site, profile, !!loginOf(site)) }))
  const done = rows.filter((r) => r.state.done).length
  const shown = filterSites(rows, query, which)
  return (
    <>
      <ListHead label="vos comptes sur les sites" count={rows.length} />
      <div className="list-tools">
        <SearchField className="framed" value={query} onChange={setQuery} placeholder="chercher un site" />
        <Filter
          label="lesquels"
          value={which}
          onChange={setWhich}
          options={[
            ['all', `tous ${rows.length}`],
            ['done', `renseignés ${done}`],
            ['todo', `à renseigner ${rows.length - done}`]
          ]}
        />
      </div>
      {shown.length ? (
        <div className="table-wrap">
          <table className="stable">
            <thead>
              <tr>
                <th>site</th>
                <th>identifiant</th>
                <th>vos numéros</th>
                <th>
                  <span className="sr-only">actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {DOMAINS.map((d) => {
                const list = shown.filter((r) => r.site.domain === d.id)
                if (!list.length) return null
                return (
                  <Fragment key={d.id}>
                    <tr className="grp">
                      <td colSpan={4}>
                        <span className="label">{d.label}</span>
                        <span className="small dim">{list.length}</span>
                      </td>
                    </tr>
                    {list.map(({ site, state }) => (
                      <tr key={site.id} onClick={() => setEditing(site)}>
                        <td>
                          <span className="stack" style={{ gap: 2 }}>
                            <span className="hi">{site.name}</span>
                            <span className="small muted">{siteOf(site.url)}</span>
                          </span>
                        </td>
                        <td>
                          {site.login !== 'account' ? (
                            <span className="muted">{site.login === 'franceconnect' ? 'FranceConnect' : '—'}</span>
                          ) : state.login ? (
                            <>
                              <span className="ok">✓</span> enregistré
                            </>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {state.numbers.length ? (
                            state.numbers.map((n) => (
                              <span key={n.label} className="nowrap">
                                {n.label} {n.given ? <span className="ok">✓</span> : <span className="small accent">à renseigner</span>}
                              </span>
                            ))
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="r">
                          <button className="btn small">{state.done ? 'modifier' : 'renseigner'}</button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small dim empty">Aucun site ne correspond.</p>
      )}
      <ListHead label="clés d’API" count={keys.length}>
        <button className="btn small" onClick={() => setAdding(true)}>
          + ajouter une clé d’API
        </button>
      </ListHead>
      {keys.length ? (
        <div className="table-wrap">
          <table className="stable">
            <thead>
              <tr>
                <th>service</th>
                <th>adresse</th>
                <th>
                  <span className="sr-only">actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((e) => (
                <tr key={e.id}>
                  <td>
                    <span className="hi">{e.label}</span>
                  </td>
                  <td className="dim">{e.url}</td>
                  <td className="r">
                    <button
                      className="btn small danger"
                      aria-label={`supprimer la clé d’API ${e.label}`}
                      title="supprimer la clé"
                      onClick={() => confirm(`Supprimer la clé d’API « ${e.label} » de l’archive ?`) && void api.deleteKeychain(e.id)}
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
        <p className="small dim empty">aucune clé</p>
      )}
      {editing && <SiteEditor site={editing} entry={loginOf(editing)} onClose={() => setEditing(null)} />}
      {adding && <ApiKeyDialog onClose={() => setAdding(false)} />}
    </>
  )
}

function SiteEditor({ site, entry, onClose }: { site: Site; entry?: KeychainEntry; onClose: () => void }) {
  const profile = useProfile()
  const { openSettings } = useApp()
  const account = profile?.accounts.find((a) => a.siteId === site.id)
  const [username, setUsername] = useState(entry?.username ?? '')
  const [password, setPassword] = useState('')
  const [fields, setFields] = useState<Record<string, string>>(account?.fields ?? {})
  const [error, setError] = useState('')
  const save = async () => {
    try {
      if (username || password || entry)
        await api.saveKeychain({ id: entry?.id, kind: 'login', label: site.name, url: site.url, username, ...(password ? { password } : {}) })
      // A site that needs the social security number is set up once chosen, even without numbers of its own (siteReady).
      if (site.fields?.length || site.needsNir)
        await api.updateProfile({ type: 'account', account: { siteId: site.id, fields, since: account?.since ?? new Date().toISOString().slice(0, 10) } })
      onClose()
    } catch (err) {
      setError(errorText(err))
    }
  }
  return (
    <FormDialog
      title={site.name}
      onClose={onClose}
      aside={
        entry && (
          <button className="btn danger" onClick={() => void api.deleteKeychain(entry.id).then(onClose)}>
            oublier l’identifiant
          </button>
        )
      }
      actions={
        <>
          <button className="btn" onClick={onClose}>
            annuler
          </button>
          <button className="btn primary" onClick={() => void save()}>
            enregistrer
          </button>
        </>
      }
    >
      <p className="dim small">{site.description}</p>
      {site.login === 'account' && (
        <div className="form-grid">
          <Field label="identifiant">
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="mot de passe" hint={entry ? 'laissez vide pour garder celui enregistré' : undefined}>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
      )}
      {!!site.fields?.length && (
        <div className="form-grid">
          {site.fields.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <input value={fields[f.key] ?? ''} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value.replace(/\s+/g, '') })} />
            </Field>
          ))}
        </div>
      )}
      {site.needsNir && (
        <p className="small">
          n° de sécurité sociale :{' '}
          {profile?.person.nir ? (
            <span className="ok">renseigné</span>
          ) : (
            <button className="link" onClick={() => (onClose(), openSettings('identity'))}>
              à renseigner dans Identité ›
            </button>
          )}
        </p>
      )}
      {error && <p className="bad small">{error}</p>}
    </FormDialog>
  )
}

const PISTE = { label: 'Légifrance (PISTE)', url: 'https://piste.gouv.fr' }

/** An API key added: by default Légifrance's, the only one Marianne uses (PISTE, the State's gateway). */
function ApiKeyDialog({ onClose }: { onClose: () => void }) {
  const [label, setLabel] = useState(PISTE.label)
  const [url, setUrl] = useState(PISTE.url)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = () => {
    if (busy) return
    setBusy(true)
    setError('')
    api
      .saveKeychain({ kind: 'api', label, url, username, password })
      .then(onClose)
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false))
  }
  return (
    <FormDialog
      title="ajouter une clé d’API"
      onClose={onClose}
      actions={
        <>
          <button className="btn" disabled={busy} onClick={onClose}>
            annuler
          </button>
          <button className="btn primary" disabled={!username || !password || busy} aria-busy={busy} onClick={save}>
            {busy && <Spinner />}
            enregistrer
          </button>
        </>
      }
    >
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
    </FormDialog>
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
              {ENGINE_HOMES[id].env} · {engine.home ? 'dossier personnalisé' : 'dossier par défaut'}
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
      </div>
    </>
  )
}

/** Réglages › Web et navigateur: where the engine may search, and when the folder's browser shows. */
export function WebPane() {
  const { config, setConfig, settings, setSettings } = useApp()
  if (!settings) return null
  return (
    <div className="rows">
      <div className="row">
        <span>recherche sur le web</span>
        <select value={config.web} onChange={(e) => void setConfig({ web: e.target.value as 'off' | 'public' | 'all' })}>
          <option value="off">jamais</option>
          <option value="public">sites publics seulement</option>
          <option value="all">tout le web</option>
        </select>
        <span />
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
    </div>
  )
}

/**
 * How much Marianne asks before acting for the user: the level, and the standing permissions given on
 * cards (« toujours… »), each with the way to take it back. What no level lowers is the guide's to say.
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
      <ListHead label="ce que Marianne fait sans vous demander" />
      <div className="levels">
        {LEVELS.map((l) => (
          <label key={l.id}>
            <input type="radio" name="approvals-level" checked={level === l.id} onChange={() => void setSettings({ approvals: { level: l.id } })} /> {l.label}
            {l.id === 'balanced' && <span className="small dim"> (par défaut)</span>}
            <span className="small dim">{l.text}</span>
          </label>
        ))}
      </div>
      <ListHead label="autorisations données" count={rules.length} />
      {rules.length ? (
        <div className="table-wrap">
          <table className="stable">
            <thead>
              <tr>
                <th>autorisation</th>
                <th>donnée le</th>
                <th>
                  <span className="sr-only">actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{ruleLabel(r)}</td>
                  <td>{shortDate(r.at)}</td>
                  <td className="r">
                    <button className="link small" onClick={() => remove(r.id)}>
                      retirer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small dim empty">aucune · une carte vous en propose avec « toujours… »</p>
      )}
      {error && <p className="small bad">{error}</p>}
    </>
  )
}

/** The public data Marianne keeps on this computer, or queries live; Légifrance with its PISTE key, on its line. */
export function DataPane() {
  const { config, setConfig } = useApp()
  const statuses = useLive(api.listPublicSources, api.onPublicSources) ?? []
  const [entries, setEntries] = useState<KeychainEntry[]>([])
  const [adding, setAdding] = useState(false)
  useEffect(() => {
    const load = () => void api.listKeychain().then(setEntries)
    load()
    return api.onKeychain(load)
  }, [])
  // As the main process finds it (keychain.hasApi): an API key whose address names PISTE.
  const piste = entries.some((e) => e.kind === 'api' && /piste/i.test(e.url))
  return (
    <>
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
                {s.id === 'legifrance' && (piste ? ' · clé PISTE enregistrée' : <span className="accent"> · clé PISTE à renseigner</span>)}
                {st?.error && <span className="bad"> · {st.error}</span>}
              </span>
              {s.kind === 'offline' && enabled ? (
                <button className="btn small" disabled={!!st?.syncing} aria-busy={!!st?.syncing} onClick={() => void api.syncPublicSource(s.id)}>
                  {st?.syncing && <Spinner />}
                  mettre à jour
                </button>
              ) : s.id === 'legifrance' && !piste ? (
                <button className="btn small" onClick={() => setAdding(true)}>
                  renseigner la clé
                </button>
              ) : (
                <span />
              )}
            </div>
          )
        })}
      </div>
      {adding && <ApiKeyDialog onClose={() => setAdding(false)} />}
    </>
  )
}
