import type { DatabaseSync } from 'node:sqlite'
import { defineTool, departmentOf, ToolError, type ServiceContext, type ServiceTool } from '@marianne/sdk/main'
import * as z from 'zod'
import { searchKey } from './assembly'
import { formatAgenda, formatBallot, formatBallots, formatDeputies, formatDeputy, formatLive, formatVideo, formatVideos } from './format'
import { parseVideoRef } from './links'
import { agendaDay, todayStreams } from './methods'
import { ballotDetail, ballotSummary, deputyCard, deputyName, deputyProfile } from './present'
import { findDeputies, getBallot, searchBallots } from './queries'
import type { AssemblyIndex } from './store'
import { addDays, parisDay } from './time'
import type { DeputyRow } from './types'
import { liveStreams, searchVideos, videoDetail } from './videos'

/** The tools engines see as parlement_<name>: deputies, ballots and the agenda from the index; videos and live streams from the portal. */

const DAY = /^\d{4}-\d{2}-\d{2}$/
const day = (what: string) => z.string().regex(DAY, 'YYYY-MM-DD').optional().describe(what)

/** Why the index can't answer yet, for the model to relay. */
export function notSynced(status: ReturnType<ServiceContext['sync']['status']>): string {
  if (status.running) return "The Assemblée nationale's open data (deputies, ballots, agenda) is being downloaded right now: try again in a minute or two."
  return [
    "The Assemblée nationale's open data (deputies, ballots, agenda) is not downloaded yet.",
    status.error ? `The last attempt failed: ${status.error}.` : '',
    'Tell the user they can download it from the 3615 PARLEMENT service (Services page, « mettre à jour »). Videos (parlement_videos, parlement_video) and live streams (parlement_live) work meanwhile.'
  ]
    .filter(Boolean)
    .join(' ')
}

