import { join } from 'node:path'
import { defineService } from '@marianne/sdk/main'
import { createMethods, todayStreams } from './methods'
import { meetingsOn } from './queries'
import guide from './skills/national-assembly.md?raw'
import { AssemblyIndex, DB_FILE } from './store'
import { parisDay } from './time'
import { todayItems } from './today'
import { createTools } from './tools'
import type { AssembleeMethods } from './types'

/**
 * 3615 ASSEMBLEE: the Assemblée nationale. Deputies, ballots and the agenda from its open data,
 * downloaded by the sync job into an index of the data folder; videos and live streams from its
 * video portal.
 */

export const INSTRUCTIONS = `- Deputies, public ballots and the agenda come from the Assemblée's open data, kept offline and updated daily (assemblee_deputies, assemblee_deputy, assemblee_ballots, assemblee_ballot, assemblee_agenda); videos and live streams come from its video portal (assemblee_videos, assemblee_video, assemblee_live).
- The videos.assemblee-nationale.fr links you cite are shown as video players; add ?timecode=<milliseconds> to point at a passage (assemblee_video gives each speech's timecode).
- Only public ballots record each deputy's vote; most votes are by show of hands. Say so when you report a deputy's votes or absences.
- For the user's own deputies, call assemblee_deputies with mine: true (the département of their address); their constituency depends on the exact address.`

export const service = defineService<AssembleeMethods>({
  sync: { everyHours: 24 },

  activate(ctx) {
    const index = new AssemblyIndex(join(ctx.dataDir, DB_FILE))
    return {
      methods: createMethods(ctx, index),
      tools: createTools(ctx, index),
      skills: [guide],
      instructions: INSTRUCTIONS,
      async today(day) {
        const db = index.open()
        const streams = day === parisDay() ? await todayStreams(ctx) : []
        return todayItems(day, db ? meetingsOn(db, day) : [], streams)
      },
      synced: () => index.close()
    }
  }
})
