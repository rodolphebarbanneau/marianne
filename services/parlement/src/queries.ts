import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { ATTENDANCE_CODES, POSITION_CODES, searchKey } from './assembly'
import { contains, type Geometry } from './constituency'
import plans from './hemicycle.json'
import { visibleColor } from './present'
import type { Senator } from './senate'
import type { Attendance, BallotKind, BallotQuery, Chamber, Deputy, GroupInfo, Meeting, MemberQuery, Position } from './types'

/**
 * Queries on the index (store.ts), for both chambers: members, groups, seats, ballots and how each
 * member voted, the agenda and committee attendance, rapporteurs, constituencies. Each takes the
 * database, so the main side and the tests run them alike.
 */

export interface MemberRow {
  chamber: Chamber
  id: string
  key: number
  seat: number
  /** The Assemblée's deputy or the Sénat's senator, as indexed. */
  data: Deputy | Senator
  group: GroupRecord | null
}

export interface GroupRecord {
  chamber: Chamber
  id: string
  short_name: string
  name: string
  color: string
  rank: number
}

export interface BallotRecord {
  chamber: Chamber
  id: string
  key: number
  number: number
  date: string
  title: string
  kind: BallotKind
  result: string
  author: string
  author_group: string
  bill: string
  sitting: string
  data: string
}

const marks = (n: number) => Array(n).fill('?').join(', ')

export function all<T>(db: DatabaseSync, sql: string, ...args: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...args) as unknown as T[]
}

export function one<T>(db: DatabaseSync, sql: string, ...args: SQLInputValue[]): T | null {
  return (db.prepare(sql).get(...args) as unknown as T | undefined) ?? null
}

// ---------------------------------------------------------------- groups

/** Each group's place in its hemicycle from left to right: the mean bearing of its members' seats. */
function hemicycleOrder(db: DatabaseSync, chamber: Chamber): Map<string, number> {
  const plan = plans[chamber]
  const seats = plan.seats as unknown as Record<string, [number, number]>
  const rows = all<{ group_id: string; seat: number }>(db, 'select group_id, seat from members where chamber = ? and seat > 0', chamber)
  // The president sits at the bottom, in the middle: a seat's bearing seen from there.
  const [cx, cy] = [plan.width / 2, plan.height]
  const sums = new Map<string, [number, number]>()
  for (const r of rows) {
    const p = seats[String(r.seat)]
    if (!p) continue
    const angle = Math.atan2(cy - p[1], p[0] - cx)
    const [total, n] = sums.get(r.group_id) ?? [0, 0]
    sums.set(r.group_id, [total + angle, n + 1])
  }
  // From the left (an angle near π) to the right (near 0).
  return new Map([...sums].map(([id, [total, n]]) => [id, -total / n]))
}

/** A chamber's political groups that have members, from left to right in its hemicycle, with their size. */
export function listGroups(db: DatabaseSync, chamber: Chamber): GroupInfo[] {
  const order = hemicycleOrder(db, chamber)
  return all<GroupRecord & { members: number }>(
    db,
    `select g.*, count(m.id) as members from groups g join members m on m.chamber = g.chamber and m.group_id = g.id
     where g.chamber = ? group by g.id order by g.rank, g.name`,
    chamber
  )
    .map((r) => ({ chamber, id: r.id, name: r.name, shortName: r.short_name, color: visibleColor(r.color), members: r.members, order: order.get(r.id) ?? 9 }))
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...g }) => g)
}

export function groupRecords(db: DatabaseSync): Map<string, GroupRecord> {
  return new Map(all<GroupRecord>(db, 'select * from groups').map((g) => [`${g.chamber}:${g.id}`, g]))
}

/** Groups by id, acronym or words of their name ("SOC", "écologiste"). */
export function findGroups(db: DatabaseSync, chamber: Chamber, text: string): GroupInfo[] {
  const key = searchKey(text)
  if (!key) return []
  const groups = listGroups(db, chamber)
  const exact = groups.filter((g) => g.id === text.trim().toUpperCase() || searchKey(g.shortName) === key)
  return exact.length ? exact : groups.filter((g) => ` ${searchKey(`${g.shortName} ${g.name}`)}`.includes(` ${key}`))
}

// ---------------------------------------------------------------- members

interface MemberRecord {
  chamber: Chamber
  id: string
  key: number
  seat: number
  data: string
  g_id: string | null
  g_short: string | null
  g_name: string | null
  g_color: string | null
  g_rank: number | null
}

const SELECT_MEMBER = `select m.chamber, m.id, m.key, m.seat, m.data, g.id as g_id, g.short_name as g_short, g.name as g_name, g.color as g_color, g.rank as g_rank
  from members m left join groups g on g.chamber = m.chamber and g.id = m.group_id`

