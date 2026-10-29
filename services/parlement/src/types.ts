import type { SyncStatus } from '@marianne/sdk'

/** The two chambers: the Assemblée nationale and the Sénat. */
export type Chamber = 'an' | 'se'

export const CHAMBERS: Chamber[] = ['an', 'se']

export const CHAMBER_NAMES: Record<Chamber, string> = { an: 'Assemblée nationale', se: 'Sénat' }

/** What a ballot decides: an amendment (or sub-amendment), an article, a whole text, a motion, something else. */
export type BallotKind = 'amendment' | 'article' | 'text' | 'motion' | 'other'

export type Position = 'for' | 'against' | 'abstention' | 'nonVoting'

export const POSITION_LABELS: Record<Position, string> = { for: 'pour', against: 'contre', abstention: 'abstention', nonVoting: 'non-votant' }

/** Committee attendance, as the Assemblée's minutes record it. */
export type Attendance = 'present' | 'excused' | 'absent'

// ---------------------------------------------------------------- open data of the Assemblée

/** A group, committee, delegation… of the Assemblée. */
export interface AssemblyOrgan {
  id: string
  /** Open-data code: GP (group), COMPER (standing committee)… */
  type: string
  name: string
  /** As the Assemblée shortens it: "RN", "Affaires sociales". */
  shortName: string
  /** Its acronym ("CION-SOC", "MASCO"): the video portal files videos under it. */
  code: string
  /** The group's color on the Assemblée's charts ("#313567"); empty for other organs. */
  color: string
}

export interface Deputy {
  /** "PA1008" */
  id: string
  civility: string
  firstName: string
  lastName: string
  /** Their seat in the hemicycle (placeHemicycle); 0: none. */
  seat: number
  groupId: string
  department: string
  departmentNumber: string
  constituency: string
  profession: string
  birthDate: string
  mandateStart: string
  emails: string[]
  websites: string[]
  /** The constituency office (permanence) address. */
  office: string
  /** Declarations of interests (HATVP). */
  hatvp: string
  /** Committees and other organs, with the deputy's role in French ("Membre", "Président"). */
  organs: Array<{ id: string; role: string }>
}

/** One public vote of the Assemblée (scrutin): on a text, an article, an amendment, a motion. */
export interface Ballot {
  /** "VTANR5L17V9097" */
  id: string
  number: number
  date: string
  title: string
  /** French, as published: "scrutin public ordinaire"… */
  type: string
  /** French, as published: "adopté", "rejeté". */
  result: string
  voters: number
  for: number
  against: number
  abstentions: number
  /** The sitting it took place in. */
  sitting: string
  /** The legislative file (dossier législatif) it belongs to. */
  bill: string
  /** The file's title: "Projet de loi de finances pour 2027". */
  billTitle: string
  groups: BallotGroup[]
}

export interface BallotGroup {
  organId: string
  members: number
  position: Position | ''
  for: number
  against: number
  abstentions: number
  nonVoting: number
}

/** A deputy's position in one ballot. */
export interface BallotVote {
  ballot: string
  deputy: string
  position: Position
  /** Cast by another deputy (délégation). */
  proxy: boolean
}

export type MeetingKind = 'sitting' | 'committee' | 'other'
export type MeetingState = 'confirmed' | 'tentative' | 'cancelled'

/** A meeting on the agenda of either chamber: a public sitting, a committee, a hearing… */
export interface Meeting {
  /** The Assemblée's "RUANR5L17S2027IDS30966" (its live stream's and video's id too); the Sénat's "SE-559710". */
  id: string
  chamber: Chamber
  kind: MeetingKind
  state: MeetingState
  /** ISO, with the Paris offset. */
  start: string
  end?: string
  organId: string
  /** The organ's name, filled in by the queries. */
  organ?: string
  place: string
  /** The agenda, in French. */
  items: string[]
  /** Filmed (and so broadcast, then on the video portal). */
  video: boolean
}

// ---------------------------------------------------------------- videos

/** The kinds of videos both portals publish, as the view filters them. */
export type VideoType = 'seance' | 'questions' | 'commission' | 'autre'

