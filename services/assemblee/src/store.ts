import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

/**
 * The offline index of the Assemblée's open data: <dataDir>/assemblee.db. The sync job writes it
 * in one transaction (WAL: the main side keeps reading meanwhile); the main side opens it
 * read-only. It is a cache: a new schema version drops it, and the next sync fills it again.
 */

export const DB_FILE = 'assemblee.db'

export const SCHEMA_VERSION = 1

export type Dump = 'deputies' | 'ballots' | 'meetings'

/**
 * The tables of each dump: created empty, filled, then indexed (an index built after the rows is
 * much faster than one kept up row by row). Searchable columns are folded (lowercase, no accents,
 * words separated by single spaces). Some 1.3 million votes per legislature: integers only
 * (deputy PA1008 → 1008, ballot number, position code), keyed in the order they arrive. A
 * meeting's day is the Paris date of its start.
 */
export const TABLES: Record<Dump, { names: string[]; create: string; index: string }> = {
  deputies: {
    names: ['organs', 'deputies'],
    create: `create table organs (id text primary key, type text not null, name text not null, short_name text not null, code text not null, color text not null);
      create table deputies (id text primary key, search text not null, group_id text not null, department_number text not null, department text not null, constituency text not null, data text not null);`,
    index: `create index organs_type on organs (type);
      create index deputies_department on deputies (department_number);
      create index deputies_group on deputies (group_id);`
  },
  ballots: {
    names: ['ballots_fts', 'ballots', 'votes'],
    create: `create table ballots (id text primary key, number integer not null, date text not null, title text not null, result text not null, data text not null);
      create table votes (ballot integer not null, deputy integer not null, position integer not null, proxy integer not null, primary key (ballot, deputy)) without rowid;`,
    index: `create index ballots_number on ballots (number);
      create index ballots_date on ballots (date);
      create index votes_deputy on votes (deputy, position);
      create virtual table ballots_fts using fts5(title, content='ballots', tokenize='unicode61 remove_diacritics 2');
      insert into ballots_fts (ballots_fts) values ('rebuild');`
  },
  meetings: {
    names: ['meetings'],
    create:
      'create table meetings (id text primary key, day text not null, start text not null, kind text not null, organ_id text not null, data text not null);',
    index: 'create index meetings_day on meetings (day);'
  }
}

const version = (db: DatabaseSync) => (db.prepare('pragma user_version').get() as { user_version: number }).user_version

/** The index for the sync job, and whether its schema is the current one (false: it must be rebuilt from every dump). */
export function openWriter(file: string): { db: DatabaseSync; current: boolean } {
  const db = new DatabaseSync(file)
  // A large page cache: a rebuild goes through most of the file.
  db.exec('pragma journal_mode = wal; pragma synchronous = normal; pragma busy_timeout = 15000; pragma cache_size = -65536;')
  return { db, current: version(db) === SCHEMA_VERSION }
}

/**
 * Drop whatever schema the file has and mark it as the current version, before every dump fills
 * its tables again; inside the sync's transaction, so readers see the old index or the new one,
 * never an empty one. Tables are dropped rather than the file deleted: the main side may have it open.
 */
export function resetSchema(db: DatabaseSync): void {
  const tables = (where: string) =>
    (db.prepare(`select name from sqlite_master where type = 'table' and ${where}`).all() as Array<{ name: string }>).map((t) => t.name)
  // Virtual tables first: dropping one drops its shadow tables.
  for (const name of tables("upper(sql) like 'CREATE VIRTUAL TABLE%'")) db.exec(`drop table "${name}"`)
  for (const name of tables("name not like 'sqlite_%'")) db.exec(`drop table "${name}"`)
  db.exec(`pragma user_version = ${SCHEMA_VERSION}`)
}

/** A dump's tables, dropped and created empty: refilled in the same transaction. */
export function recreateTables(db: DatabaseSync, dump: Dump): void {
  for (const name of TABLES[dump].names) db.exec(`drop table if exists ${name}`)
  db.exec(TABLES[dump].create)
}

/** A dump's indexes, once its rows are in. */
export const indexTables = (db: DatabaseSync, dump: Dump) => db.exec(TABLES[dump].index)

/** The main side's view of the index: opened read-only when first needed, once a sync has filled it. */
export class AssemblyIndex {
  private db: DatabaseSync | null = null

  constructor(readonly file: string) {}

  /** The index, or null before the first sync (or after a schema change, until the next one). */
  open(): DatabaseSync | null {
    if (this.db) return this.db
    if (!existsSync(this.file)) return null
    const db = new DatabaseSync(this.file, { readOnly: true })
    try {
      db.exec('pragma busy_timeout = 5000')
      if (version(db) === SCHEMA_VERSION && db.prepare('select 1 from deputies limit 1').get()) return (this.db = db)
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
