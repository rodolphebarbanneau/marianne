import { departmentOf, query, type Commune, type ServiceGeo, type ServiceHttp } from '@marianne/sdk/main'
import { DAYS, periodLabel } from './hours'
import { OFFICE_KINDS, type NearbyOffices, type OfficeAddress, type OfficeQuery, type OfficeResults, type OpeningPeriod, type PublicOffice } from './types'

/**
 * Annuaire: the DILA directory of public offices (API Annuaire de l'administration, an
 * Opendatasoft dataset whose structured fields arrive as JSON strings). An office is found in the
 * commune, or as competent for it (its "pivot" lists the communes it serves); many offices (caf,
 * cpam, impôts) don't list them: then the nearest ones of the département.
 */

export const DIRECTORY_API = 'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration'

/** What the directory needs of the service's context. */
export interface DirectoryContext {
  http: Pick<ServiceHttp, 'json'>
  geo: Pick<ServiceGeo, 'findCommunes' | 'getCommune'>
}

export interface RawOffice {
  id: string
  nom: string
  adresse: string | null
  telephone: string | null
  adresse_courriel: string | null
  site_internet: string | null
  plage_ouverture: string | null
  commentaire_plage_ouverture: string | null
  formulaire_contact: string | null
  url_service_public: string | null
  pivot: string | null
}

const FIELDS = 'id,nom,adresse,telephone,adresse_courriel,site_internet,plage_ouverture,commentaire_plage_ouverture,formulaire_contact,url_service_public,pivot'

/** The most records the API gives at once. */
const MAX_LIMIT = 100

function parseList<T>(json: string | null): T[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

const dayNumber = (name = '') => DAYS.indexOf(name.trim().toLowerCase()) + 1
const hhmm = (t: string) => t.slice(0, 5)

/** The directory's opening hours ("plage_ouverture"), structured. */
export function openingHours(json: string | null): OpeningPeriod[] {
  return parseList<Record<string, string>>(json).flatMap((p) => {
    const fromDay = dayNumber(p.nom_jour_debut)
    if (!fromDay) return []
    const toDay = dayNumber(p.nom_jour_fin) || fromDay
    const slots = [
      [p.valeur_heure_debut_1, p.valeur_heure_fin_1],
      [p.valeur_heure_debut_2, p.valeur_heure_fin_2]
    ]
      .filter(([a, b]) => a && b)
      .map(([a, b]) => ({ from: hhmm(a), to: hhmm(b) }))
    const note = p.commentaire?.trim()
    return [{ fromDay, toDay, slots, ...(note ? { note } : {}), label: periodLabel(fromDay, toDay, slots) }]
  })
}

function addresses(json: string | null): OfficeAddress[] {
  return parseList<Record<string, string>>(json).map((a) => {
    const [lat, lon] = [Number(a.latitude), Number(a.longitude)]
    return {
      lines: [a.complement1, a.complement2, a.numero_voie, a.service_distribution].map((s) => s?.trim()).filter((s): s is string => !!s),
      postalCode: a.code_postal ?? '',
      city: a.nom_commune ?? '',
      postal: a.type_adresse === 'Adresse postale',
      ...(lat && lon ? { latitude: lat, longitude: lon } : {})
    }
  })
}

export function parseOffice(r: RawOffice): PublicOffice {
  const kind = parseList<{ type_service_local: string }>(r.pivot)[0]?.type_service_local ?? ''
  const contactForm = r.formulaire_contact?.trim()
  const hoursNote = r.commentaire_plage_ouverture?.trim()
  return {
    id: r.id,
    name: r.nom,
    kind,
    kindLabel: OFFICE_KINDS.find((k) => k.id === kind)?.label ?? kind.replace(/_/g, ' '),
    addresses: addresses(r.adresse),
    phones: parseList<{ valeur: string; description?: string }>(r.telephone)
      .filter((t) => t.valeur?.trim())
      .map((t) => ({ number: t.valeur.trim(), ...(t.description?.trim() ? { note: t.description.trim() } : {}) })),
    emails: (r.adresse_courriel ?? '')
      .split(/[;,]/)
      .map((m) => m.trim())
      .filter(Boolean),
    websites: parseList<{ valeur: string }>(r.site_internet)
      .map((s) => s.valeur?.trim())
      .filter((s): s is string => !!s),
    ...(contactForm ? { contactForm } : {}),
    hours: openingHours(r.plage_ouverture),
    ...(hoursNote ? { hoursNote } : {}),
    url: r.url_service_public ?? ''
  }
}

/** km between two points (haversine). */
function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(a))
}

