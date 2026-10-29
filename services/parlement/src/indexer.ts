import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { strFromU8, unzipSync } from 'fflate'
import {
  actorNumber,
  ATTENDANCE_CODES,
  parseAttendance,
  parseBallot,
  parseBill,
  parseDeputy,
  parseMeeting,
  parseOrgan,
  POSITION_CODES,
  searchKey
} from './assembly'
import { ballotAuthor, MemberNames, parseMention } from './authors'
import { parseContours, type CommuneConstituency } from './constituency'
import { LEGISLATURE } from './links'
import { senateBallotId, senateBallotKey, senateBillTitle, senatorKey, type SenateBallotHead, type Senator } from './senate'
import { AN_VOTES, transaction } from './store'
import type { Deputy, Position } from './types'

/**
 * How each source fills the index (store.ts): the Assemblée's dumps (zips of JSON documents), the
 * constituencies' files, the Sénat's senators and ballots. Each source refills its own rows in
 * one transaction; the job (job.ts) downloads them and calls these.
 */

const REPOSITORY = `https://data.assemblee-nationale.fr/static/openData/repository/${LEGISLATURE}`

/** The Assemblée's dumps. */
export const DUMPS = {
  deputies: `${REPOSITORY}/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes.json.zip`,
  ballots: `${REPOSITORY}/loi/scrutins/Scrutins.json.zip`,
  meetings: `${REPOSITORY}/vp/reunions/Agenda.json.zip`,
  bills: `${REPOSITORY}/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip`
} as const

/**
 * The JSON documents of a zip whose names pass `keep`, a batch at a time: the ballots inflate
 * to some 200 MB, too much to hold at once.
 */
export function zipDocuments(zip: Uint8Array, keep: (name: string) => boolean, batch = 500): { count: number; documents: Iterable<[string, unknown]> } {
  const names: string[] = []
  unzipSync(zip, {
    filter: (f) => {
      if (f.name.endsWith('.json') && keep(f.name)) names.push(f.name)
      return false
    }
  })
  function* documents(): Generator<[string, unknown]> {
    for (let i = 0; i < names.length; i += batch) {
      const wanted = new Set(names.slice(i, i + batch))
      const files = unzipSync(zip, { filter: (f) => wanted.has(f.name) })
      for (const name of wanted) yield [name, JSON.parse(strFromU8(files[name]))]
    }
  }
  return { count: names.length, documents: documents() }
}

type Step = (done: number, total: number) => void

/**
 * Rows inserted many at a time: one statement per row would spend most of the sync crossing
 * from JavaScript to SQLite (1.3 million votes).
 */
function bulkInsert(db: DatabaseSync, table: string, columns: string[], rowsPerStatement = 500): { add(...row: SQLInputValue[]): void; flush(): void } {
  const statement = (rows: number) =>
    db.prepare(
      `insert or ignore into ${table} (${columns.join(', ')}) values ${Array(rows)
        .fill(`(${columns.map(() => '?').join(', ')})`)
        .join(', ')}`
    )
  const full = statement(rowsPerStatement)
  let pending: SQLInputValue[] = []
  const flush = () => {
    const rows = pending.length / columns.length
    if (rows) (rows === rowsPerStatement ? full : statement(rows)).run(...pending)
    pending = []
  }
  return {
    add(...row) {
      pending.push(...row)
      if (pending.length === rowsPerStatement * columns.length) flush()
    },
    flush
  }
}

