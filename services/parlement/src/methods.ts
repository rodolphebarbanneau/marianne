import type { DatabaseSync } from 'node:sqlite'
import { departmentOf, foldText, THEMES, type ServiceImpl } from '@marianne/sdk'
import type { ServiceContext } from '@marianne/sdk/main'
import { agreement, analyse, groupPositions, groupsByAuthor } from './analysis'
import { searchKey } from './assembly'
import { communeOf } from './constituency'
import { counts } from './indexer'
import { parseVideoRef } from './links'
import { ballotLine, ballotType, groupCounts, memberCard, memberName, voteCode, type LineContext } from './present'
import {
  attendanceOn,
  ballotsBetween,
  billTitles,
  constituenciesOf,
  constituencyAt,
  findMembers,
  getBallot,
  getBallots,
  getMeeting,
  getMember,
  getOrgans,
  groupRecords,
  listGroups,
  meetingsBetween,
  membersByKey,
  rapporteursOf,
  searchBallots,
  sittingStarts,
  votesIn,
  votesOf,
  type BallotRecord,
  type GroupRecord,
  type MemberRow
} from './queries'
import { parseSenateAgenda, senateAgendaUrl, senateHour, mondayOf, type Senator } from './senate'
import type { ParliamentIndex } from './store'
import { addDays, parisDay, parisIso } from './time'
import type {
  Agenda,
  AgendaMeeting,
  BallotDetail,
  BallotLine,
  Chamber,
  DataStatus,
  DayBallots,
  DayPresence,
  Deputy,
  Favorites,
  LiveStream,
  Meeting,
  MeetingDetail,
  MemberCard,
  MemberProfile,
  MemberVote,
  Mine,
  Position,
  ParlementMethods,
  Passage,
  Suggestion,
  VideoItem
} from './types'
import { detailOf, liveStreams, searchBoth, searchSenateVideos, searchVideos, senateLive, type Http } from './videos'

/** What the view calls: the index (once synced), the chambers' sites and video portals, the sync job. Errors are in French: the view shows them. */

const NOT_SYNCED = 'Les données du Parlement ne sont pas encore téléchargées : mettez-les à jour depuis ce service.'

/** Today's broadcasts of both chambers, live or announced; none from a chamber whose site doesn't answer. */
export async function todayStreams(ctx: Pick<ServiceContext, 'http' | 'log'>): Promise<LiveStream[]> {
  const parts = await Promise.allSettled([liveStreams(ctx.http, true), senateLive(ctx.http)])
  return parts.flatMap((p) => (p.status === 'fulfilled' ? p.value : (ctx.log.warn('live streams:', (p.reason as Error).message), [])))
}

/** The Sénat's agenda of some days (its API, a week at a time); none when its site doesn't answer. */
export async function senateMeetings(ctx: Pick<ServiceContext, 'http' | 'log'>, from: string, to: string): Promise<Meeting[]> {
  const mondays: string[] = []
  for (let monday = mondayOf(from); monday <= to; monday = addDays(monday, 7)) mondays.push(monday)
  const weeks = await Promise.allSettled(mondays.map((m) => ctx.http.json<unknown>(senateAgendaUrl(m, true), { cacheMs: 600_000 })))
  return weeks
    .flatMap((w) => (w.status === 'fulfilled' ? parseSenateAgenda(w.value) : (ctx.log.warn('Sénat agenda:', (w.reason as Error).message), [])))
    .filter((e) => e.day >= from && e.day <= to)
    .map((e): Meeting => ({
      id: e.id,
      chamber: 'se',
      kind: e.sitting ? 'sitting' : 'committee',
      state: e.tentative ? 'tentative' : 'confirmed',
      start: parisIso(`${e.day} ${senateHour(e.hour)}`),
      organId: '',
      organ: e.organ,
      place: e.place,
      items: [e.title].filter(Boolean),
      video: e.sitting || e.public
    }))
}

/**
 * The meetings today's live broadcasts show, by meeting id. A public sitting's broadcast shows the
 * sitting under way, the latest started, whatever meeting the chamber names: the Assemblée's API
 * names the day's first sitting all day long, the Sénat's none. A committee's shows the meeting the
 * Assemblée names, or at the Sénat the latest started of that committee. A broadcast whose meeting
 * the agenda doesn't have keeps the id it came with.
 */
