import * as z from 'zod'
import { fetchJson, query } from '../http'
import { findCommunes } from './geo'
import { base, plural, tool, ToolError } from './tool'

/** The DILA directory of public offices (Opendatasoft API): JSON fields arrive as JSON strings. */

interface Record_ {
  nom: string
  adresse: string | null
  telephone: string | null
  adresse_courriel: string | null
  site_internet: string | null
  plage_ouverture: string | null
  url_service_public: string | null
  pivot: string | null
}

function parse<T>(json: string | null): T[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

const hhmm = (t?: string) => (t ? t.slice(0, 5).replace(':', 'h') : '')

function hours(json: string | null): string {
  return parse<Record<string, string>>(json)
    .map((p) => {
      const days = p.nom_jour_debut === p.nom_jour_fin ? p.nom_jour_debut : `${p.nom_jour_debut}–${p.nom_jour_fin}`
      const slots = [
        [p.valeur_heure_debut_1, p.valeur_heure_fin_1],
        [p.valeur_heure_debut_2, p.valeur_heure_fin_2]
      ]
        .filter(([a, b]) => a && b)
        .map(([a, b]) => `${hhmm(a)}–${hhmm(b)}`)
        .join(', ')
      return `${days} ${slots}${p.commentaire ? ` (${p.commentaire})` : ''}`
    })
    .join(' ; ')
}

function describe(r: Record_): string {
  const address = parse<Record<string, string>>(r.adresse).map((a) =>
    [a.complement1, a.numero_voie, a.service_distribution, `${a.code_postal} ${a.nom_commune}`].filter((x) => x?.trim()).join(', ')
  )
  const phones = parse<{ valeur: string; description?: string }>(r.telephone).map((t) => `${t.valeur}${t.description ? ` (${t.description})` : ''}`)
  const sites = parse<{ valeur: string }>(r.site_internet).map((s) => s.valeur)
  const mails = r.adresse_courriel ? r.adresse_courriel.split(/[;,]/).map((m) => m.trim()) : []
  const type = parse<{ type_service_local: string }>(r.pivot)[0]?.type_service_local
  return [
    `**${r.nom}**${type ? ` · ${type}` : ''}`,
    address.length && `  adresse : ${[...new Set(address)].join(' | ')}`,
    phones.length && `  téléphone : ${phones.join(' ; ')}`,
    mails.length && `  courriel : ${mails.join(', ')}`,
    sites.length && `  site : ${sites.join(', ')}`,
    r.plage_ouverture && `  horaires : ${hours(r.plage_ouverture)}`,
    r.url_service_public && `  fiche : ${r.url_service_public}`
  ]
    .filter(Boolean)
    .join('\n')
}

const quote = (s: string) => `"${s.replace(/["\\]/g, ' ')}"`

export const annuaireTools = [
  tool({
    name: 'annuaire_administration',
    title: "Annuaire de l'administration",
    source: 'annuaire',
    readOnly: true,
    description:
      "Trouve les services publics locaux compétents et leurs coordonnées (adresse, téléphone, courriel, horaires) dans l'annuaire officiel. Types courants : mairie, caf, cpam, carsat, msa, france_travail, prefecture, sous_pref, sip (impôts des particuliers), sie, tribunal_judiciaire, tribunal_administratif, conseil_prudhommes, conciliateur_fr, cdad (accès au droit), france_services, ccas, maison_handicapees, adil, commissariat_police, gendarmerie. Un type partiel fonctionne (« tribunal »).",
    input: {
      type: z.string().optional().describe('Type de service local, ex. "caf", "mairie", "tribunal"'),
      commune: z.string().optional().describe('Commune : nom, code postal ou code insee'),
      recherche: z.string().optional().describe('Mots du nom de l’organisme, ex. "Défenseur des droits"'),
      limite: z.number().int().min(1).max(20).default(5)
    },
    run: async ({ type, commune, recherche, limite }) => {
      if (!type && !commune && !recherche) throw new ToolError('Indique au moins un type, une commune ou une recherche.')
      const where: string[] = []
      let place = ''
      if (commune) {
        const found = await findCommunes(commune, 5)
        if (!found.length) throw new ToolError(`Commune introuvable : « ${commune} ».`)
        // A postal code can cover several communes; a name, the most populated match.
        const codes = /^\d/.test(commune.trim()) ? found.map((c) => c.code) : [found[0].code]
        place = found
          .filter((c) => codes.includes(c.code))
          .map((c) => `${c.nom} (${c.code})`)
          .join(', ')
        where.push(`(${codes.map((c) => `code_insee_commune=${quote(c)}`).join(' or ')})`)
      }
      if (type) where.push(`pivot like ${quote(type.trim().toLowerCase())}`)
      if (recherche) where.push(`search(nom, ${quote(recherche)})`)
      const data = await fetchJson<{ total_count: number; results: Record_[] }>(
        `${base('annuaire')}/records${query({
          where: where.join(' and '),
          limit: limite,
          select: 'nom,adresse,telephone,adresse_courriel,site_internet,plage_ouverture,url_service_public,pivot'
        })}`
      )
      if (!data.results?.length)
        return `Aucun service trouvé${place ? ` à ${place}` : ''}. Certains services (caf, cpam, tribunal…) sont rattachés à une autre commune : réessaie sans commune avec le nom du département dans la recherche, ou un type plus large.`
      return `${plural(data.total_count, 'résultat')}${place ? ` pour ${place}` : ''}${data.total_count > data.results.length ? ` (les ${data.results.length} premiers)` : ''} :\n\n${data.results.map(describe).join('\n\n')}`
    }
  }),

  tool({
    name: 'code_du_travail',
    title: 'Code du travail numérique',
    source: 'code-travail',
    readOnly: true,
    description:
      'Cherche dans le Code du travail numérique (ministère du Travail) : fiches pratiques, articles du code du travail, conventions collectives, modèles de courriers et simulateurs (préavis, indemnité de licenciement, salaire…). Pour les questions de droit du travail des salariés du privé.',
    input: { recherche: z.string().min(2) },
    run: async ({ recherche }) => {
      const root = base('code-travail')
      const data = await fetchJson<{ results: Array<{ title: string; slug: string; source: string; description?: string; url?: string | null }> }>(
        `${root}/api/presearch${query({ q: recherche })}`
      )
      const pages: Record<string, string> = {
        code_du_travail: 'code-du-travail',
        fiches_service_public: 'fiche-service-public',
        fiches_ministere_travail: 'fiche-ministere-travail',
        page_fiche_ministere_travail: 'fiche-ministere-travail',
        modeles_de_courriers: 'modeles-de-courriers',
        outils: 'outils',
        themes: 'themes',
        information: 'information',
        contributions: 'contribution',
        conventions_collectives: 'convention-collective'
      }
      const results = data.results ?? []
      if (!results.length) throw new ToolError(`Rien trouvé dans le Code du travail numérique pour « ${recherche} ».`)
      return results
        .map((r) => {
          const url = pages[r.source] ? `${root}/${pages[r.source]}/${r.slug}` : (r.url ?? '')
          return `- **${r.title}** · ${r.source.replace(/_/g, ' ')}${r.description ? `\n  ${r.description}` : ''}${url ? `\n  ${url}` : ''}`
        })
        .join('\n')
    }
  })
]