const insertMember = (db: DatabaseSync) =>
  db.prepare(
    'insert or replace into members (chamber, id, key, search, group_id, department_number, department, constituency, seat, data) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )

/** The members of a chamber, as authors' names designate them. */
function memberNames(db: DatabaseSync, chamber: 'an' | 'se'): MemberNames {
  const rows = db.prepare('select id, group_id, data from members where chamber = ?').all(chamber) as Array<{ id: string; group_id: string; data: string }>
  return new MemberNames(
    rows.map((r) => {
      const d = JSON.parse(r.data) as Pick<Deputy, 'civility' | 'firstName' | 'lastName'>
      return { id: r.id, groupId: r.group_id, civility: d.civility, firstName: d.firstName, lastName: d.lastName }
    })
  )
}

/** The full-text index of ballots' subjects, after either chamber's ballots changed. */
const reindexTitles = (db: DatabaseSync) => db.exec("insert into ballots_fts (ballots_fts) values ('rebuild')")

// ---------------------------------------------------------------- the Assemblée

/** The deputies, the groups and organs (AMO dump). */
export function indexDeputies(db: DatabaseSync, zip: Uint8Array, step?: Step): number {
  const part = zipDocuments(zip, (name) => name.includes('/acteur/') || name.includes('/organe/'))
  return transaction(db, () => {
    db.exec("delete from organs; delete from members where chamber = 'an'; delete from groups where chamber = 'an'")
    const organ = db.prepare('insert or replace into organs (id, type, name, short_name, code, color) values (?, ?, ?, ?, ?, ?)')
    const member = insertMember(db)
    let deputies = 0
    let done = 0
    for (const [name, doc] of part.documents) {
      if (name.includes('/organe/')) {
        const o = parseOrgan(doc as Record<string, unknown>)
        if (o) organ.run(o.id, o.type, o.name, o.shortName, o.code, o.color)
      } else {
        const d = parseDeputy(doc as Record<string, unknown>)
        if (d) {
          member.run(
            'an',
            d.id,
            actorNumber(d.id),
            searchKey(`${d.lastName} ${d.firstName}`),
            d.groupId,
            d.departmentNumber.toUpperCase(),
            searchKey(d.department),
            d.constituency,
            d.seat,
            JSON.stringify(d)
          )
          deputies++
        }
      }
      step?.(++done, part.count)
    }
    // An empty list would leave the service without deputies: keep the previous index instead.
    if (!deputies) throw new Error('The deputies dump has no sitting deputy')
    // The groups that have sitting members; their rank, from left to right, is the plan's (queries).
    db.exec(`insert into groups (chamber, id, short_name, name, color, rank)
      select 'an', o.id, o.short_name, o.name, o.color, 0 from organs o where o.type = 'GP' and exists (select 1 from members m where m.chamber = 'an' and m.group_id = o.id)`)
    return deputies
  })
}

/** The public ballots and every deputy's vote (Scrutins dump); the deputies must be indexed first (amendments' authors). */
export function indexBallots(db: DatabaseSync, zip: Uint8Array, step?: Step): number {
  const part = zipDocuments(zip, () => true)
  const names = memberNames(db, 'an')
  return transaction(db, () => {
    db.exec("delete from ballots where chamber = 'an'")
    db.exec('drop table if exists votes_an')
    db.exec(AN_VOTES.create)
    const ballot = db.prepare(
      'insert or replace into ballots (chamber, id, key, number, date, title, kind, result, author, author_group, bill, sitting, data) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const votes = bulkInsert(db, 'votes_an', ['ballot', 'member', 'position', 'proxy'])
    let count = 0
    let done = 0
    for (const [, doc] of part.documents) {
      const parsed = parseBallot(doc as Record<string, unknown>)
      if (parsed) {
        const b = parsed.ballot
        const mention = parseMention('an', b.title)
        const { author, group, name: authorName } = ballotAuthor(mention, names)
        ballot.run(
          'an',
          b.id,
          b.number,
          b.number,
          b.date,
          b.title,
          mention.kind,
          b.result,
          author,
          group,
          b.bill,
          b.sitting,
          JSON.stringify({ ...b, amendment: mention.amendment, ...(authorName ? { authorName } : {}) })
        )
        for (const v of parsed.votes) votes.add(b.number, actorNumber(v.deputy), POSITION_CODES.indexOf(v.position), v.proxy ? 1 : 0)
        count++
      }
      step?.(++done, part.count)
    }
    votes.flush()
    db.exec(AN_VOTES.index)
    // The bills' titles as the ballots give them; the Dossiers dump completes them.
    db.exec(`insert or ignore into bills (id, title) select bill, json_extract(data, '$.billTitle') from ballots where chamber = 'an' and bill != ''`)
    reindexTitles(db)
    return count
  })
}

/** The agenda, and who attended committee meetings (Agenda dump). */
export function indexMeetings(db: DatabaseSync, zip: Uint8Array, step?: Step): number {
  const part = zipDocuments(zip, () => true)
  return transaction(db, () => {
    db.exec('delete from meetings; delete from attendance')
    const meeting = db.prepare('insert or replace into meetings (id, day, start, kind, organ_id, data) values (?, ?, ?, ?, ?, ?)')
    const attendance = bulkInsert(db, 'attendance', ['meeting', 'member', 'status'])
    let count = 0
    let done = 0
    for (const [, doc] of part.documents) {
      const m = parseMeeting(doc as Record<string, unknown>)
      if (m) {
        // The timestamps carry the Paris offset: their date part is the Paris day.
        meeting.run(m.id, m.start.slice(0, 10), m.start, m.kind, m.organId, JSON.stringify(m))
        for (const a of parseAttendance(doc as Record<string, unknown>)) attendance.add(m.id, actorNumber(a.deputy), ATTENDANCE_CODES.indexOf(a.status))
        count++
      }
      step?.(++done, part.count)
    }
    attendance.flush()
    return count
  })
}

/** The legislative files' titles and rapporteurs (Dossiers dump). */
export function indexBills(db: DatabaseSync, zip: Uint8Array, step?: Step): number {
  const part = zipDocuments(zip, (name) => name.includes('dossierParlementaire'))
  return transaction(db, () => {
    db.exec('delete from rapporteurs')
    const bill = db.prepare('insert or replace into bills (id, title) values (?, ?)')
    const rapporteur = db.prepare('insert into rapporteurs (bill, member, type, organ, date) values (?, ?, ?, ?, ?)')
    let count = 0
    let done = 0
    for (const [, doc] of part.documents) {
      const b = parseBill(doc as Record<string, unknown>)
      if (b) {
        if (b.title) bill.run(b.id, b.title)
        for (const r of b.rapporteurs) rapporteur.run(b.id, r.deputy, r.type, r.organ, r.date)
        count++
      }
      step?.(++done, part.count)
    }
    return count
  })
}

/** Each commune's constituencies, and the contours of those a commune shares with others. */
export function indexConstituencies(db: DatabaseSync, communes: CommuneConstituency[], contours: unknown): { communes: number; contours: number } {
  const byCommune = new Map<string, CommuneConstituency[]>()
  for (const c of communes) byCommune.set(c.commune, [...(byCommune.get(c.commune) ?? []), c])
  const wanted = new Set([...byCommune.values()].filter((list) => list.length > 1).flatMap((list) => list.map((c) => `${c.department}|${c.constituency}`)))
  const shapes = parseContours(contours, wanted)
  return transaction(db, () => {
    db.exec('delete from communes; delete from contours')
    const commune = db.prepare('insert or ignore into communes (commune, department, constituency) values (?, ?, ?)')
    for (const c of communes) commune.run(c.commune, c.department, c.constituency)
    const contour = db.prepare('insert or replace into contours (department, constituency, west, south, east, north, geometry) values (?, ?, ?, ?, ?, ?, ?)')
    for (const s of shapes) contour.run(s.department, s.constituency, ...s.bbox, JSON.stringify(s.geometry))
    return { communes: byCommune.size, contours: shapes.length }
  })
}

// ---------------------------------------------------------------- the Sénat

/** A palette for groups the Sénat's home page gives no colour (a new group). */
const SPARE_COLORS = ['#8089c4', '#a0622e', '#2fb8a0', '#c77dff', '#ff8a2a']

/** The senators and their groups, with the colours of the Sénat's hemicycle. */
export function indexSenators(db: DatabaseSync, senators: Senator[], colors: Record<string, string>, ranks: Record<string, number>): number {
  if (!senators.length) throw new Error('The Sénat’s list has no senator')
  return transaction(db, () => {
    db.exec("delete from members where chamber = 'se'; delete from groups where chamber = 'se'")
    const member = insertMember(db)
    for (const s of senators)
      member.run(
        'se',
        s.id,
        senatorKey(s.id),
        searchKey(`${s.lastName} ${s.firstName}`),
        s.groupId,
        s.departmentNumber,
        searchKey(s.department),
        '',
        s.seat,
        JSON.stringify(s)
      )
    const group = db.prepare('insert or replace into groups (chamber, id, short_name, name, color, rank) values (?, ?, ?, ?, ?, ?)')
    const groups = new Map(senators.map((s) => [s.groupId, s]))
    let spare = 0
    for (const [id, s] of groups) group.run('se', id, s.groupShort, s.groupName, colors[id] ?? SPARE_COLORS[spare++ % SPARE_COLORS.length], ranks[id] ?? 99)
    return senators.length
  })
}

/** The Sénat's ballots already indexed, by session. */
export function senateBallotNumbers(db: DatabaseSync, session: number): Set<number> {
  const rows = db.prepare("select number from ballots where chamber = 'se' and key between ? and ?").all(session * 10_000, session * 10_000 + 9_999) as Array<{
    number: number
  }>
  return new Set(rows.map((r) => r.number))
}

/** New ballots of the Sénat, with each senator's vote; the senators must be indexed first (amendments' authors). */
export function addSenateBallots(
  db: DatabaseSync,
  ballots: Array<{ session: number; head: SenateBallotHead; votes: Array<{ senator: string; position: Position }> }>
): number {
  if (!ballots.length) return 0
  const names = memberNames(db, 'se')
  return transaction(db, () => {
    const ballot = db.prepare(
      'insert or replace into ballots (chamber, id, key, number, date, title, kind, result, author, author_group, bill, sitting, data) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const votes = bulkInsert(db, 'votes_se', ['ballot', 'member', 'position'])
    const bill = db.prepare('insert or ignore into bills (id, title) values (?, ?)')
    for (const { session, head, votes: list } of ballots) {
      const key = senateBallotKey(session, head.number)
      const mention = parseMention('se', head.title)
      const { author, group, name: authorName } = ballotAuthor(mention, names)
      const count = (p: Position) => list.filter((v) => v.position === p).length
      const billTitle = senateBillTitle(head.title)
      const data = {
        session,
        number: head.number,
        date: head.date,
        title: head.title,
        result: head.result,
        for: count('for'),
        against: count('against'),
        abstentions: count('abstention'),
        voters: list.filter((v) => v.position !== 'nonVoting').length,
        bill: head.bill,
        billTitle,
        amendment: mention.amendment,
        amendmentUrl: head.amendmentUrl,
        ...(authorName ? { authorName } : {})
      }
      ballot.run(
        'se',
        senateBallotId(session, head.number),
        key,
        head.number,
        head.date,
        head.title,
        mention.kind,
        head.result,
        author,
        group,
        head.bill,
        '',
        JSON.stringify(data)
      )
      if (head.bill && billTitle) bill.run(head.bill, billTitle.charAt(0).toUpperCase() + billTitle.slice(1))
      for (const v of list) votes.add(key, senatorKey(v.senator), POSITION_CODES.indexOf(v.position))
    }
    votes.flush()
    reindexTitles(db)
    return ballots.length
  })
}

/** What the index holds. */
export function counts(db: DatabaseSync): { deputies: number; senators: number; ballots: number; meetings: number } {
  const n = (sql: string) => (db.prepare(sql).get() as { n: number } | undefined)?.n ?? 0
  return {
    deputies: n("select count(*) as n from members where chamber = 'an'"),
    senators: n("select count(*) as n from members where chamber = 'se'"),
    ballots: n('select count(*) as n from ballots'),
    meetings: n('select count(*) as n from meetings')
  }
}

/** Whether a source has filled its rows. */
export function filled(db: DatabaseSync, source: 'deputies' | 'senators' | 'ballots' | 'meetings' | 'bills' | 'constituencies'): boolean {
  const sql = {
    deputies: "select 1 from members where chamber = 'an' limit 1",
    senators: "select 1 from members where chamber = 'se' limit 1",
    ballots: "select 1 from ballots where chamber = 'an' limit 1",
    meetings: 'select 1 from meetings limit 1',
    bills: 'select 1 from rapporteurs limit 1',
    constituencies: 'select 1 from communes limit 1'
  }[source]
  return !!db.prepare(sql).get()
}
