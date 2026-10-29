import {
  CIVILITY_LABELS,
  CONTRACT_LABELS,
  DOMAINS,
  FAMILY_STATUS_LABELS,
  FREQUENCY_LABELS,
  frDate,
  ID_DOCUMENT_LABELS,
  monthDay,
  newKey,
  nirValid,
  PROPERTY_STATUS_LABELS,
  PROPERTY_USE_LABELS,
  REGIME_LABELS,
  RELATION_LABELS,
  ROLE_LABELS,
  sirenValid,
  VAT_LABELS,
  WORK_STATUS_LABELS,
  type Address,
  type Company,
  type Employer,
  type EntityKind,
  type HouseholdMember,
  type IdDocument,
  type ManualDeadline,
  type Profile,
  type ProfileOp,
  type Property,
  type Vehicle
} from '@marianne/profile'
import type { Site } from '../../shared/sites'
import type { DomainId } from '../../shared/types'
import { fold, ToolError } from './tool'

/**
 * What the engine may propose to change in the profile, and how each change shows on the card
 * the user accepts or refuses: real values, French labels. Pure: the tool asks and applies.
 */

export type ProposalKind = 'deadline' | 'company' | 'employer' | 'vehicle' | 'property' | 'id_document' | 'account' | 'person' | 'address' | 'household_member'
export type Operation = 'add' | 'update' | 'delete'

interface Field {
  label: string
  /** Allowed values, with their labels. */
  options?: Record<string, string>
  kind?: 'date' | 'monthDay' | 'boolean' | 'nir' | 'siren'
}

interface Spec {
  /** What the card is about: "une entreprise". */
  noun: string
  fields: Record<string, Field>
  required: string[]
  entity?: EntityKind
}

export interface Plan {
  op: ProfileOp
  title: string
  fields: Array<{ label: string; value: string }>
}

const text = (label: string): Field => ({ label })
const date = (label: string): Field => ({ label, kind: 'date' })
const choice = (label: string, options: Record<string, string>, optional = false): Field => ({
  label,
  options: optional ? { '': 'non renseigné', ...options } : options
})

export const PROPOSALS: Record<ProposalKind, Spec> = {
  deadline: {
    noun: 'une échéance',
    fields: {
      title: text('intitulé'),
      date: date('date'),
      domain: choice('domaine', Object.fromEntries(DOMAINS.map((d) => [d.id, d.label]))),
      note: text('note')
    },
    required: ['title', 'date', 'domain']
  },
  company: {
    noun: 'une entreprise',
    entity: 'companies',
    fields: {
      siren: { label: 'siren', kind: 'siren' },
      name: text('nom'),
      legalForm: text('forme juridique'),
      activity: text('activité'),
      created: date('création'),
      address: text('adresse'),
      role: choice('rôle', ROLE_LABELS),
      regime: choice('régime', REGIME_LABELS),
      frequency: choice('déclarations urssaf', FREQUENCY_LABELS, true),
      vat: choice('tva', VAT_LABELS, true),
      yearEnd: { label: 'clôture de l’exercice', kind: 'monthDay' }
    },
    required: ['siren']
  },
  employer: {
    noun: 'un employeur',
    entity: 'employers',
    fields: {
      name: text('nom'),
      siren: { label: 'siren', kind: 'siren' },
      position: text('poste'),
      contract: choice('contrat', CONTRACT_LABELS),
      start: date('début'),
      end: date('fin'),
      idcc: text('convention collective (idcc)')
    },
    required: ['name']
  },
  vehicle: {
    noun: 'un véhicule',
    entity: 'vehicles',
    fields: {
      plate: text('immatriculation'),
      model: text('modèle'),
      firstRegistration: date('1re immatriculation'),
      lastInspection: date('dernier contrôle technique'),
      critair: text('crit’air')
    },
    required: ['plate']
  },
  property: {
    noun: 'un logement',
    entity: 'properties',
    fields: {
      address: text('adresse'),
      inseeCode: text('code insee'),
      use: choice('usage', PROPERTY_USE_LABELS),
      status: choice('statut', PROPERTY_STATUS_LABELS),
      rent: text('loyer'),
      leaseStart: date('début du bail'),
      landlord: text('bailleur')
    },
    required: ['address']
  },
  id_document: {
    noun: 'une pièce d’identité',
    fields: {
      type: choice('type', ID_DOCUMENT_LABELS),
      number: text('numéro'),
      issued: date('délivrée le'),
      expires: date('valable jusqu’au'),
      holder: text('titulaire')
    },
    required: ['type']
  },
  account: { noun: 'un compte', fields: { siteId: text('site') }, required: ['siteId'] },
  person: {
    noun: 'votre identité',
    fields: {
      civility: choice('civilité', CIVILITY_LABELS, true),
      birthName: text('nom de naissance'),
      usedName: text('nom d’usage'),
      firstNames: text('prénoms'),
      birthDate: date('date de naissance'),
      birthPlace: text('lieu de naissance'),
      birthCountry: text('pays de naissance'),
      nationality: text('nationalité'),
      nir: { label: 'numéro de sécurité sociale', kind: 'nir' },
      iban: text('iban'),
      familyStatus: choice('situation familiale', FAMILY_STATUS_LABELS, true),
      workStatus: choice('situation professionnelle', WORK_STATUS_LABELS, true),
      phone: text('téléphone'),
      email: text('courriel')
    },
    required: []
  },
  address: {
    noun: 'votre adresse',
    fields: {
      street: text('numéro et rue'),
      complement: text('complément'),
      postcode: text('code postal'),
      city: text('commune'),
      inseeCode: text('code insee'),
      since: date('depuis')
    },
    required: ['street', 'postcode', 'city']
  },
  household_member: {
    noun: 'un membre du foyer',
    fields: {
      relation: choice('lien', RELATION_LABELS),
      firstName: text('prénom'),
      lastName: text('nom'),
      birthDate: date('date de naissance'),
      dependent: { label: 'à charge', kind: 'boolean' }
    },
    required: ['relation', 'firstName']
  }
}

