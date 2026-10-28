import type { DomainId, EntityKind } from './dossier'

/**
 * The domains of the app: one page each, built the same way (deadlines, services, information,
 * procedures, documents, references). Defined as data so a domain can change without UI code.
 */

export type Color = 'bleu' | 'rouge' | 'magenta' | 'vert' | 'cyan' | 'jaune' | 'blanc'

export interface DomainInfo {
  id: DomainId
  num: number
  label: string
  /** Name on the Minitel sommaire. */
  short: string
  /** Videotex service code shown in the page header. */
  code: string
  color: Color
  description: string
  /** Key Service-Public documents of the domain (ids in the local index). */
  fiches: string[]
  /** References outside the index. */
  links: Array<{ label: string; url: string }>
  /** Linked entities shown on the page. */
  entities: EntityKind[]
  /** Questions to start a conversation from the page. */
  starters: string[]
}

export const DOMAINS: DomainInfo[] = [
  {
    id: 'identite',
    num: 1,
    label: 'identité & citoyenneté',
    short: 'identité',
    code: '3615 IDENTITE',
    color: 'cyan',
    description: 'papiers d’identité, état civil, élections, vie démocratique',
    fiches: ['N358', 'N360', 'F1367', 'N530'],
    links: [{ label: 'ANTS : prédemande et suivi des titres', url: 'https://ants.gouv.fr' }],
    entities: [],
    starters: [
      'Mes papiers d’identité sont-ils à jour, et comment les renouveler ?',
      'Comment déclarer mon changement d’adresse à toutes les administrations ?',
      'Qui est mon député et comment a-t-il voté récemment ?'
    ]
  },
  {
    id: 'sante',
    num: 2,
    label: 'santé',
    short: 'santé',
    code: '3615 SANTE',
    color: 'vert',
    description: 'assurance maladie, complémentaire santé, arrêts de travail, handicap',
    fiches: ['F10027', 'F163', 'F265', 'F303'],
    links: [{ label: 'ameli : remboursements et attestations', url: 'https://www.ameli.fr' }],
    entities: [],
    starters: [
      'Ai-je droit à la complémentaire santé solidaire ?',
      'Comment déclarer mon médecin traitant ?',
      'Je suis en arrêt maladie : que dois-je faire et que vais-je toucher ?'
    ]
  },
  {
    id: 'impots',
    num: 3,
    label: 'impôts & finances',
    short: 'impôts',
    code: '3615 IMPOTS',
    color: 'jaune',
    description: 'impôt sur le revenu, prélèvement à la source, taxe foncière, échéanciers de paiement',
    fiches: ['F358', 'F34009', 'F59', 'F110'],
    links: [{ label: 'impots.gouv.fr : espace particulier', url: 'https://cfspart.impots.gouv.fr' }],
    entities: [],
    starters: [
      'Aide-moi à préparer ma déclaration de revenus.',
      'Puis-je payer mon impôt en plusieurs fois ou obtenir un délai ?',
      'Combien vais-je payer d’impôt sur le revenu cette année ?'
    ]
  },
  {
    id: 'famille',
    num: 4,
    label: 'famille & solidarités',
    short: 'famille',
    code: '3615 FAMILLE',
    color: 'magenta',
    description: 'caf et msa : allocations familiales, aides au logement, rsa, prime d’activité',
    fiches: ['N31477', 'N19775', 'F13213', 'F12006'],
    links: [{ label: 'Mes droits sociaux : simulateur de toutes les aides', url: 'https://www.mesdroitssociaux.gouv.fr' }],
    entities: [],
    starters: ['Quelles aides puis-je demander pour mon foyer ?', 'Ai-je droit à la prime d’activité ?', 'J’ai reçu un indu de la caf : que faire ?']
  },
  {
    id: 'travail',
    num: 5,
    label: 'travail & emploi',
    short: 'travail',
    code: '3615 TRAVAIL',
    color: 'bleu',
    description: 'contrats et employeurs, chômage, formation',
    fiches: ['F1636', 'F19030', 'F2855', 'F10705'],
    links: [{ label: 'Code du travail numérique', url: 'https://code.travail.gouv.fr' }],
    entities: ['employeurs'],
    starters: [
      'Quel préavis dois-je respecter si je démissionne ?',
      'Comment s’inscrire à France Travail et quels droits au chômage ?',
      'Comment utiliser mon compte personnel de formation ?'
    ]
  },
  {
    id: 'retraite',
    num: 6,
    label: 'retraite',
    short: 'retraite',
    code: '3615 RETRAITE',
    color: 'cyan',
    description: 'relevé de carrière, âge et montant de la retraite, réversion',
    fiches: ['N381', 'F14044', 'F12842', 'F13104'],
    links: [{ label: 'Info retraite : relevé de carrière tous régimes', url: 'https://www.info-retraite.fr' }],
    entities: [],
    starters: ['À quel âge pourrai-je partir à la retraite ?', 'Comment vérifier mon relevé de carrière ?', 'Comment demander une pension de réversion ?']
  },
  {
    id: 'logement',
    num: 7,
    label: 'logement',
    short: 'logement',
    code: '3615 LOGEMENT',
    color: 'vert',
    description: 'bail et loyer, aides au logement, rénovation, risques à l’adresse',
    fiches: ['N337', 'N19424', 'F31269', 'F35083'],
    links: [{ label: 'ANIL : conseil juridique gratuit sur le logement', url: 'https://www.anil.org' }],
    entities: ['logements'],
    starters: ['Mon propriétaire peut-il augmenter mon loyer ?', 'Quand récupérer mon dépôt de garantie ?', 'Quelles aides pour rénover mon logement ?']
  },
  {
    id: 'justice',
    num: 8,
    label: 'justice & litiges',
    short: 'justice',
    code: '3615 JUSTICE',
    color: 'rouge',
    description: 'recours contre une décision, délais, litiges, aide juridictionnelle',
    fiches: ['N20312', 'F2474', 'F18074', 'F1736'],
    links: [{ label: 'Justice.fr : démarches judiciaires', url: 'https://www.justice.fr' }],
    entities: [],
    starters: [
      'Je veux contester une décision : quels recours et quels délais ?',
      'Ai-je droit à l’aide juridictionnelle ?',
      'Comment régler un litige avec une entreprise ?'
    ]
  },
  {
    id: 'entreprises',
    num: 9,
    label: 'entreprises & activité',
    short: 'entreprises',
    code: '3615 ENTREPRISES',
    color: 'jaune',
    description: 'vos entreprises : urssaf, tva, cfe, comptes annuels, formalités',
    fiches: [],
    links: [
      { label: 'Entreprendre.Service-Public : fiches pour les professionnels', url: 'https://entreprendre.service-public.gouv.fr' },
      { label: 'Guichet unique INPI : formalités', url: 'https://procedures.inpi.fr' },
      { label: 'Annuaire des entreprises', url: 'https://annuaire-entreprises.data.gouv.fr' }
    ],
    entities: ['entreprises'],
    starters: ['Quelles sont mes obligations de micro-entrepreneur ce trimestre ?', 'Dois-je facturer la tva ?', 'Quand dois-je déposer mes comptes annuels ?']
  },
  {
    id: 'mobilite',
    num: 10,
    label: 'mobilité',
    short: 'mobilité',
    code: '3615 MOBILITE',
    color: 'magenta',
    description: 'permis, véhicules, carte grise, contrôle technique, amendes',
    fiches: ['N530', 'N367', 'N31200', 'F1685'],
    links: [{ label: 'ANTAI : payer ou contester une amende', url: 'https://www.antai.gouv.fr' }],
    entities: ['vehicules'],
    starters: ['Comment contester une amende ?', 'Quand dois-je faire le contrôle technique de ma voiture ?', 'Combien de points ai-je sur mon permis ?']
  }
]

export const domainInfo = (id: DomainId): DomainInfo => DOMAINS.find((d) => d.id === id)!

export const ENTITY_LABELS: Record<EntityKind, { label: string; one: string }> = {
  entreprises: { label: 'entreprises', one: 'entreprise' },
  employeurs: { label: 'employeurs', one: 'employeur' },
  vehicules: { label: 'véhicules', one: 'véhicule' },
  logements: { label: 'logements', one: 'logement' }
}
