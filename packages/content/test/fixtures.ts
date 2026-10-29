/** A small valid content: a skill, a démarche with every kind of action, a date, two sites, a news source. */
export function minimal(): Record<string, string> {
  return {
    'skills/fines.md': [
      '---',
      'name: fines',
      'title: Amendes',
      'description: payer ou contester une amende',
      'sources: F18509; https://www.antai.gouv.fr',
      'updated: 2026-10-20',
      'owner: marianne',
      '---',
      '# Amendes',
      '',
      'Lis la fiche https://www.service-public.gouv.fr/particuliers/vosdroits/F18509, puis ouvre antai.gouv.fr.'
    ].join('\n'),
    'procedures/mobility/contest-fine.md': [
      '---',
      'id: contest-fine',
      'domain: mobility',
      'title: Contester une amende',
      'description: avis de contravention',
      'when: dans les 45 jours',
      'documents: l’avis; vos justificatifs',
      'sources: F18509',
      'updated: 2026-10-25',
      'owner: someone-else',
      'verified: 2026-10-26',
      '---',
      '## Lire l’avis',
      'Repérez la date.',
      '> document: letter | Ajouter l’avis',
      '> sheet: F18509 | Lire la fiche',
      '> setup: account:antai | Renseigner mon compte',
      '## Contester',
      '> open: antai | Ouvrir l’ANTAI',
      '> open: https://www.antai.gouv.fr/contester | Contester en ligne',
      '> ask: Comment contester ? | Demander à Marianne',
      '> service: peage | Ouvrir 3615 PEAGE'
    ].join('\n'),
    'calendar.json': JSON.stringify({
      updated: '2026-10-01',
      items: [{ id: 'fines', domain: 'mobility', title: 'payer', monthDay: '02-29', applies: 'always', site: 'antai', procedure: 'contest-fine' }]
    }),
    'sites.json': JSON.stringify({
      updated: '2026-10-01',
      sites: [
        { id: 'antai', name: 'ANTAI', url: 'https://www.antai.gouv.fr', domain: 'mobility', login: 'none', description: 'amendes' },
        {
          id: 'ameli',
          name: 'ameli',
          url: 'https://www.ameli.fr',
          domain: 'health',
          login: 'account',
          description: 'assurance maladie',
          fields: [{ key: 'ameli_id', label: 'identifiant', pattern: '^[0-9]+$' }],
          needsNir: true
        }
      ]
    }),
    'news-sources.json': JSON.stringify({
      updated: '2026-10-01',
      note: 'checked',
      sources: [{ id: 'press', name: 'La Presse', group: 'national', feed: 'https://www.presse.example/rss', homepage: 'https://www.presse.example' }]
    })
  }
}