const toMember = (r: MemberRecord): MemberRow => ({
  chamber: r.chamber,
  id: r.id,
  key: r.key,
  seat: r.seat,
  data: JSON.parse(r.data),
  group: r.g_id ? { chamber: r.chamber, id: r.g_id, short_name: r.g_short ?? '', name: r.g_name ?? '', color: r.g_color ?? '', rank: r.g_rank ?? 0 } : null
})

/** The ways a département number is written: "1", "01", "2A", "971", "099". */
export function departmentNumbers(text: string): string[] {
  const dep = text.trim().toUpperCase()
  return [...new Set([dep, dep.replace(/^0+(?=.)/, ''), dep.padStart(2, '0'), dep.padStart(3, '0')])]
}

const isDepartmentNumber = (text: string) => /^(\d{1,3}|2[AB])$/i.test(text.trim())

/** Members matching every criterion given, in one chamber or both; by département and constituency, or by name. */
export function findMembers(db: DatabaseSync, q: MemberQuery): MemberRow[] {
  const where: string[] = []
  const args: SQLInputValue[] = []
  if (q.chamber) {
    where.push('m.chamber = ?')
    args.push(q.chamber)
  }
  if (q.ids) {
    if (!q.ids.length) return []
    where.push(`m.id in (${marks(q.ids.length)})`)
    args.push(...q.ids.map((id) => id.trim().toUpperCase()))
  }
  for (const word of searchKey(q.text ?? '')
    .split(' ')
    .filter(Boolean)) {
    // Word starts: "dup" finds Dupont and Jean-Paul Dupuis, not Lavaldupont.
    where.push(`(' ' || m.search) like ?`)
    args.push(`% ${word}%`)
  }
  const department = q.department?.trim()
  if (department) {
    if (isDepartmentNumber(department)) {
      const numbers = departmentNumbers(department)
      where.push(`m.department_number in (${marks(numbers.length)})`)
      args.push(...numbers)
    } else {
      where.push('m.department = ?')
      args.push(searchKey(department))
    }
  }
  if (q.constituency?.trim()) {
    where.push('m.constituency = ?')
    args.push(q.constituency.trim().replace(/^0+(?=.)/, ''))
  }
  if (q.group?.trim()) {
    const chambers: Chamber[] = q.chamber ? [q.chamber] : ['an', 'se']
    const groups = chambers.flatMap((c) => findGroups(db, c, q.group!))
    if (!groups.length) return []
    where.push(`(m.chamber || ':' || m.group_id) in (${marks(groups.length)})`)
    args.push(...groups.map((g) => `${g.chamber}:${g.id}`))
  }
  const order = department ? 'm.chamber, m.department_number, cast(m.constituency as integer), m.search' : 'm.search'
  return all<MemberRecord>(
    db,
    `${SELECT_MEMBER} ${where.length ? `where ${where.join(' and ')}` : ''} order by ${order} limit ?`,
    ...args,
    q.limit ?? 1000
  ).map(toMember)
}

export function getMember(db: DatabaseSync, chamber: Chamber, id: string): MemberRow | null {
  return findMembers(db, { chamber, ids: [id] })[0] ?? null
}

/** Every member of a chamber, by key: for votes, which name members by key. */
export function membersByKey(db: DatabaseSync, chamber: Chamber): Map<number, MemberRow> {
  return new Map(all<MemberRecord>(db, `${SELECT_MEMBER} where m.chamber = ?`, chamber).map((r) => [r.key, toMember(r)]))
}

// ---------------------------------------------------------------- organs (the Assemblée's)

export interface OrganRecord {
  id: string
  type: string
  name: string
  short_name: string
  code: string
  color: string
}

export function getOrgans(db: DatabaseSync, ids: string[]): Map<string, OrganRecord> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()
  return new Map(all<OrganRecord>(db, `select * from organs where id in (${marks(unique.length)})`, ...unique).map((r) => [r.id, r]))
}

// ---------------------------------------------------------------- ballots

const STOP_WORDS = new Set(
  'le la les un une des du de d l au aux et ou en a est que qui dans pour par sur avec sans ce cet cette ces son sa ses leur leurs ne pas plus'.split(' ')
)

/** An FTS5 query from free text: every word, as a prefix, accents and case aside. */
export function ftsQuery(text: string): string {
  return searchKey(text)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .map((w) => `"${w}"*`)
    .join(' ')
}

const BALLOT_COLUMNS = 'b.chamber, b.id, b.key, b.number, b.date, b.title, b.kind, b.result, b.author, b.author_group, b.bill, b.sitting, b.data'