export function liveMeetings(meetings: Meeting[], streams: LiveStream[], now = Date.now()): Map<string, LiveStream> {
  const today = parisDay(new Date(now))
  const started = (m: Meeting) => m.state !== 'cancelled' && m.start.slice(0, 10) === today && Date.parse(m.start) <= now
  const sameOrgan = (a = '', b = '') => !!a && !!b && (foldText(a).includes(foldText(b)) || foldText(b).includes(foldText(a)))
  const found = new Map<string, LiveStream>()
  for (const s of streams.filter((x) => x.live)) {
    // The latest started; between meetings that started together (the Sénat lists a day's sitting as
    // several points at its opening hour), the one whose agenda shares most words with the broadcast.
    const words = new Set(
      foldText(`${s.title} ${s.subject}`)
        .split(/\W+/)
        .filter((w) => w.length > 3)
    )
    const shared = (m: Meeting) =>
      foldText(m.items.join(' '))
        .split(/\W+/)
        .filter((w) => words.has(w)).length
    const latest = (list: Meeting[]) => [...list].sort((a, b) => b.start.localeCompare(a.start) || shared(b) - shared(a))[0]
    const named = meetings.find((m) => m.id === s.id)
    const own = meetings.filter((m) => m.chamber === s.chamber && started(m))
    const sitting = s.organ === 'Séance publique' || named?.kind === 'sitting'
    const shown = sitting
      ? (latest(own.filter((m) => m.kind === 'sitting')) ?? named)
      : (named ?? (s.chamber === 'se' ? latest(own.filter((m) => m.kind !== 'sitting' && sameOrgan(m.organ, s.organ))) : undefined))
    found.set(shown?.id ?? s.id, s)
  }
  return found
}

/** The agenda of some days in both chambers, with the broadcasts of today; `db` null: the Assemblée's isn't synced yet. */
export function agendaOf(db: DatabaseSync | null, from: string, to: string, senate: Meeting[], streams: LiveStream[]): Agenda {
  const assembly = db ? meetingsBetween(db, from, to) : []
  const live = liveMeetings([...assembly, ...senate], streams)
  const meetings: AgendaMeeting[] = [...assembly, ...senate].map((m) => ({ ...m, live: live.has(m.id) })).sort((a, b) => a.start.localeCompare(b.start))
  return { from, to, indexed: !!db, meetings }
}

