import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CIVILITY_LABELS,
  CONTRACT_LABELS,
  DOCUMENT_TYPE_LABELS,
  DOMAINS,
  FAMILY_STATUS_LABELS,
  formatNir,
  ID_DOCUMENT_LABELS,
  newKey,
  nirValid,
  PROPERTY_STATUS_LABELS,
  PROPERTY_USE_LABELS,
  REGIME_LABELS,
  RELATION_LABELS,
  ROLE_LABELS,
  WORK_STATUS_LABELS,
  type Company,
  type EntityKind,
  type HouseholdMember,
  type IdDocument,
  type Person,
  type ProfileOp
} from '@marianne/profile'
import type { AddressSuggestion } from '@shared/api'
import type { DisplayChoice } from '@shared/types'
import { useApp } from '../app/context'
import { Field, SearchField } from '../components/ui'
import { api, errorText } from '../lib/api'
import { bytes } from '../lib/format'
import { plainKey } from '../lib/keys'
import { useDocuments, useProfile } from '../lib/profile'
import { documentWords, filterDocuments, frDate, type DocumentPlace } from './lists'
import { Filter, FormDialog, ListHead, RowActions } from './parts'

const compact = (s: string) => s.replace(/\s+/g, '')
const groups = (s: string, size: number) => compact(s).replace(new RegExp(`(.{${size}})(?=.)`, 'g'), '$1 ')
/** "0612345678" → "06 12 34 56 78" */
const formatPhone = (s: string) => (/^\d{10}$/.test(compact(s)) ? groups(s, 2) : s)

function useSave() {
  const [error, setError] = useState('')
  const save = (op: ProfileOp) =>
    void api
      .updateProfile(op)
      .then(() => setError(''))
      .catch((err) => setError(errorText(err)))
  return { save, error }
}

/** A text box saved when it loses focus, shown formatted the French way. */
function Text({
  value,
  onSave,
  placeholder,
  format = (v) => v,
  type = 'text'
}: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  format?: (v: string) => string
  type?: string
}) {
  const [draft, setDraft] = useState(format(value))
  // Callers often pass `format` inline (a new function at each render): only a new stored value resets the draft.
  const formatRef = useRef(format)
  formatRef.current = format
  useEffect(() => setDraft(formatRef.current(value)), [value])
  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== format(value) && onSave(draft.trim())}
      onKeyDown={(e) => plainKey(e, 'Enter') && (e.target as HTMLInputElement).blur()}
    />
  )
}

function Select<T extends string>({ value, options, onSave }: { value: T; options: Record<string, string>; onSave: (v: T) => void }) {
  return (
    <select value={value} onChange={(e) => onSave(e.target.value as T)}>
      <option value="">—</option>
      {Object.entries(options).map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </select>
  )
}

/** "12 rue de l’Exemple, 75000 Paris": an address as the field shows it. */
const addressLine = (a: { street: string; postcode: string; city: string }) => [a.street, `${a.postcode} ${a.city}`.trim()].filter(Boolean).join(', ')

/**
 * The address in its field: the one saved, as it reads. Typing searches the Base adresse nationale;
 * a suggestion picked (click, or ↑ ↓ and entrée) is saved and shows in the field. Échap, or leaving
 * the field without picking, puts the saved address back: nothing changes by accident.
 */
function AddressField({ value, onPick }: { value: string; onPick: (a: AddressSuggestion) => void }) {
  // What is typed; null: the field shows the saved address (or the one just picked, until it is saved).
  const [draft, setDraft] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [hits, setHits] = useState<AddressSuggestion[]>([])
  const [searched, setSearched] = useState('')
  const [active, setActive] = useState(0)
  const query = draft?.trim() ?? ''
  useEffect(() => setPicked(null), [value])
  useEffect(() => {
    if (query.length < 4) {
      setHits([])
      setSearched('')
      return
    }
    const t = setTimeout(
      () =>
        void api
          .searchAddress(query)
          .then((found) => {
            setHits(found)
            setActive(0)
            setSearched(query)
          })
          .catch(() => setHits([])),
      250
    )
    return () => clearTimeout(t)
  }, [query])
  const close = () => {
    setDraft(null)
    setHits([])
    setSearched('')
  }
  const pick = (h: AddressSuggestion) => {
    onPick(h)
    setPicked(addressLine(h))
    close()
  }
  const open = draft !== null && (hits.length > 0 || (searched === query && query.length >= 4))
  return (
    <div style={{ position: 'relative' }}>
      <input
        value={draft ?? picked ?? value}
        placeholder="commencez à taper votre adresse…"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        style={{ width: '100%' }}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && draft !== null) {
            e.preventDefault()
            close()
          } else if (e.key === 'ArrowDown' && hits.length) {
            e.preventDefault()
            setActive((active + 1) % hits.length)
          } else if (e.key === 'ArrowUp' && hits.length) {
            e.preventDefault()
            setActive((active - 1 + hits.length) % hits.length)
          } else if (plainKey(e, 'Enter') && hits[active]) {
            e.preventDefault()
            pick(hits[active])
          }
        }}
      />
      {open && (
        <div className="menu" role="listbox" style={{ top: '100%', left: 0, right: 0 }}>
          {hits.length ? (
            hits.map((h, i) => (
              // Before the field's blur: the click picks it.
              <button
                key={h.label}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'on' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(h)}
              >
                {h.label}
              </button>
            ))
          ) : (
            <span className="item dim">aucune adresse ne correspond</span>
          )}
        </div>
      )}
    </div>
  )
}

