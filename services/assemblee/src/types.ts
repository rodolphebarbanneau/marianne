import type { SyncStatus } from '@marianne/sdk'

// ---------------------------------------------------------------- open data

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

/** A deputy with their group, as the queries return them. */
export interface DeputyRow {
  deputy: Deputy
  group: AssemblyOrgan | null
}

export type Position = 'for' | 'against' | 'abstention' | 'nonVoting'

export const POSITION_LABELS: Record<Position, string> = { for: 'pour', against: 'contre', abstention: 'abstention', nonVoting: 'non-votant' }

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

/** A meeting on the agenda of the Assemblée: a public sitting, a committee, a hearing… */
export interface Meeting {
  /** "RUANR5L17S2027IDS30966": the same id as the live stream's and the video's. */
  id: string
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

export interface VideoItem {
  /** "19632460_6ae0ce76adf9c" */
  id: string
  title: string
  description: string
  date: string
  /** In French: "séance publique", "commission"… */
  type: string
  /** The organ's acronym on the portal ("MASCO"), as AssemblyOrgan.code. */
  commission: string
  thumbnail: string
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
  /** The speaker's actor id (PA…), when the portal gives one. */
  deputy?: string
}

export interface VideoDetail {
  id: string
  title: string
  date: string
  type: string
  organ: string
  /** The open-data meetings (réunions) it covers: a video may span two hearings. */
  meetingIds: string[]
  durationMs: number
  chapters: VideoChapter[]
  speakers: Array<{ name: string; deputy?: string }>
  /** HLS playlist (multi-bitrate); empty while the portal is still processing the video. */
  hls: string
  thumbnail: string
  url: string
}

export interface LiveStream {
  meetingId: string
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
}

export type VideoType = 'seance' | 'commission' | 'questions' | 'autre'

export interface VideoQuery {
  /** YYYY-MM-DD */
  from: string
  to: string
  type?: VideoType
  /** Words of the title or description. */
  text?: string
  /** "Last name" or "Last name First name", as the portal searches speakers. */
  speaker?: string
}

// ---------------------------------------------------------------- what the view gets

/** A deputy as lists show them. */
export interface DeputyCard {
  id: string
  /** "M. Thierry Tesson" */
  name: string
  firstName: string
  lastName: string
  groupId: string
  group: string
  groupShort: string
  groupColor: string
  department: string
  departmentNumber: string
  constituency: string
  photo: string
  url: string
}

export interface BallotSummary {
  id: string
  number: number
  date: string
  title: string
  result: string
  url: string
  /** With a deputy: their position, null when they didn't take part. */
  position?: Position | null
  proxy?: boolean
}

export interface DeputyProfile extends DeputyCard {
  profession: string
  birthDate: string
  mandateStart: string
  emails: string[]
  websites: string[]
  office: string
  hatvp: string
  /** Committees, delegations, offices: their name and the deputy's role. */
  roles: Array<{ organId: string; organ: string; role: string }>
  /** Public ballots they took part in, since the start of their mandate. */
  participation: { voted: number; total: number }
  /** Their latest votes, newest first. */
  votes: BallotSummary[]
}

export interface GroupInfo {
  id: string
  name: string
  shortName: string
  color: string
  members: number
}

export interface BallotDetail extends Omit<Ballot, 'groups'> {
  url: string
  groups: Array<BallotGroup & { name: string; shortName: string; color: string }>
  /** The positions of the deputies asked for; null: didn't take part. */
  votes: Array<{ deputy: DeputyCard; position: Position | null; proxy: boolean }>
}

export interface DeputyQuery {
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
  /** Words of the title. */
  text?: string
  /** A deputy's id: each ballot comes with their position. */
  deputy?: string
  /** YYYY-MM-DD */
  from?: string
  to?: string
  /** Only the votes on a text as a whole. */
  finalOnly?: boolean
  limit?: number
}

/** The deputies of the département of the user's address. */
export interface MyDeputies {
  /** null: the profile has no address. */
  commune: { name: string; department: string; departmentName: string } | null
  deputies: DeputyCard[]
}

export interface AgendaMeeting extends Meeting {
  /** Broadcast live right now. */
  live: boolean
}

export interface AgendaDay {
  day: string
  /** The open data is there: `meetings` is the agenda of the day. */
  indexed: boolean
  meetings: AgendaMeeting[]
  /** Today's broadcasts, live or announced; empty for other days. */
  streams: LiveStream[]
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
  ballots: number
  meetings: number
  sync: SyncStatus
}

/** What the view may call (methods.ts implements it); a type, not an interface: ServiceMethods needs its index signature. */
export type AssembleeMethods = {
  status(): DataStatus
  /** Start a sync of the open data now; poll `status` for its progress. */
  sync(): DataStatus
  myDeputies(): MyDeputies
  deputies(query: DeputyQuery): DeputyCard[]
  deputy(id: string): DeputyProfile
  groups(): GroupInfo[]
  group(id: string): { group: GroupInfo; members: DeputyCard[] }
  ballots(query: BallotQuery): BallotSummary[]
  /** A ballot by number or id, with the positions of the deputies asked for. */
  ballot(key: string, deputies: string[]): BallotDetail
  /** The agenda of a day (YYYY-MM-DD, Paris), with today's broadcasts. */
  agenda(day: string): AgendaDay
  meeting(id: string): MeetingDetail
  videos(query: VideoQuery): VideoItem[]
  /** An id ("19632460_6ae0ce76adf9c") or a portal link, with its ?timecode=. */
  video(ref: string): VideoOpen
  live(): LiveStream[]
}

// ---------------------------------------------------------------- the user's data (ctx.storage)

/** Starred deputies and groups ("favorites"). */
export interface Favorites {
  deputies: string[]
  groups: string[]
}

/** A passage of a video the user kept ("clips"). */
export interface Clip {
  id: string
  video: string
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
