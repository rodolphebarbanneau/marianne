import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

/**
 * The offline index of both chambers' public data: <dataDir>/parlement.db. The sync job writes
 * it, a source at a time, each in one transaction (WAL: the main side keeps reading meanwhile);
 * the main side opens it read-only. It is a cache: a new schema version drops it, and the next
 * sync fills it again.
 */

export const DB_FILE = 'parlement.db'

/** 3: amendments' authors read again (sub-amendments, "de suppression"…), their names kept with the ballots. */
export const SCHEMA_VERSION = 3

/**
 * The sources of the index, each refilling its own rows:
 * - deputies: the Assemblée's deputies, its groups and organs (AMO dump);
 * - ballots: its public ballots and every deputy's vote (Scrutins dump);
 * - meetings: its agenda, and who attended committee meetings (Agenda dump);
 * - bills: the rapporteurs of its legislative files (Dossiers dump);
 * - constituencies: which constituency each commune is in, and the contours of those split between several;
 * - senators: the Sénat's senators and groups;
 * - senateBallots: its public ballots and every senator's vote (added as they come, never rebuilt).
 */
export type Source = 'deputies' | 'ballots' | 'meetings' | 'bills' | 'constituencies' | 'senators' | 'senateBallots'

export const SOURCES: Source[] = ['deputies', 'senators', 'ballots', 'senateBallots', 'meetings', 'bills', 'constituencies']

/**
 * The tables, created once per schema. Members and ballots of both chambers share a table (a few
 * thousand rows, refilled a chamber at a time); their votes don't: 1.3 million at the Assemblée,
 * rebuilt as a whole (indexed after the rows, much faster), a hundred thousand at the Sénat,
 * added as ballots come. Votes are integers only: member key (PA1008 → 1008; 19591F → senatorKey),
 * ballot key (the Assemblée's number; the Sénat's session × 10 000 + number), position code.
 * Searchable columns are folded (lowercase, no accents, single spaces).
 */
const SCHEMA = `
create table groups (chamber text not null, id text not null, short_name text not null, name text not null, color text not null, rank integer not null,
  primary key (chamber, id)) without rowid;
create table organs (id text primary key, type text not null, name text not null, short_name text not null, code text not null, color text not null);
create index organs_type on organs (type);
create table members (chamber text not null, id text not null, key integer not null, search text not null, group_id text not null,
  department_number text not null, department text not null, constituency text not null, seat integer not null, data text not null,
  primary key (chamber, id)) without rowid;
create index members_key on members (chamber, key);
create index members_department on members (chamber, department_number);
create index members_group on members (chamber, group_id);
create table ballots (chamber text not null, id text not null, key integer not null, number integer not null, date text not null, title text not null,
  kind text not null, result text not null, author text not null, author_group text not null, bill text not null, sitting text not null, data text not null);
create unique index ballots_id on ballots (chamber, id);
create index ballots_key on ballots (chamber, key);
create index ballots_date on ballots (chamber, date);
create index ballots_bill on ballots (bill);
create index ballots_sitting on ballots (sitting);
create virtual table ballots_fts using fts5(title, content='ballots', tokenize='unicode61 remove_diacritics 2');
create table votes_se (ballot integer not null, member integer not null, position integer not null, primary key (ballot, member)) without rowid;
create index votes_se_member on votes_se (member, position);
create table meetings (id text primary key, day text not null, start text not null, kind text not null, organ_id text not null, data text not null);
create index meetings_day on meetings (day);
create table attendance (meeting text not null, member integer not null, status integer not null, primary key (meeting, member)) without rowid;
create index attendance_member on attendance (member);
create table rapporteurs (bill text not null, member text not null, type text not null, organ text not null, date text not null);
create index rapporteurs_bill on rapporteurs (bill);
create index rapporteurs_member on rapporteurs (member);
create table bills (id text primary key, title text not null);
create table communes (commune text not null, department text not null, constituency text not null, primary key (commune, department, constituency)) without rowid;
create table contours (department text not null, constituency text not null, west real not null, south real not null, east real not null, north real not null,
  geometry text not null, primary key (department, constituency)) without rowid;
`

/** The Assemblée's votes: dropped and created again with each Scrutins dump, indexed once filled. */
export const AN_VOTES = {
  create:
    'create table votes_an (ballot integer not null, member integer not null, position integer not null, proxy integer not null, primary key (ballot, member)) without rowid',
  index: 'create index votes_an_member on votes_an (member, position)'
}

const version = (db: DatabaseSync) => (db.prepare('pragma user_version').get() as { user_version: number }).user_version

/** The index for the sync job, and whether its schema is the current one (false: it must be rebuilt from every source). */
export function openWriter(file: string): { db: DatabaseSync; current: boolean } {
  const db = new DatabaseSync(file)
  // A large page cache: a rebuild goes through most of the file.
  db.exec('pragma journal_mode = wal; pragma synchronous = normal; pragma busy_timeout = 15000; pragma cache_size = -65536;')
  return { db, current: version(db) === SCHEMA_VERSION }
}

/**
 * Drop whatever schema the file has, create the current one and mark its version, before every
 * source fills it again; inside the sync's transaction, so readers see the old index or the new
 * one, never an empty one. Tables are dropped rather than the file deleted: the main side may have it open.
 */
export function resetSchema(db: DatabaseSync): void {
  const tables = (where: string) =>
    (db.prepare(`select name from sqlite_master where type = 'table' and ${where}`).all() as Array<{ name: string }>).map((t) => t.name)
  // Virtual tables first: dropping one drops its shadow tables.
  for (const name of tables("upper(sql) like 'CREATE VIRTUAL TABLE%'")) db.exec(`drop table "${name}"`)
  for (const name of tables("name not like 'sqlite_%'")) db.exec(`drop table "${name}"`)
  db.exec(SCHEMA)
  db.exec(AN_VOTES.create)
  db.exec(AN_VOTES.index)
  db.exec(`pragma user_version = ${SCHEMA_VERSION}`)
}

/** In one transaction: committed when `fill` returns, rolled back when it throws. */
export function transaction<T>(db: DatabaseSync, fill: () => T): T {
  db.exec('begin')
  try {
    const result = fill()
    db.exec('commit')
    return result
  } catch (err) {
    db.exec('rollback')
    throw err
  }
}

/** The main side's view of the index: opened read-only when first needed, once a sync has filled it. */
export class ParliamentIndex {
  private db: DatabaseSync | null = null

  constructor(readonly file: string) {}

  /** There is an index, of an older version: its schema changed with the service. */
  stale(): boolean {
    if (!existsSync(this.file)) return false
    const db = new DatabaseSync(this.file, { readOnly: true })
    try {
      return version(db) !== SCHEMA_VERSION
    } catch {
      return false
    } finally {
      db.close()
    }
  }

  /** The index, or null before the first sync (or after a schema change, until the next one). */
  open(): DatabaseSync | null {
    if (this.db) return this.db
    if (!existsSync(this.file)) return null
    const db = new DatabaseSync(this.file, { readOnly: true })
    try {
      db.exec('pragma busy_timeout = 5000')
      if (version(db) === SCHEMA_VERSION && db.prepare("select 1 from members where chamber = 'an' limit 1").get()) return (this.db = db)
    } catch {
      // Not an index of this version: as if there were none.
    }
    db.close()
    return null
  }

  /** Forget the connection: the next query opens the file again (after a sync). */
  close(): void {
    this.db?.close()
    this.db = null
  }
}
