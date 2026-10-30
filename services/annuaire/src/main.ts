import { clip, defineService, defineTool, ToolError, type ServiceTool } from '@marianne/sdk/main'
import * as z from 'zod'
import { communesOf, officesNear, searchOffices, type DirectoryContext } from './directory'
import { describeResults } from './report'
import { annuaireTile } from './tile'
import { OFFICE_KINDS, type AnnuaireMethods } from './types'

/** 3615 ANNUAIRE: the public offices near the user, and any other, from the official directory. */

const MAX_TEXT = 14_000

function findOfficeTool(ctx: DirectoryContext): ServiceTool {
  return defineTool({
    name: 'find_office',
    label: 'services publics',
    description:
      'Finds French public offices and their contact details in the official directory (Annuaire de l’administration, DILA): address, phone, email, opening hours, ' +
      'website, contact form and official page. Search by kind of office, commune and words of the name, at least one of them. With a kind and a commune: the offices ' +
      'in or competent for the commune, else the nearest ones of its département. Kinds: ' +
      OFFICE_KINDS.map((k) => `${k.id} (${k.label})`).join(', ') +
      '; other directory types work too.',
    input: {
      kind: z.string().trim().min(2).optional().describe('Kind of office, e.g. "mairie", "caf", "cpam", "ccas", "cdad", "tgi"'),
      commune: z.string().trim().min(2).optional().describe('Commune: name, postal code or INSEE code'),
      text: z.string().trim().min(2).optional().describe('Words of the office’s name, e.g. "Défenseur des droits"'),
      limit: z.number().int().min(1).max(20).default(5)
    },
    readOnly: true,
    run: async ({ kind, commune, text, limit }) => {
      if (!kind && !commune && !text) throw new ToolError('Give at least a kind of office, a commune or words of the name.')
      const communes = await communesOf(ctx.geo, { commune })
      if (!communes) throw new ToolError(`No French commune matches "${commune}": give its name, postal code or INSEE code.`)
      const results = await searchOffices(ctx.http, { kind, text, limit }, communes)
      if (!results.offices.length)
        throw new ToolError(
          `No office found${kind ? ` of kind "${kind}"` : ''}${text ? ` named "${text}"` : ''}${results.place ? ` for ${results.place}` : ''}. ` +
            'Some offices (caf, cpam, courts) are listed in another commune: try without the commune, with the département’s name in the text, or another kind.'
        )
      return clip(describeResults(results), MAX_TEXT, 'Ask for fewer offices (limit) or a narrower search.')
    }
  })
}

export const service = defineService<AnnuaireMethods>({
  activate(ctx) {
    return {
      methods: {
        kinds: () => OFFICE_KINDS,
        async search(q) {
          if (!q.kind?.trim() && !q.insee?.trim() && !q.commune?.trim() && !q.text?.trim())
            throw new Error('Indiquez un type de service, une commune ou une recherche.')
          const communes = await communesOf(ctx.geo, q)
          if (!communes) throw new Error(`Commune introuvable : « ${q.insee?.trim() || q.commune?.trim()} ».`)
          return searchOffices(ctx.http, q, communes)
        },
        async near(insee) {
          const commune = await ctx.geo.getCommune(insee)
          if (!commune) throw new Error(`Commune introuvable : ${insee}`)
          return officesNear(ctx.http, commune)
        }
      },
      tools: [findOfficeTool(ctx)],
      tile: () => annuaireTile(ctx)
    }
  },
  // Rather than 15: the time left before closing goes stale fast, and the directory's answers are cached an hour, so asking again costs no request.
  tile: { everyMinutes: 5 }
})