/** A meeting known only from its broadcast (the agenda isn't synced yet). */
export function streamMeeting(s: LiveStream): Meeting {
  return {
    id: s.id,
    chamber: s.chamber,
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
 * The recordings of a past, filmed meeting of the Assemblée: the portal's videos of its day under
 * its organ (or the public sittings), the closest in time first, kept when their metadata names it.
 */
export async function meetingVideos(http: Http, meeting: Meeting, organCode: string): Promise<VideoItem[]> {
  if (!meeting.video || meeting.state === 'cancelled' || Date.parse(meeting.start) > Date.now()) return []
  const day = meeting.start.slice(0, 10)
  const sitting = meeting.kind === 'sitting'
  if (meeting.chamber === 'se') {
    const found = await searchSenateVideos(http, { from: day, to: day, ...(sitting ? { type: 'seance' as const } : {}) })
    const start = Date.parse(meeting.start)
    return found.sort((a, b) => Math.abs(Date.parse(a.date) - start) - Math.abs(Date.parse(b.date) - start)).slice(0, 2)
  }
  const found = await searchVideos(http, { from: day, to: day, ...(sitting ? { type: 'seance' as const } : {}) })
  const start = Date.parse(meeting.start)
  const candidates = found
    .filter((v) => sitting || !organCode || v.commission === organCode)
    .sort((a, b) => Math.abs(Date.parse(a.date) - start) - Math.abs(Date.parse(b.date) - start))
    .slice(0, 3)
  const details = await Promise.all(candidates.map((v) => detailOf(http, 'an', v.id).catch(() => null)))
  return candidates.filter((_, i) => details[i]?.meetingIds.includes(meeting.id))
}

/** Committees whose work a theme is about (the Assemblée's standing committees, by name). */
const THEME_COMMITTEES: Record<string, RegExp> = {
  ecology: /développement durable/i,
  'purchasing-power': /affaires économiques/i,
  health: /affaires sociales/i,
  housing: /affaires économiques/i,
  pensions: /affaires sociales/i,
  security: /lois constitutionnelles/i,
  school: /affaires culturelles/i,
  agriculture: /affaires économiques/i,
  europe: /affaires européennes/i,
  digital: /affaires économiques/i
}

/** What the index gives often: members and groups, kept for as long as the index stays open. */
interface Cache {
  /** The index's data version it was read at: another connection's commit (the sync job's) changes it. */
  version: number
  groups: Map<string, GroupRecord>
  members: Map<string, MemberRow>
  byKey: Record<Chamber, Map<number, MemberRow>>
}

export function createMethods(ctx: ServiceContext, index: ParliamentIndex): ServiceImpl<ParlementMethods> {
  /** Why the last run couldn't start, when the host's status can't say (no job built…). */
  let failure = ''
  const caches = new WeakMap<DatabaseSync, Cache>()
  const db = () => {
    const opened = index.open()
    if (!opened) throw new Error(NOT_SYNCED)
    return opened
  }
  const cache = (opened: DatabaseSync): Cache => {
    const version = (opened.prepare('pragma data_version').get() as { data_version: number }).data_version
    let c = caches.get(opened)
    if (!c || c.version !== version) {
      const an = membersByKey(opened, 'an')
      const se = membersByKey(opened, 'se')
      const members = new Map<string, MemberRow>()
      for (const row of [...an.values(), ...se.values()]) members.set(`${row.chamber}:${row.id}`, row)
      c = { version, groups: groupRecords(opened), members, byKey: { an, se } }
      caches.set(opened, c)
    }
    return c
  }
  /** Lines of some ballots, with their authors, bills and sittings. */
  const lines = (opened: DatabaseSync, records: BallotRecord[]): BallotLine[] => {
    const c = cache(opened)
    const context: LineContext = {
      members: c.members,
      groups: c.groups,
      bills: billTitles(
        opened,
        records.map((r) => r.bill)
      ),
      sittings: sittingStarts(
        opened,
        records.map((r) => r.sitting)
      )
    }
    return records.map((r) => ballotLine(r, context))
  }
  const member = (opened: DatabaseSync, chamber: Chamber, id: string): MemberRow => {
    const row = cache(opened).members.get(`${chamber}:${id.trim().toUpperCase()}`)
    if (!row) throw new Error(`${chamber === 'an' ? 'Aucun député en exercice' : 'Aucun sénateur en exercice'} n’a l’identifiant ${id}.`)
    return row
  }
  /** The group a leaning names in a chamber (its acronym), when it has members. */
  const groupNamed = (opened: DatabaseSync, chamber: Chamber, acronym: string) =>
    listGroups(opened, chamber).find((g) => searchKey(g.shortName) === searchKey(acronym) || g.id === acronym)
  /** The sync started for an index of an older version (an update of the service), once. */
  let upgrading = false
  const status = (): DataStatus => {
    const opened = index.open()
    // An index of an older version reads as none: it is built again now, not at the next daily sync.
    if (!opened && !upgrading && index.stale()) {
      upgrading = true
      void ctx.sync.run().catch((err: unknown) => (failure = (err as Error).message))
    }
    const sync = ctx.sync.status()
    const error = sync.error || (sync.running ? '' : failure)
    return {
      ready: !!opened,
      ...(opened ? counts(opened) : { deputies: 0, senators: 0, ballots: 0, meetings: 0 }),
      sync: { ...sync, ...(error ? { error } : {}) }
    }
  }

  async function mine(): Promise<Mine> {
    const leaning = ctx.profile.leaning()
    const opinions = { leaning: leaning ? { an: leaning.assembly, se: leaning.senate } : null, themes: ctx.profile.themes() }
    const home = ctx.home()
    if (!home) return { commune: null, deputies: [], exact: false, senators: [], ...opinions }
    db()
    // The geo connection names the département; without it, the INSEE code tells it.
    const commune = await ctx.geo.getCommune(home.code).catch(() => null)
    // The index may have been reopened meanwhile (a sync that ended): taken after the wait.
    const opened = db()
    const department = commune?.department ?? departmentOf(home.code)
    const circos = constituenciesOf(opened, communeOf(home.code))
    let exact = circos.length === 1
    let chosen = circos
    if (circos.length > 1 && home.latitude !== undefined && home.longitude !== undefined) {
      const at = constituencyAt(opened, circos, home.longitude, home.latitude)
      if (at) {
        chosen = [at]
        exact = true
      }
    }
    const deputies = chosen.length
      ? chosen.flatMap((c) => findMembers(opened, { chamber: 'an', department: c.department, constituency: c.constituency }))
      : findMembers(opened, { chamber: 'an', department })
    const senators = findMembers(opened, { chamber: 'se', department })
    return {
      commune: { name: commune?.name ?? home.name, code: home.code, department, departmentName: commune?.departmentName ?? senators[0]?.data.department ?? '' },
      deputies: deputies.map(memberCard),
      exact: exact && deputies.length === 1,
      senators: senators.map(memberCard),
      ...opinions
    }
  }

  function profileOf(opened: DatabaseSync, row: MemberRow): MemberProfile {
    const today = parisDay()
    const from = addDays(today, -30)
    const ballots = ballotsBetween(opened, row.chamber, from, today)
    const c = cache(opened)
    const votes = votesIn(
      opened,
      row.chamber,
      ballots.map((b) => b.key)
    )
    const [analysis] = analyse(ballots, votes, c.byKey[row.chamber], [row.key])
    const mineVotes = new Map(votes.filter((v) => v.member === row.key).map((v) => [v.ballot, { position: v.position, proxy: v.proxy }]))
    const recent = lines(opened, ballots).map((ballot, i) => ({ ballot, vote: mineVotes.get(ballots[i].key) ?? { position: null, proxy: false } }))
    const card = memberCard(row)
    if (row.chamber === 'an') {
      const d = row.data as Deputy
      const organs = getOrgans(
        opened,
        d.organs.map((o) => o.id)
      )
      const roles = d.organs.flatMap((o) => {
        const organ = organs.get(o.id)
        return organ && ROLE_TYPES.includes(organ.type) ? [{ organ: organ.name, role: o.role, rank: ROLE_TYPES.indexOf(organ.type) }] : []
      })
      return {
        ...card,
        profession: d.profession,
        birthDate: d.birthDate,
        mandateStart: d.mandateStart,
        emails: d.emails,
        websites: d.websites,
        office: d.office,
        hatvp: d.hatvp,
        roles: roles.sort((a, b) => a.rank - b.rank).map(({ organ, role }) => ({ organ, role })),
        recent,
        analysis
      }
    }
    const s = row.data as Senator
    const roles = s.organs
      .filter((o) => ['COMMISSION', 'DELEGATION', 'TEMPORAIRE'].includes(o.type))
      .map((o) => ({ organ: o.name.replace(/�/g, 'ç'), role: 'Membre' }))
    return { ...card, profession: '', birthDate: '', mandateStart: '', emails: [], websites: [], office: '', hatvp: '', roles, recent, analysis }
  }

  function suggestions(): Suggestion[] {
    const opened = db()
    const c = cache(opened)
    const favorites = (ctx.storage.get<Favorites>('favorites') ?? { members: [], groups: [] }).members
    const home = ctx.home()
    const taken = new Set(favorites)
    const found: Suggestion[] = []
    const add = (row: MemberRow | undefined, why: string, kind: Suggestion['kind']) => {
      if (!row || taken.has(row.id)) return
      taken.add(row.id)
      found.push({ member: memberCard(row), why, kind })
    }
    let mineDeputy: MemberRow | undefined
    if (home) {
      const department = departmentOf(home.code)
      const circos = constituenciesOf(opened, communeOf(home.code))
      const own = new Set(circos.map((x) => x.constituency))
      const deputies = findMembers(opened, { chamber: 'an', department })
      mineDeputy = circos.length === 1 ? deputies.find((d) => own.has((d.data as Deputy).constituency)) : undefined
      for (const d of deputies.filter((x) => own.has((x.data as Deputy).constituency))) taken.add(d.id)
      for (const s of findMembers(opened, { chamber: 'se', department })) taken.add(s.id)
      // Another constituency of the département: the closest by number.
      const near = Number([...own][0] ?? 0)
      const other = deputies
        .filter((d) => !own.has((d.data as Deputy).constituency))
        .sort((a, b) => Math.abs(Number((a.data as Deputy).constituency) - near) - Math.abs(Number((b.data as Deputy).constituency) - near))[0]
      if (other) add(other, `une autre circonscription de votre département (${(other.data as Deputy).constituency}e)`, 'neighbour')
    }
    // The rapporteur of the bill most voted on this week at the Assemblée.
    const week = ballotsBetween(opened, 'an', addDays(parisDay(), -7), parisDay())
    const byBill = new Map<string, number>()
    for (const b of week) if (b.bill) byBill.set(b.bill, (byBill.get(b.bill) ?? 0) + 1)
    const bill = [...byBill].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (bill) {
      const title = billTitles(opened, [bill]).get(bill) ?? ''
      const r = rapporteursOf(opened, [bill]).sort((a, b) => Number(b.type === 'rapporteur général') - Number(a.type === 'rapporteur général'))[0]
      const row = r ? c.members.get(`an:${r.member}`) : undefined
      if (row)
        add(row, `${r!.type === 'rapporteur général' ? 'rapporteur général' : 'rapporteur'} du texte de la semaine${title ? ` (${title})` : ''}`, 'rapporteur')
    }
    // The themes the user let it read: the president of the committee that works on them.
    const themes = ctx.profile.themes()
    const committees = new Map<string, string[]>()
    for (const t of themes) {
      const pattern = THEME_COMMITTEES[t]
      if (pattern) committees.set(pattern.source, [...(committees.get(pattern.source) ?? []), THEMES.find((x) => x.id === t)?.label ?? t])
    }
    for (const [source, labels] of committees) {
      const pattern = new RegExp(source, 'i')
      const president = [...c.byKey.an.values()].find((m) =>
        (m.data as Deputy).organs.some((o) => o.role === 'Président' && pattern.test(getOrgans(opened, [o.id]).get(o.id)?.name ?? ''))
      )
      const organ = president
        ? ([
            ...getOrgans(
              opened,
              (president.data as Deputy).organs.map((o) => o.id)
            ).values()
          ].find((o) => pattern.test(o.name))?.name ?? '')
        : ''
      if (president) add(president, `préside la ${organ.charAt(0).toLowerCase()}${organ.slice(1)} · vos thèmes : ${labels.join(', ')}`, 'theme')
    }
    // The user's leaning: someone outside their group who votes like it, and someone who rarely does.
    const leaning = ctx.profile.leaning()
    const group = leaning?.assembly[0] ? groupNamed(opened, 'an', leaning.assembly[0]) : undefined
    if (group) {
      const ballots = ballotsBetween(opened, 'an', addDays(parisDay(), -30), parisDay())
      const votes = votesIn(
        opened,
        'an',
        ballots.map((b) => b.key)
      )
      const shares = [...agreement(votes, c.byKey.an, { group: group.id }, 10)]
        .map(([key, share]) => ({ row: c.byKey.an.get(key)!, share }))
        .filter((x) => x.row && x.row.id !== mineDeputy?.id)
      const close = shares.filter((x) => x.row.group?.id !== group.id).sort((a, b) => b.share - a.share)[0]
      const far = shares.sort((a, b) => a.share - b.share)[0]
      if (close) add(close.row, `hors de ${group.shortName}, vote comme vos idées à ${Math.round(close.share * 100)} %`, 'close')
      if (far) add(far.row, `contrepoint : vote comme vos idées à ${Math.round(far.share * 100)} %, pour entendre l’autre bord`, 'counterpoint')
    }
    return found
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

    mine,

    members: (query) => findMembers(db(), { ...query, limit: Math.min(query.limit ?? 1000, 1000) }).map(memberCard),

    member(chamber, id) {
      const opened = db()
      return profileOf(opened, member(opened, chamber, id))
    },

    groups: (chamber) => listGroups(db(), chamber),

    hemicycle(chamber) {
      const opened = db()
      const rows = [...cache(opened).byKey[chamber].values()].filter((r) => r.seat > 0)
      return {
        chamber,
        groups: listGroups(opened, chamber),
        seats: rows.map((r) => ({
          seat: r.seat,
          member: r.id,
          name: memberName(r.data),
          groupId: r.group?.id ?? '',
          place: chamber === 'an' ? `${r.data.department} · ${(r.data as Deputy).constituency}e circ.` : r.data.department
        }))
      }
    },

    votes(chamber, id) {
      const opened = db()
      const ballot = getBallot(opened, chamber, id)
      if (!ballot) throw new Error(`Scrutin introuvable : ${id}`)
      const byKey = cache(opened).byKey[chamber]
      const map: Record<string, string> = {}
      for (const v of votesIn(opened, chamber, [ballot.key])) {
        const row = byKey.get(v.member)
        if (row) map[row.id] = voteCode(v.position, v.proxy)
      }
      return map
    },

    presence(day) {
      const opened = db()
      const byKey = cache(opened).byKey.an
      const ballots = ballotsBetween(opened, 'an', day, day)
      const result: Record<string, DayPresence> = {}
      const entry = (row: MemberRow) => (result[row.id] ??= { voted: 0, proxy: 0, ballots: ballots.length, committees: [] })
      for (const v of votesIn(
        opened,
        'an',
        ballots.map((b) => b.key)
      )) {
        const row = byKey.get(v.member)
        if (!row || v.position === 'nonVoting') continue
        const e = entry(row)
        e.voted++
        if (v.proxy) e.proxy++
      }
      for (const a of attendanceOn(opened, day)) {
        const row = byKey.get(a.member)
        if (row) entry(row).committees.push({ meeting: a.meeting, organ: a.organ, start: a.start, status: a.status })
      }
      return result
    },

    agreement(chamber, reference, days) {
      const opened = db()
      const c = cache(opened)
      const ballots = ballotsBetween(opened, chamber, addDays(parisDay(), -days), parisDay())
      const votes = votesIn(
        opened,
        chamber,
        ballots.map((b) => b.key)
      )
      let ref: { member: number } | { group: string }
      if ('member' in reference) ref = { member: member(opened, chamber, reference.member).key }
      else {
        const group = groupNamed(opened, chamber, reference.group)
        if (!group) return {}
        ref = { group: group.id }
      }
      const shares: Record<string, number> = {}
      for (const [key, share] of agreement(votes, c.byKey[chamber], ref)) {
        const row = c.byKey[chamber].get(key)
        if (row) shares[row.id] = share
      }
      return shares
    },

    day(day): DayBallots {
      const opened = db()
      const records = [...ballotsBetween(opened, 'an', day, day), ...ballotsBetween(opened, 'se', day, day)]
      const c = cache(opened)
      const majorities = new Map<string, Record<string, Position>>()
      for (const chamber of ['an', 'se'] as const) {
        const keys = records.filter((r) => r.chamber === chamber).map((r) => r.key)
        const positions = groupPositions(votesIn(opened, chamber, keys), c.byKey[chamber])
        for (const r of records.filter((x) => x.chamber === chamber)) majorities.set(r.id, Object.fromEntries(positions.get(r.key) ?? []))
      }
      const all = lines(opened, records).map((line) => ({ ...line, majorities: majorities.get(line.id) ?? {} }))
      const bills = new Map<string, DayBallots['bills'][number]>()
      for (const line of all) {
        const key = `${line.chamber}:${line.bill || line.billTitle || 'autres'}`
        const entry = bills.get(key) ?? { chamber: line.chamber, bill: line.bill, title: line.billTitle || 'Autres scrutins', ballots: [] }
        entry.ballots.push(line)
        bills.set(key, entry)
      }
      const an = all.filter((l) => l.chamber === 'an')
      const anVotes = votesIn(
        opened,
        'an',
        records.filter((r) => r.chamber === 'an').map((r) => r.key)
      )
      return {
        day,
        bills: [...bills.values()].sort((a, b) => a.chamber.localeCompare(b.chamber) || b.ballots.length - a.ballots.length),
        averageVoters: an.length ? Math.round(an.reduce((s, l) => s + l.voters, 0) / an.length) : 0,
        proxies: anVotes.filter((v) => v.proxy).length
      }
    },

    ballots(query) {
      const opened = db()
      const records = searchBallots(opened, { ...query, limit: Math.min(query.limit ?? 50, 200) })
      const result = lines(opened, records)
      if (!query.member) return result
      const chamber = query.chamber ?? (/^PA\d+$/i.test(query.member) ? 'an' : 'se')
      const who = member(opened, chamber, query.member)
      const votes = new Map(
        votesOf(
          opened,
          chamber,
          records.filter((r) => r.chamber === chamber).map((r) => r.key),
          [who.key]
        ).map((v) => [v.ballot, v])
      )
      return result.map((line, i) => {
        const v = records[i].chamber === chamber ? votes.get(records[i].key) : undefined
        return { ...line, vote: { position: v?.position ?? null, proxy: v?.proxy ?? false } }
      })
    },

    ballot(chamber, id, asked): BallotDetail {
      const opened = db()
      const record = getBallot(opened, chamber, id)
      if (!record) throw new Error(`Scrutin introuvable : ${id}`)
      const c = cache(opened)
      const byKey = c.byKey[chamber]
      const votes = votesIn(opened, chamber, [record.key])
      const groups = groupCounts(votes, byKey, listGroups(opened, chamber))
      const positionOf = new Map(groups.map((g) => [g.groupId, g.position]))
      const byMember = new Map(votes.map((v) => [v.member, v]))
      const askedRows = asked.flatMap((x) => {
        const row = c.members.get(`${chamber}:${x}`)
        return row ? [row] : []
      })
      const dissidents = votes
        .filter((v) => v.position !== 'nonVoting')
        .flatMap((v) => {
          const row = byKey.get(v.member)
          const position = row?.group ? positionOf.get(row.group.id) : null
          return row && position && position !== v.position && row.group?.short_name !== 'NI' ? [{ member: memberCard(row), position: v.position }] : []
        })
      return {
        ...lines(opened, [record])[0],
        type: ballotType(record),
        groups,
        votes: askedRows.map((row) => {
          const v = byMember.get(row.key)
          const vote: MemberVote = v && v.position !== 'nonVoting' ? { position: v.position, proxy: v.proxy } : { position: v?.position ?? null, proxy: false }
          return { member: memberCard(row), vote, groupPosition: (row.group && positionOf.get(row.group.id)) ?? null }
        }),
        dissidents: dissidents.slice(0, 40),
        dissidentCount: dissidents.length,
        proxies: votes.filter((v) => v.proxy).length,
        video: null
      }
    },

    positions(chamber, ballots, members) {
      const opened = db()
      const c = cache(opened)
      const records = getBallots(opened, chamber, ballots)
      const rows = members.flatMap((m) => {
        const row = c.members.get(`${chamber}:${m}`)
        return row ? [row] : []
      })
      const votes = votesOf(
        opened,
        chamber,
        records.map((r) => r.key),
        rows.map((r) => r.key)
      )
      const idOf = new Map(records.map((r) => [r.key, r.id]))
      const result: Record<string, Record<string, MemberVote>> = Object.fromEntries(rows.map((r) => [r.id, {}]))
      for (const v of votes) {
        const row = c.byKey[chamber].get(v.member)
        if (row) result[row.id][idOf.get(v.ballot)!] = { position: v.position, proxy: v.proxy }
      }
      return result
    },

    analysis(chamber, members, from, to) {
      const opened = db()
      const c = cache(opened)
      const ballots = ballotsBetween(opened, chamber, from, to)
      const votes = votesIn(
        opened,
        chamber,
        ballots.map((b) => b.key)
      )
      const keys = members.flatMap((m) => {
        const row = c.members.get(`${chamber}:${m}`)
        return row ? [row.key] : []
      })
      return {
        chamber,
        from,
        to,
        ballots: ballots.length,
        members: analyse(ballots, votes, c.byKey[chamber], keys),
        groups: groupsByAuthor(ballots, votes, c.byKey[chamber])
      }
    },

    suggestions,

    async agenda(from, days) {
      const to = addDays(from, Math.max(0, days - 1))
      const today = parisDay()
      const [senate, streams] = await Promise.all([senateMeetings(ctx, from, to), from <= today && today <= to ? todayStreams(ctx) : Promise.resolve([])])
      return agendaOf(index.open(), from, to, senate, streams)
    },

    async meeting(id): Promise<MeetingDetail> {
      const streams = await todayStreams(ctx)
      const day = parisDay()
      if (/^SE-/i.test(id)) {
        const around = await senateMeetings(ctx, addDays(day, -30), addDays(day, 30))
        const found = around.find((m) => m.id === id)
        if (!found) throw new Error(`Réunion introuvable : ${id}`)
        const stream = liveMeetings(around, streams).get(id) ?? null
        const videos = await meetingVideos(ctx.http, found, '').catch(() => [])
        return { meeting: found, stream, videos }
      }
      const opened = index.open()
      const indexed = opened ? getMeeting(opened, id) : null
      // Known only from its broadcast (the agenda isn't synced): the broadcast that names it.
      const stream = (opened ? liveMeetings(meetingsBetween(opened, day, day), streams).get(id) : streams.find((s) => s.id === id && s.live)) ?? null
      const meeting = indexed ?? (stream ? streamMeeting(stream) : null)
      if (!meeting) throw new Error(opened ? `Réunion introuvable : ${id}` : NOT_SYNCED)
      const code = opened ? (getOrgans(opened, [meeting.organId]).get(meeting.organId)?.code ?? '') : ''
      const videos = await meetingVideos(ctx.http, meeting, code).catch((err: unknown) => {
        ctx.log.warn('videos of a meeting:', (err as Error).message)
        return []
      })
      return { meeting, stream, videos }
    },

    videos: (query) => searchBoth(ctx.http, query),

    async video(ref) {
      const parsed = parseVideoRef(ref)
      if (!parsed) throw new Error(`Ce n’est pas une vidéo de l’Assemblée nationale ni du Sénat : ${ref}`)
      const detail = await detailOf(ctx.http, parsed.chamber, parsed.id)
      return parsed.timecode ? { ...detail, timecode: parsed.timecode } : detail
    },

    // What is broadcast now, each with the meeting it shows and its agenda (the panel beside the player).
    async live() {
      const streams = (await todayStreams(ctx)).filter((s) => s.live)
      const day = parisDay()
      const opened = index.open()
      const today = [...(opened ? meetingsBetween(opened, day, day) : []), ...(await senateMeetings(ctx, day, day))]
      const shown = new Map([...liveMeetings(today, streams)].map(([id, s]) => [s, today.find((m) => m.id === id)]))
      return streams.map((s) => {
        const m = shown.get(s)
        if (!m) return s
        // Shown as another meeting than the one it names (the Assemblée names its first sitting all day): that meeting's time and agenda.
        const moved = m.id !== s.id && s.chamber === 'an'
        return { ...s, meeting: m.id, items: m.items, ...(moved ? { startAt: m.start, title: m.items[0] ?? s.title, subject: m.items.join(' ; ') } : {}) }
      })
    },

    async passages(asked, days) {
      const opened = db()
      const c = cache(opened)
      const to = parisDay()
      const from = addDays(to, -days)
      const rows = asked.slice(0, 12).flatMap((id) => {
        const row = c.members.get(`an:${id}`) ?? c.members.get(`se:${id}`)
        return row ? [row] : []
      })
      const found = await Promise.allSettled(
        rows.map(async (row) => {
          // Each portal searches speakers by name: "Nom Prénom" at the Assemblée, "NOM Prénom" at the Sénat.
          const speaker = row.chamber === 'an' ? `${row.data.lastName} ${row.data.firstName}` : `${row.data.lastName.toUpperCase()} ${row.data.firstName}`
          const videos = await (row.chamber === 'an' ? searchVideos : searchSenateVideos)(ctx.http, { from, to, speaker })
          return videos.filter((v) => v.timecode !== undefined).map((v): Passage => ({ member: row.id, video: v, timecode: v.timecode! }))
        })
      )
      return found
        .flatMap((p) => (p.status === 'fulfilled' ? p.value : []))
        .sort((a, b) => b.video.date.localeCompare(a.video.date))
        .slice(0, 40)
    }
  }
}

/** The organs worth listing as a deputy's roles, in this order: committees, delegations, offices, missions… */
const ROLE_TYPES = [
  'BUREAU',
  'CONFPT',
  'COMPER',
  'COMNL',
  'COMSPSENAT',
  'CMP',
  'DELEG',
  'DELEGBUREAU',
  'OFFPAR',
  'CNPE',
  'CNPS',
  'MISINFO',
  'MISINFOCOM',
  'MISINFOPRE',
  'GE',
  'API'
]

/** A member card from either chamber's id, for the tools. */
export function cardOf(db: DatabaseSync, chamber: Chamber, id: string): MemberCard | null {
  const row = getMember(db, chamber, id)
  return row ? memberCard(row) : null
}
