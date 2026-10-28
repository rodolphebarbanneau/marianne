import { domainInfo } from '@shared/domains'
import type { DomainId } from '@shared/dossier'

/** The person's pages, at the top of the sommaire. */
export const TOP: Array<{ route: string; label: string; num?: string }> = [
  { route: 'moi', label: 'moi', num: '0' },
  { route: 'dossier', label: 'mon dossier' },
  { route: 'entites', label: 'entités' },
  { route: 'agenda', label: 'agenda' },
  { route: 'documents', label: 'documents' }
]

const SETTINGS: Record<string, string> = {
  general: 'général',
  agent: 'agent',
  sources: 'sources',
  keychain: 'trousseau',
  skills: 'compétences',
  backup: 'sauvegarde',
  about: 'à propos'
}

/** A readable title for a route (title bar, and the screen the agent is told about). */
export function routeTitle(route: string): string {
  const path = route.split('#')[0]
  if (path.startsWith('domaine/')) return domainInfo(path.slice(8) as DomainId)?.label ?? ''
  if (path.startsWith('demarche/')) return `démarche ${path.slice(9)}`
  if (path.startsWith('fiche/')) return `fiche Service-Public ${path.slice(6)}`
  if (path.startsWith('reglages/')) return `réglages · ${SETTINGS[path.slice(9)] ?? ''}`
  return TOP.find((t) => t.route === path)?.label ?? path
}
