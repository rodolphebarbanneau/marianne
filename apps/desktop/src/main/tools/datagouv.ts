import * as z from 'zod'
import { fetchJson, query } from '../http'
import { base, clip, plural, table, tool, ToolError } from './tool'

/** data.gouv.fr, the national catalog of open data, and the Annuaire des entreprises. */

interface Resource {
  id: string
  title: string
  format: string
  url: string
  filesize?: number | null
  last_modified?: string
}

interface Dataset {
  id: string
  title: string
  page: string
  description: string
  organization?: { name: string } | null
  last_update?: string
  license?: string
  frequency?: string
  resources: Resource[]
}

interface Company {
  siren: string
  nom_complet: string
  etat_administratif: string
  date_creation: string
  activite_principale: string
  siege: { siret: string; adresse: string; libelle_activite_principale?: string }
  dirigeants: Array<{ nom?: string; prenoms?: string; denomination?: string; qualite?: string }>
  complements?: { est_association?: boolean; est_service_public?: boolean }
}

const TABULAR = 'https://tabular-api.data.gouv.fr/api'
const size = (n?: number | null) => (!n ? '' : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`)
const day = (iso?: string) => iso?.slice(0, 10) ?? ''

export const datagouvTools = [
  tool({
    name: 'search_datasets',
    title: 'data.gouv.fr search',
    source: 'datagouv',
    readOnly: true,
    description:
      'Searches open datasets on data.gouv.fr (statistics, prices, fuel, schools, elected officials, budgets, water quality…). Returns the datasets and their files; csv files can then be read with tabular_data.',
    input: {
      query: z.string().min(2).describe('Keywords, in French'),
      organization: z.string().optional().describe('Slug or id of a producing organization, e.g. "insee"'),
      limit: z.number().int().min(1).max(20).default(6)
    },
    run: async ({ query: q, organization, limit }) => {
      const data = await fetchJson<{ data: Dataset[]; total: number }>(`${base('datagouv')}/1/datasets/${query({ q, organization, page_size: limit })}`)
      if (!data.data.length) throw new ToolError(`No dataset for « ${q} ».`)
      const lines = data.data.map((d) => {
        const files = d.resources
          .slice(0, 6)
          .map((r) => `    - ${r.title} · ${r.format || '?'}${r.filesize ? ` · ${size(r.filesize)}` : ''} · id ${r.id}`)
          .join('\n')
        const more = d.resources.length > 6 ? `\n    - … ${d.resources.length - 6} more files` : ''
        return `- **${d.title}** · ${d.organization?.name ?? 'unknown producer'} · updated ${day(d.last_update)}\n  id ${d.id} · ${d.page}\n  ${d.description.replace(/\s+/g, ' ').slice(0, 220)}…\n${files}${more}`
      })
      return `${plural(data.total, 'dataset')} (the ${data.data.length} most relevant):\n\n${lines.join('\n')}`
    }
  }),

  tool({
    name: 'dataset',
    title: 'data.gouv.fr dataset',
    source: 'datagouv',
    readOnly: true,
    description: 'A data.gouv.fr dataset in full: description, license, update frequency and all its files (ids, formats, links).',
    input: { id: z.string().min(3).describe('Id or slug of the dataset') },
    run: async ({ id }) => {
      const d = await fetchJson<Dataset>(`${base('datagouv')}/1/datasets/${encodeURIComponent(id)}/`)
      const files = table(
        ['file', 'format', 'size', 'modified', 'id', 'link'],
        d.resources.map((r) => [r.title, r.format, size(r.filesize), day(r.last_modified), r.id, r.url])
      )
      return clip(
        `# ${d.title}\n\n${d.organization?.name ?? ''} · license ${d.license ?? '?'} · frequency ${d.frequency ?? '?'} · updated ${day(d.last_update)}\n${d.page}\n\n${d.description}\n\n## Files\n\n${files}`,
        20_000
      )
    }
  }),

  tool({
    name: 'tabular_data',
    title: 'data.gouv.fr rows',
    source: 'datagouv',
    readOnly: true,
    description:
      'Reads the rows of a csv/xlsx file published on data.gouv.fr without downloading it (tabular API), with filters and sorting. Call it first without filters (or with columns: true) to learn the columns. Filters: {"column__exact": "value"}, operators exact, contains, less, greater, in (values separated by commas).',
    input: {
      resource: z.string().describe('Id of the file (resource), from search_datasets or dataset'),
      filters: z.record(z.string(), z.string()).optional().describe('e.g. {"code_postal__exact": "44000", "prix__less": "2"}'),
      sort: z.string().optional().describe('Column to sort on, then :asc or :desc, e.g. "date:desc"'),
      columns: z.boolean().default(false).describe('Describe the columns (types) instead of reading rows'),
      page: z.number().int().min(1).default(1),
      rows: z.number().int().min(1).max(50).default(20)
    },
    run: async ({ resource, filters, sort, columns, page, rows }) => {
      const root = `${TABULAR}/resources/${encodeURIComponent(resource)}`
      if (columns) {
        const p = await fetchJson<{ profile: { header: string[]; columns: Record<string, { format: string }> } }>(`${root}/profile/`)
        return `Columns:\n${p.profile.header.map((h) => `- ${h} (${p.profile.columns[h]?.format ?? '?'})`).join('\n')}`
      }
      const params: Record<string, string | number> = { page, page_size: rows, ...filters }
      if (sort) {
        const [column, direction] = sort.split(':')
        params[`${column}__sort`] = direction === 'desc' ? 'desc' : 'asc'
      }
      let data: { data: Array<Record<string, unknown>>; meta: { total: number } }
      try {
        data = await fetchJson(`${root}/data/${query(params)}`)
      } catch (err) {
        throw new ToolError(
          `${(err as Error).message}\nThis file may not be in the tabular API (only csv/xlsx files of reasonable size are): give the user its download link.`
        )
      }
      if (!data.data.length) return `No row (${data.meta.total} in all with these filters).`
      const head = Object.keys(data.data[0]).filter((k) => k !== '__id')
      return clip(
        `${plural(data.meta.total, 'row')} in all · page ${page}:\n\n${table(
          head,
          data.data.map((row) => head.map((h) => String(row[h] ?? '')))
        )}`,
        20_000
      )
    }
  }),

  tool({
    name: 'search_companies',
    title: 'Annuaire des entreprises',
    source: 'entreprises',
    readOnly: true,
    description:
      'Finds a company, an association or a public body by name, SIREN, SIRET or address: legal identity, head office, activity (NAF), headcount, directors, status (active or closed). Useful to check an employer, a seller, a landlord or where to send a complaint.',
    input: {
      query: z.string().min(2).describe('Name, SIREN or SIRET'),
      postcode: z.string().optional(),
      limit: z.number().int().min(1).max(10).default(5)
    },
    run: async ({ query: q, postcode, limit }) => {
      const data = await fetchJson<{ results: Company[] }>(`${base('entreprises')}/search${query({ q, code_postal: postcode, per_page: limit })}`)
      if (!data.results.length) throw new ToolError(`No company for « ${q} ».`)
      return data.results
        .map((e) => {
          const directors = e.dirigeants
            .slice(0, 4)
            .map((d) => `${d.denomination ?? `${d.prenoms ?? ''} ${d.nom ?? ''}`.trim()}${d.qualite ? ` (${d.qualite})` : ''}`)
            .join(', ')
          const kind = e.complements?.est_association ? 'association' : e.complements?.est_service_public ? 'public body' : 'company'
          const activity = `${e.activite_principale}${e.siege.libelle_activite_principale ? ` (${e.siege.libelle_activite_principale})` : ''}`
          return `- **${e.nom_complet}** · ${kind} · ${e.etat_administratif === 'A' ? 'active' : 'closed'}\n  SIREN ${e.siren} · head office SIRET ${e.siege.siret} · created ${e.date_creation}\n  ${e.siege.adresse}\n  activity ${activity}${directors ? `\n  directors: ${directors}` : ''}\n  https://annuaire-entreprises.data.gouv.fr/entreprise/${e.siren}`
        })
        .join('\n')
    }
  })
]
