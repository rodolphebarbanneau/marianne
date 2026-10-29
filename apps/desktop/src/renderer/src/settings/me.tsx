import { useEffect, useRef, useState } from 'react'
import type { AddressSuggestion } from '@shared/api'
import { DOMAINS } from '@shared/domains'
import {
  CIVILITY_LABELS,
  CONTRACT_LABELS,
  DOCUMENT_TYPE_LABELS,
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
} from '@shared/profile'
import type { DisplayChoice } from '@shared/types'
import { useApp } from '../app/context'
import { Field } from '../components/ui'
import { api, errorText } from '../lib/api'
import { bytes, shortDate } from '../lib/format'
import { useDocuments, useProfile } from '../lib/profile'

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
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
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

function AddressSearch({ onPick }: { onPick: (a: AddressSuggestion) => void }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<AddressSuggestion[]>([])
  useEffect(() => {
    if (query.trim().length < 4) return setHits([])
    const t = setTimeout(
      () =>
        void api
          .searchAddress(query)
          .then(setHits)
          .catch(() => setHits([])),
      250
    )
    return () => clearTimeout(t)
  }, [query])
  return (
    <div style={{ position: 'relative' }}>
      <input value={query} placeholder="commencez à taper votre adresse…" onChange={(e) => setQuery(e.target.value)} style={{ width: '100%' }} />
      {hits.length > 0 && (
        <div className="menu" style={{ top: '100%', left: 0, right: 0 }}>
          {hits.map((h) => (
            <button
              key={h.label}
              onClick={() => {
                onPick(h)
                setQuery('')
                setHits([])
              }}
            >
              {h.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function IdentityPane() {
  const profile = useProfile()
  const { settings, setSettings } = useApp()
  const { save, error } = useSave()
  if (!profile) return null
  const p = profile.person
  const a = profile.address
  const person = (patch: Partial<Person>) => save({ type: 'person', patch })
  const nirProblem = p.nir && !nirValid(p.nir) ? 'ce numéro semble incorrect, vérifiez les 15 chiffres' : undefined
  const display = async (choice: DisplayChoice) => {
    await setSettings({ display: choice })
    await api.setDisplay(choice)
  }
  return (
    <>
      <div className="note">
        Tout ce que vous saisissez ici reste dans votre archive chiffrée. Vos numéros ne sont jamais transmis au moteur, qui ne voit que des jetons à leur
        place.
      </div>
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
        <Field label="situation familiale">
          <Select value={p.familyStatus} options={FAMILY_STATUS_LABELS} onSave={(familyStatus) => person({ familyStatus })} />
        </Field>
        <Field label="situation professionnelle">
          <Select value={p.workStatus} options={WORK_STATUS_LABELS} onSave={(workStatus) => person({ workStatus })} />
        </Field>
        <Field label="nationalité">
          <Text value={p.nationality} onSave={(nationality) => person({ nationality })} />
        </Field>
        <Field
          label="adresse"
          wide
          hint={
            a.street
              ? `${a.street}${a.complement ? `, ${a.complement}` : ''}, ${a.postcode} ${a.city}`
              : 'les suggestions viennent de la Base adresse nationale'
          }
        >
          <AddressSearch
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
        <Field label="IBAN" wide hint="le compte où vous recevez vos remboursements et vos aides">
          <Text
            value={p.iban}
            format={(v) => groups(v.toUpperCase(), 4)}
            onSave={(v) => person({ iban: compact(v).toUpperCase() })}
            placeholder="FR76 ____ ____ ____ ____ ____ ___"
          />
        </Field>
        <Field label="affichage sur l’écran de verrouillage" wide hint="l’identifiant du compte est tiré au hasard et ne dit rien de vous">
          <span>
            {(
              [
                ['initials', 'initiales'],
                ['firstName', 'prénom'],
                ['none', 'identifiant']
              ] as Array<[DisplayChoice, string]>
            ).map(([k, label]) => (
              <label key={k} style={{ marginRight: 16 }}>
                <input type="radio" checked={settings?.display === k} onChange={() => void display(k)} />
                {label}
              </label>
            ))}
          </span>
        </Field>
        <Field
          label="notes pour Marianne"
          wide
          hint="ce qui l’aide à mieux vous répondre, par exemple « je vois mal » ou « je travaille de nuit ». Elle en tient compte dans tous vos dossiers."
        >
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

type Spec = Array<{ key: string; label: string; type?: 'date' | 'select'; options?: Record<string, string> }>

const ENTITY_SPECS: Record<EntityKind, { label: string; spec: Spec; title: (x: Record<string, string>) => string }> = {
  companies: {
    label: 'Entreprises et associations',
    title: (x) => x.name || 'entreprise',
    spec: [
      { key: 'siren', label: 'SIREN' },
      { key: 'name', label: 'dénomination' },
      { key: 'role', label: 'rôle', type: 'select', options: ROLE_LABELS },
      { key: 'regime', label: 'régime', type: 'select', options: REGIME_LABELS },
      { key: 'yearEnd', label: 'clôture de l’exercice (JJ/MM)' }
    ]
  },
  employers: {
    label: 'Employeurs',
    title: (x) => x.name || 'employeur',
    spec: [
      { key: 'name', label: 'nom' },
      { key: 'siren', label: 'SIREN' },
      { key: 'position', label: 'poste' },
      { key: 'contract', label: 'contrat', type: 'select', options: CONTRACT_LABELS },
      { key: 'start', label: 'début', type: 'date' },
      { key: 'idcc', label: 'convention collective (IDCC)' }
    ]
  },
  vehicles: {
    label: 'Véhicules',
    title: (x) => x.plate || x.model || 'véhicule',
    spec: [
      { key: 'plate', label: 'immatriculation' },
      { key: 'model', label: 'modèle' },
      { key: 'firstRegistration', label: '1ʳᵉ immatriculation', type: 'date' },
      { key: 'lastInspection', label: 'dernier contrôle technique', type: 'date' }
    ]
  },
  properties: {
    label: 'Logements',
    title: (x) => x.address || 'logement',
    spec: [
      { key: 'address', label: 'adresse' },
      { key: 'use', label: 'usage', type: 'select', options: PROPERTY_USE_LABELS },
      { key: 'status', label: 'statut', type: 'select', options: PROPERTY_STATUS_LABELS },
      { key: 'rent', label: 'loyer' },
      { key: 'leaseStart', label: 'début du bail', type: 'date' }
    ]
  }
}

/** A list of records with a small form for each. */
function Records<T extends { id: string }>({
  title,
  items,
  spec,
  label,
  empty,
  onSave,
  onDelete
}: {
  title: string
  items: T[]
  spec: Spec
  label: (x: T) => string
  empty: T
  onSave: (x: T) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState<T | null>(null)
  return (
    <>
      <span className="label sub">{title}</span>
      <div className="rows">
        {items.map((x) => (
          <div key={x.id} className="row">
            <span className="hi">{label(x)}</span>
            <span className="dim small">
              {spec
                .slice(1, 3)
                .map((s) => (s.options ? s.options[(x as Record<string, string>)[s.key]] : (x as Record<string, string>)[s.key]))
                .filter(Boolean)
                .join(' · ')}
            </span>
            <span>
              <button className="btn small" onClick={() => setEditing(x)}>
                modifier
              </button>{' '}
              <button className="btn small danger" onClick={() => confirm(`Supprimer « ${label(x)} » ?`) && onDelete(x.id)}>
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
      <button className="btn small" onClick={() => setEditing({ ...empty, id: newKey() })}>
        + ajouter
      </button>
      {editing && (
        <div className="inline-card">
          <div className="in">
            <div className="form-grid">
              {spec.map((s) => {
                const value = String((editing as Record<string, unknown>)[s.key] ?? '')
                const set = (v: string) => setEditing({ ...editing, [s.key]: v })
                return (
                  <Field key={s.key} label={s.label}>
                    {s.type === 'select' ? (
                      <select value={value} onChange={(e) => set(e.target.value)}>
                        {Object.entries(s.options!).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input type={s.type ?? 'text'} value={value} onChange={(e) => set(e.target.value)} />
                    )}
                  </Field>
                )
              })}
            </div>
            <div className="acts">
              <button className="btn primary" onClick={() => (onSave(editing), setEditing(null))}>
                enregistrer
              </button>
              <button className="btn" onClick={() => setEditing(null)}>
                annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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

export function HouseholdPane() {
  const profile = useProfile()
  const { save, error } = useSave()
  if (!profile) return null
  return (
    <>
      <Records<HouseholdMember>
        title="Foyer"
        items={profile.household}
        label={(m) => `${m.firstName} ${m.lastName}`.trim() || RELATION_LABELS[m.relation]}
        spec={[
          { key: 'firstName', label: 'prénom' },
          { key: 'relation', label: 'lien avec vous', type: 'select', options: RELATION_LABELS },
          { key: 'birthDate', label: 'date de naissance', type: 'date' },
          { key: 'lastName', label: 'nom' }
        ]}
        empty={{ id: '', relation: 'child', firstName: '', lastName: '', birthDate: '', dependent: true }}
        onSave={(member) => save({ type: 'member', member })}
        onDelete={(id) => save({ type: 'deleteMember', id })}
      />
      <Records<IdDocument>
        title="Pièces d’identité"
        items={profile.idDocuments}
        label={(d) => ID_DOCUMENT_LABELS[d.type]}
        spec={[
          { key: 'type', label: 'type', type: 'select', options: ID_DOCUMENT_LABELS },
          { key: 'expires', label: 'expire le', type: 'date' },
          { key: 'number', label: 'numéro' },
          { key: 'issued', label: 'délivrée le', type: 'date' }
        ]}
        empty={{ id: '', type: 'id_card', number: '', issued: '', expires: '', holder: 'me' }}
        onSave={(document) => save({ type: 'idDocument', document })}
        onDelete={(id) => save({ type: 'deleteIdDocument', id })}
      />
      {(Object.keys(ENTITY_SPECS) as EntityKind[]).map((kind) => (
        <Records
          key={kind}
          title={ENTITY_SPECS[kind].label}
          items={profile[kind] as unknown as Array<Record<string, string> & { id: string }>}
          label={(x) => ENTITY_SPECS[kind].title(x)}
          spec={ENTITY_SPECS[kind].spec}
          empty={{ ...EMPTY_ENTITY[kind], id: '' }}
          onSave={(item) => save({ type: 'entity', kind, item } as ProfileOp)}
          onDelete={(id) => save({ type: 'deleteEntity', kind, id })}
        />
      ))}
      <p className="dim small" style={{ marginTop: 12 }}>
        Vous avez un numéro SIREN ? Marianne remplit la fiche de l’entreprise pour vous : <SirenLookup />
      </p>
      {error && <p className="bad small">{error}</p>}
    </>
  )
}

/** Fill a company from its SIREN (Annuaire des entreprises). */
function SirenLookup() {
  const [siren, setSiren] = useState('')
  const [message, setMessage] = useState('')
  const add = async () => {
    try {
      const c = await api.lookupSiren(siren.replace(/\s+/g, ''))
      if (!c) return setMessage('aucune entreprise ne porte ce numéro')
      const item: Company = {
        id: newKey(),
        siren: c.siren,
        name: c.name,
        legalForm: c.legalForm,
        activity: c.activity,
        created: c.created,
        address: c.address,
        role: c.individual ? 'entrepreneur' : 'director',
        regime: c.association ? 'association' : c.individual ? 'micro' : 'corporate_tax',
        frequency: '',
        vat: '',
        yearEnd: ''
      }
      await api.updateProfile({ type: 'entity', kind: 'companies', item })
      setMessage(`${c.name} ajoutée`)
      setSiren('')
    } catch (err) {
      setMessage(errorText(err))
    }
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <input value={siren} placeholder="___ ___ ___" style={{ width: 140 }} onChange={(e) => setSiren(e.target.value)} />
      <button className="btn small" disabled={siren.replace(/\D/g, '').length !== 9} onClick={() => void add()}>
        ajouter l’entreprise
      </button>
      <span>{message}</span>
    </span>
  )
}

export function DocumentsPane() {
  const documents = useDocuments()
  const { folders } = useApp()
  const [error, setError] = useState('')
  const add = () => void api.addDocuments({ domain: 'identity' }).catch((err) => setError(errorText(err)))
  return (
    <>
      <div className="note">
        Vos pièces sont rangées dans l’archive chiffrée. Quand vous en ouvrez une, Marianne en fait une copie temporaire, effacée dès que vous verrouillez.
      </div>
      <div className="rows">
        {documents.map((d) => (
          <div key={d.id} className="row">
            <span>
              <button className="link" onClick={() => void api.openDocument(d.id)}>
                {d.title}
              </button>
              <br />
              <span className="small dim">
                {DOCUMENT_TYPE_LABELS[d.type]} · {shortDate(d.addedAt)} · {bytes(d.size)}
              </span>
            </span>
            <span className="small dim">
              <select value={d.domain} onChange={(e) => void api.updateDocument(d.id, { domain: e.target.value as typeof d.domain })}>
                {DOMAINS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>{' '}
              {d.folderId && <>· {folders.find((f) => f.id === d.folderId)?.title ?? 'dossier'}</>}
            </span>
            <span>
              <button className="btn small" onClick={() => void api.exportDocument(d.id)}>
                exporter
              </button>{' '}
              <button className="btn small danger" onClick={() => confirm(`Supprimer « ${d.title} » de l’archive ?`) && void api.deleteDocument(d.id)}>
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
      {!documents.length && <p className="dim">Aucune pièce pour l’instant.</p>}
      <button className="btn" onClick={add}>
        + ajouter des pièces
      </button>
      {error && <p className="bad small">{error}</p>}
    </>
  )
}