export interface VideoItem {
  /** "19632460_6ae0ce76adf9c" (Assemblée), "5979506_6ae25732cc856" (Sénat). */
  id: string
  chamber: Chamber
  title: string
  description: string
  date: string
  /** In French: "séance publique", "commission"… */
  type: string
  kind: VideoType
  /** The organ: its acronym on the Assemblée's portal ("MASCO", as AssemblyOrgan.code), its name on the Sénat's. */
  commission: string
  thumbnail: string
  /** Its length, ms; 0: unknown. */
  durationMs: number
  /** Broadcasting now. */
  live?: boolean
  /** Search hits on a speaker point to their passage, ms. */
  timecode?: number
  url: string
}

export interface VideoChapter {
  id: string
  title: string
  depth: number
  /** Position in the video, ms; null when the chapter isn't timed. */
  timecode: number | null
  speaker?: string
  /** The speaker's member id (PA… or a senator's matricule), when the portal gives one. */
  member?: string
}

export interface VideoDetail {
  id: string
  chamber: Chamber
  title: string
  date: string
  type: string
  organ: string
  /** The open-data meetings (réunions) it covers: a video may span two hearings. */
  meetingIds: string[]
  durationMs: number
  chapters: VideoChapter[]
  speakers: Array<{ name: string; member?: string }>
  /** HLS playlist (multi-bitrate); empty while the portal is still processing the video. */
  hls: string
  /** Where the stream starts in the recording, ms (the Sénat's streams skip the wait before the sitting). */
  offsetMs: number
  thumbnail: string
  url: string
}

export interface LiveStream {
  /** The Assemblée's meeting id; the Sénat's video id. */
  id: string
  chamber: Chamber
  organ: string
  /** French: "mercredi 28 octobre 2026 à 14h00". */
  start: string
  /** ISO, with the Paris offset. */
  startAt: string
  title: string
  subject: string
  place: string
  /** Broadcasting now; false: announced for later today. */
  live: boolean
  hls: string
  poster: string
  /** Its page on the chamber's portal. */
  url: string
  /** The meeting it shows, when the agenda says which (liveMeetings), and its agenda. */
  meeting?: string
  items?: string[]
}

export interface VideoQuery {
  /** YYYY-MM-DD */
  from: string
  to: string
  /** Both chambers when absent. */
  chamber?: Chamber
  type?: VideoType
  /** Words of the title or description. */
  text?: string
  /** "Last name" or "Last name First name", as the portals search speakers. */
  speaker?: string
}

/** A passage of a video where a member speaks. */
export interface Passage {
  member: string
  video: VideoItem
  /** ms */
  timecode: number
}

// ---------------------------------------------------------------- what the view gets

export interface GroupInfo {
  chamber: Chamber
  id: string
  name: string
  shortName: string
  color: string
  members: number
}

/** A member of either chamber, as lists show them. */
export interface MemberCard {
  chamber: Chamber
  /** "PA1008" (Assemblée), "19591F" (Sénat). */
  id: string
  /** "M. Thierry Tesson" */
  name: string
  firstName: string
  lastName: string
  female: boolean
  groupId: string
  group: string
  groupShort: string
  groupColor: string
  department: string
  departmentNumber: string
  /** The deputy's constituency number; '' for senators (elected by their département). */
  constituency: string
  seat: number
  photo: string
  url: string
  /** The organs they sit in (the Assemblée's organ ids, the Sénat's codes): their committees' meetings. */
  organs: string[]
}

/** How a member voted in one ballot; null: didn't take part. */
export interface MemberVote {
  position: Position | null
  proxy: boolean
}

/** Who tabled an amendment: a member, the Government (GOUV) or a committee (COM). */
export interface Author {
  id: string
  name: string
  groupId: string
  groupShort: string
  groupColor: string
}

export interface BallotLine {
  chamber: Chamber
  /** "VTANR5L17V9097", "SE2026-44". */
  id: string
  number: number
  date: string
  title: string
  kind: BallotKind
  /** "1274", when the ballot is on an amendment. */
  amendment: string
  /** "adopté", "rejeté". */
  result: string
  adopted: boolean
  voters: number
  for: number
  against: number
  abstentions: number
  author: Author | null
  bill: string
  billTitle: string
  /** The sitting it took place in (Assemblée), and when it started: the time a ballot shows. */
  sitting: string
  sittingStart: string
  url: string
  /** With a member: their vote. */
  vote?: MemberVote
  /** In the day's ballots: what most of each group chose (group id → position). */
  majorities?: Record<string, Position>
}

