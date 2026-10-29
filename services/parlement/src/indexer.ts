import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { strFromU8, unzipSync } from 'fflate'
import { actorNumber, parseBallot, parseDeputy, parseMeeting, parseOrgan, POSITION_CODES, searchKey } from './assembly'
import { LEGISLATURE } from './links'
import { indexTables, recreateTables, resetSchema, type Dump } from './store'

/**
 * The open-data dumps of the Assemblée and their indexing: three zips of JSON documents
 * (deputies and organs, ballots, agenda), each rebuilding its own tables.
 */

export const DUMP_NAMES: Dump[] = ['deputies', 'ballots', 'meetings']

const REPOSITORY = `https://data.assemblee-nationale.fr/static/openData/repository/${LEGISLATURE}`

export const DUMPS: Record<Dump, string> = {
  deputies: `${REPOSITORY}/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes.json.zip`,
  ballots: `${REPOSITORY}/loi/scrutins/Scrutins.json.zip`,
  meetings: `${REPOSITORY}/vp/reunions/Agenda.json.zip`
}

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

export interface IndexOptions {
  /** Rebuild the schema first (a new index, or a new schema version): every dump is then required. */
  reset: boolean
  progress?: (done: number, total: number) => void
}

/** Rebuild the tables of the dumps given, in one transaction. */
export function indexDumps(db: DatabaseSync, zips: Partial<Record<Dump, Uint8Array>>, options: IndexOptions): void {
  const missing = DUMP_NAMES.filter((d) => !zips[d])
  if (options.reset && missing.length) throw new Error(`A new index needs every dump (missing: ${missing.join(', ')})`)
  const parts = {
    deputies: zips.deputies ? zipDocuments(zips.deputies, (name) => name.includes('/acteur/') || name.includes('/organe/')) : null,
    ballots: zips.ballots ? zipDocuments(zips.ballots, () => true) : null,
    meetings: zips.meetings ? zipDocuments(zips.meetings, () => true) : null
  }
  const total = DUMP_NAMES.reduce((n, d) => n + (parts[d]?.count ?? 0), 0)
  let done = 0
  const step = () => options.progress?.(++done, total)
  db.exec('begin')
  try {
    if (options.reset) resetSchema(db)
    const fill = { deputies: fillDeputies, ballots: fillBallots, meetings: fillMeetings }
    for (const dump of DUMP_NAMES) {
      const part = parts[dump]
      if (!part) continue
      recreateTables(db, dump)
      fill[dump](db, part.documents, step)
      indexTables(db, dump)
    }
    db.exec('commit')
  } catch (err) {
    db.exec('rollback')
    throw err
  }
}

function fillDeputies(db: DatabaseSync, documents: Iterable<[string, unknown]>, step: () => void): void {
  const organ = db.prepare('insert or replace into organs (id, type, name, short_name, code, color) values (?, ?, ?, ?, ?, ?)')
  const deputy = db.prepare(
    'insert or replace into deputies (id, search, group_id, department_number, department, constituency, data) values (?, ?, ?, ?, ?, ?, ?)'
  )
  let deputies = 0
  for (const [name, doc] of documents) {
    if (name.includes('/organe/')) {
      const o = parseOrgan(doc as Record<string, unknown>)
      if (o) organ.run(o.id, o.type, o.name, o.shortName, o.code, o.color)
    } else {
      const d = parseDeputy(doc as Record<string, unknown>)
      if (d) {
        deputy.run(
          d.id,
          searchKey(`${d.lastName} ${d.firstName}`),
          d.groupId,
          d.departmentNumber.toUpperCase(),
          searchKey(d.department),
          d.constituency,
          JSON.stringify(d)
        )
        deputies++
      }
    }
    step()
  }
  // An empty list would leave the service without deputies: keep the previous index instead.
  if (!deputies) throw new Error('The deputies dump has no sitting deputy')
}

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

function fillBallots(db: DatabaseSync, documents: Iterable<[string, unknown]>, step: () => void): void {
  const ballot = db.prepare('insert or replace into ballots (id, number, date, title, result, data) values (?, ?, ?, ?, ?, ?)')
  const votes = bulkInsert(db, 'votes', ['ballot', 'deputy', 'position', 'proxy'])
  for (const [, doc] of documents) {
    const parsed = parseBallot(doc as Record<string, unknown>)
    if (parsed) {
      const b = parsed.ballot
      ballot.run(b.id, b.number, b.date, b.title, b.result, JSON.stringify(b))
      for (const v of parsed.votes) votes.add(b.number, actorNumber(v.deputy), POSITION_CODES.indexOf(v.position), v.proxy ? 1 : 0)
    }
    step()
  }
  votes.flush()
}

function fillMeetings(db: DatabaseSync, documents: Iterable<[string, unknown]>, step: () => void): void {
  const meeting = db.prepare('insert or replace into meetings (id, day, start, kind, organ_id, data) values (?, ?, ?, ?, ?, ?)')
  for (const [, doc] of documents) {
    const m = parseMeeting(doc as Record<string, unknown>)
    // The timestamps carry the Paris offset: their date part is the Paris day.
    if (m) meeting.run(m.id, m.start.slice(0, 10), m.start, m.kind, m.organId, JSON.stringify(m))
    step()
  }
}
