import * as z from 'zod'
import { frDate, monthDay, newKey, today, type DomainId, type Dossier, type DossierOp, type EntityKind } from '../../shared/dossier'
import { DOMAINS, domainInfo } from '../../shared/domains'
import { setupRoute } from '../../shared/setup'
import { actions } from '../actions'
import { contextView } from '../dossier/context'
import { demarche, demarches } from '../dossier/demarches'
import { documentText } from '../dossier/documents'
import { dossier } from '../dossier/store'
import { vault } from '../vault'
import { navigate } from '../windows'
import { searchAddress } from './geo'
import { clip, plural, tool, ToolError } from './tool'

/** The agent's access to the personal file: context, navigation, cards, deadlines, procedures. */

const DOMAIN_IDS = DOMAINS.map((d) => d.id) as [DomainId, ...DomainId[]]
const ROUTE = /^(moi|dossier|entites|agenda|documents|domaine\/[a-z]+|demarche\/[a-z0-9-]+|fiche\/[FNR]\d+|reglages\/[a-z]+)(#[\w:.-]+)?$/

/** Configuration targets the agent can send the user to. */
export const setupTarget = (target: string) => setupRoute(target, dossier.services())

// ---------------------------------------------------------------- proposals

type Kind = 'echeance' | 'entreprise' | 'employeur' | 'vehicule' | 'logement' | 'piece' | 'compte' | 'personne' | 'adresse' | 'membre_foyer' | 'journal'

/** Fields the agent may set, by kind, with their labels (the card shows them). */
const FIELDS: Record<Kind, { keys: Record<string, string>; required: string[]; entity?: EntityKind }> = {
  echeance: { keys: { titre: 'intitulé', date: 'date', domaine: 'domaine', note: 'note' }, required: ['titre', 'date', 'domaine'] },
  entreprise: {
    keys: {
      siren: 'siren',
      denomination: 'nom',
      forme: 'forme',
      activite: 'activité',
      creation: 'création',
      adresse: 'adresse',
      role: 'rôle',
      regime: 'régime',
      periodicite: 'périodicité urssaf',
      tva: 'tva',
      cloture: 'clôture'
    },
    required: ['siren'],
    entity: 'entreprises'
  },
  employeur: {
    keys: { nom: 'nom', siren: 'siren', poste: 'poste', contrat: 'contrat', debut: 'début', fin: 'fin', idcc: 'convention (idcc)' },
    required: ['nom'],
    entity: 'employeurs'
  },
  vehicule: {
    keys: {
      immatriculation: 'immatriculation',
      modele: 'modèle',
      premiereImmatriculation: '1re immatriculation',
      dernierControle: 'dernier contrôle technique',
      critair: 'crit’air'
    },
    required: ['immatriculation'],
    entity: 'vehicules'
  },
  logement: {
    keys: { adresse: 'adresse', codeInsee: 'code insee', usage: 'usage', statut: 'statut', loyer: 'loyer', debutBail: 'début du bail', bailleur: 'bailleur' },
    required: ['adresse'],
    entity: 'logements'
  },
  piece: { keys: { type: 'type', numero: 'numéro', delivrance: 'délivrance', expiration: 'expiration' }, required: ['type'] },
  compte: { keys: { serviceId: 'service' }, required: ['serviceId'] },
  personne: {
    keys: {
      civilite: 'civilité',
      nomNaissance: 'nom de naissance',
      nomUsage: 'nom d’usage',
      prenoms: 'prénoms',
      dateNaissance: 'date de naissance',
      communeNaissance: 'commune de naissance',
      paysNaissance: 'pays de naissance',
      nationalite: 'nationalité',
      nir: 'n° de sécurité sociale',
      situationFamiliale: 'situation familiale',
      situationPro: 'situation professionnelle',
      telephone: 'téléphone',
      email: 'courriel'
    },
    required: []
  },
  adresse: {
    keys: { rue: 'numéro et rue', complement: 'complément', codePostal: 'code postal', commune: 'commune', codeInsee: 'code insee', depuis: 'depuis' },
    required: ['rue', 'codePostal', 'commune']
  },
  membre_foyer: { keys: { lien: 'lien', prenom: 'prénom', nom: 'nom', dateNaissance: 'date de naissance', aCharge: 'à charge' }, required: ['lien', 'prenom'] },
  journal: { keys: { domaine: 'domaine', texte: 'texte' }, required: ['domaine', 'texte'] }
}

const ENUMS: Record<string, string[]> = {
  domaine: DOMAIN_IDS,
  regime: ['micro', 'ei_reel', 'societe_is', 'societe_ir', 'association'],
  role: ['dirigeant', 'associe', 'entrepreneur', 'autre'],
  periodicite: ['', 'mensuelle', 'trimestrielle'],
  tva: ['', 'franchise', 'reel_simplifie', 'reel_normal'],
  contrat: ['cdi', 'cdd', 'interim', 'apprentissage', 'fonction_publique', 'autre'],
  usage: ['residence_principale', 'residence_secondaire', 'locatif'],
  statut: ['locataire', 'proprietaire', 'heberge'],
  type: ['cni', 'passeport', 'permis', 'titre_sejour', 'carte_vitale'],
  lien: ['conjoint', 'enfant', 'autre'],
  situationFamiliale: ['', 'celibataire', 'marie', 'pacse', 'concubinage', 'divorce', 'veuf'],
  situationPro: ['', 'salarie', 'fonctionnaire', 'independant', 'demandeur_emploi', 'etudiant', 'retraite', 'sans_activite'],
  civilite: ['', 'M.', 'Mme']
}

const DATE_KEYS = new Set([
  'date',
  'creation',
  'debut',
  'fin',
  'premiereImmatriculation',
  'dernierControle',
  'debutBail',
  'delivrance',
  'expiration',
  'dateNaissance',
  'depuis'
])

/** Values as the file stores them: dates in AAAA-MM-JJ (dd/mm/yyyy accepted), year ends in MM-JJ. */
function normalizeData(data: Record<string, string>): Record<string, string> {
  const out = { ...data }
  const pad = (n: number | string) => String(n).padStart(2, '0')
  for (const [key, value] of Object.entries(out)) {
    const fr = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (DATE_KEYS.has(key) && fr) out[key] = `${fr[3]}-${pad(fr[2])}-${pad(fr[1])}`
    if (key === 'cloture' && value) {
      const md = monthDay(value)
      if (!md) throw new ToolError(`Date de clôture invalide : « ${value} ». Format MM-JJ attendu (31 décembre : 12-31).`)
      out[key] = `${pad(md[0])}-${pad(md[1])}`
    }
  }
  return out
}

/** Values allowed; `full`: an addition, whose required fields must be there. */
function check(kind: Kind, data: Record<string, string>, full = true): void {
  if (full) for (const key of FIELDS[kind].required) if (!String(data[key] ?? '').trim()) throw new ToolError(`Champ requis manquant : ${key}`)
  for (const [key, value] of Object.entries(data)) {
    if (ENUMS[key] && !ENUMS[key].includes(value)) throw new ToolError(`Valeur invalide pour ${key} : « ${value} ». Valeurs : ${ENUMS[key].join(', ')}`)
    if (DATE_KEYS.has(key) && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ToolError(`Date invalide pour ${key} : format AAAA-MM-JJ attendu.`)
  }
}

/** The operation to apply, and what the card shows. */
function plan(
  kind: Kind,
  operation: 'ajouter' | 'modifier' | 'supprimer',
  id: string | undefined,
  data: Record<string, string>,
  d: Dossier
): { op: DossierOp; title: string; fields: Array<{ label: string; value: string }> } {
  const spec = FIELDS[kind]
  const service = kind === 'compte' ? dossier.services().find((s) => s.id === data.serviceId) : undefined
  const labels = { ...spec.keys, ...Object.fromEntries((service?.fields ?? []).map((f) => [f.key, f.label])) }
  const unknown = Object.keys(data).filter((k) => !labels[k])
  if (unknown.length) throw new ToolError(`Champs inconnus pour ${kind} : ${unknown.join(', ')}. Champs possibles : ${Object.keys(labels).join(', ')}`)
  const fields = Object.entries(data)
    .filter(([, v]) => String(v).trim())
    .map(([k, v]) => ({ label: labels[k], value: DATE_KEYS.has(k) ? frDate(v) : k === 'domaine' ? (domainInfo(v as DomainId)?.label ?? v) : String(v) }))
  const verb = { ajouter: 'ajouter', modifier: 'modifier', supprimer: 'supprimer' }[operation]

  if (spec.entity) {
    const list = d[spec.entity] as Array<{ id: string }>
    const existing = id ? list.find((x) => x.id === id) : undefined
    if (operation !== 'ajouter' && !existing)
      throw new ToolError(`Aucun élément ${id ?? '(id manquant)'} parmi ${spec.entity}. Ids : ${list.map((x) => x.id).join(', ') || 'aucun'}`)
    if (operation === 'supprimer')
      return { op: { type: 'deleteEntity', kind: spec.entity, id: existing!.id }, title: `${verb} : ${kind}`, fields: summary(existing!) }
    check(kind, data, operation === 'ajouter')
    const item = { ...(existing ?? EMPTY_ENTITY[spec.entity]), ...data, id: existing?.id ?? newKey() }
    return { op: { type: 'entity', kind: spec.entity, item } as DossierOp, title: `${verb} : ${kind}`, fields }
  }
  switch (kind) {
    case 'echeance': {
      if (operation === 'supprimer') {
        const x = d.deadlines.find((y) => y.id === id)
        if (!x) throw new ToolError('Échéance inconnue (seules celles ajoutées à la main se suppriment).')
        return { op: { type: 'deleteDeadline', id: x.id }, title: 'supprimer une échéance', fields: [{ label: 'intitulé', value: x.title }] }
      }
      check(kind, data)
      const existing = id ? d.deadlines.find((y) => y.id === id) : undefined
      return {
        op: {
          type: 'deadline',
          deadline: {
            id: existing?.id ?? newKey(),
            title: data.titre,
            date: data.date,
            domain: data.domaine as DomainId,
            note: data.note ?? '',
            source: 'agent'
          }
        },
        title: `${verb} une échéance`,
        fields
      }
    }
    case 'piece': {
      const existing = id ? d.pieces.find((p) => p.id === id) : undefined
      if (operation !== 'ajouter' && !existing)
        throw new ToolError(`Pièce inconnue : ${id ?? '(id manquant)'}. Ids : ${d.pieces.map((p) => p.id).join(', ') || 'aucune'}`)
      if (operation === 'supprimer')
        return {
          op: { type: 'deletePiece', id: existing!.id },
          title: 'supprimer une pièce',
          fields: [{ label: 'pièce', value: `${existing!.type}${existing!.expiration ? `, valable jusqu’au ${frDate(existing!.expiration)}` : ''}` }]
        }
      check(kind, data, operation === 'ajouter')
      const piece = {
        id: existing?.id ?? newKey(),
        titulaire: 'moi',
        numero: '',
        delivrance: '',
        expiration: '',
        ...existing,
        ...data
      } as Dossier['pieces'][number]
      return { op: { type: 'piece', piece }, title: `${verb} une pièce d’identité`, fields }
    }
    case 'compte': {
      if (!service) throw new ToolError(`Service inconnu : ${data.serviceId}. Utilise un identifiant du catalogue (sites_publics).`)
      if (operation === 'supprimer') return { op: { type: 'deleteAccount', serviceId: service.id }, title: `retirer le compte ${service.name}`, fields: [] }
      const { serviceId: _s, ...rest } = data
      const current = d.accounts.find((a) => a.serviceId === service.id)
      return {
        op: { type: 'account', account: { serviceId: service.id, fields: { ...current?.fields, ...rest }, since: current?.since ?? '' } },
        title: `configurer le compte ${service.name}`,
        fields: fields.filter((f) => f.label !== 'service')
      }
    }
    case 'personne':
      check(kind, data)
      return { op: { type: 'person', patch: data }, title: 'modifier votre identité', fields }
    case 'adresse': {
      check(kind, data)
      // Another commune: its insee code and the coordinates of the old address no longer apply.
      const moved = data.codePostal !== d.address.codePostal || data.commune.toLowerCase() !== d.address.commune.toLowerCase()
      const address = moved ? { ...d.address, codeInsee: '', lat: undefined, lon: undefined, ...data } : { ...d.address, ...data }
      return { op: { type: 'address', address }, title: 'modifier votre adresse', fields }
    }
    case 'membre_foyer': {
      const existing = id ? d.household.find((m) => m.id === id) : undefined
      if (operation !== 'ajouter' && !existing)
        throw new ToolError(`Membre du foyer inconnu : ${id ?? '(id manquant)'}. Ids : ${d.household.map((m) => m.id).join(', ') || 'aucun'}`)
      if (operation === 'supprimer')
        return { op: { type: 'deleteMember', id: existing!.id }, title: 'retirer un membre du foyer', fields: [{ label: 'membre', value: existing!.lien }] }
      check(kind, data, operation === 'ajouter')
      const member = {
        id: existing?.id ?? newKey(),
        prenom: '',
        nom: '',
        dateNaissance: '',
        lien: 'enfant',
        ...existing,
        ...data,
        aCharge: String(data.aCharge ?? existing?.aCharge) === 'true'
      }
      return { op: { type: 'member', member: member as Dossier['household'][number] }, title: `${verb} un membre du foyer`, fields }
    }
    default:
      throw new ToolError('Type non pris en charge.')
  }
}

const EMPTY_ENTITY: Record<EntityKind, object> = {
  entreprises: {
    siren: '',
    denomination: '',
    forme: '',
    activite: '',
    creation: '',
    adresse: '',
    role: 'dirigeant',
    regime: 'micro',
    periodicite: '',
    tva: '',
    cloture: '12-31'
  },
  employeurs: { nom: '', siren: '', poste: '', contrat: 'cdi', debut: '', fin: '', idcc: '' },
  vehicules: { immatriculation: '', modele: '', premiereImmatriculation: '', dernierControle: '', critair: '' },
  logements: { adresse: '', codeInsee: '', usage: 'residence_principale', statut: 'locataire', loyer: '', debutBail: '', bailleur: '' }
}

const summary = (o: object) =>
  Object.entries(o)
    .filter(([k, v]) => k !== 'id' && String(v).trim())
    .slice(0, 6)
    .map(([k, v]) => ({ label: k, value: String(v) }))

// ---------------------------------------------------------------- tools

export const dossierTools = [
  tool({
    name: 'dossier',
    title: 'Dossier',
    readOnly: true,
    description:
      "Le dossier personnel de l'utilisateur, sans ses identifiants : âge, commune, foyer, situation, entités liées (entreprises, employeurs, véhicules, logements), services configurés par domaine, échéances proches, et ce qui n'est pas configuré. Les identifiants y figurent sous forme de jetons [[nir]], [[numero_fiscal]]… que l'application remplace localement : utilise-les tels quels dans les courriers, formulaires et arguments d'outils. À consulter avant toute question personnelle.",
    input: { domaine: z.enum(DOMAIN_IDS).optional().describe('Restreindre aux services et échéances d’un domaine') },
    run: async ({ domaine }) =>
      contextView(dossier.get(), {
        services: dossier.services(),
        tokens: dossier.tokens(),
        deadlines: dossier.deadlines(),
        hasLogin: (url) => vault.hasLogin(url),
        domain: domaine
      })
  }),

  tool({
    name: 'demander_configuration',
    title: 'Configuration requise',
    description:
      "Quand une information du dossier manque pour répondre (compte non configuré, numéro fiscal, adresse, entreprise…), affiche à l'utilisateur une carte qui l'emmène à l'écran où la renseigner. Cibles : identite, adresse, foyer, pieces, notes, entreprises, employeurs, vehicules, logements, compte:<id du service> (ex. compte:impots, compte:caf), trousseau, legifrance, agent. Ne demande jamais d'identifiant dans la conversation : utilise cet outil.",
    input: {
      cible: z.string().describe('ex. "compte:impots", "adresse", "entreprises"'),
      raison: z.string().describe('Pourquoi il en a besoin, en une phrase adressée à l’utilisateur')
    },
    run: async ({ cible, raison }, ctx) => {
      const target = setupTarget(cible.trim())
      if (!target) throw new ToolError(`Cible inconnue : ${cible}.`)
      const shown = actions.setup(ctx.conversationId, { route: target.route, label: target.label, reason: raison })
      return shown
        ? `Carte affichée : « configurer ${target.label} ». Explique brièvement à l'utilisateur ce qu'il doit renseigner, puis arrête-toi : il reprendra la conversation une fois la configuration faite.`
        : `Écran de configuration : ${target.label} (réglages de Marianne). Indique-le à l'utilisateur.`
    }
  }),

  tool({
    name: 'afficher',
    title: 'Afficher un écran',
    description:
      'Affiche un écran de Marianne à côté de la conversation : moi (tableau de bord), dossier (identité, adresse, foyer, pièces), entites, agenda, documents, domaine/<id> (identite, sante, impots, famille, travail, retraite, logement, justice, entreprises, mobilite), demarche/<id>, fiche/<id Service-Public>, reglages/<page> (general, agent, sources, keychain, skills, backup, about). Un ancre est possible : entites#vehicules.',
    input: { ecran: z.string().regex(ROUTE, 'écran inconnu') },
    run: async ({ ecran }) => {
      navigate(ecran)
      return `Écran affiché : ${ecran}.`
    }
  }),

  tool({
    name: 'proposer',
    title: 'Proposition',
    description:
      "Propose une modification du dossier : l'utilisateur voit une carte avec les valeurs exactes et accepte ou refuse ; le résultat t'est renvoyé. Types : echeance (titre, date AAAA-MM-JJ, domaine, note), entreprise (siren, denomination, forme, activite, creation, adresse, role, regime micro|ei_reel|societe_is|societe_ir|association, periodicite mensuelle|trimestrielle, tva franchise|reel_simplifie|reel_normal, cloture MM-JJ), employeur (nom, siren, poste, contrat, debut, fin, idcc), vehicule (immatriculation, modele, premiereImmatriculation, dernierControle, critair), logement (adresse, usage, statut, loyer, debutBail, bailleur), piece (type cni|passeport|permis|titre_sejour|carte_vitale, numero, delivrance, expiration), compte (serviceId et ses champs, ex. numero_fiscal), personne, adresse, membre_foyer (lien, prenom, nom, dateNaissance, aCharge), journal (domaine, texte : trace d'une démarche faite). Les jetons [[…]] sont acceptés. Pour modifier ou supprimer, donne l'id (vu dans dossier ou agenda).",
    input: {
      type: z.enum(Object.keys(FIELDS) as [Kind, ...Kind[]]),
      operation: z.enum(['ajouter', 'modifier', 'supprimer']).default('ajouter'),
      id: z.string().optional(),
      donnees: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
      raison: z.string().describe('Pourquoi, en une phrase pour l’utilisateur')
    },
    run: async ({ type, operation, id, donnees, raison }, ctx) => {
      const data = Object.fromEntries(Object.entries(donnees).map(([k, v]) => [k, String(v).trim()]))
      if (type === 'journal') {
        if (!DOMAIN_IDS.includes(data.domaine as DomainId) || !data.texte) throw new ToolError('domaine et texte requis')
        dossier.journal(data.domaine as DomainId, data.texte)
        return 'Ajouté au journal.'
      }
      const unresolved = Object.values(data).filter((v) => /\[\[[a-z0-9_.]+\]\]/i.test(v))
      if (unresolved.length)
        throw new ToolError(
          `Jetons sans valeur dans le dossier : ${unresolved.join(', ')}. Utilise demander_configuration pour que l'utilisateur les renseigne.`
        )
      const values = normalizeData(data)
      // A new address: its commune's insee code, from the national address base.
      if (type === 'adresse' && values.rue && values.codePostal && !values.codeInsee) {
        const found = await searchAddress(`${values.rue} ${values.codePostal} ${values.commune ?? ''}`).catch(() => [])
        const match = found.find((a) => a.codePostal === values.codePostal)
        if (match?.codeInsee) values.codeInsee = match.codeInsee
      }
      const p = plan(type, operation, id, values, dossier.get())
      const decision = await actions.request(ctx.conversationId, { kind: 'proposal', title: p.title, reason: raison, fields: p.fields })
      if (decision === 'refused') return "L'utilisateur a refusé. Ne recommence pas sans qu'il le demande."
      if (decision === 'expired') return "Pas de réponse de l'utilisateur (ou pas de conversation où afficher la carte) : rien n'a été modifié."
      // Applied to the file as it is now: the user may have changed it while the card waited.
      let current: ReturnType<typeof plan>
      try {
        current = plan(type, operation, id, values, dossier.get())
      } catch (err) {
        throw new ToolError(`Le dossier a changé pendant que la carte attendait, rien n'a été modifié : ${(err as Error).message}`)
      }
      dossier.apply(current.op)
      return `Accepté et enregistré : ${p.title}.`
    }
  }),

  tool({
    name: 'echeances',
    title: 'Échéances',
    readOnly: true,
    description:
      "Les échéances de l'utilisateur : calculées depuis son dossier (déclarations urssaf, comptes annuels, pièces qui expirent, contrôle technique…), le calendrier officiel et celles qu'il a ajoutées, avec leur statut et leur clé.",
    input: {
      domaine: z.enum(DOMAIN_IDS).optional(),
      jours: z.number().int().min(1).max(730).default(120),
      toutes: z.boolean().default(false).describe('Inclure celles faites ou ignorées')
    },
    run: async ({ domaine, jours, toutes }) => {
      const day = (offset: number) => today(new Date(Date.now() + offset * 86_400_000))
      const [since, until] = [day(-31), day(jours)]
      const list = dossier
        .deadlines(new Date(), jours)
        .filter((x) => (!domaine || x.domain === domaine) && (toutes || x.status === 'a_faire') && x.date >= since && x.date <= until)
      if (!list.length) return 'Aucune échéance sur la période.'
      return list
        .map(
          (x) =>
            `- ${x.date} · ${x.domain} · ${x.title}${x.indicative ? ' (date indicative)' : ''}${x.status !== 'a_faire' ? ` [${x.status}]` : ''}${x.demarcheId ? ` · démarche ${x.demarcheId}` : ''} · clé ${x.key}`
        )
        .join('\n')
    }
  }),

  tool({
    name: 'demarches',
    title: 'Démarches guidées',
    readOnly: true,
    description: 'Les démarches guidées disponibles (pas à pas, avec liens et pièces), par domaine, et où en est l’utilisateur.',
    input: { domaine: z.enum(DOMAIN_IDS).optional() },
    run: async ({ domaine }) => {
      const done = dossier.get().procedures
      return demarches()
        .filter((x) => !domaine || x.domain === domaine)
        .map((x) => `- ${x.id} · ${x.domain} · **${x.title}** : ${x.description} (${(done[x.id] ?? []).length}/${x.steps.length} étapes faites)`)
        .join('\n')
    }
  }),

  tool({
    name: 'demarche',
    title: 'Démarche',
    readOnly: true,
    description:
      'Le détail d’une démarche guidée : étapes, actions, pièces, et les étapes déjà faites. Pour la montrer à l’utilisateur, utilise afficher avec demarche/<id>.',
    input: { id: z.string() },
    run: async ({ id }) => {
      const x = demarche(id)
      if (!x) throw new ToolError(`Démarche inconnue : ${id}.`)
      const done = new Set(dossier.get().procedures[id] ?? [])
      return `# ${x.title}\n\n${x.description}\n\nQuand : ${x.when || '—'} · durée : ${x.duration || '—'}${x.pieces.length ? `\nPièces : ${x.pieces.join(' ; ')}` : ''}\n\n${x.steps
        .map(
          (s, i) =>
            `## ${i + 1}. ${s.title}${done.has(i) ? ' (fait)' : ''}\n\n${s.body}${s.actions.length ? `\n\nActions : ${s.actions.map((a) => `${a.kind} ${a.target}`).join(' · ')}` : ''}`
        )
        .join('\n\n')}`
    }
  }),

  tool({
    name: 'etape_demarche',
    title: 'Étape de démarche',
    description: 'Coche ou décoche une étape d’une démarche guidée, quand l’utilisateur dit l’avoir faite.',
    input: { id: z.string(), etape: z.number().int().min(1).describe('Numéro de l’étape, à partir de 1'), fait: z.boolean().default(true) },
    run: async ({ id, etape, fait }) => {
      const x = demarche(id)
      if (!x || etape > x.steps.length) throw new ToolError('Démarche ou étape inconnue.')
      dossier.apply({ type: 'procedureStep', id, step: etape - 1, done: fait })
      return `Étape ${etape} « ${x.steps[etape - 1].title} » ${fait ? 'cochée' : 'décochée'}.`
    }
  }),

  tool({
    name: 'documents',
    title: 'Documents',
    readOnly: true,
    description: 'Les documents du coffre de l’utilisateur (avis d’impôt, attestations, bulletins, courriers…), par domaine, avec leur id.',
    input: { domaine: z.enum(DOMAIN_IDS).optional() },
    run: async ({ domaine }) => {
      const list = dossier.get().documents.filter((x) => !domaine || x.domain === domaine)
      if (!list.length) return 'Aucun document. L’utilisateur peut en ajouter dans l’écran documents (ou celui du domaine).'
      return `${plural(list.length, 'document')} :\n${list.map((x) => `- ${x.id} · ${x.domain} · ${x.type} · ${x.title} · ${x.date} · ${x.fileName}`).join('\n')}`
    }
  }),

  tool({
    name: 'lire_document',
    title: 'Lecture d’un document',
    readOnly: true,
    description:
      'Le texte d’un document du coffre (PDF avec texte, fichiers texte), identifiants remplacés par des jetons. Les images et les scans ne sont pas lisibles ainsi.',
    input: { id: z.string() },
    run: async ({ id }) => {
      const meta = dossier.get().documents.find((x) => x.id === id)
      if (!meta) throw new ToolError('Document inconnu.')
      const text = await documentText(id)
      if (text === null)
        return `« ${meta.title} » est une image ou un scan sans texte. Demande à l'utilisateur de le joindre à la conversation (bouton joindre un fichier) s'il accepte qu'il te soit envoyé tel quel.`
      return clip(`# ${meta.title} (${meta.type}, ${meta.date})\n\n${text}`, 40_000)
    }
  })
]
