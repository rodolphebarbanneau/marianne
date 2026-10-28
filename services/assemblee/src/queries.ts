import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { actorNumber, POSITION_CODES, searchKey } from './assembly'
import type { AssemblyOrgan, Ballot, DeputyQuery, DeputyRow, GroupInfo, Meeting, Position } from './types'

/**
 * Queries on the index (store.ts): deputies, organs, ballots and how each deputy voted, the
 * agenda. Each takes the database, so the main side and the tests run them alike.
 */

interface DeputyRecord {
  data: string
  group_id: string | null
  group_type: string | null
  group_name: string | null
  group_short: string | null
  group_code: string | null
  group_color: string | null
}

const SELECT_DEPUTY = `select d.data, o.id as group_id, o.type as group_type, o.name as group_name, o.short_name as group_short, o.code as group_code,
  o.color as group_color from deputies d left join organs o on o.id = d.group_id`

const toRow = (r: DeputyRecord): DeputyRow => ({
  deputy: JSON.parse(r.data),
  group: r.group_id
    ? {
        id: r.group_id,
        type: r.group_type ?? '',
        name: r.group_name ?? '',
        shortName: r.group_short ?? '',
        code: r.group_code ?? '',
        color: r.group_color ?? ''
      }
    : null
})

const marks = (n: number) => Array(n).fill('?').join(', ')

function all<T>(db: DatabaseSync, sql: string, ...args: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...args) as unknown as T[]
}

function one<T>(db: DatabaseSync, sql: string, ...args: SQLInputValue[]): T | null {
  return (db.prepare(sql).get(...args) as unknown as T | undefined) ?? null
}

/** The ways a département number is written: "1", "01", "2A", "971", "099". */
export function departmentNumbers(text: string): string[] {
  const dep = text.trim().toUpperCase()
  return [...new Set([dep, dep.replace(/^0+(?=.)/, ''), dep.padStart(2, '0'), dep.padStart(3, '0')])]
}

const isDepartmentNumber = (text: string) => /^(\d{1,3}|2[AB])$/i.test(text.trim())

/** Sitting deputies matching every criterion given; by département and constituency, or by name. */
export function findDeputies(db: DatabaseSync, q: DeputyQuery): DeputyRow[] {
  const where: string[] = []
  const args: SQLInputValue[] = []
  if (q.ids) {
    if (!q.ids.length) return []
    where.push(`d.id in (${marks(q.ids.length)})`)
    args.push(...q.ids.map((id) => id.trim().toUpperCase()))
  }
  for (const word of searchKey(q.text ?? '')
    .split(' ')
    .filter(Boolean)) {
    // Word starts: "dup" finds Dupont and Jean-Paul Dupuis, not Lavaldupont.
    where.push(`(' ' || d.search) like ?`)
    args.push(`% ${word}%`)
  }
  const department = q.department?.trim()
  if (department) {
    if (isDepartmentNumber(department)) {
      const numbers = departmentNumbers(department)
      where.push(`d.department_number in (${marks(numbers.length)})`)
      args.push(...numbers)
    } else {
      where.push('d.department = ?')
      args.push(searchKey(department))
    }
  }
  if (q.constituency?.trim()) {
    where.push('d.constituency = ?')
    args.push(q.constituency.trim().replace(/^0+(?=.)/, ''))
  }
  if (q.group?.trim()) {
    const groups = findGroups(db, q.group)
    if (!groups.length) return []
    where.push(`d.group_id in (${marks(groups.length)})`)
    args.push(...groups.map((g) => g.id))
  }
  const order = department ? 'd.department_number, cast(d.constituency as integer)' : 'd.search'
  return all<DeputyRecord>(db, `${SELECT_DEPUTY} ${where.length ? `where ${where.join(' and ')}` : ''} order by ${order} limit ?`, ...args, q.limit ?? 600).map(
    toRow
  )
}

export function getDeputy(db: DatabaseSync, id: string): DeputyRow | null {
  return findDeputies(db, { ids: [id] })[0] ?? null
}

interface OrganRecord {
  id: string
  type: string
  name: string
  short_name: string
  code: string
  color: string
}

const toOrgan = (r: OrganRecord): AssemblyOrgan => ({ id: r.id, type: r.type, name: r.name, shortName: r.short_name, code: r.code, color: r.color })

export function getOrgans(db: DatabaseSync, ids: string[]): Map<string, AssemblyOrgan> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()
  return new Map(all<OrganRecord>(db, `select * from organs where id in (${marks(unique.length)})`, ...unique).map((r) => [r.id, toOrgan(r)]))
}

/** The political groups that have sitting members, largest first. */
export function listGroups(db: DatabaseSync): GroupInfo[] {
  return all<OrganRecord & { members: number }>(
    db,
    `select o.*, count(d.id) as members from organs o join deputies d on d.group_id = o.id where o.type = 'GP' group by o.id order by members desc, o.name`
  ).map((r) => ({ id: r.id, name: r.name, shortName: r.short_name, color: r.color, members: r.members }))
}

/** Groups by id, acronym or words of their name ("SOC", "écologiste"). */
export function findGroups(db: DatabaseSync, text: string): GroupInfo[] {
  const key = searchKey(text)
  if (!key) return []
  const groups = listGroups(db)
  const exact = groups.filter((g) => g.id === text.trim().toUpperCase() || searchKey(g.shortName) === key)
  return exact.length ? exact : groups.filter((g) => ` ${searchKey(`${g.shortName} ${g.name}`)}`.includes(` ${key}`))
}

export interface BallotRow {
  id: string
  number: number
  date: string
  title: string
  result: string
}