const EMPTY_ENTITY: { companies: Omit<Company, 'id'>; employers: Omit<Employer, 'id'>; vehicles: Omit<Vehicle, 'id'>; properties: Omit<Property, 'id'> } = {
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
    yearEnd: '12-31'
  },
  employers: { name: '', siren: '', position: '', contract: 'permanent', start: '', end: '', idcc: '' },
  vehicles: { plate: '', model: '', firstRegistration: '', lastInspection: '', critair: '' },
  properties: { address: '', inseeCode: '', use: 'main_home', status: 'tenant', rent: '', leaseStart: '', landlord: '' }
}

const pad = (n: number | string) => String(n).padStart(2, '0')
const BOOLEAN: Record<string, string> = { true: 'true', oui: 'true', yes: 'true', '1': 'true', false: 'false', non: 'false', no: 'false', '0': 'false' }

/** Values as the profile stores them: dates YYYY-MM-DD (dd/mm/yyyy accepted), year ends MM-DD, booleans "true" or "false". */
export function normalizeValues(kind: ProposalKind, data: Record<string, string>): Record<string, string> {
  const fields = PROPOSALS[kind].fields
  const out = { ...data }
  for (const [key, value] of Object.entries(out)) {
    const field = fields[key]
    const fr = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (field?.kind === 'date' && fr) out[key] = `${fr[3]}-${pad(fr[2])}-${pad(fr[1])}`
    if (field?.kind === 'boolean' && value) out[key] = BOOLEAN[value.toLowerCase()] ?? value
    if (field?.kind === 'monthDay' && value) {
      const md = monthDay(value)
      if (!md) throw new ToolError(`Invalid year end « ${value} »: MM-DD expected (31 December: 12-31).`)
      out[key] = `${pad(md[0])}-${pad(md[1])}`
    }
  }
  return out
}

