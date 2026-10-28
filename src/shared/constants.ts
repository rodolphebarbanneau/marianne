import type { AgentModel, Config, Service, SourceId, SourceInfo } from './types'

/** Releases are published here; the updater reads them through electron-builder's update manifests. */
export const RELEASES_URL = 'https://github.com/rodolphebarbanneau/marianne/releases'

/** Name of the MCP server the agents see: its tools appear as mcp__marianne__<tool>. */
export const MCP_SERVER_NAME = 'marianne'

// ---------------------------------------------------------------- data sources

export const SOURCES: SourceInfo[] = [
  {
    id: 'service-public',
    label: 'Service-Public',
    description: 'fiches pratiques, questions-réponses, formulaires cerfa et téléservices (≈ 7 000 documents, indexés sur cet ordinateur)',
    kind: 'offline',
    defaultUrl: 'https://lecomarquage.service-public.fr/vdd/3.4/part/zip/vosdroits-latest.zip',
    homepage: 'https://www.service-public.gouv.fr',
    license: 'Licence Ouverte 2.0 · DILA'
  },
  {
    id: 'annuaire',
    label: "Annuaire de l'administration",
    description: 'mairies, caf, cpam, préfectures, tribunaux, france services : adresses, horaires, téléphones',
    kind: 'live',
    defaultUrl: 'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration',
    homepage: 'https://lannuaire.service-public.gouv.fr',
    license: 'Licence Ouverte 2.0 · DILA'
  },
  {
    id: 'legifrance',
    label: 'Légifrance',
    description: 'codes, lois et décrets en vigueur, jurisprudence · nécessite un accès api piste gratuit, rangé dans le trousseau',
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
    label: 'data.gouv.fr',
    description: 'catalogue national des données publiques, et lecture des fichiers csv sans les télécharger',
    kind: 'live',
    defaultUrl: 'https://www.data.gouv.fr/api',
    homepage: 'https://www.data.gouv.fr',
    license: 'licence propre à chaque jeu de données'
  },
  {
    id: 'entreprises',
    label: 'Annuaire des entreprises',
    description: 'toutes les entreprises et associations : siren, siège, dirigeants, activité',
    kind: 'live',
    defaultUrl: 'https://recherche-entreprises.api.gouv.fr',
    homepage: 'https://annuaire-entreprises.data.gouv.fr',
    license: 'Licence Ouverte 2.0 · DINUM'
  },
  {
    id: 'geo',
    label: 'Découpage administratif',
    description: 'communes, codes postaux et insee, départements, régions, population',
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
    id: 'calendrier',
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
    description: 'simulation des impôts et des prestations sociales (rsa, prime d’activité, aides au logement…)',
    kind: 'live',
    defaultUrl: 'https://api.fr.openfisca.org/latest',
    homepage: 'https://openfisca.org',
    license: 'AGPL · OpenFisca'
  },
  {
    id: 'assemblee',
    label: 'Assemblée nationale',
    description: 'députés, groupes et commissions (indexés sur cet ordinateur), et les vidéos des séances et réunions',
    kind: 'offline',
    defaultUrl:
      'https://data.assemblee-nationale.fr/static/openData/repository/17/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes.json.zip',
    homepage: 'https://data.assemblee-nationale.fr',
    license: 'Licence Ouverte · Assemblée nationale'
  }
]

export const sourceInfo = (id: SourceId): SourceInfo => SOURCES.find((s) => s.id === id)!

// ---------------------------------------------------------------- public-service websites

