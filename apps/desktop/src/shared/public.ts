import type { TodayItem } from '@marianne/sdk'
import type { PublicSourceId } from './types'

/**
 * Public information: the data sources Marianne draws on (the Connexions), the offline index of
 * their dumps, and what the services read from them.
 * Identifiers are in English; labels and descriptions are in French.
 */

// ---------------------------------------------------------------- sources

/** offline: a dump downloaded and indexed on this computer · live: queried on demand. */
export type PublicSourceKind = 'offline' | 'live'

export interface PublicSourceInfo {
  id: PublicSourceId
  label: string
  description: string
  kind: PublicSourceKind
  /** Official API base URL, or dump URL for offline sources. */
  defaultUrl: string
  homepage: string
  license: string
  /** A keychain entry the source needs (API credentials). */
  key?: 'piste'
}

export interface SyncProgress {
  phase: 'download' | 'index'
  done: number
  total: number
}

export interface PublicSourceStatus {
  id: PublicSourceId
  enabled: boolean
  /** Offline sources: last successful sync and what it holds. */
  syncedAt?: string
  count?: number
  syncing?: SyncProgress
  error?: string
  /** Sources that need credentials: whether they are in the keychain. */
  hasKey?: boolean
}

export const PUBLIC_SOURCES: PublicSourceInfo[] = [
  {
    id: 'service-public',
    label: 'Service public',
    description: 'fiches pratiques, questions-réponses, formulaires Cerfa et téléservices (≈ 7 000 documents, indexés sur cet ordinateur)',
    kind: 'offline',
    defaultUrl: 'https://lecomarquage.service-public.fr/vdd/3.4/part/zip/vosdroits-latest.zip',
    homepage: 'https://www.service-public.gouv.fr',
    license: 'Licence Ouverte 2.0 · DILA'
  },
  {
    id: 'legifrance',
    label: 'Légifrance',
    description: 'codes, lois et décrets en vigueur, jurisprudence · demande un accès gratuit à l’API PISTE, à enregistrer dans Réglages › Sites et API',
    kind: 'live',
    defaultUrl: 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app',
    homepage: 'https://www.legifrance.gouv.fr',
    license: 'Licence Ouverte 2.0 · DILA',
    key: 'piste'
  },
  {
    id: 'code-travail',
    label: 'Code du travail numérique',
    description: 'réponses sur le droit du travail : contrats, préavis, congés, licenciement, conventions collectives',
    kind: 'live',
    defaultUrl: 'https://code.travail.gouv.fr',
    homepage: 'https://code.travail.gouv.fr',
    license: 'Licence Ouverte 2.0 · ministère du Travail'
  },
  {
    id: 'datagouv',
    label: 'Données ouvertes',
    description: 'catalogue national des données publiques (data.gouv.fr), et lecture des fichiers CSV sans les télécharger',
    kind: 'live',
    defaultUrl: 'https://www.data.gouv.fr/api',
    homepage: 'https://www.data.gouv.fr',
    license: 'licence propre à chaque jeu de données'
  },
  {
    id: 'entreprises',
    label: 'Annuaire des entreprises',
    description: 'toutes les entreprises et associations : SIREN, siège, dirigeants, activité',
    kind: 'live',
    defaultUrl: 'https://recherche-entreprises.api.gouv.fr',
    homepage: 'https://annuaire-entreprises.data.gouv.fr',
    license: 'Licence Ouverte 2.0 · DINUM'
  },
  {
    id: 'geo',
    label: 'Découpage administratif',
    description: 'communes, codes postaux et INSEE, départements, régions, population, contours',
    kind: 'live',
    defaultUrl: 'https://geo.api.gouv.fr',
    homepage: 'https://geo.api.gouv.fr',
    license: 'Licence Ouverte 2.0 · Etalab'
  },
  {
    id: 'adresse',
    label: 'Base adresse nationale',
    description: 'recherche et normalisation des adresses postales',
    kind: 'live',
    defaultUrl: 'https://data.geopf.fr/geocodage',
    homepage: 'https://adresse.data.gouv.fr',
    license: 'Licence Ouverte 2.0 · IGN'
  },
  {
    id: 'calendar',
    label: 'Jours fériés',
    description: 'jours fériés par zone, pour calculer les délais légaux et de procédure',
    kind: 'live',
    defaultUrl: 'https://calendrier.api.gouv.fr',
    homepage: 'https://api.gouv.fr/les-api/jours-feries',
    license: 'Licence Ouverte 2.0 · Etalab'
  },
  {
    id: 'openfisca',
    label: 'OpenFisca',
    description: 'simulation des impôts et des prestations sociales (RSA, prime d’activité, aides au logement…)',
    kind: 'live',
    defaultUrl: 'https://api.fr.openfisca.org/latest',
    homepage: 'https://openfisca.org',
    license: 'AGPL · OpenFisca'
  }
]

export const publicSource = (id: PublicSourceId): PublicSourceInfo => PUBLIC_SOURCES.find((s) => s.id === id)!

// ---------------------------------------------------------------- Service-Public documents

export type SpKind = 'sheet' | 'question' | 'topic' | 'form' | 'online-service' | 'simulator' | 'template' | 'search-tool' | 'definition' | 'other'

export const SP_KIND_LABELS: Record<SpKind, string> = {
  sheet: 'fiche pratique',
  question: 'question-réponse',
  topic: 'dossier',
  form: 'formulaire',
  'online-service': 'téléservice',
  simulator: 'simulateur',
  template: 'modèle de document',
  'search-tool': 'outil de recherche',
  definition: 'définition',
  other: 'autre'
}

// ---------------------------------------------------------------- public life (the start of 3615 CALENDRIER)

/** "Aujourd'hui": what happens today in public life. */
export type TodayKind = 'holiday' | 'school' | 'clock' | 'change' | 'service'

export interface TodayEvent extends TodayItem {
  kind: TodayKind
  /** kind 'service': the service that tells it, opened with the item's params. */
  service?: string
}
