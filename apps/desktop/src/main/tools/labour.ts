import * as z from 'zod'
import { fetchJson, query } from '../http'
import { base, tool, ToolError } from './tool'

/** The Code du travail numérique (ministry of Labour): employment law for private-sector employees. */

/** Its pages by kind of content, as its search names them. */
const PAGES: Record<string, string> = {
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

interface Result {
  title: string
  slug: string
  source: string
  description?: string
  url?: string | null
}

export const labourTools = [
  tool({
    name: 'labour_code',
    title: 'Code du travail numérique',
    source: 'code-travail',
    readOnly: true,
    description:
      'Searches the Code du travail numérique (ministry of Labour): practical sheets, articles of the code du travail, collective agreements, letter templates and simulators (notice period, severance pay, salary…). For employment-law questions of private-sector employees.',
    input: { query: z.string().min(2).describe('Keywords, in French') },
    run: async ({ query: q }) => {
      const root = base('code-travail')
      const data = await fetchJson<{ results?: Result[] }>(`${root}/api/presearch${query({ q })}`)
      const results = data.results ?? []
      if (!results.length) throw new ToolError(`Nothing in the Code du travail numérique for « ${q} ».`)
      return results
        .map((r) => {
          const url = PAGES[r.source] ? `${root}/${PAGES[r.source]}/${r.slug}` : (r.url ?? '')
          return `- **${r.title}** · ${r.source.replace(/_/g, ' ')}${r.description ? `\n  ${r.description}` : ''}${url ? `\n  ${url}` : ''}`
        })
        .join('\n')
    }
  })
]
