import type { DatabaseSync } from 'node:sqlite'
import { departmentOf, ToolError, defineTool, type ServiceContext, type ServiceImpl, type ServiceTool } from '@marianne/sdk/main'
import * as z from 'zod'
import { searchKey } from './assembly'
import { formatAgenda, formatBallot, formatBallots, formatLive, formatMember, formatMembers, formatVideo, formatVideos } from './format'
import { parseVideoRef } from './links'
import { todayStreams } from './methods'
import { memberCard, memberName } from './present'
import { findMembers, type MemberRow } from './queries'
import type { ParliamentIndex } from './store'
import { addDays, parisDay } from './time'
import type { Chamber, ParlementMethods } from './types'

/** The tools engines see as parlement_<name>: members, ballots and the agenda from the index; videos and live streams from the portals. */

const DAY = /^\d{4}-\d{2}-\d{2}$/
const day = (what: string) => z.string().regex(DAY, 'YYYY-MM-DD').optional().describe(what)
const chamber = z.enum(['assemblee', 'senat']).optional().describe('assemblee: Assemblée nationale; senat: Sénat; both when absent')
const toChamber = (c?: 'assemblee' | 'senat'): Chamber | undefined => (c === 'assemblee' ? 'an' : c === 'senat' ? 'se' : undefined)

/** Why the index can't answer yet, for the model to relay. */
export function notSynced(status: ReturnType<ServiceContext['sync']['status']>): string {
  if (status.running) return "Parliament's open data (deputies, senators, ballots, agenda) is being downloaded right now: try again in a minute or two."
  return [
    "Parliament's open data (deputies, senators, ballots, agenda) is not downloaded yet.",
    status.error ? `The last attempt failed: ${status.error}.` : '',
    'Tell the user they can download it from the 3615 PARLEMENT service (Services page, « mettre à jour »). Videos (parlement_videos, parlement_video) and live streams (parlement_live) work meanwhile.'
  ]
    .filter(Boolean)
    .join(' ')
}