/** Réglages › Identité: the civil status, and the identity documents. */
export function IdentityPane() {
  const profile = useProfile()
  const { save, error } = useSave()
  if (!profile) return null
  const p = profile.person
  const person = (patch: Partial<Person>) => save({ type: 'person', patch })
  const nirProblem = p.nir && !nirValid(p.nir) ? 'ce numéro semble incorrect, vérifiez les 15 chiffres' : undefined
  return (
    <>
      <div className="form-grid">
        <Field label="civilité">
          <Select value={p.civility} options={CIVILITY_LABELS} onSave={(civility) => person({ civility })} />
        </Field>
        <Field label="prénoms">
          <Text value={p.firstNames} onSave={(firstNames) => person({ firstNames })} placeholder="Camille, Marie" />
        </Field>
        <Field label="nom de naissance">
          <Text value={p.birthName} onSave={(birthName) => person({ birthName: birthName.toUpperCase() })} />
        </Field>
        <Field label="nom d’usage">
          <Text value={p.usedName} onSave={(usedName) => person({ usedName: usedName.toUpperCase() })} />
        </Field>
        <Field label="date de naissance">
          <Text type="date" value={p.birthDate} onSave={(birthDate) => person({ birthDate })} />
        </Field>
        <Field label="lieu de naissance">
          <Text value={p.birthPlace} onSave={(birthPlace) => person({ birthPlace })} placeholder="commune (département)" />
        </Field>
        <Field label="n° de sécurité sociale" error={nirProblem} hint="les 15 chiffres de votre carte Vitale, clé comprise">
          <Text value={p.nir} format={formatNir} onSave={(v) => person({ nir: compact(v) })} placeholder="_ __ __ __ ___ ___ __" />
        </Field>
        <Field label="nationalité">
          <Text value={p.nationality} onSave={(nationality) => person({ nationality })} />
        </Field>
        <Field label="situation familiale">
          <Select value={p.familyStatus} options={FAMILY_STATUS_LABELS} onSave={(familyStatus) => person({ familyStatus })} />
        </Field>
        <Field label="situation professionnelle">
          <Select value={p.workStatus} options={WORK_STATUS_LABELS} onSave={(workStatus) => person({ workStatus })} />
        </Field>
      </div>
      {error && <p className="bad small">{error}</p>}
      <RecordList<IdDocument>
        label="pièces d’identité"
        noun="une pièce d’identité"
        none="aucune pièce d’identité"
        items={profile.idDocuments}
        title={(d) => ID_DOCUMENT_LABELS[d.type]}
        columns={[
          ['pièce', (d) => <span className="hi">{ID_DOCUMENT_LABELS[d.type]}</span>],
          ['numéro', (d) => d.number || '—'],
          ['délivrée le', (d) => frDate(d.issued)],
          ['expire le', (d) => frDate(d.expires)]
        ]}
        spec={[
          { key: 'type', label: 'pièce', type: 'select', options: ID_DOCUMENT_LABELS },
          { key: 'number', label: 'numéro' },
          { key: 'issued', label: 'délivrée le', type: 'date' },
          { key: 'expires', label: 'expire le', type: 'date' }
        ]}
        empty={{ id: '', type: 'id_card', number: '', issued: '', expires: '', holder: 'me' }}
        onSave={(document) => save({ type: 'idDocument', document })}
        onDelete={(id) => save({ type: 'deleteIdDocument', id })}
      />
    </>
  )
}