/** How one group voted in a ballot, on its seats. */
export interface GroupCount {
  groupId: string
  shortName: string
  name: string
  color: string
  members: number
  for: number
  against: number
  abstentions: number
  nonVoting: number
  /** What most of its voters chose; null: none voted. */
  position: Position | null
}

export interface BallotDetail extends BallotLine {
  /** French: "scrutin public ordinaire". */
  type: string
  groups: GroupCount[]
  /** The votes of the members asked for (the user's own, those they follow). */
  votes: Array<{ member: MemberCard; vote: MemberVote; groupPosition: Position | null }>
  /** Members who voted otherwise than most of their group (the first 40), and how many they are. */
  dissidents: Array<{ member: MemberCard; position: Position }>
  dissidentCount: number
  proxies: number
  /** The recording of its sitting, when the portal has it. */
  video: { id: string; url: string } | null
}

/** Votes in compact form, for a hemicycle: member id → "p" pour, "c" contre, "a" abstention, "n" non-votant; capitals: by proxy. */
export type VoteMap = Record<string, string>

export interface Hemicycle {
  chamber: Chamber
  groups: GroupInfo[]
  seats: Array<{ seat: number; member: string; name: string; groupId: string; place: string }>
}

/** How a member took part in the public ballots of a day: votes cast, of which by proxy, out of how many. */
export interface DayPresence {
  voted: number
  proxy: number
  ballots: number
  /** Committee meetings of the day whose minutes say who attended: present, excused or absent. */
  committees: Array<{ meeting: string; organ: string; start: string; status: Attendance }>
}

export interface DayBills {
  chamber: Chamber
  bill: string
  title: string
  ballots: BallotLine[]
}

/** The public ballots of a day, by bill, in both chambers. */
export interface DayBallots {
  day: string
  bills: DayBills[]
  /** The Assemblée's voters per ballot, on average; and its votes by proxy. */
  averageVoters: number
  proxies: number
}

export interface MemberQuery {
  chamber?: Chamber
  /** Words of the name. */
  text?: string
  /** Name or number of the département. */
  department?: string
  constituency?: string
  /** Acronym or name of the group. */
  group?: string
  ids?: string[]
  limit?: number
}

export interface BallotQuery {
  chamber?: Chamber
  /** Words of the title. */
  text?: string
  /** Its number (at the Sénat, one per session: the newest first). */
  number?: number
  /** A member's id: each ballot comes with their vote. */
  member?: string
  /** YYYY-MM-DD */
  from?: string
  to?: string
  kind?: BallotKind
  /** Only those whose amendment a group (its id, GOUV or COM) tabled. */
  authorGroup?: string
  result?: 'adopted' | 'rejected'
  limit?: number
}

/** Shares of votes as a member cast them, on the ballots of a period. */
export interface VoteTally {
  for: number
  against: number
  abstention: number
  n: number
}

/** How a member votes, over a period: on the amendments of each group, and like each group. */
export interface MemberAnalysis {
  member: string
  /** Ballots they voted in, out of the period's. */
  voted: number
  ballots: number
  proxies: number
  /** Votes like most of their own group, out of their votes. */
  loyal: number
  /** By the group that tabled the amendment (its id, GOUV or COM). */
  byAuthor: Record<string, VoteTally>
  /** Votes like most of each group: [same, both voted]. */
  likeGroup: Record<string, [number, number]>
}

export interface Analysis {
  chamber: Chamber
  from: string
  to: string
  ballots: number
  members: MemberAnalysis[]
  /** How each group voted on the amendments of each group, for a reference row (the user's leaning). */
  groups: Record<string, Record<string, VoteTally>>
}

export interface MemberProfile extends MemberCard {
  profession: string
  birthDate: string
  mandateStart: string
  emails: string[]
  websites: string[]
  office: string
  hatvp: string
  /** Committees, delegations, offices: their name and the member's role. */
  roles: Array<{ organ: string; role: string }>
  /** Their votes over the last 30 days, oldest first, and how they vote. */
  recent: Array<{ ballot: BallotLine; vote: MemberVote }>
  analysis: MemberAnalysis
}

