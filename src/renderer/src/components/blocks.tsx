import type { ReactNode } from 'react'
import { daysUntil, frDate, type Deadline } from '@shared/dossier'
import { domainInfo, type Color } from '@shared/domains'
import { setupRoute, type Missing } from '@shared/setup'
import { useApp } from '../app/context'
import { Action } from './ui'

const api = window.marianne

/** A Videotex page header: an inverse-video code bar, a title, a line of description. */
export function PageHead({
  code,
  color = 'cyan',
  title,
  description,
  right
}: {
  code: string
  color?: Color
  title: string
  description?: ReactNode
  right?: ReactNode
}) {
  return (
    <header className="page-head">
      <div className={`bar-fill inv-${color}`}>
        <span className="upper">{code}</span>
        {right && <span className="right">{right}</span>}
      </div>
      <h1>{title}</h1>
      {description && <p className="dim">{description}</p>}
    </header>
  )
}

const SOURCES: Record<Deadline['source'], string> = { regle: 'calculée', calendrier: 'calendrier', utilisateur: 'vous', agent: 'marianne' }

export function daysLabel(days: number): string {
  if (days < 0) return days === -1 ? 'hier' : `il y a ${-days} j`
  if (days === 0) return 'aujourd’hui'
  if (days === 1) return 'demain'
  return `J-${days}`
}

/** One deadline: date, how soon, what, where to act, done or ignored. */
export function DeadlineRow({ d, showDomain = true }: { d: Deadline; showDomain?: boolean }) {
  const { apply, go, services } = useApp()
  const days = daysUntil(d.date)
  const urgency = d.status !== 'a_faire' ? 'past' : days < 0 ? 'late' : days <= 7 ? 'soon' : days <= 30 ? 'near' : ''
  const service = d.serviceId ? services.find((s) => s.id === d.serviceId) : undefined
  return (
    <div className={`deadline ${urgency} ${d.status !== 'a_faire' ? 'settled' : ''}`}>
      <span className="when">
        <span className="date">{frDate(d.date)}</span>
        <span className="days">{d.status === 'fait' ? 'fait' : d.status === 'ignore' ? 'ignoré' : daysLabel(days)}</span>
      </span>
      <span className="what">
        <span className="title">{d.title}</span>
        <span className="meta">
          {showDomain && <span>{domainInfo(d.domain).short}</span>}
          <span>{SOURCES[d.source]}</span>
          {d.indicative && <span className="yellow">date indicative</span>}
          {d.note && <span>{d.note}</span>}
        </span>
      </span>
      <span className="acts">
        {d.demarcheId && <Action onClick={() => go(`demarche/${d.demarcheId}`)}>démarche</Action>}
        {service && <Action onClick={() => api.openBrowser(service.url)}>{service.name}</Action>}
        {d.sourceUrl && <Action onClick={() => api.openBrowser(d.sourceUrl!)}>source</Action>}
        {d.status === 'a_faire' ? (
          <>
            <Action onClick={() => void apply({ type: 'deadlineStatus', key: d.key, status: 'fait' })}>fait</Action>
            <Action onClick={() => void apply({ type: 'deadlineStatus', key: d.key, status: 'ignore' })}>ignorer</Action>
          </>
        ) : (
          <Action onClick={() => void apply({ type: 'deadlineStatus', key: d.key, status: 'a_faire' })}>rétablir</Action>
        )}
        {(d.source === 'utilisateur' || d.source === 'agent') && (
          <Action danger onClick={() => void apply({ type: 'deleteDeadline', id: d.key })}>
            supprimer
          </Action>
        )}
      </span>
    </div>
  )
}

/** What a page lacks, with a link to each configuration screen. */
export function MissingList({ missing }: { missing: Missing[] }) {
  const { go, services } = useApp()
  if (!missing.length) return null
  return (
    <div className="missing">
      <span className="yellow upper">à configurer</span>
      {missing.map((m) => {
        const target = setupRoute(m.target, services)
        return target ? (
          <Action key={m.target} onClick={() => go(target.route)}>
            {m.label}
          </Action>
        ) : null
      })}
    </div>
  )
}

/** Key / value lines of a card. */
export function KV({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <div className="kv">
      {rows.map(([k, v]) => (
        <span key={k} className="kv-row">
          <span className="k">{k}</span>
          <span className="v">{v || <span className="muted">—</span>}</span>
        </span>
      ))}
    </div>
  )
}

export function Card({ title, color, actions, children, id }: { title: ReactNode; color?: Color; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="card" id={id}>
      <div className="card-head">
        <span className={`card-title ${color ? `c-${color}` : ''}`}>{title}</span>
        {actions && <span className="card-actions">{actions}</span>}
      </div>
      {children}
    </section>
  )
}