/** The sites people most often need, with how they sign in. The assistant can open them in the built-in browser. */
export const SERVICES: Service[] = [
  {
    id: 'service-public',
    name: 'Service-Public',
    url: 'https://www.service-public.gouv.fr',
    domain: 'identite',
    login: 'franceconnect',
    description: 'le site officiel de l’administration : fiches, démarches en ligne, espace personnel'
  },
  {
    id: 'ants',
    name: 'ANTS',
    url: 'https://ants.gouv.fr',
    domain: 'identite',
    login: 'franceconnect',
    description: 'carte d’identité, passeport, permis de conduire, carte grise'
  },
  {
    id: 'france-identite',
    name: 'France Identité',
    url: 'https://france-identite.gouv.fr',
    domain: 'identite',
    login: 'aucun',
    description: 'l’identité numérique sur téléphone, avec la carte d’identité électronique'
  },
  {
    id: 'demarches-simplifiees',
    name: 'Démarches simplifiées',
    url: 'https://www.demarches-simplifiees.fr',
    domain: 'identite',
    login: 'compte',
    description: 'formulaires en ligne de nombreuses administrations et collectivités'
  },
  {
    id: 'impots',
    name: 'impots.gouv.fr',
    url: 'https://www.impots.gouv.fr',
    domain: 'impots',
    login: 'compte',
    description: 'déclaration de revenus, avis d’impôt, prélèvement à la source, taxe foncière, messagerie sécurisée',
    fields: [{ key: 'numero_fiscal', label: 'numéro fiscal', hint: '13 chiffres, en haut à gauche de votre avis d’impôt', pattern: '^[0-9]{13}$' }]
  },
  {
    id: 'antai',
    name: 'ANTAI',
    url: 'https://www.antai.gouv.fr',
    domain: 'mobilite',
    login: 'aucun',
    description: 'payer ou contester une amende, désigner le conducteur'
  },
  {
    id: 'cadastre',
    name: 'Cadastre',
    url: 'https://www.cadastre.gouv.fr',
    domain: 'logement',
    login: 'aucun',
    description: 'plans cadastraux et parcelles'
  },
  {
    id: 'dvf',
    name: 'Prix immobiliers (DVF)',
    url: 'https://explore.data.gouv.fr/fr/immobilier',
    domain: 'logement',
    login: 'aucun',
    description: 'les ventes immobilières réelles, parcelle par parcelle'
  },
  {
    id: 'caf',
    name: 'Caf',
    url: 'https://www.caf.fr',
    domain: 'famille',
    login: 'compte',
    description: 'allocations familiales, aides au logement, rsa, prime d’activité, simulateurs',
    fields: [{ key: 'numero_allocataire', label: 'numéro allocataire', hint: '7 chiffres, sur vos courriers de la caf', pattern: '^[0-9]{7}$' }]
  },
  {
    id: 'msa',
    name: 'MSA',
    url: 'https://www.msa.fr',
    domain: 'famille',
    login: 'compte',
    description: 'la protection sociale du monde agricole',
    needsNir: true
  },
  {
    id: 'mes-droits-sociaux',
    name: 'Mes droits sociaux',
    url: 'https://www.mesdroitssociaux.gouv.fr',
    domain: 'famille',
    login: 'franceconnect',
    description: 'toutes vos prestations sociales au même endroit, et un simulateur d’aides'
  },
  {
    id: 'mes-aides',
    name: '1 jeune 1 solution · mes aides',
    url: 'https://www.1jeune1solution.gouv.fr/mes-aides',
    domain: 'famille',
    login: 'aucun',
    description: 'simulateur des aides pour les jeunes'
  },
  {
    id: 'cheque-energie',
    name: 'Chèque énergie',
    url: 'https://chequeenergie.gouv.fr',
    domain: 'famille',
    login: 'aucun',
    description: 'éligibilité, utilisation et réclamations'
  },
  {
    id: 'ameli',
    name: 'ameli',
    url: 'https://www.ameli.fr',
    domain: 'sante',
    login: 'compte',
    description: 'assurance maladie : remboursements, attestations, arrêts de travail, complémentaire santé solidaire',
    needsNir: true
  },
  {
    id: 'mon-espace-sante',
    name: 'Mon espace santé',
    url: 'https://www.monespacesante.fr',
    domain: 'sante',
    login: 'compte',
    description: 'dossier médical partagé et messagerie santé',
    needsNir: true
  },
  {
    id: 'mdph',
    name: 'MDPH en ligne',
    url: 'https://mdphenligne.cnsa.fr',
    domain: 'sante',
    login: 'compte',
    description: 'demandes auprès de la maison départementale des personnes handicapées',
    fields: [{ key: 'numero_dossier_mdph', label: 'numéro de dossier MDPH' }]
  },
  {
    id: 'france-travail',
    name: 'France Travail',
    url: 'https://www.francetravail.fr',
    domain: 'travail',
    login: 'compte',
    description: 'inscription, actualisation, allocations chômage, offres d’emploi',
    fields: [{ key: 'identifiant_france_travail', label: 'identifiant France Travail', hint: 'sur vos courriers de France Travail' }]
  },
  {
    id: 'mon-compte-formation',
    name: 'Mon compte formation',
    url: 'https://www.moncompteformation.gouv.fr',
    domain: 'travail',
    login: 'franceconnect',
    description: 'vos droits à la formation (cpf) et le catalogue des formations',
    needsNir: true
  },
  {
    id: 'code-travail',
    name: 'Code du travail numérique',
    url: 'https://code.travail.gouv.fr',
    domain: 'travail',
    login: 'aucun',
    description: 'réponses personnalisées sur le droit du travail, conventions collectives, modèles de courriers'
  },
  {
    id: 'info-retraite',
    name: 'Info retraite',
    url: 'https://www.info-retraite.fr',
    domain: 'retraite',
    login: 'franceconnect',
    description: 'relevé de carrière, simulation et demande de retraite, tous régimes',
    needsNir: true
  },
  {
    id: 'assurance-retraite',
    name: 'L’Assurance retraite',
    url: 'https://www.lassuranceretraite.fr',
    domain: 'retraite',
    login: 'compte',
    description: 'la retraite de base du régime général',
    needsNir: true
  },
  {
    id: 'agirc-arrco',
    name: 'Agirc-Arrco',
    url: 'https://www.agirc-arrco.fr',
    domain: 'retraite',
    login: 'compte',
    description: 'la retraite complémentaire des salariés du privé',
    needsNir: true
  },
  {
    id: 'logement-social',
    name: 'Demande de logement social',
    url: 'https://www.demande-logement-social.gouv.fr',
    domain: 'logement',
    login: 'compte',
    description: 'déposer et renouveler une demande de logement social',
    fields: [{ key: 'numero_demande_logement', label: 'numéro unique de demande', hint: 'sur l’attestation d’enregistrement de votre demande' }]
  },
  {
    id: 'france-renov',
    name: 'France Rénov’',
    url: 'https://france-renov.gouv.fr',
    domain: 'logement',
    login: 'aucun',
    description: 'aides à la rénovation énergétique, maprimerénov’'
  },
  {
    id: 'anil',
    name: 'ANIL · ADIL',
    url: 'https://www.anil.org',
    domain: 'logement',
    login: 'aucun',
    description: 'conseil juridique gratuit sur le logement : bail, loyers, copropriété'
  },
  {
    id: 'georisques',
    name: 'Géorisques',
    url: 'https://www.georisques.gouv.fr',
    domain: 'logement',
    login: 'aucun',
    description: 'les risques naturels et technologiques à une adresse'
  },
  {
    id: 'justice',
    name: 'Justice.fr',
    url: 'https://www.justice.fr',
    domain: 'justice',
    login: 'aucun',
    description: 'démarches judiciaires, formulaires, aide juridictionnelle, trouver un tribunal'
  },
  {
    id: 'telerecours',
    name: 'Télérecours citoyens',
    url: 'https://citoyens.telerecours.fr',
    domain: 'justice',
    login: 'compte',
    description: 'saisir le tribunal administratif en ligne et suivre son dossier'
  },
  {
    id: 'legifrance',
    name: 'Légifrance',
    url: 'https://www.legifrance.gouv.fr',
    domain: 'justice',
    login: 'aucun',
    description: 'les codes, lois, décrets et la jurisprudence'
  },
  {
    id: 'defenseur-des-droits',
    name: 'Défenseur des droits',
    url: 'https://www.defenseurdesdroits.fr',
    domain: 'justice',
    login: 'aucun',
    description: 'recours gratuit en cas de litige avec un service public ou de discrimination'
  },
  {
    id: 'signal-conso',
    name: 'SignalConso',
    url: 'https://signal.conso.gouv.fr',
    domain: 'justice',
    login: 'aucun',
    description: 'signaler un problème avec une entreprise'
  },
  {
    id: 'crit-air',
    name: 'Crit’Air',
    url: 'https://www.certificat-air.gouv.fr',
    domain: 'mobilite',
    login: 'aucun',
    description: 'la vignette qualité de l’air'
  },
  {
    id: 'histovec',
    name: 'HistoVec',
    url: 'https://histovec.interieur.gouv.fr',
    domain: 'mobilite',
    login: 'aucun',
    description: 'l’historique d’un véhicule d’occasion'
  },
  {
    id: 'urssaf-ae',
    name: 'Urssaf auto-entrepreneur',
    url: 'https://www.autoentrepreneur.urssaf.fr',
    domain: 'entreprises',
    login: 'compte',
    description: 'déclarer son chiffre d’affaires et payer ses cotisations',
    fields: [{ key: 'siret_micro', label: 'siret de la micro-entreprise', hint: '14 chiffres', pattern: '^[0-9]{14}$' }]
  },
  {
    id: 'mon-entreprise',
    name: 'mon-entreprise',
    url: 'https://mon-entreprise.urssaf.fr',
    domain: 'entreprises',
    login: 'aucun',
    description: 'simulateurs officiels : salaire, cotisations, statut, revenus d’indépendant'
  },
  {
    id: 'guichet-unique',
    name: 'Guichet unique INPI',
    url: 'https://procedures.inpi.fr',
    domain: 'entreprises',
    login: 'compte',
    description: 'créer, modifier ou fermer une entreprise'
  },
  {
    id: 'annuaire-entreprises',
    name: 'Annuaire des entreprises',
    url: 'https://annuaire-entreprises.data.gouv.fr',
    domain: 'entreprises',
    login: 'aucun',
    description: 'les informations légales de toutes les entreprises'
  },
  {
    id: 'elections',
    name: 'Ma situation électorale',
    url: 'https://situation.elections.interieur.gouv.fr',
    domain: 'identite',
    login: 'franceconnect',
    description: 'vérifier son inscription et son bureau de vote'
  },
  {
    id: 'assemblee',
    name: 'Assemblée nationale',
    url: 'https://www.assemblee-nationale.fr',
    domain: 'identite',
    login: 'aucun',
    description: 'députés, textes, scrutins, vidéos des débats'
  },
  {
    id: 'senat',
    name: 'Sénat',
    url: 'https://www.senat.fr',
    domain: 'identite',
    login: 'aucun',
    description: 'sénateurs, textes et débats'
  },
  {
    id: 'vie-publique',
    name: 'Vie publique',
    url: 'https://www.vie-publique.fr',
    domain: 'identite',
    login: 'aucun',
    description: 'comprendre les lois en préparation et les institutions'
  },
  {
    id: 'data-gouv',
    name: 'data.gouv.fr',
    url: 'https://www.data.gouv.fr',
    domain: 'identite',
    login: 'aucun',
    description: 'toutes les données publiques ouvertes'
  },
  {
    id: 'ma-securite',
    name: 'Ma sécurité',
    url: 'https://www.masecurite.interieur.gouv.fr',
    domain: 'identite',
    login: 'aucun',
    description: 'pré-plainte en ligne, signalements, contacter la police ou la gendarmerie'
  }
]