export function createTools(ctx: ServiceContext, index: AssemblyIndex): ServiceTool[] {
  const db = (): DatabaseSync => {
    const opened = index.open()
    if (!opened) throw new ToolError(notSynced(ctx.sync.status()))
    return opened
  }

  /** One sitting deputy from a name or an id; several matches are for the model to choose from. */
  const oneDeputy = (opened: DatabaseSync, text: string): DeputyRow => {
    const key = text.trim()
    const found = /^PA\d+$/i.test(key) ? findDeputies(opened, { ids: [key] }) : findDeputies(opened, { text: key, limit: 8 })
    if (!found.length) throw new ToolError(`No sitting deputy matches "${text}". Search with parlement_deputies (by département, group or part of the name).`)
    if (found.length > 1) {
      const names = found.map((r) => `${deputyName(r.deputy)} (${r.deputy.id}, ${r.deputy.department}, ${r.group?.shortName || 'non-attached'})`)
      throw new ToolError(`Several sitting deputies match "${text}": ${names.join('; ')}. Ask again with their id (PA…).`)
    }
    return found[0]
  }

  return [
    defineTool({
      name: 'deputies',
      label: 'députés',
      description:
        "Sitting deputies of the Assemblée nationale, by name, département (name or number), constituency or political group (acronym or name), with their ids. For the user's own deputies, use mine: the deputies of the département of their address (the constituency depends on the exact address: when unsure, list them and suggest checking on https://www.assemblee-nationale.fr/dyn/vos-deputes).",
      input: {
        name: z.string().optional().describe('Words of the name, e.g. "Dupont"'),
        department: z.string().optional().describe('Département name or number, e.g. "Gironde", "33", "2A", "971"'),
        constituency: z.string().optional().describe('Constituency number within the département'),
        group: z.string().optional().describe('Group acronym or name, e.g. "SOC", "écologiste"'),
        mine: z.boolean().optional().describe("The deputies of the département of the user's address"),
        limit: z.number().int().min(1).max(100).default(30)
      },
      readOnly: true,
      async run({ name, department, constituency, group, mine, limit }) {
        const opened = db()
        let dep = department
        if (mine) {
          const home = ctx.home()
          if (!home) throw new ToolError("The user's address isn't filled in: they can add it in Settings → Identity. Meanwhile, ask for their département.")
          dep = (await ctx.geo.getCommune(home.code).catch(() => null))?.department ?? departmentOf(home.code)
        }
        if (!name && !dep && !group) throw new ToolError('Give a name, a département, a group, or mine: true.')
        const cards = findDeputies(opened, { text: name, department: dep, constituency, group }).map(deputyCard)
        if (!cards.length) throw new ToolError('No sitting deputy matches. Check the spelling, or search by département.')
        return formatDeputies(cards, limit, mine && cards[0] ? `département of the user's address: ${cards[0].department} (${cards[0].departmentNumber})` : '')
      }
    }),

    defineTool({
      name: 'deputy',
      label: 'député',
      description:
        "A sitting deputy's profile: group, constituency, committees and roles, contacts (email, constituency office), declarations of interests (HATVP), participation in public ballots and latest votes.",
      input: {
        deputy: z.string().describe('Name or id (PA…)'),
        votes: z.number().int().min(0).max(50).default(12).describe('How many of their latest votes')
      },
      readOnly: true,
      async run({ deputy, votes }) {
        const opened = db()
        return formatDeputy(deputyProfile(opened, oneDeputy(opened, deputy), votes))
      }
    }),

    defineTool({
      name: 'ballots',
      label: 'scrutins',
      description:
        'Public ballots (scrutins publics) of the Assemblée nationale: votes on texts, articles, amendments and motions, by words of their subject and dates, newest first, with the result and a link. With a deputy, each comes with their vote: "how did my deputy vote on…". Only public ballots record each deputy\'s vote; most votes are by show of hands.',
      input: {
        text: z.string().optional().describe('Words of the subject, e.g. "retraites", "loi de finances 2027"'),
        deputy: z.string().optional().describe('Name or id (PA…): shows their vote on each'),
        from: day('From this day, YYYY-MM-DD'),
        to: day('Until this day, YYYY-MM-DD'),
        final: z.boolean().default(false).describe('Only the votes on a text as a whole (the final vote of a reading)'),
        limit: z.number().int().min(1).max(50).default(15)
      },
      readOnly: true,
      async run({ text, deputy, from, to, final, limit }) {
        const opened = db()
        const who = deputy ? oneDeputy(opened, deputy) : null
        const rows = searchBallots(opened, { text, deputy: who?.deputy.id, from, to, finalOnly: final, limit }).map(ballotSummary)
        if (!rows.length) throw new ToolError(`No public ballot found${text ? ` for "${text}"` : ''}. Try other words, or widen the dates.`)
        return formatBallots(rows, who ? `${deputyName(who.deputy)} (${who.deputy.id})` : undefined)
      }
    }),

    defineTool({
      name: 'ballot',
      label: 'scrutin',
      description: "One public ballot: subject, legislative file, result, the count, each political group's position, and a deputy's vote when asked.",
      input: {
        ballot: z.union([z.number().int(), z.string()]).describe('Ballot number or id (VTANR5L17V…)'),
        deputy: z.string().optional().describe('Name or id (PA…): their vote')
      },
      readOnly: true,
      async run({ ballot, deputy }) {
        const opened = db()
        const found = getBallot(opened, ballot)
        if (!found) throw new ToolError(`No public ballot ${ballot} in this legislature. Search with parlement_ballots.`)
        return formatBallot(ballotDetail(opened, found, deputy ? [oneDeputy(opened, deputy).deputy.id] : []))
      }
    }),

    defineTool({
      name: 'agenda',
      label: 'agenda',
      description:
        'The agenda of the Assemblée nationale for a day: public sittings with their order of business, committee meetings and hearings, with times (Paris), places, whether they are cancelled or tentative, filmed, or broadcast live now, and their meeting ids.',
      input: {
        day: day('YYYY-MM-DD (default: today)'),
        kind: z.enum(['sitting', 'committee']).optional().describe('Only public sittings, or only committee meetings'),
        text: z.string().optional().describe('Words of the organ or of the agenda, e.g. "finances", "audition"')
      },
      readOnly: true,
      async run({ day: asked, kind, text }) {
        const opened = db()
        const date = asked ?? parisDay()
        const agenda = agendaDay(opened, date, date === parisDay() ? await todayStreams(ctx) : [])
        const words = searchKey(text ?? '')
          .split(' ')
          .filter(Boolean)
        const meetings = agenda.meetings.filter(
          (m) => (!kind || m.kind === kind) && words.every((w) => searchKey(`${m.organ ?? ''} ${m.items.join(' ')}`).includes(w))
        )
        return formatAgenda(date, meetings)
      }
    }),

    defineTool({
      name: 'videos',
      label: 'vidéos',
      description:
        'Videos of the Assemblée nationale (public sittings, committees, questions to the government) over a period, newest first, by words of the title or by speaker, with their videos.assemblee-nationale.fr links (cited in your answer, Marianne shows them as video players). A speaker search points each video at their first passage. Videos stay online for about a year.',
      input: {
        from: day('YYYY-MM-DD (default: 7 days ago)'),
        to: day('YYYY-MM-DD (default: today)'),
        type: z.enum(['seance', 'commission', 'questions', 'autre']).optional().describe('seance: public sittings; questions: questions to the government'),
        text: z.string().optional().describe('Words of the title or description, e.g. "budget santé"'),
        speaker: z.string().optional().describe('A speaker\'s last name, or "Last name First name"'),
        limit: z.number().int().min(1).max(60).default(15)
      },
      readOnly: true,
      async run({ from, to, type, text, speaker, limit }) {
        const today = parisDay()
        const videos = await searchVideos(ctx.http, { from: from ?? addDays(to ?? today, -7), to: to ?? today, type, text, speaker })
        if (!videos.length) throw new ToolError('No video published over this period with these criteria. Widen the period or drop a filter.')
        return formatVideos(videos, limit)
      }
    }),

    defineTool({
      name: 'video',
      label: 'vidéo',
      description:
        "One video of the Assemblée: date, organ, duration, the meetings it covers, and its order of business as chapters with the timecode of each speech and the speaker (with their deputy id). To point at a passage, cite the video's link with ?timecode=<milliseconds>.",
      input: { video: z.string().describe('Id ("19632460_6ae0ce76adf9c") or link of the video') },
      readOnly: true,
      async run({ video }) {
        const ref = parseVideoRef(video)
        if (!ref) throw new ToolError(`"${video}" is not a video of the Assemblée: give its id or its videos.assemblee-nationale.fr link.`)
        return formatVideo(await videoDetail(ctx.http, ref.id))
      }
    }),

    defineTool({
      name: 'live',
      label: 'en direct',
      description: 'What the Assemblée nationale broadcasts live right now (sittings, committee meetings), and what is announced for later today.',
      input: {},
      readOnly: true,
      async run() {
        return formatLive(await liveStreams(ctx.http, true))
      }
    })
  ]
}
