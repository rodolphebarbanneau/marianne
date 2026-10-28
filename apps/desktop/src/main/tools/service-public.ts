import * as z from 'zod'
import { SP_KIND_LABELS, type SpKind } from '../../shared/public'
import { getSpDocument, searchSp } from '../public/sp-query'
import { sync } from '../public/sync'
import { clip, fold, plural, tool, ToolError } from './tool'

/** Service-Public's official pages on rights and formalities, from the index kept on this computer. */

const KINDS = Object.keys(SP_KIND_LABELS) as [SpKind, ...SpKind[]]
const MAX = 24_000

function ensureIndexed(): void {
  if (!sync.ready('service-public'))
    throw new ToolError(
      'The Service-Public index is not ready yet (first download under way). Meanwhile search service-public.gouv.fr on the web, or offer the user to start the update in the settings (marianne:settings/data).'
    )
}

const heading = (section: string) => section.split('\n')[0].replace(/^## /, '')

export const servicePublicTools = [
  tool({
    name: 'search_service_public',
    title: 'Service-Public search',
    source: 'service-public',
    readOnly: true,
    description:
      'Searches the official Service-Public pages (rights, formalities, benefits, cerfa forms, online services, simulators), indexed on this computer and up to date. Use it first for any question on the rights and formalities of individuals. Returns ids (F…, R…, N…) to read with read_service_public.',
    input: {
      query: z.string().min(2).describe('Keywords in French, e.g. "aide personnalisée au logement étudiant"'),
      kind: z.enum(KINDS).optional().describe('Only one kind: sheet, question, form (cerfa), online-service, simulator, template (letter template)…'),
      limit: z.number().int().min(1).max(25).default(8)
    },
    run: async ({ query, kind, limit }) => {
      ensureIndexed()
      const { hits, loose } = searchSp(query, limit, kind)
      if (!hits.length) return `No Service-Public page for « ${query} ». Try other words (synonyms, the official name of the benefit).`
      const lines = hits.map(
        (h) => `- **${h.title}** (${h.id} · ${h.kind} · updated ${h.updated})\n  ${h.description}\n  ${h.excerpt.replace(/\s+/g, ' ')}\n  ${h.url}`
      )
      return `${plural(hits.length, 'page')} for « ${query} »${loose ? ' (partial match)' : ''}:\n\n${lines.join('\n')}`
    }
  }),

  tool({
    name: 'read_service_public',
    title: 'Service-Public page',
    source: 'service-public',
    readOnly: true,
    description:
      'Reads a whole Service-Public page by its id (F1234, R12345, N123): conditions, amounts, formalities, special cases, forms, legal references. Long pages come in sections: then ask for one by its heading.',
    input: {
      id: z.string().regex(/^[FNR]\d+$/i, 'an F…, N… or R… id'),
      section: z.string().optional().describe('Heading (or its start) of a section, for long pages')
    },
    run: async ({ id, section }) => {
      ensureIndexed()
      const doc = getSpDocument(id)
      if (!doc) throw new ToolError(`No page ${id} in the Service-Public index.`)
      const head = `# ${doc.title}\n\n${doc.id} · ${doc.kind} · ${doc.theme} · updated ${doc.updated}\nSource: ${doc.url}\n\n${doc.description}\n\n`
      const sections = doc.body.split(/^(?=## )/m)
      if (section) {
        const wanted = fold(section)
        const found = sections.filter((s) => fold(heading(s)).includes(wanted))
        if (!found.length) return `${head}No section « ${section} ». Sections: ${sections.map(heading).join(' · ')}`
        return clip(head + found.join('\n\n'), MAX)
      }
      if (doc.body.length <= MAX) return head + doc.body
      const toc = sections.map((s) => `- ${heading(s) || '(introduction)'} (${Math.round(s.length / 1000)}k characters)`)
      return `${head}Long page: read the useful sections with the section argument.\n\nSections:\n${toc.join('\n')}\n\n${clip(doc.body, MAX / 2, 'Ask for a section.')}`
    }
  })
]