export function createTools(ctx: ServiceContext, index: ParliamentIndex, methods: ServiceImpl<ParlementMethods>): ServiceTool[] {
  const db = (): DatabaseSync => {
    const opened = index.open()
    if (!opened) throw new ToolError(notSynced(ctx.sync.status()))
    return opened
  }

  /** One member from a name or an id; several matches are for the model to choose from. */
  const oneMember = (opened: DatabaseSync, text: string, c?: Chamber): MemberRow => {
    const key = text.trim()
    const byId = /^PA\d+$/i.test(key) ? 'an' : /^\d+[A-Z]$/i.test(key) ? 'se' : null
    const found = byId ? findMembers(opened, { chamber: byId, ids: [key] }) : findMembers(opened, { chamber: c, text: key, limit: 8 })
    if (!found.length)
      throw new ToolError(`No member of Parliament matches "${text}". Search with parlement_members (by département, group or part of the name).`)
    if (found.length > 1) {
      const names = found.map(
        (r) => `${memberName(r.data)} (${r.id}, ${r.chamber === 'an' ? 'deputy' : 'senator'}, ${r.data.department}, ${r.group?.short_name || 'non-attached'})`
      )
      throw new ToolError(`Several members match "${text}": ${names.join('; ')}. Ask again with their id.`)
    }
    return found[0]
  }

  return [
    defineTool({
      name: 'members',
      label: 'élus',
      description:
        "Sitting members of Parliament (deputies of the Assemblée nationale, senators of the Sénat), by name, département (name or number), constituency or political group (acronym or name), with their ids. For the user's own, use mine: their deputy (the constituency of their address) and the senators of their département.",
      input: {
        name: z.string().optional().describe('Words of the name, e.g. "Dupont"'),
        chamber,
        department: z.string().optional().describe('Département name or number, e.g. "Gironde", "33", "2A", "971"'),
        constituency: z.string().optional().describe('Constituency number within the département (deputies)'),
        group: z.string().optional().describe('Group acronym or name, e.g. "SOC", "LR", "écologiste"'),
        mine: z.boolean().optional().describe("The user's deputy and senators, from their address"),
        limit: z.number().int().min(1).max(100).default(30)
      },
      readOnly: true,
      async run({ name, chamber: c, department, constituency, group, mine, limit }) {
        const opened = db()
        if (mine) {
          const home = ctx.home()
          if (!home) throw new ToolError("The user's address isn't filled in: they can add it in Settings → Identity. Meanwhile, ask for their département.")
          const m = await methods.mine()
          const cards = [...m.deputies, ...m.senators]
          const scope = `${m.commune?.name ?? ''} (${m.commune?.department ?? departmentOf(home.code)})${m.exact ? '' : ' · several constituencies: the exact one depends on the address'}`
          return formatMembers(cards, limit, `the user's ${m.exact ? 'deputy' : 'possible deputies'} and senators · ${scope}`)
        }
        if (!name && !department && !group) throw new ToolError('Give a name, a département, a group, or mine: true.')
        const cards = findMembers(opened, { chamber: toChamber(c), text: name, department, constituency, group }).map(memberCard)
        if (!cards.length) throw new ToolError('No member of Parliament matches. Check the spelling, or search by département.')
        return formatMembers(cards, limit)
      }
    }),

    defineTool({
      name: 'member',
      label: 'élu',
      description:
        "A member of Parliament's profile: chamber, group, constituency or département, committees and roles, contacts (email, constituency office), declarations of interests (HATVP), how they voted over the last 30 days (participation, with their group or not) and their latest votes.",
      input: {
        member: z.string().describe('Name or id (PA… for a deputy, a matricule like 19591F for a senator)'),
        chamber
      },
      readOnly: true,
      async run({ member, chamber: c }) {
        const row = oneMember(db(), member, toChamber(c))
        return formatMember(await methods.member(row.chamber, row.id))
      }
    }),

    defineTool({
      name: 'ballots',
      label: 'scrutins',
      description:
        'Public ballots (scrutins publics) of the Assemblée nationale and the Sénat: votes on texts, articles, amendments and motions, by words of their subject and dates, newest first, with who tabled the amendment (and their group), the result and a link. With a member, each comes with their vote: "how did my deputy vote on…". Only public ballots record each member\'s vote; most votes are by show of hands, and at the Sénat a group often votes for all its members.',
      input: {
        text: z.string().optional().describe('Words of the subject, e.g. "retraites", "loi de finances 2027"'),
        chamber,
        member: z.string().optional().describe('Name or id: shows their vote on each'),
        from: day('From this day, YYYY-MM-DD'),
        to: day('Until this day, YYYY-MM-DD'),
        final: z.boolean().default(false).describe('Only the votes on a text as a whole (the final vote of a reading)'),
        limit: z.number().int().min(1).max(50).default(15)
      },
      readOnly: true,
      async run({ text, chamber: c, member, from, to, final, limit }) {
        const opened = db()
        const who = member ? oneMember(opened, member, toChamber(c)) : null
        const rows = await methods.ballots({
          text,
          chamber: who?.chamber ?? toChamber(c),
          member: who?.id,
          from,
          to,
          ...(final ? { kind: 'text' as const } : {}),
          limit
        })
        if (!rows.length) throw new ToolError(`No public ballot found${text ? ` for "${text}"` : ''}. Try other words, or widen the dates.`)
        return formatBallots(rows, who ? `${memberName(who.data)} (${who.id})` : undefined)
      }
    }),

    defineTool({
      name: 'ballot',
      label: 'scrutin',
      description:
        "One public ballot: subject, legislative file, who tabled the amendment, result, the count, each political group's position, those who voted otherwise than their group, and a member's vote when asked.",
      input: {
        ballot: z.union([z.number().int(), z.string()]).describe('Number or id (VTANR5L17V… at the Assemblée, SE2026-44 at the Sénat)'),
        chamber,
        member: z.string().optional().describe('Name or id: their vote')
      },
      readOnly: true,
      async run({ ballot, chamber: c, member }) {
        const opened = db()
        const key = String(ballot)
        const where: Chamber = /^SE\d{4}-\d+$/i.test(key) ? 'se' : (toChamber(c) ?? 'an')
        const who = member ? oneMember(opened, member, where) : null
        try {
          return formatBallot(await methods.ballot(where, key, who ? [who.id] : []))
        } catch {
          throw new ToolError(
            `No public ballot ${ballot} ${where === 'an' ? 'at the Assemblée in this legislature' : 'at the Sénat'}. Search with parlement_ballots.`
          )
        }
      }
    }),

    defineTool({
      name: 'agenda',
      label: 'agenda',
      description:
        'The agenda of the Assemblée nationale and the Sénat for a day or a week: public sittings with their order of business, committee meetings and hearings, with times (Paris), places, whether they are cancelled or tentative, filmed, or broadcast live now, and their meeting ids.',
      input: {
        day: day('YYYY-MM-DD (default: today)'),
        days: z.number().int().min(1).max(14).default(1).describe('How many days from that day'),
        chamber,
        kind: z.enum(['sitting', 'committee']).optional().describe('Only public sittings, or only committee meetings'),
        text: z.string().optional().describe('Words of the organ or of the agenda, e.g. "finances", "audition"')
      },
      readOnly: true,
      async run({ day: asked, days, chamber: c, kind, text }) {
        const from = asked ?? parisDay()
        const agenda = await methods.agenda(from, days ?? 1)
        const words = searchKey(text ?? '')
          .split(' ')
          .filter(Boolean)
        const wanted = toChamber(c)
        const meetings = agenda.meetings.filter(
          (m) =>
            (!wanted || m.chamber === wanted) &&
            (!kind || m.kind === kind) &&
            words.every((w) => searchKey(`${m.organ ?? ''} ${m.items.join(' ')}`).includes(w))
        )
        return formatAgenda(agenda.from, agenda.to, meetings)
      }
    }),

    defineTool({
      name: 'videos',
      label: 'vidéos',
      description:
        'Videos of the Assemblée nationale and the Sénat (public sittings, committees and hearings, questions to the government) over a period, newest first, by words of the title or by speaker, with their links (videos.assemblee-nationale.fr, videos.senat.fr; cited in your answer, Marianne shows them as video players). A speaker search points each video at their first passage. Videos stay online for about a year.',
      input: {
        from: day('YYYY-MM-DD (default: 7 days ago)'),
        to: day('YYYY-MM-DD (default: today)'),
        chamber,
        type: z.enum(['seance', 'commission', 'questions', 'autre']).optional().describe('seance: public sittings; questions: questions to the government'),
        text: z.string().optional().describe('Words of the title or description, e.g. "budget santé"'),
        speaker: z.string().optional().describe('A speaker\'s last name, or "Last name First name"'),
        limit: z.number().int().min(1).max(60).default(15)
      },
      readOnly: true,
      async run({ from, to, chamber: c, type, text, speaker, limit }) {
        const today = parisDay()
        const videos = await methods.videos({ from: from ?? addDays(to ?? today, -7), to: to ?? today, chamber: toChamber(c), type, text, speaker })
        if (!videos.length) throw new ToolError('No video published over this period with these criteria. Widen the period or drop a filter.')
        return formatVideos(videos, limit)
      }
    }),

    defineTool({
      name: 'video',
      label: 'vidéo',
      description:
        "One video of either chamber: date, organ, duration, the meetings it covers, and its order of business as chapters with the timecode of each speech and the speaker (with their member id). To point at a passage, cite the video's link with ?timecode=<milliseconds>.",
      input: {
        video: z.string().describe('Link of the video, or its id ("19632460_6ae0ce76adf9c" at the Assemblée, "se:5979506_6ae25732cc856" at the Sénat)')
      },
      readOnly: true,
      async run({ video }) {
        if (!parseVideoRef(video))
          throw new ToolError(`"${video}" is not a video of Parliament: give its link (videos.assemblee-nationale.fr, videos.senat.fr) or its id.`)
        return formatVideo(await methods.video(video))
      }
    }),

    defineTool({
      name: 'live',
      label: 'en direct',
      description:
        'What the Assemblée nationale and the Sénat broadcast live right now (sittings, committee meetings), and what the Assemblée announces for later today.',
      input: {},
      readOnly: true,
      async run() {
        return formatLive(await todayStreams(ctx))
      }
    })
  ]
}