/** Who represents the user, from their address. */
export interface Mine {
  /** null: the profile has no address. */
  commune: { name: string; code: string; department: string; departmentName: string } | null
  /** Their deputy; several when the commune is split and the address can't tell which. */
  deputies: MemberCard[]
  /** Sure of the constituency (one, from the commune or the address's coordinates). */
  exact: boolean
  senators: MemberCard[]
  /** What the user told Marianne they lean to, and what matters to them, when they let the service read it. */
  leaning: { an: string[]; se: string[] } | null
  themes: string[]
}

/** A member to follow, and why. */
export interface Suggestion {
  member: MemberCard
  /** French: "circonscription voisine de la vôtre", "rapporteur du texte du jour (…)". */
  why: string
  kind: 'neighbour' | 'rapporteur' | 'theme' | 'close' | 'counterpoint'
}

export interface AgendaMeeting extends Meeting {
  /** Broadcast live right now. */
  live: boolean
}

/** The agenda of some days, in both chambers. */
export interface Agenda {
  from: string
  to: string
  /** The Assemblée's open data is there. */
  indexed: boolean
  meetings: AgendaMeeting[]
}

export interface MeetingDetail {
  meeting: Meeting
  /** Its broadcast today, live or announced. */
  stream: LiveStream | null
  /** Its recordings on the video portal. */
  videos: VideoItem[]
}

/** A video opened from a reference: an id, or a portal link that may point at a passage. */
export interface VideoOpen extends VideoDetail {
  timecode?: number
}

export interface DataStatus {
  /** The open data is downloaded and indexed. */
  ready: boolean
  deputies: number
  senators: number
  ballots: number
  meetings: number
  sync: SyncStatus
}

/** What the view may call (methods.ts implements it); a type, not an interface: ServiceMethods needs its index signature. */
export type ParlementMethods = {
  status(): DataStatus
  /** Start a sync of the open data now; poll `status` for its progress. */
  sync(): DataStatus
  mine(): Mine
  members(query: MemberQuery): MemberCard[]
  member(chamber: Chamber, id: string): MemberProfile
  groups(chamber: Chamber): GroupInfo[]
  hemicycle(chamber: Chamber): Hemicycle
  /** How everyone voted in a ballot. */
  votes(chamber: Chamber, ballot: string): VoteMap
  /** How each deputy took part in the day's ballots and committee meetings. */
  presence(day: string): Record<string, DayPresence>
  /** Share of the ballots of the last days where each member voted as a reference: a member, or the majority of a group. */
  agreement(chamber: Chamber, reference: { member: string } | { group: string }, days: number): Record<string, number>
  day(day: string): DayBallots
  ballots(query: BallotQuery): BallotLine[]
  /** A ballot, with the votes of the members asked for. */
  ballot(chamber: Chamber, id: string, members: string[]): BallotDetail
  /** The votes of some members in some ballots: member → ballot → vote. */
  positions(chamber: Chamber, ballots: string[], members: string[]): Record<string, Record<string, MemberVote>>
  analysis(chamber: Chamber, members: string[], from: string, to: string): Analysis
  suggestions(): Suggestion[]
  agenda(from: string, days: number): Agenda
  meeting(id: string): MeetingDetail
  videos(query: VideoQuery): VideoItem[]
  /** An id or a portal link of either chamber. */
  video(ref: string): VideoOpen
  live(): LiveStream[]
  /** Where some members speak in the videos of the last days. */
  passages(members: string[], days: number): Passage[]
}

// ---------------------------------------------------------------- the user's data (ctx.storage)

/** Followed members and groups ("favorites"): ids of either chamber. */
export interface Favorites {
  members: string[]
  groups: string[]
}

/** A passage of a video the user kept ("clips"). */
export interface Clip {
  id: string
  video: string
  chamber: Chamber
  title: string
  videoTitle: string
  /** The video's date, ISO. */
  date: string
  /** In the video, ms. */
  start: number
  end: number
  thumbnail: string
  createdAt: string
}

export interface Clips {
  items: Clip[]
}

/** Videos the user pinned (to watch soon) or starred (to keep), and where they stopped watching. */
export interface Shelf {
  pinned: Array<{ video: string; chamber: Chamber; at: string }>
  starred: Array<{ video: string; chamber: Chamber; at: string }>
  /** Video id → position, ms. */
  progress: Record<string, number>
}
