import { join } from 'node:path'
import { defineService } from '@marianne/sdk/main'
import { agendaOf, createMethods, senateMeetings, todayStreams } from './methods'
import guide from './skills/parliament.md?raw'
import { DB_FILE, ParliamentIndex } from './store'
import { parlementTile } from './tile'
import { parisDay } from './time'
import { todayItems } from './today'
import { createTools } from './tools'
import type { ParlementMethods } from './types'

/**
 * 3615 PARLEMENT: the Assemblée nationale and the Sénat. Members, ballots and the agenda from their
 * open data and sites, downloaded by the sync job into an index of the data folder; the Sénat's
 * agenda, the videos and live streams from their portals.
 */

export const INSTRUCTIONS = `- Deputies (Assemblée nationale) and senators (Sénat), their public ballots and the Assemblée's agenda come from both chambers' open data, kept offline and updated daily (parlement_members, parlement_member, parlement_ballots, parlement_ballot, parlement_agenda); videos and live streams come from their video portals (parlement_videos, parlement_video, parlement_live).
- The videos.assemblee-nationale.fr and videos.senat.fr links you cite are shown as video players; add ?timecode=<milliseconds> to point at a passage (parlement_video gives each speech's timecode).
- Only public ballots record each member's vote; most votes are by show of hands, and at the Sénat a group often votes for all its members. Say so when you report a member's votes or absences.
- For the user's own deputy and senators, call parlement_members with mine: true (from their address).`

export const service = defineService<ParlementMethods>({
  sync: { everyHours: 24 },
  // Broadcasts start and end through the day, and the tile says what is live: asked again as often as
  // Marianne allows. The portals' answers are kept a minute; the rest is read from the index.
  tile: { everyMinutes: 5 },

  activate(ctx) {
    const index = new ParliamentIndex(join(ctx.dataDir, DB_FILE))
    const methods = createMethods(ctx, index)
    return {
      methods,
      tools: createTools(ctx, index, methods),
      skills: [guide],
      instructions: INSTRUCTIONS,
      async today(day) {
        const [senate, streams] = await Promise.all([senateMeetings(ctx, day, day), day === parisDay() ? todayStreams(ctx) : Promise.resolve([])])
        return todayItems(day, agendaOf(index.open(), day, day, senate, streams).meetings, streams)
      },
      tile: () => parlementTile(ctx, index, methods),
      synced: () => index.close()
    }
  }
})