/** Ballots by words of their subject, dates, kind, author's group and result, newest first. */
export function searchBallots(db: DatabaseSync, q: BallotQuery): BallotRecord[] {
  const where: string[] = []
  const args: SQLInputValue[] = []
  let from = 'ballots b'
  const match = q.text ? ftsQuery(q.text) : ''
  if (match) {
    from = 'ballots_fts f join ballots b on b.rowid = f.rowid'
    where.push('ballots_fts match ?')
    args.push(match)
  }
  const filters: Array<[unknown, string]> = [
    [q.chamber, 'b.chamber = ?'],
    [q.from, 'b.date >= ?'],
    [q.to, 'b.date <= ?'],
    [q.kind, 'b.kind = ?'],
    [q.authorGroup, 'b.author_group = ?']
  ]
  for (const [value, sql] of filters)
    if (value) {
      where.push(sql)
      args.push(value as string)
    }
  if (q.result) where.push(q.result === 'adopted' ? "b.result like 'adopt%'" : "b.result like 'rejet%'")
  return all<BallotRecord>(
    db,
    `select ${BALLOT_COLUMNS} from ${from} ${where.length ? `where ${where.join(' and ')}` : ''} order by b.date desc, b.chamber, b.key desc limit ?`,
    ...args,
    q.limit ?? 50
  )
}

/** A ballot by id ("VTANR5L17V9097", "SE2026-44") or, at the Assemblée, number. */
export function getBallot(db: DatabaseSync, chamber: Chamber, key: string | number): BallotRecord | null {
  const k = String(key)
    .trim()
    .replace(/^n°\s*/i, '')
  if (/^\d+$/.test(k))
    return one<BallotRecord>(db, `select ${BALLOT_COLUMNS} from ballots b where b.chamber = ? and b.number = ? order by b.key desc`, chamber, Number(k))
  return one<BallotRecord>(db, `select ${BALLOT_COLUMNS} from ballots b where b.chamber = ? and b.id = ?`, chamber, k.toUpperCase())
}

export function getBallots(db: DatabaseSync, chamber: Chamber, ids: string[]): BallotRecord[] {
  if (!ids.length) return []
  return all<BallotRecord>(db, `select ${BALLOT_COLUMNS} from ballots b where b.chamber = ? and b.id in (${marks(ids.length)}) order by b.key`, chamber, ...ids)
}

/** The ballots of a period in a chamber, oldest first. */
export function ballotsBetween(db: DatabaseSync, chamber: Chamber, from: string, to: string): BallotRecord[] {
  return all<BallotRecord>(db, `select ${BALLOT_COLUMNS} from ballots b where b.chamber = ? and b.date between ? and ? order by b.key`, chamber, from, to)
}

const votesTable = (chamber: Chamber) => (chamber === 'an' ? 'votes_an' : 'votes_se')
const proxyColumn = (chamber: Chamber) => (chamber === 'an' ? 'proxy' : '0 as proxy')

export interface VoteRow {
  ballot: number
  member: number
  position: Position
  proxy: boolean
}

const toVote = (r: { ballot: number; member: number; position: number; proxy: number }): VoteRow => ({
  ballot: r.ballot,
  member: r.member,
  position: POSITION_CODES[r.position],
  proxy: !!r.proxy
})

/** Every vote cast in some ballots (by key). */
export function votesIn(db: DatabaseSync, chamber: Chamber, ballots: number[]): VoteRow[] {
  if (!ballots.length) return []
  const rows: VoteRow[] = []
  // SQLite's limit on bound values: a few hundred ballots at a time.
  for (let i = 0; i < ballots.length; i += 500) {
    const chunk = ballots.slice(i, i + 500)
    rows.push(
      ...all<{ ballot: number; member: number; position: number; proxy: number }>(
        db,
        `select ballot, member, position, ${proxyColumn(chamber)} from ${votesTable(chamber)} where ballot in (${marks(chunk.length)})`,
        ...chunk
      ).map(toVote)
    )
  }
  return rows
}

/** The votes of some members (by key) in some ballots (by key). */
export function votesOf(db: DatabaseSync, chamber: Chamber, ballots: number[], members: number[]): VoteRow[] {
  if (!ballots.length || !members.length) return []
  return all<{ ballot: number; member: number; position: number; proxy: number }>(
    db,
    `select ballot, member, position, ${proxyColumn(chamber)} from ${votesTable(chamber)}
     where ballot in (${marks(ballots.length)}) and member in (${marks(members.length)})`,
    ...ballots,
    ...members
  ).map(toVote)
}

/** A member's votes, newest first. */
export function memberVotes(db: DatabaseSync, chamber: Chamber, member: number, limit = 12): Array<BallotRecord & { position: Position; proxy: boolean }> {
  return all<BallotRecord & { position: number; proxy: number }>(
    db,
    `select ${BALLOT_COLUMNS}, v.position, ${chamber === 'an' ? 'v.proxy' : '0 as proxy'} from ${votesTable(chamber)} v
     join ballots b on b.chamber = ? and b.key = v.ballot where v.member = ? order by b.date desc, b.key desc limit ?`,
    chamber,
    member,
    limit
  ).map((r) => ({ ...r, position: POSITION_CODES[r.position], proxy: !!r.proxy }))
}

