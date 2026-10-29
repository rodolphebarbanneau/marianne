import type { DomainId } from '@marianne/sdk'
import type { EntityKind } from './profile'

/**
 * The domains of the app: one page each, built the same way (deadlines, sites, information,
 * procedures, documents, references). Defined as data so a domain can change without UI code.
 */

export type Color = 'blue' | 'red' | 'magenta' | 'green' | 'cyan' | 'yellow' | 'white'

/** How the Démarches page groups the domains. */
export type DomainCategory = 'family' | 'money' | 'home' | 'rights'

export const DOMAIN_CATEGORIES: Array<{ id: DomainCategory; label: string }> = [
  { id: 'family', label: 'moi et ma famille' },
  { id: 'money', label: 'argent et travail' },
  { id: 'home', label: 'chez moi et déplacements' },
  { id: 'rights', label: 'droits et entreprise' }
]

export interface DomainInfo {
  id: DomainId
  num: number
  label: string
  /** Name on the Minitel sommaire. */
  short: string
  /** Two letters, where there is no room for the name. */
  badge: string
  category: DomainCategory
  color: Color
  description: string
  /** Key Service-Public documents of the domain (ids in the local index). */
  sheets: string[]
  /** References outside the index. */
  links: Array<{ label: string; url: string }>
  /** Linked entities shown on the page. */
  entities: EntityKind[]
  /** Questions to start a conversation from the page. */
  starters: string[]
}

