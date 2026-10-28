import { ageOf, today, type Deadline, type DomainId, type Dossier } from '../../shared/dossier'
import { DOMAINS } from '../../shared/domains'
import { missingFor, serviceReady } from '../../shared/setup'
import type { Service } from '../../shared/types'
import type { TokenDef } from './tokens'

/**
 * What the agent knows of the user: context (age, commune, household, situation, kinds of
 * entities) and tokens for identifiers, never their values. Also what is not configured yet,
 * with the screen where the user can set it up.
 */

const FAMILY: Record<string, string> = {
  celibataire: 'célibataire',
  marie: 'marié(e)',
  pacse: 'pacsé(e)',
  concubinage: 'en concubinage',
  divorce: 'divorcé(e)',
  veuf: 'veuf ou veuve'
}
const WORK: Record<string, string> = {
  salarie: 'salarié(e) du privé',
  fonctionnaire: 'agent public',
  independant: 'indépendant(e)',
  demandeur_emploi: 'demandeur d’emploi',
  etudiant: 'étudiant(e)',
  retraite: 'retraité(e)',
  sans_activite: 'sans activité'
}
const REGIMES: Record<string, string> = {
  micro: 'micro-entreprise',
  ei_reel: 'entreprise individuelle au réel',
  societe_is: 'société à l’impôt sur les sociétés',
  societe_ir: 'société à l’impôt sur le revenu',
  association: 'association'
}

const tok = (defs: TokenDef[], token: string) => (defs.some((t) => t.token === token) ? `[[${token}]]` : 'non renseigné')

