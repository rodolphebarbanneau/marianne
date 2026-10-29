import { useEffect, useState, type ReactNode } from 'react'
import type { Procedure } from '@marianne/content'
import {
  CONTRACT_LABELS,
  DOCUMENT_TYPE_LABELS,
  daysUntil,
  domainInfo,
  frDate,
  PROPERTY_STATUS_LABELS,
  PROPERTY_USE_LABELS,
  ROLE_LABELS,
  type Deadline,
  type EntityKind,
  type Profile
} from '@marianne/profile'
import { serviceCode, type ServiceState, type ServiceSummary } from '@marianne/sdk'
import type { DomainId } from '@shared/types'
import { useApp } from '../app/context'
import { api } from '../lib/api'
import { when } from '../lib/format'
import { useDocuments, useProfile } from '../lib/profile'
import { useServices } from '../host'

/**
 * A domain's dashboard: what the user has in it (deadlines, entities, folders), then what helps
 * (guided démarches, the services useful for it, pièces, official links). Services are laid out
 * from their summaries: data, never an add-on's own screen.
 */
export function DomainPage({ id }: { id: DomainId }) {
  const app = useApp()
  const d = domainInfo(id)
  const profile = useProfile()
  const documents = useDocuments().filter((x) => x.domain === id)
  const services = useServices().filter((s) => s.manifest.domains.includes(id) && s.available)
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [summaries, setSummaries] = useState<Array<{ service: string; summary: ServiceSummary }>>([])
  const onServices = services
    .filter((s) => s.on)
    .map((s) => s.manifest.id)
    .join()

  useEffect(() => {
    void api.getDeadlines(400).then((list) => setDeadlines(list.filter((x) => x.domain === id && x.status === 'todo')))
    void api.listProcedures().then((list) => setProcedures(list.filter((p) => p.domain === id)))
  }, [id])
  // The services' lines change with the services that are on.
  useEffect(() => void api.serviceSummaries(id).then(setSummaries), [id, onServices])

  const folders = app.folders.filter((f) => f.domain === id)
  const open = folders.filter((f) => !f.settledAt)
  const settled = folders.filter((f) => f.settledAt).slice(0, 3)
  const newFolder = (text = '') => {
    app.setSeed({ text, attachments: [], domain: id })
    app.goPage('home')
  }
  const start = (p: Procedure) => {
    app.setSeed({ text: '', attachments: [], procedure: p.id })
    app.goPage('home')
  }

  return (
    <div className="page">
      <div className="page-body domain-page">
        <div className="service-head">
          {/* The way back is the domain's block, as a service's 3615 is: a click anywhere on it, as échap. */}
          <span className="t">
            <button
              className="inv service-back"
              title="retour aux Démarches (échap)"
              aria-label="retour aux Démarches"
              onClick={() => app.goPage('procedures')}
            >
              <span className="arrow" aria-hidden>
                ←
              </span>
              {d.badge}
            </button>{' '}
            {capitalize(d.label)}
          </span>
          <span className="small dim">{d.description}</span>
        </div>
        <div className="box-note domain-ask">
          <span>
            demander à Marianne sur {d.short} :{' '}
            {d.starters.map((s) => (
              <button key={s} className="chip" onClick={() => newFolder(s)}>
                {s}
              </button>
            ))}
          </span>
          <button className="btn small" onClick={() => newFolder()}>
            nouveau dossier {d.short}
          </button>
        </div>

        <div className="dash">
          <div>
            <Block title="Échéances">
              {!deadlines.length && <p className="small dim">Aucune échéance à venir.</p>}
              {deadlines.slice(0, 8).map((x) => (
                <DeadlineRow key={x.key} deadline={x} />
              ))}
            </Block>
            {d.entities.map((kind) => (
              <Block key={kind} title={ENTITY_TITLES[kind]} action={<Link onClick={() => app.openSettings('household')}>dans Moi › Foyer ›</Link>}>
                {profile && !profile[kind].length && <p className="small dim">Rien d’enregistré.</p>}
                {profile && entities(profile, kind)}
              </Block>
            ))}
            <Block title="Dossiers">
              {!folders.length && <p className="small dim">Aucun dossier dans ce domaine.</p>}
              {[...open, ...settled].map((f) => (
                <button key={f.id} className="r" onClick={() => app.go({ kind: 'folder', id: f.id })}>
                  <span className="badge">{d.badge}</span>
                  <span>
                    {f.title} <span className="small dim">· {f.settledAt ? `classé ${when(f.settledAt)}` : f.meta || when(f.updatedAt)}</span>
                  </span>
                  <span className="small">›</span>
                </button>
              ))}
            </Block>
            <Block title="Démarches guidées">
              {!procedures.length && <p className="small dim">Pas encore de démarche guidée ici : posez votre question à Marianne.</p>}
              {procedures.map((p) => (
                <div key={p.id} className="r">
                  <span className="small dim">
                    {p.steps.length} étape{p.steps.length > 1 ? 's' : ''}
                  </span>
                  <span>
                    {p.title} <span className="small dim">· {p.description}</span>
                  </span>
                  <button className="btn small" onClick={() => start(p)}>
                    commencer
                  </button>
                </div>
              ))}
            </Block>
          </div>

          <div>
            <Block title="Services utiles">
              {!services.length && <p className="small dim">Aucun service pour ce domaine.</p>}
              {services.map((s) => (
                <ServiceLine key={s.manifest.id} state={s} summary={summaries.find((x) => x.service === s.manifest.id)?.summary} />
              ))}
            </Block>
            <Block title="Pièces">
              {!documents.length && <p className="small dim">Aucune pièce dans ce domaine.</p>}
              {documents.slice(0, 8).map((x) => (
                <button key={x.id} className="r" onClick={() => void api.openDocument(x.id)}>
                  <span className="small dim">{DOCUMENT_TYPE_LABELS[x.type]}</span>
                  <span>
                    {x.title} {x.date && <span className="small dim">· {frDate(x.date)}</span>}
                  </span>
                  <span className="small">ouvrir</span>
                </button>
              ))}
            </Block>
            <Block title="Liens officiels">
              {d.links.map((l) => (
                <button key={l.url} className="r" onClick={() => api.openExternal(l.url)} title={l.url}>
                  <span className="small dim">{new URL(l.url).hostname.replace(/^www\./, '')}</span>
                  <span>{l.label}</span>
                  <span className="small">↗</span>
                </button>
              ))}
            </Block>
          </div>
        </div>
      </div>
    </div>
  )
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const ENTITY_TITLES: Record<EntityKind, string> = {
  vehicles: 'Vos véhicules',
  properties: 'Vos logements',
  companies: 'Vos entreprises',
  employers: 'Vos employeurs'
}

function Block({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="blk">
      <span className="label sub blk-head">
        {title} {action}
      </span>
      {children}
    </div>
  )
}

function Link({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button className="small link" onClick={onClick}>
      {children}
    </button>
  )
}

/** "dans 3 j", "demain", "aujourd’hui", or the date. */
function dueLabel(date: string): string {
  const days = daysUntil(date)
  if (days < 0) return 'dépassée'
  if (days === 0) return 'aujourd’hui'
  if (days === 1) return 'demain'
  if (days <= 7) return `dans ${days} j`
  return frDate(date).slice(0, 5)
}

function DeadlineRow({ deadline }: { deadline: Deadline }) {
  const app = useApp()
  const days = daysUntil(deadline.date)
  const act = deadline.service
    ? { label: 'ouvrir', run: () => app.go({ kind: 'service', id: deadline.service!, params: deadline.params ?? {} }) }
    : deadline.procedureId
      ? { label: 'commencer', run: () => (app.setSeed({ text: '', attachments: [], procedure: deadline.procedureId }), app.goPage('home')) }
      : deadline.sourceUrl
        ? { label: 'voir', run: () => api.openExternal(deadline.sourceUrl!) }
        : null
  return (
    <div className={`r${days <= 3 ? ' urgent' : ''}`}>
      <span className="when">{dueLabel(deadline.date)}</span>
      <span>
        {deadline.title}
        {deadline.service && <span className="small dim"> · 3615 {deadline.service.toUpperCase()}</span>}
        {deadline.indicative && <span className="small dim"> · date indicative</span>}
      </span>
      {act ? (
        <button className="btn small" onClick={act.run}>
          {act.label}
        </button>
      ) : (
        <span />
      )}
    </div>
  )
}

function entities(profile: Profile, kind: EntityKind): ReactNode {
  const row = (key: string, head: ReactNode, text: string, side = '') => (
    <div key={key} className="r">
      {head}
      <span>{text}</span>
      <span className="small dim">{side}</span>
    </div>
  )
  switch (kind) {
    case 'vehicles':
      return profile.vehicles.map((v) =>
        row(
          v.id,
          <span className="plate">{v.plate || '—'}</span>,
          [v.model, v.firstRegistration && `1re immatriculation ${v.firstRegistration.slice(0, 4)}`, v.critair && `Crit’Air ${v.critair}`]
            .filter(Boolean)
            .join(' · '),
          v.lastInspection ? `CT le ${frDate(v.lastInspection)}` : ''
        )
      )
    case 'properties':
      return profile.properties.map((p) =>
        row(p.id, <span className="small dim">{PROPERTY_STATUS_LABELS[p.status]}</span>, p.address || 'adresse à compléter', PROPERTY_USE_LABELS[p.use])
      )
    case 'companies':
      return profile.companies.map((c) => row(c.id, <span className="small dim">{c.siren || '—'}</span>, c.name || 'entreprise', ROLE_LABELS[c.role]))
    case 'employers':
      return profile.employers.map((e) =>
        row(
          e.id,
          <span className="small dim">{CONTRACT_LABELS[e.contract]}</span>,
          [e.name, e.position].filter(Boolean).join(' · '),
          e.start ? `depuis ${frDate(e.start)}` : ''
        )
      )
  }
}

/** A service useful for the domain: its summary when it is on, a suggestion when it is off. */
function ServiceLine({ state, summary }: { state: ServiceState; summary?: ServiceSummary }) {
  const app = useApp()
  const m = state.manifest
  if (!state.on) {
    const disabled = app.settings?.services.disabled ?? []
    return (
      <div className="svc off">
        <span className="top">
          <span>
            3615 {serviceCode(m)} · {m.name}
          </span>
          <button className="btn small" onClick={() => void app.setSettings({ services: { disabled: disabled.filter((x) => x !== m.id) } })}>
            activer
          </button>
        </span>
        <span className="sum">désactivé : peut vous aider dans ce domaine</span>
      </div>
    )
  }
  return (
    <div className={`svc${summary?.urgency === 'urgent' ? ' urgent' : summary?.urgency === 'soon' ? ' soon' : ''}`}>
      <span className="top">
        <span>
          <span className="inv">3615</span> {serviceCode(m)} · {m.name}
        </span>
        <button className="btn small" onClick={() => app.go({ kind: 'service', id: m.id, params: summary?.params ?? {} })}>
          ouvrir
        </button>
      </span>
      <span className="sum">{summary?.text ?? m.description}</span>
      {summary?.detail && <span className="small dim">{summary.detail}</span>}
    </div>
  )
}
