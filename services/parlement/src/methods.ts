import type { DatabaseSync } from 'node:sqlite'
import { departmentOf, type ServiceImpl } from '@marianne/sdk'
import type { ServiceContext } from '@marianne/sdk/main'
import { parseVideoRef } from './links'
import { ballotDetail, ballotSummary, deputyCard, deputyProfile } from './present'
import { counts, findDeputies, getBallot, getDeputy, getMeeting, getOrgans, listGroups, meetingsOn, searchBallots } from './queries'
import type { AssemblyIndex } from './store'
import { parisDay } from './time'
import type { AgendaDay, ParlementMethods, DataStatus, LiveStream, Meeting, MeetingDetail, VideoItem } from './types'
import { liveStreams, searchVideos, videoDetail, type Http } from './videos'

/** What the view calls: the index (once synced), the video portal, the sync job. Errors are in French: the view shows them. */

const NOT_SYNCED = 'Les données de l’Assemblée ne sont pas encore téléchargées : mettez-les à jour depuis ce service.'

/** Today's broadcasts, live or announced; none when the Assemblée's site doesn't answer. */
export async function todayStreams(ctx: Pick<ServiceContext, 'http' | 'log'>): Promise<LiveStream[]> {
  try {
    return await liveStreams(ctx.http, true)
  } catch (err) {
    ctx.log.warn('live streams:', (err as Error).message)
    return []
  }
}

/** The agenda of a day with the broadcasts of today; `db` null: not synced yet. */
export function agendaDay(db: DatabaseSync | null, day: string, streams: LiveStream[]): AgendaDay {
  const today = day === parisDay() ? streams : []
  const live = new Set(today.filter((s) => s.live).map((s) => s.meetingId))
  return {
    day,
    indexed: !!db,
    meetings: db ? meetingsOn(db, day).map((m) => ({ ...m, live: live.has(m.id) })) : [],
    streams: today
  }
}

/** A meeting known only from its broadcast (the agenda isn't synced yet). */
export function streamMeeting(s: LiveStream): Meeting {
  return {
    id: s.meetingId,
    kind: s.organ === 'Séance publique' ? 'sitting' : 'committee',
    state: 'confirmed',
    start: s.startAt,
    organId: '',
    organ: s.organ,
    place: s.place,
    items: [s.title || s.subject].filter(Boolean),
    video: true
  }
}

/**
 * The recordings of a past, filmed meeting: the portal's videos of its day under its organ (or
 * the public sittings), the closest in time first, kept when their metadata names the meeting.
 */
export async function meetingVideos(http: Http, meeting: Meeting, organCode: string): Promise<VideoItem[]> {
  if (!meeting.video || meeting.state === 'cancelled' || Date.parse(meeting.start) > Date.now()) return []
  const day = meeting.start.slice(0, 10)
  const sitting = meeting.kind === 'sitting'
  const found = await searchVideos(http, { from: day, to: day, ...(sitting ? { type: 'seance' as const } : {}) })
  const start = Date.parse(meeting.start)
  const candidates = found
    .filter((v) => sitting || !organCode || v.commission === organCode)
    .sort((a, b) => Math.abs(Date.parse(a.date) - start) - Math.abs(Date.parse(b.date) - start))
    .slice(0, 3)
  const details = await Promise.all(candidates.map((v) => videoDetail(http, v.id).catch(() => null)))
  return candidates.filter((_, i) => details[i]?.meetingIds.includes(meeting.id))
}

export function createMethods(ctx: ServiceContext, index: AssemblyIndex): ServiceImpl<ParlementMethods> {
  /** Why the last run couldn't start, when the host's status can't say (no job built…). */
  let failure = ''
  const db = () => {
    const opened = index.open()
    if (!opened) throw new Error(NOT_SYNCED)
    return opened
  }
  const status = (): DataStatus => {
    const opened = index.open()
    const sync = ctx.sync.status()
    const error = sync.error || (sync.running ? '' : failure)
    return { ready: !!opened, ...(opened ? counts(opened) : { deputies: 0, ballots: 0, meetings: 0 }), sync: { ...sync, ...(error ? { error } : {}) } }
  }

  return {
    status,

    sync() {
      failure = ''
      ctx.sync.run().catch((err: unknown) => {
        failure = (err as Error).message
        ctx.log.warn('sync:', failure)
      })
      return status()
    },

    async myDeputies() {
      const home = ctx.home()
      if (!home) return { commune: null, deputies: [] }
      // The geo connection names the département; without it, the INSEE code tells it.
      const commune = await ctx.geo.getCommune(home.code).catch(() => null)
      const department = commune?.department ?? departmentOf(home.code)
      const deputies = findDeputies(db(), { department }).map(deputyCard)
      return {
        commune: { name: commune?.name ?? home.name, department, departmentName: commune?.departmentName ?? deputies[0]?.department ?? '' },
        deputies
      }
    },

    deputies: (query) => findDeputies(db(), { ...query, limit: Math.min(query.limit ?? 600, 600) }).map(deputyCard),

    deputy(id) {
      const opened = db()
      const row = getDeputy(opened, id)
      if (!row) throw new Error(`Aucun député en exercice n’a l’identifiant ${id}.`)
      return deputyProfile(opened, row)
    },

    groups: () => listGroups(db()),

    group(id) {
      const opened = db()
      const group = listGroups(opened).find((g) => g.id === id)
      if (!group) throw new Error(`Groupe introuvable : ${id}`)
      return { group, members: findDeputies(opened, { group: id }).map(deputyCard) }
    },

    ballots: (query) => searchBallots(db(), { ...query, limit: Math.min(query.limit ?? 50, 200) }).map(ballotSummary),

    ballot(key, deputies) {
      const opened = db()
      const ballot = getBallot(opened, key)
      if (!ballot) throw new Error(`Scrutin introuvable : ${key}`)
      return ballotDetail(opened, ballot, deputies)
    },

    async agenda(day) {
      return agendaDay(index.open(), day, day === parisDay() ? await todayStreams(ctx) : [])
    },

    async meeting(id): Promise<MeetingDetail> {
      const opened = index.open()
      const indexed = opened ? getMeeting(opened, id) : null
      const stream = (await todayStreams(ctx)).find((s) => s.meetingId === id) ?? null
      const meeting = indexed ?? (stream ? streamMeeting(stream) : null)
      if (!meeting) throw new Error(opened ? `Réunion introuvable : ${id}` : NOT_SYNCED)
      const code = opened ? (getOrgans(opened, [meeting.organId]).get(meeting.organId)?.code ?? '') : ''
      const videos = await meetingVideos(ctx.http, meeting, code).catch((err: unknown) => {
        ctx.log.warn('videos of a meeting:', (err as Error).message)
        return []
      })
      return { meeting, stream, videos }
    },

    videos: (query) => searchVideos(ctx.http, query),

    async video(ref) {
      const parsed = parseVideoRef(ref)
      if (!parsed) throw new Error(`Ce n’est pas une vidéo de l’Assemblée : ${ref}`)
      const detail = await videoDetail(ctx.http, parsed.id)
      return parsed.timecode ? { ...detail, timecode: parsed.timecode } : detail
    },

    live: () => liveStreams(ctx.http, true)
  }
}