/** The values allowed; `full`: the required fields must be there. */
function check(kind: ProposalKind, data: Record<string, string>, full: boolean): void {
  const fields = PROPOSALS[kind].fields
  if (full) for (const key of PROPOSALS[kind].required) if (!data[key]?.trim()) throw new ToolError(`Missing required field for ${kind}: ${key}`)
  for (const [key, value] of Object.entries(data)) {
    const field = fields[key]
    if (!field || !value) continue
    if (field.options && !(value in field.options))
      throw new ToolError(`Invalid value for ${key}: « ${value} ». Values: ${Object.keys(field.options).filter(Boolean).join(', ')}`)
    if (field.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ToolError(`Invalid date for ${key}: YYYY-MM-DD expected.`)
    if (field.kind === 'boolean' && !['true', 'false'].includes(value)) throw new ToolError(`Invalid value for ${key}: true or false.`)
    if (field.kind === 'nir' && !nirValid(value)) throw new ToolError('Invalid social security number (15 characters, key included).')
    if (field.kind === 'siren' && !sirenValid(value)) throw new ToolError(`Invalid SIREN for ${kind}: 9 digits expected, with a valid check digit.`)
  }
}

/** A value as the card shows it. */
function shown(field: Field, value: string): string {
  if (field.options) return field.options[value] ?? value
  if (field.kind === 'date') return frDate(value)
  if (field.kind === 'boolean') return value === 'true' ? 'oui' : 'non'
  return value
}

/** The non-empty values of `data`, with their labels. */
function rows(fields: Record<string, Field>, data: object): Plan['fields'] {
  return Object.entries(data)
    .filter(([key, value]) => fields[key] && String(value ?? '').trim())
    .map(([key, value]) => ({ label: fields[key].label, value: shown(fields[key], String(value)) }))
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const VERBS: Record<Operation, string> = { add: 'ajouter', update: 'modifier', delete: 'supprimer' }
const strings = (o: object) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v ?? '')]))

/** Where the address of the change was found (Base adresse nationale), when it was. */
export interface Place {
  inseeCode: string
  lat: number
  lon: number
}

/**
 * The operation to apply, and what the card shows. Throws a ToolError when the change can't be
 * made (unknown field or id, invalid value): planned again on the profile of the moment the
 * user accepts, since they may have changed it while the card waited.
 */
