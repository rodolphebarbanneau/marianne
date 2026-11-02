import { REPO_URL } from '@shared/project'

/**
 * A settings page: its id (the route's, « settings:sources »), its label, and the section of the user guide
 * that explains it, linked from its title: the pages hold settings only.
 */
export interface SettingsPage {
  id: string
  label: string
  /** The guide's page and section, in French (docs/guide/fr/). */
  guide?: string
}

/** The settings dialog's sections and pages, in order: the application and the user only, never a service's own settings. */
export const SETTINGS_GROUPS: Array<{ label: string; pages: SettingsPage[] }> = [
  {
    label: 'MOI',
    pages: [
      { id: 'identity', label: 'Identité', guide: 'using.md#votre-profil' },
      { id: 'contact', label: 'Coordonnées', guide: 'using.md#votre-profil' },
      { id: 'household', label: 'Foyer', guide: 'using.md#votre-profil' },
      { id: 'assets', label: 'Activités et biens', guide: 'using.md#votre-profil' },
      { id: 'money', label: 'Banque et paiement', guide: 'using.md#payer-par-carte' },
      { id: 'documents', label: 'Documents', guide: 'privacy.md#sur-votre-ordinateur' }
    ]
  },
  {
    label: 'MES IDÉES',
    pages: [
      { id: 'leaning', label: 'Sensibilité', guide: 'using.md#vos-idées' },
      { id: 'themes', label: 'Thèmes', guide: 'using.md#vos-idées' },
      { id: 'sources', label: 'Sources d’information', guide: 'privacy.md#les-infos' }
    ]
  },
  {
    label: 'MARIANNE',
    pages: [
      { id: 'engines', label: 'Moteurs', guide: 'install.md#connecter-le-moteur' },
      { id: 'notes', label: 'Notes pour Marianne' },
      { id: 'skills', label: 'Compétences' },
      { id: 'web', label: 'Web et navigateur', guide: 'using.md#le-navigateur-intégré' },
      { id: 'approvals', label: 'Autorisations', guide: 'using.md#votre-accord' }
    ]
  },
  {
    label: 'CONFIDENTIALITÉ',
    pages: [{ id: 'access', label: 'Accès des services', guide: 'privacy.md#ce-que-lisent-vos-services' }]
  },
  {
    label: 'CONNEXIONS',
    pages: [
      { id: 'sites', label: 'Sites et API', guide: 'using.md#vos-comptes-sur-les-sites' },
      { id: 'data', label: 'Données publiques' }
    ]
  },
  {
    label: 'ARCHIVE',
    pages: [
      { id: 'space', label: 'Place et sauvegarde', guide: 'privacy.md#sauvegarder' },
      { id: 'security', label: 'Sécurité', guide: 'getting-started.md#la-clé-de-secours' },
      { id: 'accounts', label: 'Comptes', guide: 'getting-started.md#plusieurs-comptes' }
    ]
  },
  {
    label: 'APPLICATION',
    pages: [
      { id: 'display', label: 'Affichage' },
      { id: 'shortcuts', label: 'Raccourcis clavier', guide: 'using.md#les-touches' },
      { id: 'about', label: 'À propos et mises à jour' }
    ]
  }
]

export const SETTINGS_PAGES = SETTINGS_GROUPS.flatMap((g) => g.pages)

/** Where a page's guide section is published: the guide in the app's language. */
export const guideUrl = (guide: string) => `${REPO_URL}/blob/main/docs/guide/fr/${guide}`

/**
 * Pages that went, and where what they had is now: an old link (an engine's answer kept in a folder, a
 * service, a notification) still lands there. « services » is the Services page's: routes.ts sends it there.
 */
export const MOVED: Record<string, string> = {
  'identity#sources': 'sources',
  'identity#opinions': 'leaning',
  payment: 'money',
  browser: 'web',
  privacy: 'access'
}

/** The page a route asks for (« page » or « page#section »), once moved. */
export function settingsTarget(asked: string): { page: string; section: string } {
  const moved = MOVED[asked] ?? MOVED[asked.split('#')[0]] ?? asked
  const [page, section = ''] = moved.split('#')
  return { page: SETTINGS_PAGES.some((p) => p.id === page) ? page : 'identity', section }
}