/**
 * Websites the assistant may read in "public sites only" mode, besides every catalog site and
 * source: institutions and ministries it often needs to cite.
 */
export const PUBLIC_HOSTS = [
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

/** Every host the assistant may read in "public sites only" mode. */
export function publicHosts(custom: Service[] = []): string[] {
  const hosts = new Set(PUBLIC_HOSTS)
  for (const url of [...SERVICES, ...custom].map((s) => s.url).concat(SOURCES.map((s) => s.homepage))) {
    try {
      hosts.add(new URL(url).hostname)
    } catch {
      // ignore malformed custom urls
    }
  }
  return [...hosts].sort()
}

// ---------------------------------------------------------------- agents

/** Claude Code model aliases always resolve to the latest model of each family. */
export const CLAUDE_CODE_MODELS: AgentModel[] = [
  { id: 'haiku', label: 'haiku' },
  { id: 'sonnet', label: 'sonnet' },
  { id: 'opus', label: 'opus' },
  { id: 'fable', label: 'fable' }
]

/** Fallback when Codex's own model catalog (~/.codex/models_cache.json) can't be read. */
export const CODEX_MODELS: AgentModel[] = [
  { id: 'gpt-6-luna', label: 'gpt-6-luna' },
  { id: 'gpt-6.1-terra', label: 'gpt-6.1-terra' },
  { id: 'gpt-6.1-sol', label: 'gpt-6.1-sol' }
]

const source = (enabled = true) => ({ enabled, url: '' })

export const DEFAULT_CONFIG: Config = {
  onboarded: false,
  ui: { theme: 'minitel', retroFont: true, crt: true, textSize: 19, chatOpen: true, chatWidth: 470 },
  background: { launchAtLogin: true, reminders: true },
  agent: {
    provider: 'claude-code',
    // Answers about rights and deadlines need care more than speed: a mid-size model by default.
    claudeCode: { path: '', model: 'sonnet', effort: 'medium' },
    codex: { path: '', model: 'gpt-6.1-terra', effort: 'medium' },
    web: 'public',
    customInstructions: '',
    maxMinutes: 10
  },
  sources: Object.fromEntries(SOURCES.map((s) => [s.id, source()])) as Record<SourceId, { enabled: boolean; url: string }>,
  sync: { auto: true, everyHours: 24 },
  skills: { disabled: [] },
  services: { custom: [] },
  updates: { auto: true }
}

/** claude-opus-5-5 → opus 5.5 (other model names are returned unchanged). */
export function shortModel(model: string): string {
  const m = model.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-|$)/)
  return m ? `${m[1]} ${m[2]}${m[3] ? '.' + m[3] : ''}` : model
}
