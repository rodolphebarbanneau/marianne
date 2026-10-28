/** The settings dialog's sections and pages, in order. */
export const SETTINGS_GROUPS: Array<{ label: string; pages: Array<{ id: string; label: string }> }> = [
  {
    label: 'MOI',
    pages: [
      { id: 'identity', label: 'Identité' },
      { id: 'household', label: 'Foyer & entités' },
      { id: 'documents', label: 'Documents' }
    ]
  },
  {
    label: 'ARCHIVE',
    pages: [
      { id: 'space', label: 'Place et emplacement' },
      { id: 'security', label: 'Phrase de passe et code' },
      { id: 'accounts', label: 'Comptes' }
    ]
  },
  {
    label: 'CONNEXIONS',
    pages: [
      { id: 'sites', label: 'Sites et API' },
      { id: 'engines', label: 'Moteurs' },
      { id: 'browser', label: 'Navigateur' },
      { id: 'privacy', label: 'Confidentialité' },
      { id: 'data', label: 'Données publiques' }
    ]
  },
  {
    label: 'PAGES',
    pages: [
      { id: 'services', label: 'Services' },
      { id: 'sources', label: 'Actualités' }
    ]
  },
  {
    label: 'APPLICATION',
    pages: [
      { id: 'display', label: 'Affichage' },
      { id: 'shortcuts', label: 'Raccourcis clavier' },
      { id: 'skills', label: 'Compétences' },
      { id: 'about', label: 'À propos et mises à jour' }
    ]
  }
]

export const SETTINGS_PAGES = SETTINGS_GROUPS.flatMap((g) => g.pages)