/** Réglages › Coordonnées: where the user lives (its commune is all services know of it), and how to reach them. */
export function ContactPane() {
  const profile = useProfile()
  const { save, error } = useSave()
  if (!profile) return null
  const p = profile.person
  const a = profile.address
  const person = (patch: Partial<Person>) => save({ type: 'person', patch })
  return (
    <>
      <div className="form-grid">
        <Field label="adresse" wide hint="tapez-en le début : les suggestions viennent de la Base adresse nationale">
          <AddressField
            value={addressLine(a)}
            onPick={(h) =>
              save({ type: 'address', address: { ...a, street: h.street, postcode: h.postcode, city: h.city, inseeCode: h.inseeCode, lat: h.lat, lon: h.lon } })
            }
          />
        </Field>
        <Field label="complément d’adresse">
          <Text value={a.complement} onSave={(complement) => save({ type: 'address', address: { ...a, complement } })} placeholder="bâtiment, étage…" />
        </Field>
        <Field label="à cette adresse depuis le">
          <Text type="date" value={a.since} onSave={(since) => save({ type: 'address', address: { ...a, since } })} />
        </Field>
        <Field label="téléphone">
          <Text value={p.phone} format={formatPhone} onSave={(v) => person({ phone: compact(v) })} placeholder="__ __ __ __ __" />
        </Field>
        <Field label="courriel">
          <Text type="email" value={p.email} onSave={(email) => person({ email })} />
        </Field>
      </div>
      {error && <p className="bad small">{error}</p>}
    </>
  )
}

/** Réglages › Banque et paiement, its first part: the account the user is paid on. */
export function IbanField() {
  const profile = useProfile()
  const { save, error } = useSave()
  if (!profile) return null
  return (
    <>
      <div className="form-grid">
        <Field label="IBAN" wide hint="le compte où vous recevez vos remboursements et vos aides">
          <Text
            value={profile.person.iban}
            format={(v) => groups(v.toUpperCase(), 4)}
            onSave={(v) => save({ type: 'person', patch: { iban: compact(v).toUpperCase() } })}
            placeholder="FR76 ____ ____ ____ ____ ____ ___"
          />
        </Field>
      </div>
      {error && <p className="bad small">{error}</p>}
    </>
  )
}

/** Réglages › Notes pour Marianne: what helps her answer better, in every folder. */
export function NotesPane() {
  const profile = useProfile()
  const { save, error } = useSave()
  if (!profile) return null
  return (
    <>
      <div className="form-grid">
        <Field label="notes pour Marianne" wide hint="par exemple « je vois mal » ou « je travaille de nuit »">
          <textarea
            className="notes"
            defaultValue={profile.notes}
            onBlur={(e) => e.target.value !== profile.notes && save({ type: 'notes', notes: e.target.value })}
          />
        </Field>
      </div>
      {error && <p className="bad small">{error}</p>}
    </>
  )
}

/** How this account shows on the lock screen (Réglages › Comptes): its initials, its first name, or its random id alone. */
export function LockScreenChoice() {
  const { settings, setSettings } = useApp()
  const display = async (choice: DisplayChoice) => {
    await setSettings({ display: choice })
    await api.setDisplay(choice)
  }
  return (
    <span className="row-flex" style={{ gap: 16 }}>
      {(
        [
          ['initials', 'initiales'],
          ['firstName', 'prénom'],
          ['none', 'identifiant']
        ] as Array<[DisplayChoice, string]>
      ).map(([k, label]) => (
        <label key={k}>
          <input type="radio" checked={settings?.display === k} onChange={() => void display(k)} /> {label}
        </label>
      ))}
    </span>
  )
}

// ---------------------------------------------------------------- lists of records

type Spec = Array<{ key: string; label: string; type?: 'date' | 'select' | 'check'; options?: Record<string, string> }>
type Column<T> = [label: string, cell: (x: T) => ReactNode]

/**
 * A list of records: its head with its own « + ajouter … », a table of them, and the form of one in a
 * dialog (added or changed). `top` goes above the form: a way to fill it (a company's SIREN).
 */