/** A deputy's last votes, newest first. */
export function deputyVotes(db: DatabaseSync, deputyId: string, limit = 12): Array<BallotRow & { position: Position; proxy: boolean }> {
  return all<BallotRow & { position: number; proxy: number }>(
    db,
    `select b.id, b.number, b.date, b.title, b.result, v.position, v.proxy from votes v join ballots b on b.number = v.ballot
     where v.deputy = ? order by b.date desc, b.number desc limit ?`,
    actorNumber(deputyId),
    limit
  ).map((r) => ({ ...r, position: POSITION_CODES[r.position], proxy: !!r.proxy }))
}

/** How many of the public ballots since the start of their mandate a deputy took part in. */
export function deputyParticipation(db: DatabaseSync, deputyId: string, mandateStart: string): { voted: number; total: number } {
  const voted = one<{ n: number }>(
    db,
    'select count(*) as n from votes where deputy = ? and position != ?',
    actorNumber(deputyId),
    POSITION_CODES.indexOf('nonVoting')
  )
  const total = one<{ n: number }>(db, 'select count(*) as n from ballots where date >= ?', mandateStart)
  return { voted: voted?.n ?? 0, total: total?.n ?? 0 }
}

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

/** Ballots by words of their title and dates, newest first; with a deputy, each with their position (null: didn't take part). */
export function searchBallots(
  db: DatabaseSync,
  q: { text?: string; deputy?: string; from?: string; to?: string; finalOnly?: boolean; limit?: number }
): Array<BallotRow & { position?: Position | null; proxy?: boolean }> {
  const where: string[] = []
  const args: SQLInputValue[] = []
  let from = 'ballots b'
  const match = q.text ? ftsQuery(q.text) : ''
  if (match) {
    from = 'ballots_fts f join ballots b on b.rowid = f.rowid'
    where.push('ballots_fts match ?')
    args.push(match)
  }
  if (q.from) {
    where.push('b.date >= ?')
    args.push(q.from)
  }
  if (q.to) {
    where.push('b.date <= ?')
    args.push(q.to)
  }
  // The final vote on a text: "l'ensemble du projet de loi…".
  if (q.finalOnly) where.push("b.title like '%ensemble d%'")
  const deputy = q.deputy ? actorNumber(q.deputy) : null
  const columns = deputy === null ? '' : ', v.position, v.proxy'
  const join = deputy === null ? '' : ' left join votes v on v.ballot = b.number and v.deputy = ?'
  const rows = all<BallotRow & { position?: number | null; proxy?: number | null }>(
    db,
    `select b.id, b.number, b.date, b.title, b.result${columns} from ${from}${join} ${where.length ? `where ${where.join(' and ')}` : ''}
     order by b.date desc, b.number desc limit ?`,
    ...(deputy === null ? [] : [deputy]),
    ...args,
    q.limit ?? 20
  )
  if (deputy === null) return rows.map(({ id, number, date, title, result }) => ({ id, number, date, title, result }))
  return rows.map((r) => ({ ...r, position: r.position === null || r.position === undefined ? null : POSITION_CODES[r.position], proxy: !!r.proxy }))
}

/** A ballot by id (VTANR5L17V…) or number. */
export function getBallot(db: DatabaseSync, key: string | number): Ballot | null {
  const k = String(key)
    .trim()
    .replace(/^n°\s*/i, '')
  const row = /^VT/i.test(k)
    ? one<{ data: string }>(db, 'select data from ballots where id = ?', k.toUpperCase())
    : /^\d+$/.test(k)
      ? one<{ data: string }>(db, 'select data from ballots where number = ? order by date desc', Number(k))
      : null
  return row ? (JSON.parse(row.data) as Ballot) : null
}

/** The positions of some deputies in one ballot; those who didn't take part are left out. */
export function ballotPositions(db: DatabaseSync, ballotNumber: number, deputyIds: string[]): Map<string, { position: Position; proxy: boolean }> {
  if (!deputyIds.length) return new Map()
  const numbers = deputyIds.map(actorNumber)
  const rows = all<{ deputy: number; position: number; proxy: number }>(
    db,
    `select deputy, position, proxy from votes where ballot = ? and deputy in (${marks(numbers.length)})`,
    ballotNumber,
    ...numbers
  )
  return new Map(rows.map((r) => [`PA${r.deputy}`, { position: POSITION_CODES[r.position], proxy: !!r.proxy }]))
}

const toMeeting = (r: { data: string; organ: string | null }): Meeting => ({ ...(JSON.parse(r.data) as Meeting), organ: r.organ ?? '' })

/** The agenda of one day (YYYY-MM-DD, Paris), with the organs' names, by start time. */
export function meetingsOn(db: DatabaseSync, day: string): Meeting[] {
  return all<{ data: string; organ: string | null }>(
    db,
    'select m.data, o.name as organ from meetings m left join organs o on o.id = m.organ_id where m.day = ? order by m.start, m.id',
    day
  ).map(toMeeting)
}

export function getMeeting(db: DatabaseSync, id: string): Meeting | null {
  const row = one<{ data: string; organ: string | null }>(
    db,
    'select m.data, o.name as organ from meetings m left join organs o on o.id = m.organ_id where m.id = ?',
    id.trim().toUpperCase()
  )
  return row ? toMeeting(row) : null
}

/** What the index holds. */
export function counts(db: DatabaseSync): { deputies: number; ballots: number; meetings: number } {
  const n = (table: string) => one<{ n: number }>(db, `select count(*) as n from ${table}`)?.n ?? 0
  return { deputies: n('deputies'), ballots: n('ballots'), meetings: n('meetings') }
}

/** Whether a table has rows (a dump has been indexed). */
export const hasRows = (db: DatabaseSync, table: string) => !!one(db, `select 1 from ${table} limit 1`)