export function plan(
  kind: ProposalKind,
  operation: Operation,
  id: string | undefined,
  data: Record<string, string>,
  p: Profile,
  sites: Site[],
  place?: Place
): Plan {
  const spec = PROPOSALS[kind]
  const site = kind === 'account' ? sites.find((s) => s.id === data.siteId) : undefined
  if (kind === 'account' && !site) throw new ToolError(`Unknown site: ${data.siteId ?? '(missing siteId)'}. Use a site id from public_sites.`)
  const fields: Record<string, Field> = { ...spec.fields, ...Object.fromEntries((site?.fields ?? []).map((f) => [f.key, { label: f.label }])) }
  const unknown = Object.keys(data).filter((k) => !fields[k])
  if (unknown.length) throw new ToolError(`Unknown fields for ${kind}: ${unknown.join(', ')}. Fields: ${Object.keys(fields).join(', ')}`)
  const title = capital(`${VERBS[operation]} ${spec.noun}`)
  const ids = (list: Array<{ id: string }>) => list.map((x) => x.id).join(', ') || 'none'
  const existingIn = <T extends { id: string }>(list: T[]): T | undefined => {
    const found = id ? list.find((x) => x.id === id) : undefined
    if (operation !== 'add' && !found) throw new ToolError(`No ${kind} with id ${id ?? '(missing id)'}. Ids: ${ids(list)}`)
    return found
  }

  switch (kind) {
    case 'company':
    case 'employer':
    case 'vehicle':
    case 'property': {
      const entity = spec.entity!
      const existing = existingIn(p[entity] as Array<{ id: string }>)
      if (operation === 'delete') return { op: { type: 'deleteEntity', kind: entity, id: existing!.id }, title, fields: rows(fields, existing!) }
      check(kind, data, operation === 'add')
      const item = { ...EMPTY_ENTITY[entity], ...existing, ...data, id: existing?.id ?? newKey() }
      return { op: { type: 'entity', kind: entity, item } as ProfileOp, title, fields: rows(fields, data) }
    }
    case 'deadline': {
      const existing = existingIn(p.deadlines)
      if (operation === 'delete') return { op: { type: 'deleteDeadline', id: existing!.id }, title, fields: rows(fields, existing!) }
      const merged = { ...(existing ? strings(existing) : {}), ...data }
      check(kind, merged, true)
      const deadline: ManualDeadline = {
        id: existing?.id ?? newKey(),
        title: merged.title,
        date: merged.date,
        domain: merged.domain as DomainId,
        note: merged.note ?? '',
        source: existing?.source ?? 'agent'
      }
      return { op: { type: 'deadline', deadline }, title, fields: rows(fields, data) }
    }
    case 'id_document': {
      const existing = existingIn(p.idDocuments)
      const holder = (h: string) => (h === 'me' ? 'vous' : (p.household.find((m) => m.id === h)?.firstName ?? h))
      const card = (d: Record<string, string>) => rows(fields, { ...d, holder: d.holder ? holder(d.holder) : '' })
      if (operation === 'delete') return { op: { type: 'deleteIdDocument', id: existing!.id }, title, fields: card(strings(existing!)) }
      check(kind, data, operation === 'add')
      if (data.holder && data.holder !== 'me' && !p.household.some((m) => m.id === data.holder))
        throw new ToolError(`Unknown holder: ${data.holder}. "me", or a household member id: ${ids(p.household)}`)
      const document = { type: 'id_card', number: '', issued: '', expires: '', holder: 'me', ...existing, ...data, id: existing?.id ?? newKey() } as IdDocument
      return { op: { type: 'idDocument', document }, title, fields: card(data) }
    }
    case 'account': {
      const s = site as Site
      const current = p.accounts.find((a) => a.siteId === s.id)
      if (operation === 'delete') {
        if (!current) throw new ToolError(`No account for ${s.name} in the profile.`)
        return { op: { type: 'deleteAccount', siteId: s.id }, title: `Retirer votre compte ${s.name}`, fields: [] }
      }
      const { siteId: _siteId, ...values } = data
      for (const f of s.fields ?? []) {
        const value = values[f.key]?.replace(/\s+/g, '')
        if (value && f.pattern && !new RegExp(`^(?:${f.pattern})$`).test(value)) throw new ToolError(`Invalid ${f.label} for ${s.name}.`)
      }
      return {
        op: { type: 'account', account: { siteId: s.id, fields: { ...current?.fields, ...values }, since: current?.since ?? '' } },
        title: `Configurer votre compte ${s.name}`,
        fields: rows(fields, values)
      }
    }
    case 'person':
      if (operation !== 'update') throw new ToolError('The identity can only be updated.')
      check(kind, data, false)
      return { op: { type: 'person', patch: data }, title, fields: rows(fields, data) }
    case 'address': {
      if (operation !== 'update') throw new ToolError('The address can only be updated.')
      check(kind, data, true)
      // Elsewhere: the INSEE code and the coordinates of the old address no longer apply.
      const moved = data.postcode !== p.address.postcode || fold(data.city) !== fold(p.address.city)
      const relocated = moved || data.street !== p.address.street
      const address: Address = {
        ...p.address,
        ...(moved ? { inseeCode: '' } : {}),
        ...(relocated ? { lat: undefined, lon: undefined } : {}),
        ...data,
        ...(place ? { inseeCode: data.inseeCode || place.inseeCode, lat: place.lat, lon: place.lon } : {})
      }
      return { op: { type: 'address', address }, title, fields: rows(fields, { ...data, inseeCode: address.inseeCode }) }
    }
    case 'household_member': {
      const existing = existingIn(p.household)
      if (operation === 'delete')
        return {
          op: { type: 'deleteMember', id: existing!.id },
          title,
          fields: [{ label: 'membre', value: `${RELATION_LABELS[existing!.relation]} ${existing!.firstName}`.trim() }]
        }
      check(kind, data, operation === 'add')
      const { dependent, ...rest } = data
      const member: HouseholdMember = {
        id: existing?.id ?? newKey(),
        relation: 'child',
        firstName: '',
        lastName: '',
        birthDate: '',
        ...existing,
        ...(rest as Partial<HouseholdMember>),
        dependent: dependent ? dependent === 'true' : (existing?.dependent ?? false)
      }
      return { op: { type: 'member', member }, title, fields: rows(fields, data) }
    }
  }
}

/** The id an operation gives or keeps, for the engine to refer to it later. */
export function opId(op: ProfileOp): string {
  switch (op.type) {
    case 'entity':
      return op.item.id
    case 'deadline':
      return op.deadline.id
    case 'idDocument':
      return op.document.id
    case 'member':
      return op.member.id
    default:
      return ''
  }
}
