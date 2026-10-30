import { defineService, defineTool } from '@marianne/sdk/main'
import * as z from 'zod'
import { greeting, visitsText, weekBlocks } from './greet'
import type { BonjourMethods } from './types'

/**
 * 3615 BONJOUR: an example of a community service, to copy. Its main side greets the user (and
 * counts their visits, in their encrypted storage), lends the engines one tool, and fills its
 * tile. It reaches no host: `marianne.hosts` is empty, and Marianne would refuse any other.
 */

export const service = defineService<BonjourMethods>({
  activate(ctx) {
    const visits = () => ctx.storage.get<number>('visits') ?? 0
    return {
      methods: {
        greet(name) {
          const count = visits() + 1
          ctx.storage.set('visits', count)
          return { text: greeting(name, new Date()), visits: count, from: ctx.home()?.name ?? null }
        },
        visits,
        reset() {
          ctx.storage.remove('visits')
          return 0
        }
      },
      tools: [
        defineTool({
          name: 'greet',
          label: 'saluer',
          description:
            'A French greeting for someone, by their first name, as 3615 BONJOUR says it. An example of a community service: use it when asked to greet someone.',
          input: { name: z.string().trim().min(1).max(40).describe('The first name of the person to greet') },
          readOnly: true,
          run: async ({ name }) => `3615 BONJOUR says: "${greeting(name, new Date())}"`
        })
      ],
      instructions: 'An example community service: it greets someone in French (tool bonjour_greet).',
      async tile() {
        const count = visits()
        const home = ctx.home()
        return {
          value: { text: String(count), unit: count > 1 ? 'visites' : 'visite' },
          visual: { kind: 'blocks', blocks: weekBlocks(new Date()) },
          lines: [{ text: home ? `bonjour de ${home.name}` : visitsText(count) + ' sur ce service', tone: 'dim' }]
        }
      }
    }
  },
  // A count that changes only when the user comes: not worth asking often.
  tile: { everyMinutes: 60 }
})
