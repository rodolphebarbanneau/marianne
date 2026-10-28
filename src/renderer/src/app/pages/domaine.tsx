import { useEffect, useState, type ReactNode } from 'react'
import type { Deputy, SpHit } from '@shared/api'
import { daysUntil, formatAddress, frDate, mask, type DomainId, type Dossier } from '@shared/dossier'
import { domainInfo, ENTITY_LABELS } from '@shared/domains'
import { missingFor, serviceReady } from '@shared/setup'
import type { Demarche, Service } from '@shared/types'
import { Card, DeadlineRow, KV, MissingList, PageHead } from '../../components/blocks'
import { Field, FormGrid, Input } from '../../components/form'
import { Action, Spinner } from '../../components/ui'
import { AssembleeVideos } from '../assemblee'
import { siteOf, useAnchor, useApp, useScrollToAnchor } from '../context'
import { ipcError } from '../hooks'
import { PIECES } from './dossier'
import { DocumentRow } from './documents'

const api = window.marianne

const LOGIN: Record<Service['login'], string> = { franceconnect: 'franceconnect', compte: 'compte', aucun: 'libre' }

/** Configure a service: its identifiers, and the login to fill in the built-in browser. */
function ServiceConfig({ service, onDone }: { service: Service; onDone: () => void }) {
  const { dossier, apply, loginSites, go } = useApp()
  const account = dossier.accounts.find((a) => a.serviceId === service.id)
  const [fields, setFields] = useState<Record<string, string>>(account?.fields ?? {})
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const hasLogin = loginSites.has(siteOf(service.url))
  const invalid = (service.fields ?? []).find((f) => {
    const v = (fields[f.key] ?? '').replace(/\s+/g, '')
    return v && f.pattern && !new RegExp(f.pattern).test(v)
  })
  const save = async () => {
    try {
      await apply({ type: 'account', account: { serviceId: service.id, fields, since: account?.since ?? '' } })
      if (username.trim() && password) await api.saveVaultEntry({ kind: 'login', label: service.name, url: service.url, username, password })
      onDone()
    } catch (e) {
      setError(ipcError(e as Error))
    }
  }
  return (
    <div className="editor" id={`compte:${service.id}`}>
      <FormGrid>
        {(service.fields ?? []).map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint} error={invalid?.key === f.key ? 'format inattendu' : ''}>
            <Input value={fields[f.key] ?? ''} onChange={(v) => setFields((x) => ({ ...x, [f.key]: v }))} mono />
          </Field>
        ))}
        {service.needsNir && (
          <Field label="numéro de sécurité sociale" hint="ce service vous identifie par ce numéro, rangé dans votre identité">
            {dossier.person.nir ? (
              <span className="green">renseigné · {mask(dossier.person.nir)}</span>
            ) : (
              <Action onClick={() => go('dossier#identite')}>à renseigner dans mon dossier</Action>
            )}
          </Field>
        )}
        {service.login !== 'aucun' &&
          (hasLogin ? (
            <Field label="connexion" hint="remplie à la demande dans le navigateur de Marianne">
              <span>
                <span className="green">dans le trousseau</span> <Action onClick={() => go('reglages/keychain')}>gérer</Action>
              </span>
            </Field>
          ) : (
            <>
              <Field
                label={service.login === 'franceconnect' ? 'identifiant (FranceConnect ou du site)' : 'identifiant de connexion'}
                hint="facultatif : rangé chiffré dans le trousseau"
              >
                <Input value={username} onChange={setUsername} mono />
              </Field>
              <Field label="mot de passe" hint="jamais montré à l’assistant">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </Field>
            </>
          ))}
      </FormGrid>
      {error && <p className="line error">✗ {error}</p>}
      <p className="line">
        <Action onClick={onDone}>annuler</Action>{' '}
        <Action onClick={() => void save()} disabled={!!invalid}>
          {account ? 'enregistrer' : 'j’utilise ce service'}
        </Action>{' '}
        {account && (
          <Action danger onClick={() => void apply({ type: 'deleteAccount', serviceId: service.id }).then(onDone)}>
            ne plus l’utiliser
          </Action>
        )}
      </p>
    </div>
  )
}