/** In the order of the categories, so lists and the sommaire read the same way. */
export const DOMAINS: DomainInfo[] = [
  {
    id: 'identity',
    num: 1,
    label: 'identité & citoyenneté',
    short: 'identité',
    badge: 'ID',
    category: 'family',
    color: 'cyan',
    description: 'papiers d’identité, état civil, élections, vie démocratique',
    sheets: ['N358', 'N360', 'F1367', 'N530'],
    links: [{ label: 'ANTS : prédemande et suivi des titres', url: 'https://ants.gouv.fr' }],
    entities: [],
    starters: [
      'Mes papiers d’identité sont-ils à jour, et comment les renouveler ?',
      'Comment déclarer mon changement d’adresse à toutes les administrations ?',
      'Qui est mon député et comment a-t-il voté récemment ?'
    ]
  },
  {
    id: 'family',
    num: 2,
    label: 'famille & solidarités',
    short: 'famille',
    badge: 'FA',
    category: 'family',
    color: 'magenta',
    description: 'caf et msa : allocations familiales, aides au logement, rsa, prime d’activité',
    sheets: ['N31477', 'N19775', 'F13213', 'F12006'],
    links: [{ label: 'Mes droits sociaux : simulateur de toutes les aides', url: 'https://www.mesdroitssociaux.gouv.fr' }],
    entities: [],
    starters: ['Quelles aides puis-je demander pour mon foyer ?', 'Ai-je droit à la prime d’activité ?', 'J’ai reçu un indu de la caf : que faire ?']
  },
  {
    id: 'health',
    num: 3,
    label: 'santé',
    short: 'santé',
    badge: 'SA',
    category: 'family',
    color: 'green',
    description: 'assurance maladie, complémentaire santé, arrêts de travail, handicap',
    sheets: ['F10027', 'F163', 'F265', 'F303'],
    links: [{ label: 'Assurance maladie : remboursements et attestations', url: 'https://www.ameli.fr' }],
    entities: [],
    starters: [
      'Ai-je droit à la complémentaire santé solidaire ?',
      'Comment déclarer mon médecin traitant ?',
      'Je suis en arrêt maladie : que dois-je faire et que vais-je toucher ?'
    ]
  },
  {
    id: 'taxes',
    num: 4,
    label: 'impôts & finances',
    short: 'impôts',
    badge: 'IM',
    category: 'money',
    color: 'yellow',
    description: 'impôt sur le revenu, prélèvement à la source, taxe foncière, échéanciers de paiement',
    sheets: ['F358', 'F34009', 'F59', 'F110'],
    links: [{ label: 'Impôts : espace particulier', url: 'https://cfspart.impots.gouv.fr' }],
    entities: [],
    starters: [
      'Aide-moi à préparer ma déclaration de revenus.',
      'Puis-je payer mon impôt en plusieurs fois ou obtenir un délai ?',
      'Combien vais-je payer d’impôt sur le revenu cette année ?'
    ]
  },
  {
    id: 'work',
    num: 5,
    label: 'travail & emploi',
    short: 'travail',
    badge: 'TR',
    category: 'money',
    color: 'blue',
    description: 'contrats et employeurs, chômage, formation',
    sheets: ['F1636', 'F19030', 'F2855', 'F10705'],
    links: [{ label: 'Code du travail numérique', url: 'https://code.travail.gouv.fr' }],
    entities: ['employers'],
    starters: [
      'Quel préavis dois-je respecter si je démissionne ?',
      'Comment s’inscrire à France Travail et quels droits au chômage ?',
      'Comment utiliser mon compte personnel de formation ?'
    ]
  },
  {
    id: 'retirement',
    num: 6,
    label: 'retraite',
    short: 'retraite',
    badge: 'RE',
    category: 'money',
    color: 'cyan',
    description: 'relevé de carrière, âge et montant de la retraite, réversion',
    sheets: ['N381', 'F14044', 'F12842', 'F13104'],
    links: [{ label: 'Info retraite : relevé de carrière tous régimes', url: 'https://www.info-retraite.fr' }],
    entities: [],
    starters: ['À quel âge pourrai-je partir à la retraite ?', 'Comment vérifier mon relevé de carrière ?', 'Comment demander une pension de réversion ?']
  },
  {
    id: 'housing',
    num: 7,
    label: 'logement',
    short: 'logement',
    badge: 'LO',
    category: 'home',
    color: 'green',
    description: 'bail et loyer, aides au logement, rénovation, risques à l’adresse',
    sheets: ['N337', 'N19424', 'F31269', 'F35083'],
    links: [{ label: 'ANIL : conseil juridique gratuit sur le logement', url: 'https://www.anil.org' }],
    entities: ['properties'],
    starters: ['Mon propriétaire peut-il augmenter mon loyer ?', 'Quand récupérer mon dépôt de garantie ?', 'Quelles aides pour rénover mon logement ?']
  },
  {
    id: 'mobility',
    num: 8,
    label: 'mobilité',
    short: 'mobilité',
    badge: 'MO',
    category: 'home',
    color: 'magenta',
    description: 'permis, véhicules, carte grise, contrôle technique, amendes',
    sheets: ['N530', 'N367', 'N31200', 'F1685'],
    links: [{ label: 'ANTAI : payer ou contester une amende', url: 'https://www.antai.gouv.fr' }],
    entities: ['vehicles'],
    starters: ['Comment contester une amende ?', 'Quand dois-je faire le contrôle technique de ma voiture ?', 'Combien de points ai-je sur mon permis ?']
  },
  {
    id: 'justice',
    num: 9,
    label: 'justice & litiges',
    short: 'justice',
    badge: 'JU',
    category: 'rights',
    color: 'red',
    description: 'recours contre une décision, délais, litiges, aide juridictionnelle',
    sheets: ['N20312', 'F2474', 'F18074', 'F1736'],
    links: [{ label: 'Justice : démarches judiciaires', url: 'https://www.justice.fr' }],
    entities: [],
    starters: [
      'Je veux contester une décision : quels recours et quels délais ?',
      'Ai-je droit à l’aide juridictionnelle ?',
      'Comment régler un litige avec une entreprise ?'
    ]
  },
  {
    id: 'business',
    num: 10,
    label: 'entreprises & activité',
    short: 'entreprises',
    badge: 'EN',
    category: 'rights',
    color: 'yellow',
    description: 'vos entreprises : urssaf, tva, cfe, comptes annuels, formalités',
    sheets: [],
    links: [
      { label: 'Entreprendre : fiches pour les professionnels', url: 'https://entreprendre.service-public.gouv.fr' },
      { label: 'Guichet unique : formalités des entreprises', url: 'https://procedures.inpi.fr' },
      { label: 'Annuaire des entreprises', url: 'https://annuaire-entreprises.data.gouv.fr' }
    ],
    entities: ['companies'],
    starters: ['Quelles sont mes obligations de micro-entrepreneur ce trimestre ?', 'Dois-je facturer la tva ?', 'Quand dois-je déposer mes comptes annuels ?']
  }
]

export const domainInfo = (id: DomainId): DomainInfo => DOMAINS.find((d) => d.id === id)!

export const ENTITY_LABELS: Record<EntityKind, { label: string; one: string }> = {
  companies: { label: 'entreprises', one: 'entreprise' },
  employers: { label: 'employeurs', one: 'employeur' },
  vehicles: { label: 'véhicules', one: 'véhicule' },
  properties: { label: 'logements', one: 'logement' }
}
