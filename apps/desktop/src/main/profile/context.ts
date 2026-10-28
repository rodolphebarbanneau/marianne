import { DOMAINS } from '../../shared/domains'
import {
  ageOf,
  CONTRACT_LABELS,
  FAMILY_STATUS_LABELS,
  FREQUENCY_LABELS,
  ID_DOCUMENT_LABELS,
  missingFor,
  PROPERTY_STATUS_LABELS,
  PROPERTY_USE_LABELS,
  REGIME_LABELS,
  RELATION_LABELS,
  ROLE_LABELS,
  siteReady,
  today,
  VAT_LABELS,
  WORK_STATUS_LABELS,
  type Deadline,
  type Profile
} from '../../shared/profile'
import type { Site } from '../../shared/sites'
import type { DomainId } from '../../shared/types'
import type { TokenDef } from './tokens'

/**
 * What the engines know of the user: context (age, commune, household, situation, kinds of
 * entities) and tokens for identifiers, never their values. Also what is not configured yet,
 * with the target where the user can set it up.
 */

const tok = (defs: TokenDef[], token: string) => (defs.some((t) => t.token === token) ? `[[${token}]]` : 'non renseigné')
const label = (labels: Record<string, string>, value: string) => labels[value] ?? value

/** The context view of the profile (Markdown, no identifier values). */
export function contextView(
  p: Profile,
  opts: { sites: Site[]; tokens: TokenDef[]; deadlines: Deadline[]; hasLogin: (site: Site) => boolean; domain?: DomainId; now?: Date }
): string {
  const { sites, tokens } = opts
  const me = p.person
  const lines: string[] = [
    '# Dossier de l’utilisateur',
    '',
    'Contexte sans identifiants : les valeurs entre [[ ]] sont des jetons que l’application remplace localement.',
    ''
  ]

  const age = ageOf(me.birthDate, opts.now)
  lines.push('## Personne', '')
  lines.push(
    `- ${[age !== null ? `${age} ans` : 'âge non renseigné', label(FAMILY_STATUS_LABELS, me.familyStatus), label(WORK_STATUS_LABELS, me.workStatus)].filter(Boolean).join(' · ')}`,
    `- nom ${tok(tokens, 'last_name')} · prénoms ${tok(tokens, 'first_names')} · né(e) le ${tok(tokens, 'birth_date')} à ${tok(tokens, 'birth_place')}${me.nationality ? ` · nationalité ${me.nationality}` : ''}`,
    `- numéro de sécurité sociale ${tok(tokens, 'nir')} · iban ${tok(tokens, 'iban')} · téléphone ${tok(tokens, 'phone')} · courriel ${tok(tokens, 'email')}`,
    p.address.inseeCode
      ? `- adresse ${tok(tokens, 'address')}, ${p.address.postcode} ${p.address.city} (code insee ${p.address.inseeCode})`
      : '- adresse non renseignée'
  )
  if (p.household.length) {
    lines.push(
      `- foyer : ${p.household
        .map((m, i) => {
          const a = ageOf(m.birthDate, opts.now)
          return `${RELATION_LABELS[m.relation]}${a !== null ? ` ${a} ans` : ''}${m.dependent ? ' à charge' : ''} ([[household.${i + 1}.first_name]], id ${m.id})`
        })
        .join(' · ')}`
    )
  }
  if (p.idDocuments.length) {
    const holder = (id: string) => {
      if (id === 'me') return ''
      const member = p.household.find((m) => m.id === id)
      return `, de ${member ? RELATION_LABELS[member.relation] : 'un proche'}`
    }
    lines.push(
      `- pièces : ${p.idDocuments.map((x) => `${label(ID_DOCUMENT_LABELS, x.type)}${holder(x.holder)}${x.expires ? ` valable jusqu’au ${x.expires}` : ''} (id ${x.id})`).join(' · ')}`
    )
  }
  if (p.notes.trim()) lines.push('', '### Ce que l’utilisateur précise', '', p.notes.trim())

  const entities: string[] = []
  p.companies.forEach((c, i) =>
    entities.push(
      `- entreprise ${i + 1} : ${label(REGIME_LABELS, c.regime)}${c.legalForm ? `, ${c.legalForm}` : ''}${c.activity ? `, activité ${c.activity}` : ''}${c.created ? `, créée le ${c.created}` : ''}${c.frequency ? `, déclarations urssaf ${label(FREQUENCY_LABELS, c.frequency)}s` : ''}${c.vat ? `, tva ${label(VAT_LABELS, c.vat)}` : ''}, rôle ${label(ROLE_LABELS, c.role)} · siren [[company.${i + 1}.siren]] · nom [[company.${i + 1}.name]] · id ${c.id}`
    )
  )
  p.employers.forEach((e, i) =>
    entities.push(
      `- employeur ${i + 1} : ${label(CONTRACT_LABELS, e.contract)}${e.position ? `, ${e.position}` : ''}${e.start ? `, depuis ${e.start}` : ''}${e.end ? ` jusqu’au ${e.end}` : ''}${e.idcc ? `, convention collective idcc ${e.idcc}` : ''} · nom [[employer.${i + 1}.name]] · id ${e.id}`
    )
  )
  p.vehicles.forEach((v, i) =>
    entities.push(
      `- véhicule ${i + 1} : ${v.model || 'modèle non renseigné'}${v.firstRegistration ? `, 1re immatriculation ${v.firstRegistration}` : ''}${v.lastInspection ? `, dernier contrôle technique ${v.lastInspection}` : ''}${v.critair ? `, crit’air ${v.critair}` : ''} · immatriculation [[vehicle.${i + 1}.plate]] · id ${v.id}`
    )
  )
  p.properties.forEach((x, i) =>
    entities.push(
      `- logement ${i + 1} : ${label(PROPERTY_STATUS_LABELS, x.status)}, ${label(PROPERTY_USE_LABELS, x.use)}${x.rent ? `, loyer ${x.rent} €` : ''}${x.leaseStart ? `, bail depuis ${x.leaseStart}` : ''} · adresse [[property.${i + 1}.address]] · id ${x.id}`
    )
  )
  if (entities.length) lines.push('', '## Entités liées', '', ...entities)

  lines.push('', '## Services', '')
  for (const domain of DOMAINS.filter((x) => !opts.domain || x.id === opts.domain)) {
    const own = sites.filter((s) => s.domain === domain.id)
    const ready = own.filter((s) => siteReady(p, s))
    const used = own.filter((s) => p.accounts.some((a) => a.siteId === s.id) && !ready.includes(s))
    const parts = [
      ...ready.map((s) => {
        const fields = (s.fields ?? []).map((f) => `${f.label} [[${f.key}]]`)
        return `${s.name} ✓${fields.length ? ` (${fields.join(', ')})` : ''}${opts.hasLogin(s) ? ' · connexion dans le trousseau' : ''}`
      }),
      ...used.map((s) => `${s.name} (incomplet)`)
    ]
    lines.push(`- ${domain.short} : ${parts.length ? parts.join(' · ') : 'aucun service configuré'}`)
  }

  // From a month ago (late ones), not the deadlines long past and never ticked.
  const since = today(new Date((opts.now ?? new Date()).getTime() - 30 * 86_400_000))
  const soon = opts.deadlines.filter((x) => x.status === 'todo' && x.date >= since && (!opts.domain || x.domain === opts.domain)).slice(0, 12)
  if (soon.length) {
    lines.push('', '## Échéances à venir', '')
    for (const x of soon) lines.push(`- ${x.date} · ${x.domain} · ${x.title}${x.indicative ? ' (date indicative)' : ''} · clé ${x.key}`)
  }

  const missing = (opts.domain ? [opts.domain] : DOMAINS.map((x) => x.id)).flatMap((id) => missingFor(p, id, sites, true))
  const unique = missing.filter((m, i) => missing.findIndex((x) => x.target === m.target) === i)
  if (unique.length) {
    lines.push('', '## Non configuré', '', 'Quand ta réponse en dépend, demande à l’utilisateur de le configurer, avec la cible :')
    for (const m of unique.slice(0, 20)) lines.push(`- ${m.label} → cible « ${m.target} »`)
  }
  return lines.join('\n')
}