function ServiceRow({ service, open, setOpen }: { service: Service; open: boolean; setOpen: (v: boolean) => void }) {
  const { dossier, loginSites } = useApp()
  const account = dossier.accounts.find((a) => a.serviceId === service.id)
  const ready = serviceReady(dossier, service)
  const needs = !!(service.fields?.length || service.needsNir)
  // Nothing to set for a free service without identifiers: just open it.
  const configurable = needs || service.login !== 'aucun'
  const status = !configurable ? null : ready ? (
    <span className="green">configuré</span>
  ) : account ? (
    <span className="yellow">{needs ? 'incomplet' : 'utilisé'}</span>
  ) : needs ? (
    <span className="muted">non configuré</span>
  ) : null
  return (
    <div className={`service-row ${open ? 'open' : ''}`}>
      <div className="item-row">
        <span>
          <span className="hi">{service.name}</span>{' '}
          <span className={`badge ${service.login === 'franceconnect' ? 'fc' : service.login === 'compte' ? 'compte' : 'libre'}`}>{LOGIN[service.login]}</span>{' '}
          {loginSites.has(siteOf(service.url)) && <span className="badge key">clé</span>} <span className="dim">· {service.description}</span>
        </span>
        <span className="acts">
          {status}
          {configurable && <Action onClick={() => setOpen(!open)}>{open ? 'fermer' : account ? 'modifier' : 'configurer'}</Action>}
          <Action onClick={() => api.openBrowser(service.url)}>ouvrir</Action>
        </span>
      </div>
      {open && <ServiceConfig service={service} onDone={() => setOpen(false)} />}
    </div>
  )
}

/** What the file holds for a domain. */
function Information({ id }: { id: DomainId }) {
  const { dossier, go } = useApp()
  const d: Dossier = dossier
  const p = d.person
  const account = (serviceId: string, key: string) => d.accounts.find((a) => a.serviceId === serviceId)?.fields[key] ?? ''
  const entityList = (kind: 'entreprises' | 'employeurs' | 'vehicules' | 'logements', render: (e: never) => ReactNode) =>
    d[kind].length ? (
      d[kind].map((e) => (
        <p key={(e as { id: string }).id} className="journal-line">
          {render(e as never)}
        </p>
      ))
    ) : (
      <p className="dim">
        Aucun élément. <Action onClick={() => go(`entites#${kind}`)}>ajouter vos {ENTITY_LABELS[kind].label}</Action>
      </p>
    )
  let body: ReactNode = null
  switch (id) {
    case 'identite':
      body = (
        <KV
          rows={[
            ['nom', [p.prenoms, p.nomUsage || p.nomNaissance].filter(Boolean).join(' ')],
            ['naissance', [p.dateNaissance && frDate(p.dateNaissance), p.communeNaissance].filter(Boolean).join(' · ')],
            ['adresse', formatAddress(d.address)],
            [
              'pièces',
              d.pieces.map((x) => `${PIECES.find((t) => t.value === x.type)?.label}${x.expiration ? ` (jusqu’au ${frDate(x.expiration)})` : ''}`).join(' · ')
            ]
          ]}
        />
      )
      break
    case 'sante':
    case 'retraite':
      body = (
        <KV
          rows={[
            ['n° de sécu', p.nir ? mask(p.nir) : ''],
            ['naissance', p.dateNaissance ? frDate(p.dateNaissance) : ''],
            ['situation', p.situationPro.replace(/_/g, ' ')]
          ]}
        />
      )
      break
    case 'impots':
      body = (
        <KV
          rows={[
            ['numéro fiscal', account('impots', 'numero_fiscal') ? mask(account('impots', 'numero_fiscal'), 3) : ''],
            ['situation', p.situationFamiliale],
            ['foyer', d.household.map((m) => `${m.prenom}${m.aCharge ? ' (à charge)' : ''}`).join(' · ')],
            ['propriétaire', d.logements.some((l) => l.statut === 'proprietaire') ? 'oui' : '']
          ]}
        />
      )
      break
    case 'famille':
      body = (
        <KV
          rows={[
            ['numéro allocataire', account('caf', 'numero_allocataire') ? mask(account('caf', 'numero_allocataire'), 3) : ''],
            ['situation', p.situationFamiliale],
            ['foyer', d.household.map((m) => `${m.lien} ${m.prenom}`).join(' · ')]
          ]}
        />
      )
      break
    case 'travail':
      body = entityList('employeurs', (e: { nom: string; contrat: string; debut: string; fin: string }) => (
        <>
          <span className="hi">{e.nom}</span>{' '}
          <span className="dim">
            · {e.contrat}
            {e.debut && ` · depuis le ${frDate(e.debut)}`}
            {e.fin && ` jusqu’au ${frDate(e.fin)}`}
          </span>
        </>
      ))
      break
    case 'logement':
      body = entityList('logements', (e: { adresse: string; statut: string; loyer: string }) => (
        <>
          <span className="hi">{e.adresse}</span>{' '}
          <span className="dim">
            · {e.statut}
            {e.loyer && ` · ${e.loyer} €`}
          </span>
        </>
      ))
      break
    case 'entreprises':
      body = entityList('entreprises', (e: { denomination: string; siren: string; regime: string; periodicite: string }) => (
        <>
          <span className="hi">{e.denomination || e.siren}</span>{' '}
          <span className="dim">
            · {e.regime.replace(/_/g, ' ')}
            {e.periodicite && ` · déclarations ${e.periodicite}s`}
          </span>
        </>
      ))
      break
    case 'mobilite':
      body = (
        <>
          {entityList('vehicules', (e: { modele: string; immatriculation: string; dernierControle: string }) => (
            <>
              <span className="hi">{e.modele || 'véhicule'}</span>{' '}
              <span className="dim">
                · {e.immatriculation}
                {e.dernierControle && ` · dernier contrôle le ${frDate(e.dernierControle)}`}
              </span>
            </>
          ))}
          <KV rows={[['permis', d.pieces.find((x) => x.type === 'permis' && x.titulaire === 'moi') ? 'renseigné' : '']]} />
        </>
      )
      break
    case 'justice':
      body = <p className="dim">Les décisions et courriers reçus se rangent dans vos documents ; leurs délais dans l’agenda.</p>
  }
  return <>{body}</>
}

