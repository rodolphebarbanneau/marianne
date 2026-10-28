import { domainInfo, ENTITY_LABELS } from './domains'
import type { DomainId, Dossier } from './dossier'
import type { Service } from './types'

/**
 * What is configured in the personal file, and where to configure the rest. Shared by the agent's
 * view of the file (main) and the pages (renderer), so both point to the same screens.
 */

export interface Missing {
  /** Target for demander_configuration, and key for setupRoute. */
  target: string
  label: string
}

/** A service is configured once the user chose it and gave the identifiers it needs. */
export function serviceReady(d: Dossier, s: Service): boolean {
  const account = d.accounts.find((a) => a.serviceId === s.id)
  if (!account) return false
  if (s.needsNir && !d.person.nir) return false
  return (s.fields ?? []).every((f) => account.fields[f.key]?.trim())
}

/**
 * What a domain lacks. For the pages, only what is essential or started and left incomplete: an
 * unused service is not a gap, the user configures only what they use. For the agent, every gap,
 * so it can point the user to the right screen when the conversation needs it.
 */
export function missingFor(d: Dossier, domain: DomainId, services: Service[], forAgent = false): Missing[] {
  const out: Missing[] = []
  if (!d.person.nomNaissance && !d.person.nomUsage) out.push({ target: 'identite', label: 'votre identité' })
  if (!d.address.codeInsee) out.push({ target: 'adresse', label: 'votre adresse' })
  if ((domain === 'sante' || domain === 'retraite') && !d.person.nir) out.push({ target: 'identite', label: 'votre numéro de sécurité sociale' })
  if (forAgent) {
    for (const kind of domainInfo(domain).entities) if (!d[kind].length) out.push({ target: kind, label: `vos ${ENTITY_LABELS[kind].label}` })
    if (domain === 'famille' && !d.household.length && !d.person.situationFamiliale) out.push({ target: 'foyer', label: 'votre foyer' })
    if (domain === 'identite' && !d.pieces.length) out.push({ target: 'pieces', label: 'vos pièces d’identité' })
  }
  for (const s of services.filter((x) => x.domain === domain && (x.fields?.length || x.needsNir))) {
    const started = d.accounts.some((a) => a.serviceId === s.id)
    if ((forAgent || started) && !serviceReady(d, s)) out.push({ target: `compte:${s.id}`, label: `votre compte ${s.name}` })
  }
  return out.filter((m, i, all) => all.findIndex((x) => x.label === m.label) === i)
}

const FIXED: Record<string, { route: string; label: string }> = {
  identite: { route: 'dossier#identite', label: 'votre identité' },
  adresse: { route: 'dossier#adresse', label: 'votre adresse' },
  foyer: { route: 'dossier#foyer', label: 'votre foyer' },
  pieces: { route: 'dossier#pieces', label: 'vos pièces d’identité' },
  notes: { route: 'dossier#notes', label: 'vos précisions pour l’assistant' },
  entreprises: { route: 'entites#entreprises', label: 'vos entreprises' },
  employeurs: { route: 'entites#employeurs', label: 'vos employeurs' },
  vehicules: { route: 'entites#vehicules', label: 'vos véhicules' },
  logements: { route: 'entites#logements', label: 'vos logements' },
  trousseau: { route: 'reglages/keychain', label: 'le trousseau' },
  legifrance: { route: 'reglages/keychain', label: 'l’accès Légifrance (clé api piste)' },
  agent: { route: 'reglages/agent', label: 'l’agent' }
}

/** The screen of a configuration target ("compte:impots" → the impôts page, on its account). */
export function setupRoute(target: string, services: Service[]): { route: string; label: string } | null {
  if (FIXED[target]) return FIXED[target]
  const service = target.startsWith('compte:') ? services.find((s) => s.id === target.slice('compte:'.length)) : null
  return service ? { route: `domaine/${service.domain}#compte:${service.id}`, label: `votre compte ${service.name}` } : null
}