/** The office with its distance from a commune's centre, measured to where one goes (not a postal box). */
export function withDistance(office: PublicOffice, from: Pick<Commune, 'latitude' | 'longitude'>): PublicOffice {
  const at = office.addresses.find((a) => a.latitude && !a.postal) ?? office.addresses.find((a) => a.latitude)
  if (!at?.latitude || !at.longitude) return office
  return { ...office, distance: Math.round(km(from.latitude, from.longitude, at.latitude, at.longitude) * 10) / 10 }
}

const nearestFirst = (a: PublicOffice, b: PublicOffice) => (a.distance ?? Infinity) - (b.distance ?? Infinity)

/** A string in an Opendatasoft query. */
const quote = (s: string) => `"${s.replace(/["\\]/g, ' ').trim()}"`

async function records(http: DirectoryContext['http'], where: string[], limit: number): Promise<{ total: number; offices: PublicOffice[] }> {
  const data = await http.json<{ total_count?: number; results?: RawOffice[] }>(
    `${DIRECTORY_API}/records${query({ where: where.join(' and '), limit, select: FIELDS })}`,
    { cacheMs: 3600_000 }
  )
  return { total: data.total_count ?? 0, offices: (data.results ?? []).map(parseOffice) }
}

/**
 * The communes a query designates: none when it names none; null when the one it names doesn't
 * exist. A postal code may cover several communes; a name designates the most populated match.
 */
export async function communesOf(geo: DirectoryContext['geo'], q: Pick<OfficeQuery, 'insee' | 'commune'>): Promise<Commune[] | null> {
  if (q.insee?.trim()) {
    const commune = await geo.getCommune(q.insee.trim())
    return commune ? [commune] : null
  }
  const text = q.commune?.trim()
  if (!text) return []
  const found = await geo.findCommunes(text, 5)
  if (!found.length) return null
  return /^\d/.test(text) ? found : [found[0]]
}

/** Offices by kind and words of their name, in or for the communes; for a kind none of them lists, the nearest of the département. */
export async function searchOffices(http: DirectoryContext['http'], q: OfficeQuery, communes: Commune[]): Promise<OfficeResults> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.round(q.limit ?? 5)))
  const kind = q.kind?.trim().toLowerCase()
  const text = q.text?.trim()
  const where = [kind ? `pivot like ${quote(kind)}` : '', text ? `search(nom, ${quote(text)})` : ''].filter(Boolean)
  if (!communes.length) return { ...(await records(http, where, limit)), place: '', scope: 'national' }
  const place = communes.map((c) => `${c.name} (${c.code})`).join(', ')
  const origin = communes[0]
  const codes = communes.map((c) => quote(c.code))
  const local = await records(http, [...where, `(${codes.map((c) => `code_insee_commune=${c} or pivot like ${c}`).join(' or ')})`], limit)
  if (local.offices.length || !kind)
    return { total: local.total, offices: local.offices.map((o) => withDistance(o, origin)).sort(nearestFirst), place, scope: 'commune' }
  // The nearest among the département's first hundred: enough for every kind but the most common ones, which communes list.
  const wide = await records(http, [...where, `startswith(code_insee_commune, ${quote(departmentOf(origin.code))})`], MAX_LIMIT)
  const offices = wide.offices
    .map((o) => withDistance(o, origin))
    .sort(nearestFirst)
    .slice(0, limit)
  return { total: wide.total, offices, place, scope: 'department' }
}

/** The usual offices of a commune, for the service's home screen. */
export const NEARBY_KINDS = ['mairie', 'france_services', 'caf', 'cpam', 'france_travail', 'sip', 'prefecture', 'tgi']

/**
 * The usual offices near a commune, a few of each kind, searched at once. A kind whose search
 * fails comes back with its error, so that it reads as unanswered rather than as none; when they
 * all fail, the directory is out of reach: that error.
 */
export async function officesNear(http: DirectoryContext['http'], commune: Commune, kinds = NEARBY_KINDS, perKind = 2): Promise<NearbyOffices[]> {
  const results = await Promise.allSettled(kinds.map((kind) => searchOffices(http, { kind, limit: perKind }, [commune])))
  const failed = results.filter((r) => r.status === 'rejected')
  if (failed.length && failed.length === results.length) throw failed[0].reason
  return kinds.map((kind, i) => {
    const r = results[i]
    const label = OFFICE_KINDS.find((k) => k.id === kind)?.label ?? kind
    if (r.status === 'fulfilled') return { kind, label, offices: r.value.offices }
    return { kind, label, offices: [], error: r.reason instanceof Error ? r.reason.message : String(r.reason) }
  })
}
