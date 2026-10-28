import * as z from 'zod'
import { fetchJson, query } from '../http'
import { base, clip, plural, table, tool, ToolError } from './tool'

interface Resource {
  id: string
  title: string
  format: string
  url: string
  filesize?: number | null
  last_modified?: string
  extras?: Record<string, unknown>
}

interface Dataset {
  id: string
  title: string
  slug: string
  page: string
  description: string
  organization?: { name: string } | null
  owner?: { first_name?: string; last_name?: string } | null
  last_update?: string
  license?: string
  frequency?: string
  resources: Resource[]
}

const TABULAR = 'https://tabular-api.data.gouv.fr/api'
const size = (n?: number | null) => (!n ? '' : n > 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1e3))} ko`)
const day = (iso?: string) => iso?.slice(0, 10) ?? ''

export const datagouvTools = [
  tool({
    name: 'recherche_datagouv',
    title: 'data.gouv.fr · recherche',
    source: 'datagouv',
    readOnly: true,
    description:
      'Cherche des jeux de données publiques sur data.gouv.fr (statistiques, prix, carburants, écoles, élus, budgets, qualité de l’eau…). Renvoie les jeux et leurs fichiers ; les fichiers csv se lisent ensuite avec donnees_tabulaires.',
    input: {
      recherche: z.string().min(2),
      organisation: z.string().optional().describe('Slug ou id d’une organisation productrice, ex. "insee"'),
      limite: z.number().int().min(1).max(20).default(6)
    },
    run: async ({ recherche, organisation, limite }) => {
      const data = await fetchJson<{ data: Dataset[]; total: number }>(
        `${base('datagouv')}/1/datasets/${query({ q: recherche, organization: organisation, page_size: limite })}`
      )
      if (!data.data.length) throw new ToolError(`Aucun jeu de données pour « ${recherche} ».`)
      const lines = data.data.map((d) => {
        const files = d.resources
          .slice(0, 6)
          .map((r) => `    - ${r.title} · ${r.format || '?'}${r.filesize ? ` · ${size(r.filesize)}` : ''} · id ${r.id}`)
          .join('\n')
        return `- **${d.title}** · ${d.organization?.name ?? 'producteur inconnu'} · mis à jour ${day(d.last_update)}\n  id ${d.id} · ${d.page}\n  ${d.description.replace(/\s+/g, ' ').slice(0, 220)}…\n${files}${d.resources.length > 6 ? `\n    - … ${d.resources.length - 6} autres fichiers` : ''}`
      })
      return `${plural(data.total, 'jeu de données', 'jeux de données')} (les ${data.data.length} plus pertinents) :\n\n${lines.join('\n')}`
    }
  }),

  tool({
    name: 'jeu_de_donnees',
    title: 'data.gouv.fr · jeu de données',
    source: 'datagouv',
    readOnly: true,
    description:
      'Détail d’un jeu de données data.gouv.fr : description complète, licence, fréquence de mise à jour et tous ses fichiers (ids, formats, liens).',
    input: { id: z.string().min(3).describe('Id ou slug du jeu de données') },
    run: async ({ id }) => {
      const d = await fetchJson<Dataset>(`${base('datagouv')}/1/datasets/${encodeURIComponent(id)}/`)
      const files = table(
        ['fichier', 'format', 'taille', 'modifié', 'id', 'lien'],
        d.resources.map((r) => [r.title, r.format, size(r.filesize), day(r.last_modified), r.id, r.url])
      )
      return clip(
        `# ${d.title}\n\n${d.organization?.name ?? ''} · licence ${d.license ?? '?'} · fréquence ${d.frequency ?? '?'} · mis à jour ${day(d.last_update)}\n${d.page}\n\n${d.description}\n\n## Fichiers\n\n${files}`,
        20_000
      )
    }
  }),

  tool({
    name: 'donnees_tabulaires',
    title: 'data.gouv.fr · données',
    source: 'datagouv',
    readOnly: true,
    description:
      'Lit les lignes d’un fichier csv/xlsx publié sur data.gouv.fr sans le télécharger (API tabulaire), avec filtres et tri. Appelle d’abord sans filtre (ou avec colonnes=true) pour connaître les colonnes. Filtres : {"colonne__exact": "valeur"}, opérateurs exact, contains, less, greater, in (valeurs séparées par des virgules).',
    input: {
      ressource: z.string().describe('Id du fichier (ressource), vu dans recherche_datagouv ou jeu_de_donnees'),
      filtres: z.record(z.string(), z.string()).optional().describe('ex. {"code_postal__exact": "44000", "prix__less": "2"}'),
      tri: z.string().optional().describe('Colonne de tri, suivie de :asc ou :desc, ex. "date:desc"'),
      colonnes: z.boolean().default(false).describe('Décrire les colonnes (types, valeurs fréquentes) au lieu des lignes'),
      page: z.number().int().min(1).default(1),
      lignes: z.number().int().min(1).max(50).default(20)
    },
    run: async ({ ressource, filtres, tri, colonnes, page, lignes }) => {
      const root = `${TABULAR}/resources/${encodeURIComponent(ressource)}`
      if (colonnes) {
        const p = await fetchJson<{ profile: { header: string[]; columns: Record<string, { format: string }> } }>(`${root}/profile/`)
        return `Colonnes :\n${p.profile.header.map((h) => `- ${h} (${p.profile.columns[h]?.format ?? '?'})`).join('\n')}`
      }
      const params: Record<string, string | number> = { page, page_size: lignes, ...(filtres ?? {}) }
      if (tri) {
        const [col, dir] = tri.split(':')
        params[`${col}__sort`] = dir === 'desc' ? 'desc' : 'asc'
      }
      let data: { data: Array<Record<string, unknown>>; meta: { total: number } }
      try {
        data = await fetchJson(`${root}/data/${query(params)}`)
      } catch (err) {
        throw new ToolError(
          `${(err as Error).message}\nCe fichier n’est peut-être pas disponible dans l’API tabulaire (seuls les csv/xlsx de taille raisonnable le sont) : donne le lien de téléchargement à l’utilisateur.`
        )
      }
      if (!data.data.length) return `Aucune ligne (${data.meta.total} au total avec ces filtres).`
      const head = Object.keys(data.data[0]).filter((k) => k !== '__id')
      return clip(
        `${plural(data.meta.total, 'ligne')} au total · page ${page} :\n\n${table(
          head,
          data.data.map((row) => head.map((h) => String(row[h] ?? '')))
        )}`,
        20_000
      )
    }
  }),

  tool({
    name: 'recherche_entreprises',
    title: 'Annuaire des entreprises',
    source: 'entreprises',
    readOnly: true,
    description:
      'Cherche une entreprise, une association ou un organisme par nom, siren, siret ou adresse : identité légale, siège, activité (naf), effectif, dirigeants, état (active ou fermée). Utile pour vérifier un employeur, un vendeur, un bailleur ou une adresse de réclamation.',
    input: {
      recherche: z.string().min(2).describe('Nom, siren ou siret'),
      code_postal: z.string().optional(),
      limite: z.number().int().min(1).max(10).default(5)
    },
    run: async ({ recherche, code_postal, limite }) => {
      const data = await fetchJson<{
        total_results: number
        results: Array<{
          siren: string
          nom_complet: string
          etat_administratif: string
          nature_juridique: string
          date_creation: string
          activite_principale: string
          tranche_effectif_salarie: string | null
          siege: { siret: string; adresse: string; libelle_activite_principale?: string }
          dirigeants: Array<{ nom?: string; prenoms?: string; denomination?: string; qualite?: string }>
          complements?: { est_association?: boolean; est_service_public?: boolean }
        }>
      }>(`${base('entreprises')}/search${query({ q: recherche, code_postal, per_page: limite })}`)
      if (!data.results.length) throw new ToolError(`Aucune entreprise pour « ${recherche} ».`)
      return data.results
        .map((e) => {
          const boss = e.dirigeants
            .slice(0, 4)
            .map((d) => `${d.denomination ?? `${d.prenoms ?? ''} ${d.nom ?? ''}`.trim()}${d.qualite ? ` (${d.qualite})` : ''}`)
            .join(', ')
          const kind = e.complements?.est_association ? 'association' : e.complements?.est_service_public ? 'service public' : 'entreprise'
          return `- **${e.nom_complet}** · ${kind} · ${e.etat_administratif === 'A' ? 'active' : 'fermée'}\n  siren ${e.siren} · siège siret ${e.siege.siret} · créée le ${e.date_creation}\n  ${e.siege.adresse}\n  activité ${e.activite_principale}${e.siege.libelle_activite_principale ? ` (${e.siege.libelle_activite_principale})` : ''}${boss ? `\n  dirigeants : ${boss}` : ''}\n  https://annuaire-entreprises.data.gouv.fr/entreprise/${e.siren}`
        })
        .join('\n')
    }
  })
]
