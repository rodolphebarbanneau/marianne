import { groupSubjects, type NewsHeadline, type NewsReading, type NewsSourceInfo } from '@marianne/sdk'

/**
 * A morning of headlines (fictional), as Marianne reads and groups them: a Friday, the 30th of
 * October 2026, read at 10 h 37 in Paris. The user set CNews and Europe 1 aside.
 */

export const READ_AT = '2026-10-30T09:37:00.000Z'

export const SOURCES: NewsSourceInfo[] = [
  { id: 'le-monde', name: 'Le Monde', group: 'national', site: 'lemonde.fr', lean: 'centre-gauche' },
  { id: 'liberation', name: 'Libération', group: 'national', site: 'liberation.fr', lean: 'gauche' },
  { id: 'le-figaro', name: 'Le Figaro', group: 'national', site: 'lefigaro.fr', lean: 'droite' },
  { id: 'les-echos', name: 'Les Échos', group: 'national', site: 'lesechos.fr', lean: 'centre-droit' },
  {
    id: 'ouest-france',
    name: 'Ouest-France',
    group: 'regional',
    site: 'ouest-france.fr',
    lean: 'centre',
    sections: [
      { id: 'une', label: 'à la une' },
      { id: 'bretagne', label: 'Bretagne' },
      { id: 'sport', label: 'sport' }
    ]
  },
  { id: 'franceinfo', name: 'Franceinfo', group: 'broadcast', site: 'francetvinfo.fr', lean: 'centre' },
  { id: 'cnews', name: 'CNews', group: 'broadcast', site: 'cnews.fr', lean: 'droite', setAside: true },
  { id: 'europe-1', name: 'Europe 1', group: 'broadcast', site: 'europe1.fr', lean: 'droite', setAside: true },
  { id: 'les-decodeurs', name: 'Les Décodeurs', group: 'factcheck', site: 'lemonde.fr', lean: 'centre' }
]

const ASIDE = new Set(['cnews', 'europe-1'])

const h = (id: string, source: string, published: string, title: string, summary?: string): NewsHeadline => ({
  id,
  source,
  title,
  url: `https://${SOURCES.find((s) => s.id === source)!.site}/${id}`,
  published,
  ...(summary ? { summary } : {})
})

export const ITEMS: NewsHeadline[] = [
  h('b1', 'les-echos', '2026-10-30T06:40:00.000Z', 'Budget : le Sénat adopte les recettes après trois semaines de débats'),
  h('b2', 'le-figaro', '2026-10-30T08:12:00.000Z', 'Budget : le Sénat rabote 4 milliards d’euros et adopte les recettes'),
  h('b3', 'le-monde', '2026-10-30T08:40:00.000Z', 'Budget 2027 : le Sénat adopte la partie recettes, la bataille des dépenses commence'),
  h('b6', 'cnews', '2026-10-30T09:00:00.000Z', 'Budget : le Sénat adopte les recettes du projet de loi'),
  h('b4', 'liberation', '2026-10-30T09:05:00.000Z', 'Budget 2027 : au Sénat, les recettes adoptées, les dépenses en suspens'),
  h(
    'b5',
    'ouest-france',
    '2026-10-30T09:20:00.000Z',
    'Budget 2027 : le Sénat adopte les recettes, ce que change le vote pour les ménages',
    'Les sénateurs ont adopté dans la nuit la première partie du projet de loi de finances.'
  ),
  h('b7', 'franceinfo', '2026-10-30T09:25:00.000Z', 'EN DIRECT. Budget 2027 : le Sénat adopte les recettes, suivez le vote'),
  h('m1', 'franceinfo', '2026-10-30T06:50:00.000Z', 'Élections de mi-mandat : les cinq États qui décideront du Congrès'),
  h('m2', 'le-figaro', '2026-10-30T07:30:00.000Z', 'Élections de mi-mandat : les États qui décideront du Congrès américain'),
  h('t1', 'les-decodeurs', '2026-10-30T05:20:00.000Z', 'Taxe foncière : d’où vient le chiffre d’un doublement pour les propriétaires'),
  h('t2', 'ouest-france', '2026-10-30T09:00:00.000Z', 'Taxe foncière : le doublement pour les propriétaires, un chiffre trompeur'),
  h('g1', 'le-monde', '2026-10-30T08:50:00.000Z', 'Prix Goncourt : les quatre finalistes dévoilés'),
  h('g2', 'liberation', '2026-10-30T09:10:00.000Z', 'Goncourt : les quatre finalistes dévoilés par le jury'),
  h('s1', 'cnews', '2026-10-30T08:00:00.000Z', 'Sécurité : les chiffres de la délinquance du troisième trimestre publiés'),
  h('s2', 'europe-1', '2026-10-30T08:30:00.000Z', 'Sécurité : les chiffres de la délinquance du troisième trimestre'),
  h('v1', 'franceinfo', '2026-10-30T09:35:00.000Z', 'DIRECT. Coup de vent en Bretagne : suivez l’évolution de la vigilance orange'),
  h('d1', 'le-monde', '2026-10-30T09:30:00.000Z', 'Au Soudan, l’aide humanitaire bloquée aux portes du Darfour'),
  h('e1', 'les-echos', '2026-10-30T08:45:00.000Z', 'Bourse : le CAC 40 recule à l’ouverture'),
  h('r1', 'ouest-france', '2026-10-29T21:15:00.000Z', 'Rennes : la ligne b du métro fermée dimanche pour travaux')
]

/** As Marianne reads them: grouped over every source, then the set-aside ones marked (`all`) or left out. */
export function readingOf(items: NewsHeadline[], all: boolean, extra: Partial<NewsReading> = {}): NewsReading {
  const marked = items.map((i) => (ASIDE.has(i.source) ? { ...i, setAside: true } : i))
  const { subjects } = groupSubjects(marked)
  const keep = (i: NewsHeadline) => all || !i.setAside
  return {
    items: marked.filter(keep).sort((a, b) => Date.parse(b.published) - Date.parse(a.published)),
    subjects: subjects.map((s) => ({ ...s, items: s.items.filter(keep) })).filter((s) => s.items.length),
    failed: [],
    readAt: READ_AT,
    ...extra
  }
}

/** The catalogue as a service with opinions.sources sees it (`all`: the set-aside ones too, marked). */
export const catalogue = (all: boolean) => SOURCES.filter((s) => all || !s.setAside)

/** The same catalogue for a service that may not read opinions.sources: every source, unmarked. */
export const UNMARKED = SOURCES.map(({ setAside: _, ...s }) => s)