function RecordList<T extends { id: string }>({
  label,
  noun,
  none,
  items,
  title,
  columns,
  spec,
  empty,
  top,
  onSave,
  onDelete
}: {
  label: string
  /** What « + ajouter » adds: « un employeur ». */
  noun: string
  /** The list empty: « aucun employeur ». */
  none: string
  items: T[]
  title: (x: T) => string
  columns: Array<Column<T>>
  spec: Spec
  empty: T
  top?: (draft: T, set: (draft: T) => void) => ReactNode
  onSave: (x: T) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState<{ draft: T; isNew: boolean } | null>(null)
  const remove = (x: T) => confirm(`Supprimer « ${title(x)} » ?`) && onDelete(x.id)
  return (
    <>
      <ListHead label={label} count={items.length}>
        <button className="btn small" onClick={() => setEditing({ draft: { ...empty, id: newKey() }, isNew: true })}>
          + ajouter {noun}
        </button>
      </ListHead>
      {items.length ? (
        <div className="table-wrap">
          <table className="stable">
            <thead>
              <tr>
                {columns.map(([l]) => (
                  <th key={l}>{l}</th>
                ))}
                <th>
                  <span className="sr-only">actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id} onClick={() => setEditing({ draft: x, isNew: false })}>
                  {columns.map(([l, cell]) => (
                    <td key={l}>{cell(x)}</td>
                  ))}
                  <td className="r" onClick={(e) => e.stopPropagation()}>
                    <RowActions name={title(x)} onEdit={() => setEditing({ draft: x, isNew: false })} onDelete={() => remove(x)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small dim empty">{none}</p>
      )}
      {editing && (
        <RecordDialog
          title={editing.isNew ? `ajouter ${noun}` : title(editing.draft)}
          draft={editing.draft}
          spec={spec}
          top={top}
          onClose={() => setEditing(null)}
          onSave={(x) => (onSave(x), setEditing(null))}
          onDelete={editing.isNew ? undefined : () => (remove(editing.draft), setEditing(null))}
        />
      )}
    </>
  )
}

function RecordDialog<T extends { id: string }>({
  title,
  draft: initial,
  spec,
  top,
  onClose,
  onSave,
  onDelete
}: {
  title: string
  draft: T
  spec: Spec
  top?: (draft: T, set: (draft: T) => void) => ReactNode
  onClose: () => void
  onSave: (x: T) => void
  onDelete?: () => void
}) {
  const [draft, setDraft] = useState(initial)
  return (
    <FormDialog
      title={title}
      onClose={onClose}
      aside={
        onDelete && (
          <button className="btn danger" onClick={onDelete}>
            supprimer
          </button>
        )
      }
      actions={
        <>
          <button className="btn" onClick={onClose}>
            annuler
          </button>
          <button className="btn primary" onClick={() => onSave(draft)}>
            enregistrer
          </button>
        </>
      }
    >
      {top?.(draft, setDraft)}
      <div className="form-grid">
        {spec.map((s) => {
          const value = (draft as Record<string, unknown>)[s.key]
          const set = (v: unknown) => setDraft({ ...draft, [s.key]: v })
          if (s.type === 'check')
            return (
              <label key={s.key} className="check-field">
                <input type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} /> {s.label}
              </label>
            )
          return (
            <Field key={s.key} label={s.label}>
              {s.type === 'select' ? (
                <select value={String(value ?? '')} onChange={(e) => set(e.target.value)}>
                  {Object.entries(s.options!).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <input type={s.type ?? 'text'} value={String(value ?? '')} onChange={(e) => set(e.target.value)} />
              )}
            </Field>
          )
        })}
      </div>
    </FormDialog>
  )
}

/** Réglages › Foyer: the people of the user's household. */
export function HouseholdPane() {
  const profile = useProfile()
  const { save, error } = useSave()
  if (!profile) return null
  const name = (m: HouseholdMember) => `${m.firstName} ${m.lastName}`.trim() || RELATION_LABELS[m.relation]
  return (
    <>
      <RecordList<HouseholdMember>
        label="les personnes de votre foyer"
        noun="une personne"
        none="personne d’autre dans votre foyer"
        items={profile.household}
        title={name}
        columns={[
          ['personne', (m) => <span className="hi">{name(m)}</span>],
          ['lien avec vous', (m) => RELATION_LABELS[m.relation]],
          ['né(e) le', (m) => frDate(m.birthDate)],
          ['à charge', (m) => (m.dependent ? 'oui' : 'non')]
        ]}
        spec={[
          { key: 'firstName', label: 'prénom' },
          { key: 'lastName', label: 'nom' },
          { key: 'relation', label: 'lien avec vous', type: 'select', options: RELATION_LABELS },
          { key: 'birthDate', label: 'date de naissance', type: 'date' },
          { key: 'dependent', label: 'à charge', type: 'check' }
        ]}
        empty={{ id: '', relation: 'child', firstName: '', lastName: '', birthDate: '', dependent: true }}
        onSave={(member) => save({ type: 'member', member })}
        onDelete={(id) => save({ type: 'deleteMember', id })}
      />
      {error && <p className="bad small">{error}</p>}
    </>
  )
}

/** A company's SIREN, at the top of its form: typed, or found in the Annuaire des entreprises, which fills the rest. */
function SirenFill({ draft, set }: { draft: Company; set: (c: Company) => void }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const digits = draft.siren.replace(/\D/g, '')
  const fill = async () => {
    setBusy(true)
    try {
      const c = await api.lookupSiren(digits)
      if (!c) return setMessage('aucune entreprise ne porte ce numéro')
      set({
        ...draft,
        siren: c.siren,
        name: c.name,
        legalForm: c.legalForm,
        activity: c.activity,
        created: c.created,
        address: c.address,
        role: c.individual ? 'entrepreneur' : 'director',
        regime: c.association ? 'association' : c.individual ? 'micro' : 'corporate_tax'
      })
      setMessage(`${c.name} : la fiche est remplie, vérifiez-la`)
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="siren-fill">
      <Field label="SIREN" hint={message || '« remplir » : Marianne remplit la fiche depuis l’Annuaire des entreprises'}>
        <span className="row-flex" style={{ gap: 8 }}>
          <input value={draft.siren} placeholder="___ ___ ___" style={{ width: 160 }} onChange={(e) => set({ ...draft, siren: e.target.value })} />
          <button className="btn small" disabled={digits.length !== 9 || busy} aria-busy={busy} onClick={() => void fill()}>
            remplir
          </button>
        </span>
      </Field>
    </div>
  )
}

const EMPTY_ENTITY: Record<EntityKind, Record<string, string>> = {
  companies: {
    siren: '',
    name: '',
    legalForm: '',
    activity: '',
    created: '',
    address: '',
    role: 'director',
    regime: 'micro',
    frequency: '',
    vat: '',
    yearEnd: ''
  },
  employers: { name: '', siren: '', position: '', contract: 'permanent', start: '', end: '', idcc: '' },
  vehicles: { plate: '', model: '', firstRegistration: '', lastInspection: '', critair: '' },
  properties: { address: '', inseeCode: '', use: 'main_home', status: 'tenant', rent: '', leaseStart: '', landlord: '' }
}

type Entity = Record<string, string> & { id: string }

/** Each kind of entity: its list's words, its columns, its form. */
const ENTITIES: Record<EntityKind, { label: string; noun: string; none: string; title: (x: Entity) => string; columns: Array<Column<Entity>>; spec: Spec }> = {
  employers: {
    label: 'employeurs',
    noun: 'un employeur',
    none: 'aucun employeur',
    title: (x) => x.name || 'employeur',
    columns: [
      ['employeur', (x) => <span className="hi">{x.name || '—'}</span>],
      ['SIREN', (x) => x.siren || '—'],
      ['poste', (x) => x.position || '—'],
      ['contrat', (x) => CONTRACT_LABELS[x.contract as keyof typeof CONTRACT_LABELS] ?? '—'],
      ['depuis le', (x) => frDate(x.start)]
    ],
    spec: [
      { key: 'name', label: 'nom' },
      { key: 'siren', label: 'SIREN' },
      { key: 'position', label: 'poste' },
      { key: 'contract', label: 'contrat', type: 'select', options: CONTRACT_LABELS },
      { key: 'start', label: 'début', type: 'date' },
      { key: 'idcc', label: 'convention collective (IDCC)' }
    ]
  },
  companies: {
    label: 'entreprises et associations',
    noun: 'une entreprise',
    none: 'aucune entreprise ni association',
    title: (x) => x.name || 'entreprise',
    columns: [
      ['entreprise', (x) => <span className="hi">{x.name || '—'}</span>],
      ['SIREN', (x) => x.siren || '—'],
      ['rôle', (x) => ROLE_LABELS[x.role as keyof typeof ROLE_LABELS] ?? '—'],
      ['régime', (x) => REGIME_LABELS[x.regime as keyof typeof REGIME_LABELS] ?? '—'],
      ['clôture', (x) => x.yearEnd || '—']
    ],
    // Its SIREN is at the top of the form (SirenFill), with the way to fill the rest from it.
    spec: [
      { key: 'name', label: 'dénomination' },
      { key: 'role', label: 'rôle', type: 'select', options: ROLE_LABELS },
      { key: 'regime', label: 'régime', type: 'select', options: REGIME_LABELS },
      { key: 'yearEnd', label: 'clôture de l’exercice (JJ/MM)' }
    ]
  },
  properties: {
    label: 'logements',
    noun: 'un logement',
    none: 'aucun logement',
    title: (x) => x.address || 'logement',
    columns: [
      ['adresse', (x) => <span className="hi">{x.address || '—'}</span>],
      ['usage', (x) => PROPERTY_USE_LABELS[x.use as keyof typeof PROPERTY_USE_LABELS] ?? '—'],
      ['statut', (x) => PROPERTY_STATUS_LABELS[x.status as keyof typeof PROPERTY_STATUS_LABELS] ?? '—'],
      ['loyer', (x) => x.rent || '—'],
      ['début du bail', (x) => frDate(x.leaseStart)]
    ],
    spec: [
      { key: 'address', label: 'adresse' },
      { key: 'use', label: 'usage', type: 'select', options: PROPERTY_USE_LABELS },
      { key: 'status', label: 'statut', type: 'select', options: PROPERTY_STATUS_LABELS },
      { key: 'rent', label: 'loyer' },
      { key: 'leaseStart', label: 'début du bail', type: 'date' }
    ]
  },
  vehicles: {
    label: 'véhicules',
    noun: 'un véhicule',
    none: 'aucun véhicule',
    title: (x) => x.plate || x.model || 'véhicule',
    columns: [
      ['immatriculation', (x) => <span className="hi">{x.plate || '—'}</span>],
      ['modèle', (x) => x.model || '—'],
      ['1ʳᵉ immatriculation', (x) => frDate(x.firstRegistration)],
      ['contrôle technique', (x) => frDate(x.lastInspection)]
    ],
    spec: [
      { key: 'plate', label: 'immatriculation' },
      { key: 'model', label: 'modèle' },
      { key: 'firstRegistration', label: '1ʳᵉ immatriculation', type: 'date' },
      { key: 'lastInspection', label: 'dernier contrôle technique', type: 'date' }
    ]
  }
}

/** Réglages › Activités et biens: employers, companies and associations, homes, vehicles, each its own list. */
export function AssetsPane() {
  const profile = useProfile()
  const { save, error } = useSave()
  if (!profile) return null
  return (
    <>
      {(['employers', 'companies', 'properties', 'vehicles'] as EntityKind[]).map((kind) => {
        const e = ENTITIES[kind]
        return (
          <RecordList<Entity>
            key={kind}
            label={e.label}
            noun={e.noun}
            none={e.none}
            items={profile[kind] as unknown as Entity[]}
            title={e.title}
            columns={e.columns}
            spec={e.spec}
            empty={{ ...EMPTY_ENTITY[kind], id: '' }}
            top={kind === 'companies' ? (draft, set) => <SirenFill draft={draft as unknown as Company} set={(c) => set(c as unknown as Entity)} /> : undefined}
            onSave={(item) => save({ type: 'entity', kind, item } as unknown as ProfileOp)}
            onDelete={(id) => save({ type: 'deleteEntity', kind, id })}
          />
        )
      })}
      {error && <p className="bad small">{error}</p>}
    </>
  )
}

// ---------------------------------------------------------------- documents

/**
 * Réglages › Documents: every document of the archive, those of the folders and their conversations
 * too, with their folder and what they are about. A search, and filters: where they are, their domain.
 */
export function DocumentsPane() {
  const documents = useDocuments()
  const profile = useProfile()
  const app = useApp()
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState<DocumentPlace>('all')
  const [domain, setDomain] = useState('all')
  const [error, setError] = useState('')
  const add = () => void api.addDocuments({ domain: 'identity' }).catch((err) => setError(errorText(err)))
  const folderTitle = (id?: string) => (id ? app.folders.find((f) => f.id === id)?.title : undefined)
  const linked = (id: string) => {
    if (!id || !profile) return undefined
    for (const kind of ['vehicles', 'properties', 'employers', 'companies'] as EntityKind[]) {
      const x = (profile[kind] as unknown as Entity[]).find((e) => e.id === id)
      if (x) return ENTITIES[kind].title(x)
    }
    return undefined
  }
  const words = documentWords((d) => [folderTitle(d.folderId), linked(d.entity)])
  const shown = filterDocuments(documents, { query, place, domain }, words)
  const inFolder = documents.filter((d) => d.folderId).length
  const used = DOMAINS.filter((d) => documents.some((x) => x.domain === d.id))
  const openFolder = (id: string) => {
    app.openSettings(null)
    app.go({ kind: 'folder', id })
  }
  return (
    <>
      <ListHead label="pièces" count={`${documents.length} · ${bytes(documents.reduce((n, d) => n + d.size, 0))}`}>
        <button className="btn small" onClick={add}>
          + ajouter des pièces
        </button>
      </ListHead>
      <div className="list-tools">
        <SearchField className="framed" value={query} onChange={setQuery} placeholder="chercher une pièce, un dossier…" />
        <Filter<DocumentPlace>
          label="où"
          value={place}
          onChange={setPlace}
          options={[
            ['all', `toutes ${documents.length}`],
            ['folder', `dans un dossier ${inFolder}`],
            ['loose', `hors dossier ${documents.length - inFolder}`]
          ]}
        />
        <select value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="domaine">
          <option value="all">tous les domaines</option>
          {used.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      {shown.length ? (
        <div className="table-wrap">
          <table className="stable fixed">
            <thead>
              <tr>
                <th>pièce</th>
                <th style={{ width: 150 }}>domaine</th>
                <th style={{ width: '14%' }}>liée à</th>
                <th style={{ width: '20%' }}>dossier</th>
                <th style={{ width: 96 }}>date</th>
                <th className="r" style={{ width: 72 }}>
                  taille
                </th>
                <th style={{ width: 78 }}>
                  <span className="sr-only">actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => {
                const folder = folderTitle(d.folderId)
                const about = linked(d.entity)
                const badge = DOMAINS.find((x) => x.id === d.domain)?.badge ?? '··'
                return (
                  <tr key={d.id} onClick={() => void api.openDocument(d.id)}>
                    <td>
                      <span className="stack" style={{ gap: 2 }}>
                        <span className="link ell">{d.title}</span>
                        <span className="small muted ell">
                          {DOCUMENT_TYPE_LABELS[d.type]} · {d.fileName}
                        </span>
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <span className="nowrap">
                        <span className="badge">{badge}</span>
                        <select
                          className="bare"
                          value={d.domain}
                          aria-label={`domaine de ${d.title}`}
                          onChange={(e) => void api.updateDocument(d.id, { domain: e.target.value as typeof d.domain })}
                        >
                          {DOMAINS.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </span>
                    </td>
                    <td>{about ? <span className="ell">{about}</span> : <span className="muted">—</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {folder && d.folderId ? (
                        <button className="link ell" title={`ouvrir le dossier « ${folder} »`} onClick={() => openFolder(d.folderId!)}>
                          {folder}
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{frDate(d.date) === '—' ? frDate(d.addedAt.slice(0, 10)) : frDate(d.date)}</td>
                    <td className="r">{bytes(d.size)}</td>
                    <td className="r" onClick={(e) => e.stopPropagation()}>
                      <span className="row-acts">
                        <button className="icon-btn" title="exporter" aria-label={`exporter ${d.title}`} onClick={() => void api.exportDocument(d.id)}>
                          ⇩
                        </button>
                        <button
                          className="icon-btn"
                          title="supprimer de l’archive"
                          aria-label={`supprimer ${d.title} de l’archive`}
                          onClick={() => confirm(`Supprimer « ${d.title} » de l’archive ?`) && void api.deleteDocument(d.id)}
                        >
                          ✕
                        </button>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small dim empty">{documents.length ? 'Aucune pièce ne correspond.' : 'Aucune pièce pour l’instant.'}</p>
      )}
      <p className="small list-foot">
        <button className="link" onClick={() => app.openSettings('space')}>
          place et sauvegarde ›
        </button>
      </p>
      {error && <p className="bad small">{error}</p>}
    </>
  )
}
