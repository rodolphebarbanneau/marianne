import type { ReactNode } from 'react'
import { PROFILE_FIELD_SHORT, type ProfileField } from '@marianne/sdk'
import { useApp } from '../app/context'
import { Modal } from '../components/ui'
import { useServices } from '../host'
import { listing } from './lists'

/**
 * The pieces every settings page is made of, so that they all read the same way: a list's head with its
 * own actions, a list's filters, a form in a dialog. A page holds settings only: what explains them is in
 * the guide, which its title links to (dialog.tsx).
 */

/**
 * A list's head, as the Services page draws its sections: its name, how many, and at its end what acts on
 * it (« + ajouter un employeur »). Each list has its own: no button between two lists, where nobody can
 * tell which one it adds to.
 */
export function ListHead({ label, count, children }: { label: string; count?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sec-h">
      <span className="label">{label}</span>
      {count !== undefined && <span className="small dim">{count}</span>}
      {children && <span className="tools">{children}</span>}
    </div>
  )
}

/** A list's filter: its choices, each with its count, the one shown pressed. */
export function Filter<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: Array<[T, string]>
  onChange: (value: T) => void
}) {
  return (
    <span className="seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} aria-pressed={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </span>
  )
}

/** A form over the settings: its title, its fields, its buttons at the foot (the one that deletes on the left). */
export function FormDialog({
  title,
  onClose,
  children,
  aside,
  actions,
  wide
}: {
  title: string
  onClose: () => void
  children: ReactNode
  /** At the foot's left: « supprimer », « oublier l’identifiant ». */
  aside?: ReactNode
  actions: ReactNode
  wide?: boolean
}) {
  return (
    <Modal wide={wide} onClose={onClose} label={title}>
      <div className="mh">
        <span className="t">{title.toUpperCase()}</span>
        <button className="btn small" onClick={onClose}>
          fermer ✕
        </button>
      </div>
      <div className="in">{children}</div>
      <div className="foot">
        <span>{aside}</span>
        <span className="row-flex" style={{ gap: 8 }}>
          {actions}
        </span>
      </div>
    </Modal>
  )
}

/** A list's « modifier » and « ✕ », at the end of each of its rows. */
export function RowActions({ name, onEdit, onDelete }: { name: string; onEdit?: () => void; onDelete: () => void }) {
  return (
    <span className="row-acts">
      {onEdit && (
        <button className="btn small" onClick={onEdit}>
          modifier
        </button>
      )}
      <button className="btn small danger" aria-label={`supprimer ${name}`} title="supprimer" onClick={onDelete}>
        ✕
      </button>
    </span>
  )
}

/**
 * Under a page of MES IDÉES: which services read what it holds, and the way to the page where the user
 * gives or takes it back. Read by the services the user accepted, never by the engines.
 */
export function ReadBy({ field, what }: { field: ProfileField; what: { none: string; some: string } }) {
  const services = useServices()
  const { openSettings } = useApp()
  const readers = services.filter((s) => s.added && s.access.granted?.includes(field)).map((s) => s.manifest.id.toUpperCase())
  return (
    <p className="small dim read-by" title={PROFILE_FIELD_SHORT[field]}>
      {readers.length ? `${what.some} ${listing(readers)}` : what.none} ·{' '}
      <button className="link" onClick={() => openSettings('access')}>
        accès des services ›
      </button>
    </p>
  )
}