function Understand({ id }: { id: DomainId }) {
  const { go } = useApp()
  const info = domainInfo(id)
  const [titles, setTitles] = useState<Array<{ id: string; title: string; kind: string }>>([])
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SpHit[] | null>(null)
  useEffect(() => void api.spTitles(info.fiches).then(setTitles), [info.fiches])
  useEffect(() => {
    if (q.trim().length < 3) return setHits(null)
    const t = setTimeout(() => void api.spSearch(`${q}`, 8).then(setHits), 300)
    return () => clearTimeout(t)
  }, [q])
  return (
    <Card title="comprendre" color="bleu">
      {titles.map((t) => (
        <button key={t.id} className="fiche-link" onClick={() => go(`fiche/${t.id}`)}>
          <span className="dim">{t.id}</span> {t.title}
        </button>
      ))}
      {info.fiches.length > 0 && !titles.length && <p className="dim">Les fiches Service-Public sont en cours de téléchargement (réglages → sources).</p>}
      {info.links.map((l) => (
        <button key={l.url} className="fiche-link" onClick={() => api.openBrowser(l.url)}>
          <span className="dim">↗</span> {l.label}
        </button>
      ))}
      <div className="search-line">
        <Input value={q} onChange={setQ} placeholder="chercher dans les fiches Service-Public" />
      </div>
      {hits?.map((h) => (
        <button key={h.id} className="fiche-link" onClick={() => go(`fiche/${h.id}`)}>
          <span className="dim">{h.id}</span> {h.title}
        </button>
      ))}
      {hits?.length === 0 && <p className="dim">Aucune fiche.</p>}
    </Card>
  )
}

function Deputies() {
  const { dossier, go } = useApp()
  const [list, setList] = useState<Deputy[] | null>(null)
  useEffect(() => void api.myDeputies().then(setList), [dossier.address.codeInsee])
  if (!dossier.address.codeInsee)
    return (
      <p className="dim">
        Renseignez votre adresse pour voir vos députés. <Action onClick={() => go('dossier#adresse')}>mon adresse</Action>
      </p>
    )
  if (!list) return <Spinner />
  if (!list.length) return <p className="dim">Les données de l’Assemblée sont en cours de téléchargement (réglages → sources).</p>
  return (
    <>
      <p className="dim" style={{ marginBottom: 4 }}>
        Députés de votre département · votre circonscription dépend de votre adresse exacte.
      </p>
      {list.map((d) => (
        <p key={d.id} className="journal-line">
          <span className="acc">{d.circo === '1' ? '1re' : `${d.circo}e`}</span> <span className="hi">{d.name}</span> <span className="dim">· {d.groupe}</span>{' '}
          <Action onClick={() => api.openBrowser(`https://www.assemblee-nationale.fr/dyn/deputes/${d.id}`)}>fiche</Action>
        </p>
      ))}
    </>
  )
}

