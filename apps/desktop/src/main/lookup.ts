import type { AddressSuggestion, CommuneSuggestion, CompanyLookup } from '../shared/api'
import { fetchJson, query } from './http'
import { ensureEnabled } from './public/sources'
import { base } from './tools/tool'

/**
 * Lookups for the settings forms: an address (Base Adresse Nationale), a commune, a company by SIREN.
 * What the user types goes to the source only while it is on: turned off in Réglages, a lookup asks
 * nothing and says so.
 */

export async function searchAddress(q: string): Promise<AddressSuggestion[]> {
  if (q.trim().length < 4) return []
  ensureEnabled('adresse')
  const data = await fetchJson<{ features: Array<{ properties: Record<string, string>; geometry: { coordinates: [number, number] } }> }>(
    `${base('adresse')}/search${query({ q, limit: 6, autocomplete: 1 })}`,
    { cacheMs: 600_000 }
  )
  return (data.features ?? []).map((f) => ({
    label: f.properties.label,
    street: f.properties.name ?? '',
    postcode: f.properties.postcode ?? '',
    city: f.properties.city ?? '',
    inseeCode: f.properties.citycode ?? '',
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1]
  }))
}

export async function searchCommunes(term: string, limit = 6): Promise<CommuneSuggestion[]> {
  const t = term.trim()
  if (t.length < 2) return []
  ensureEnabled('geo')
  const get = (params: Record<string, string | number>) =>
    fetchJson<Array<{ nom: string; code: string; codesPostaux: string[]; codeDepartement: string }>>(
      `${base('geo')}/communes${query({ ...params, fields: 'nom,code,codesPostaux,codeDepartement', limit, boost: 'population' })}`,
      { cacheMs: 86_400_000 }
    )
  const found = /^\d[\dAB]\d{3}$/i.test(t)
    ? (await get({ codePostal: t })).length
      ? await get({ codePostal: t })
      : await get({ code: t.toUpperCase() })
    : await get({ nom: t })
  return found.map((c) => ({ name: c.nom, code: c.code, department: c.codeDepartement, postcodes: c.codesPostaux }))
}

/** The commonest legal forms, by INSEE code (catégorie juridique). */
const FORMS: Record<string, string> = {
  '1000': 'entreprise individuelle',
  '5202': 'société en nom collectif',
  '5410': 'SARL',
  '5498': 'EURL',
  '5499': 'SARL',
  '5505': 'SA',
  '5510': 'SA',
  '5599': 'SA',
  '5710': 'SAS',
  '5720': 'SASU',
  '6540': 'SCI',
  '6541': 'SCI',
  '9210': 'association non déclarée',
  '9220': 'association déclarée'
}

/** A company's public details from its SIREN (the user types their own). */
export async function lookupSiren(siren: string): Promise<CompanyLookup | null> {
  const s = siren.replace(/\s+/g, '')
  ensureEnabled('entreprises')
  const data = await fetchJson<{
    results: Array<{
      siren: string
      nom_complet: string
      nature_juridique: string
      date_creation: string
      activite_principale: string
      siege: { adresse: string; libelle_activite_principale?: string }
      complements?: { est_entrepreneur_individuel?: boolean; est_association?: boolean }
    }>
  }>(`${base('entreprises')}/search${query({ q: s, per_page: 1 })}`)
  const r = data.results?.find((x) => x.siren === s)
  if (!r) return null
  const individual = !!r.complements?.est_entrepreneur_individuel
  return {
    siren: r.siren,
    name: r.nom_complet,
    legalForm: individual ? 'entreprise individuelle' : (FORMS[r.nature_juridique] ?? `catégorie juridique ${r.nature_juridique}`),
    activity: [r.activite_principale, r.siege.libelle_activite_principale].filter(Boolean).join(' · '),
    created: r.date_creation ?? '',
    address: r.siege.adresse ?? '',
    association: !!r.complements?.est_association,
    individual
  }
}