/** A member's vote in each of some ballots matching a search: what the tools show. */
export function memberVoteIn(db: DatabaseSync, chamber: Chamber, member: number, ballots: number[]): Map<number, { position: Position; proxy: boolean }> {
  return new Map(votesOf(db, chamber, ballots, [member]).map((v) => [v.ballot, { position: v.position, proxy: v.proxy }]))
}

// ---------------------------------------------------------------- the agenda

const toMeeting = (r: { data: string; organ: string | null }): Meeting => ({ ...(JSON.parse(r.data) as Meeting), chamber: 'an', organ: r.organ ?? '' })

/** The Assemblée's agenda of some days (YYYY-MM-DD, Paris), with the organs' names, by start time. */
export function meetingsBetween(db: DatabaseSync, from: string, to: string): Meeting[] {
  return all<{ data: string; organ: string | null }>(
    db,
    'select m.data, o.name as organ from meetings m left join organs o on o.id = m.organ_id where m.day between ? and ? order by m.start, m.id',
    from,
    to
  ).map(toMeeting)
}

export const meetingsOn = (db: DatabaseSync, day: string) => meetingsBetween(db, day, day)

export function getMeeting(db: DatabaseSync, id: string): Meeting | null {
  const row = one<{ data: string; organ: string | null }>(
    db,
    'select m.data, o.name as organ from meetings m left join organs o on o.id = m.organ_id where m.id = ?',
    id.trim().toUpperCase()
  )
  return row ? toMeeting(row) : null
}

/** The start of some sittings (meeting ids), for the time of their ballots. */
export function sittingStarts(db: DatabaseSync, ids: string[]): Map<string, string> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()
  return new Map(
    all<{ id: string; start: string }>(db, `select id, start from meetings where id in (${marks(unique.length)})`, ...unique).map((r) => [r.id, r.start])
  )
}

/** Who attended the committee meetings of a day, when the minutes say. */
export function attendanceOn(db: DatabaseSync, day: string): Array<{ meeting: string; member: number; status: Attendance; organ: string; start: string }> {
  return all<{ meeting: string; member: number; status: number; organ: string | null; start: string }>(
    db,
    `select a.meeting, a.member, a.status, o.name as organ, m.start from attendance a join meetings m on m.id = a.meeting
     left join organs o on o.id = m.organ_id where m.day = ?`,
    day
  ).map((r) => ({ meeting: r.meeting, member: r.member, status: ATTENDANCE_CODES[r.status], organ: r.organ ?? '', start: r.start }))
}

// ---------------------------------------------------------------- bills

export function billTitles(db: DatabaseSync, ids: string[]): Map<string, string> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()
  return new Map(
    all<{ id: string; title: string }>(db, `select id, title from bills where id in (${marks(unique.length)})`, ...unique).map((r) => [r.id, r.title])
  )
}

/** The rapporteurs of some bills, the latest named first. */
export function rapporteursOf(db: DatabaseSync, bills: string[]): Array<{ bill: string; member: string; type: string; date: string }> {
  const unique = [...new Set(bills.filter(Boolean))]
  if (!unique.length) return []
  return all<{ bill: string; member: string; type: string; date: string }>(
    db,
    `select bill, member, type, date from rapporteurs where bill in (${marks(unique.length)}) order by date desc`,
    ...unique
  )
}

// ---------------------------------------------------------------- constituencies

/** The constituencies of a commune (département number and constituency number). */
export function constituenciesOf(db: DatabaseSync, commune: string): Array<{ department: string; constituency: string }> {
  return all<{ department: string; constituency: string }>(db, 'select department, constituency from communes where commune = ? order by constituency', commune)
}

/** Which of some constituencies a point is in, from their contours; null when none of them (or no contour) says. */
export function constituencyAt(
  db: DatabaseSync,
  candidates: Array<{ department: string; constituency: string }>,
  longitude: number,
  latitude: number
): { department: string; constituency: string } | null {
  for (const c of candidates) {
    const row = one<{ west: number; south: number; east: number; north: number; geometry: string }>(
      db,
      'select west, south, east, north, geometry from contours where department = ? and constituency = ?',
      c.department,
      c.constituency
    )
    if (!row || longitude < row.west || longitude > row.east || latitude < row.south || latitude > row.north) continue
    if (contains(JSON.parse(row.geometry) as Geometry, longitude, latitude)) return c
  }
  return null
}

/** Whether the index has rows in a table. */
export const hasRows = (db: DatabaseSync, table: string) => !!one(db, `select 1 from ${table} limit 1`)