export function Domaine({ id }: { id: DomainId }) {
  const { dossier, deadlines, services, go, ask } = useApp()
  const anchor = useAnchor()
  useScrollToAnchor()
  const info = domainInfo(id)
  const [open, setOpen] = useState<string | null>(anchor.startsWith('compte:') ? anchor.slice(7) : null)
  const [demarches, setDemarches] = useState<Demarche[]>([])
  useEffect(() => void api.listDemarches().then(setDemarches), [])
  useEffect(() => {
    if (anchor.startsWith('compte:')) setOpen(anchor.slice(7))
  }, [anchor])
  if (!info) return null
  const own = services.filter((s) => s.domain === id)
  // Services with identifiers first, then those already used, then the rest.
  const sorted = [...own].sort((a, b) => Number(!!(b.fields?.length || b.needsNir)) - Number(!!(a.fields?.length || a.needsNir)))
  const todo = deadlines.filter((d) => d.domain === id && d.status === 'a_faire' && daysUntil(d.date) >= -30).slice(0, 6)
  const procs = demarches.filter((x) => x.domain === id)
  const docs = dossier.documents.filter((x) => x.domain === id).slice(0, 6)
  const missing = missingFor(dossier, id, services)

  return (
    <div className="page-inner">
      <PageHead code={info.code} color={info.color} title={info.label} description={info.description} />
      <MissingList missing={missing} />

      <div className="cols">
        <div>
          <Card title="à faire" color="cyan" actions={<Action onClick={() => go('agenda')}>agenda</Action>}>
            {todo.length ? (
              todo.map((d) => <DeadlineRow key={d.key} d={d} showDomain={false} />)
            ) : (
              <p className="dim">Rien à faire pour l’instant dans ce domaine.</p>
            )}
          </Card>

          <Card title="mes services" color={info.color}>
            {sorted.map((s) => (
              <ServiceRow key={s.id} service={s} open={open === s.id} setOpen={(v) => setOpen(v ? s.id : null)} />
            ))}
          </Card>

          <Card title="démarches" color="jaune">
            {procs.length ? (
              procs.map((x) => {
                const done = (dossier.procedures[x.id] ?? []).length
                return (
                  <button key={x.id} className="fiche-link" onClick={() => go(`demarche/${x.id}`)}>
                    <span className={done === x.steps.length ? 'green' : done ? 'yellow' : 'muted'}>
                      [{done}/{x.steps.length}]
                    </span>{' '}
                    <span className="hi">{x.title}</span> <span className="dim">· {x.description}</span>
                  </button>
                )
              })
            ) : (
              <p className="dim">Pas encore de démarche guidée dans ce domaine : demandez à Marianne.</p>
            )}
          </Card>

          {id === 'identite' && (
            <Card title="vie démocratique · assemblée nationale" color="bleu" id="assemblee">
              <Deputies />
              <AssembleeVideos />
            </Card>
          )}
        </div>

        <div>
          <Card
            title="mes informations"
            color="magenta"
            actions={<Action onClick={() => go(info.entities[0] ? `entites#${info.entities[0]}` : 'dossier')}>modifier</Action>}
          >
            <Information id={id} />
          </Card>

          <Card title="documents" color="vert" actions={<Action onClick={() => void api.addDocuments(id)}>ajouter</Action>}>
            {docs.length ? docs.map((x) => <DocumentRow key={x.id} doc={x} showDomain={false} />) : <p className="dim">Aucun document dans ce domaine.</p>}
          </Card>

          <Understand id={id} />

          <Card title="demander à marianne">
            <div className="starters">
              {info.starters.map((s) => (
                <button key={s} className="starter" onClick={() => ask({ text: s, send: true, fresh: true })}>
                  › {s}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
