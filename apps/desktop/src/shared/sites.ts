import type { Site } from '@marianne/content'
import { PUBLIC_SOURCES } from './public'

/**
 * Public-service websites. Their catalog is content (@marianne/content, sites.json): the main
 * process has it from the content store, the window asks for it (listSites).
 */
export type { LoginKind, Site, SiteField } from '@marianne/content'

/**
 * Websites engines may read in "public sites only" mode, besides every catalog site and public
 * source: institutions and ministries they often need to cite.
 */
const PUBLIC_HOSTS = [
  'service-public.gouv.fr',
  'www.service-public.gouv.fr',
  'www.service-public.fr',
  'lannuaire.service-public.gouv.fr',
  'bofip.impots.gouv.fr',
  'www.legifrance.gouv.fr',
  'www.conseil-constitutionnel.fr',
  'www.conseil-etat.fr',
  'www.courdecassation.fr',
  'www.economie.gouv.fr',
  'www.info.gouv.fr',
  'www.interieur.gouv.fr',
  'www.justice.gouv.fr',
  'travail-emploi.gouv.fr',
  'solidarites.gouv.fr',
  'www.education.gouv.fr',
  'www.ecologie.gouv.fr',
  'www.insee.fr',
  'www.urssaf.fr',
  'www.cnil.fr',
  'videos.assemblee-nationale.fr',
  'data.assemblee-nationale.fr',
  'www2.assemblee-nationale.fr'
]

/** Every host engines may read in "public sites only" mode: those of the sites given (the catalog), of the public sources, and PUBLIC_HOSTS. */
export function publicHosts(sites: Site[]): string[] {
  const hosts = new Set(PUBLIC_HOSTS)
  for (const url of [...sites.map((s) => s.url), ...PUBLIC_SOURCES.map((s) => s.homepage)]) hosts.add(new URL(url).hostname)
  return [...hosts].sort()
}