/** The context view of the file (Markdown, no identifier values). */
export function contextView(
  d: Dossier,
  opts: { services: Service[]; tokens: TokenDef[]; deadlines: Deadline[]; hasLogin: (url: string) => boolean; domain?: DomainId; now?: Date }
): string {
  const { services, tokens } = opts
  const p = d.person
  const lines: string[] = [
    '# Dossier de l’utilisateur',
    '',
    'Contexte sans identifiants : les valeurs entre [[ ]] sont des jetons que l’application remplace localement.',
    ''
  ]

  const age = ageOf(p.dateNaissance, opts.now)
  lines.push('## Personne', '')
  lines.push(
    `- ${[age !== null ? `${age} ans` : 'âge non renseigné', FAMILY[p.situationFamiliale], WORK[p.situationPro]].filter(Boolean).join(' · ')}`,
    `- nom ${tok(tokens, 'nom')} · prénoms ${tok(tokens, 'prenoms')} · né(e) le ${tok(tokens, 'date_naissance')} à ${tok(tokens, 'lieu_naissance')}${p.nationalite ? ` · nationalité ${p.nationalite}` : ''}`,
    `- numéro de sécurité sociale ${tok(tokens, 'nir')} · téléphone ${tok(tokens, 'telephone')} · courriel ${tok(tokens, 'email')}`,
    d.address.codeInsee
      ? `- adresse ${tok(tokens, 'adresse')}, ${d.address.codePostal} ${d.address.commune} (code insee ${d.address.codeInsee})`
      : '- adresse non renseignée'
  )
  if (d.household.length) {
    lines.push(
      `- foyer : ${d.household
        .map((m, i) => {
          const a = ageOf(m.dateNaissance, opts.now)
          return `${m.lien}${a !== null ? ` ${a} ans` : ''}${m.aCharge ? ' à charge' : ''} ([[foyer.${i + 1}.prenom]], id ${m.id})`
        })
        .join(' · ')}`
    )
  }
  if (d.pieces.length) {
    const holder = (id: string) => (id === 'moi' ? '' : `, de ${d.household.find((m) => m.id === id)?.lien ?? 'un proche'}`)
    lines.push(
      `- pièces : ${d.pieces.map((x) => `${x.type}${holder(x.titulaire)}${x.expiration ? ` valable jusqu’au ${x.expiration}` : ''} (id ${x.id})`).join(' · ')}`
    )
  }
  if (d.notes.trim()) lines.push('', '### Ce que l’utilisateur précise', '', d.notes.trim())

  const entities: string[] = []
  d.entreprises.forEach((e, i) =>
    entities.push(
      `- entreprise ${i + 1} : ${REGIMES[e.regime] ?? e.regime}${e.forme ? `, ${e.forme}` : ''}${e.activite ? `, activité ${e.activite}` : ''}${e.creation ? `, créée le ${e.creation}` : ''}${e.periodicite ? `, déclarations urssaf ${e.periodicite}s` : ''}${e.tva ? `, tva ${e.tva.replace('_', ' ')}` : ''}, rôle ${e.role} · siren [[entreprise.${i + 1}.siren]] · nom [[entreprise.${i + 1}.denomination]] · id ${e.id}`
    )
  )
  d.employeurs.forEach((e, i) =>
    entities.push(
      `- employeur ${i + 1} : ${e.contrat}${e.poste ? `, ${e.poste}` : ''}${e.debut ? `, depuis ${e.debut}` : ''}${e.fin ? ` jusqu’au ${e.fin}` : ''}${e.idcc ? `, convention collective idcc ${e.idcc}` : ''} · nom [[employeur.${i + 1}.nom]] · id ${e.id}`
    )
  )
  d.vehicules.forEach((v, i) =>
    entities.push(
      `- véhicule ${i + 1} : ${v.modele || 'modèle non renseigné'}${v.premiereImmatriculation ? `, 1re immatriculation ${v.premiereImmatriculation}` : ''}${v.dernierControle ? `, dernier contrôle technique ${v.dernierControle}` : ''}${v.critair ? `, crit’air ${v.critair}` : ''} · immatriculation [[vehicule.${i + 1}.immatriculation]] · id ${v.id}`
    )
  )
  d.logements.forEach((l, i) =>
    entities.push(
      `- logement ${i + 1} : ${l.statut}, ${l.usage.replace(/_/g, ' ')}${l.loyer ? `, loyer ${l.loyer} €` : ''}${l.debutBail ? `, bail depuis ${l.debutBail}` : ''} · adresse [[logement.${i + 1}.adresse]] · id ${l.id}`
    )
  )
  if (entities.length) lines.push('', '## Entités liées', '', ...entities)

  lines.push('', '## Services', '')
  for (const domain of DOMAINS.filter((x) => !opts.domain || x.id === opts.domain)) {
    const own = services.filter((s) => s.domain === domain.id)
    const ready = own.filter((s) => serviceReady(d, s))
    const used = own.filter((s) => d.accounts.some((a) => a.serviceId === s.id) && !ready.includes(s))
    const parts = [
      ...ready.map((s) => {
        const fields = (s.fields ?? []).map((f) => `${f.label} [[${f.key}]]`)
        return `${s.name} ✓${fields.length ? ` (${fields.join(', ')})` : ''}${opts.hasLogin(s.url) ? ' · connexion dans le trousseau' : ''}`
      }),
      ...used.map((s) => `${s.name} (incomplet)`)
    ]
    lines.push(`- ${domain.short} : ${parts.length ? parts.join(' · ') : 'aucun service configuré'}`)
  }

  // From a month ago (late ones), not the deadlines long past and never ticked.
  const since = today(new Date((opts.now ?? new Date()).getTime() - 30 * 86_400_000))
  const soon = opts.deadlines.filter((x) => x.status === 'a_faire' && x.date >= since && (!opts.domain || x.domain === opts.domain)).slice(0, 12)
  if (soon.length) {
    lines.push('', '## Échéances à venir', '')
    for (const x of soon) lines.push(`- ${x.date} · ${x.domain} · ${x.title}${x.indicative ? ' (date indicative)' : ''} · clé ${x.key}`)
  }

  const missing = (opts.domain ? [opts.domain] : DOMAINS.map((x) => x.id)).flatMap((id) => missingFor(d, id, services, true).map((m) => ({ ...m, domain: id })))
  const unique = missing.filter((m, i) => missing.findIndex((x) => x.target === m.target) === i)
  if (unique.length) {
    lines.push('', '## Non configuré', '', 'Quand ta réponse en dépend, appelle demander_configuration avec la cible :')
    for (const m of unique.slice(0, 20)) lines.push(`- ${m.label} → cible « ${m.target} »`)
  }
  return lines.join('\n')
}
