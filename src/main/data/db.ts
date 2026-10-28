import { rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

/**
 * The local index (~/.marianne/index.db): open data dumps, searchable offline. It is a cache:
 * a schema change drops it, and the next sync rebuilds it. The main process reads it; the index
 * worker writes it (WAL lets both work at once).
 */

const SCHEMA_VERSION = 2

const SCHEMA = `
create table sync (source text primary key, synced_at text not null, etags text not null, count integer not null);

create table sp_docs (id text primary key, kind text not null, title text not null, description text, theme text, url text, updated text, body text);
create virtual table sp_fts using fts5(title, description, body, content='sp_docs', tokenize='unicode61 remove_diacritics 2');

create table an_organes (id text primary key, type text, libelle text, abrege text);
create table an_deputes (id text primary key, nom text, prenom text, search text, groupe_id text, num_departement text, circo text, data text not null);
create table an_scrutins (id text primary key, numero integer, date text, titre text, sort text, data text not null);
create index an_scrutins_numero on an_scrutins (numero);
create virtual table an_scrutins_fts using fts5(titre, content='an_scrutins', tokenize='unicode61 remove_diacritics 2');
-- 1.3 million rows per legislature: integers only (deputy PA1008 → 1008, vote number, position code).
create table an_votes (acteur integer not null, scrutin integer not null, position integer not null, delegation integer not null, primary key (acteur, scrutin)) without rowid;
create index an_votes_scrutin on an_votes (scrutin);
`

export function openIndex(file: string): DatabaseSync {
  let db = new DatabaseSync(file)
  const { user_version } = db.prepare('pragma user_version').get() as { user_version: number }
  if (user_version !== SCHEMA_VERSION) {
    if (user_version !== 0) {
      // Older schema: start over (the next sync fills it again).
      db.close()
      for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true })
      db = new DatabaseSync(file)
    }
    db.exec(SCHEMA)
    db.exec(`pragma user_version = ${SCHEMA_VERSION}`)
  }
  db.exec('pragma journal_mode = wal; pragma synchronous = normal; pragma busy_timeout = 15000;')
  return db
}

/**
 * FTS5 query from free text: every word must appear (prefix match), accents and case ignored.
 * Falls back to any word when `any` is set.
 */
export function ftsQuery(text: string, any = false): string {
  const words = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
  return words.map((w) => `"${w}"*`).join(any ? ' OR ' : ' ')
}

const STOP_WORDS = new Set(
  'le la les un une des du de d l au aux et ou en a est que qui quoi dans pour par sur avec sans ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs je tu il elle on nous vous ils elles se ne pas plus comment quel quelle quels quelles faire peut puis dois doit'.split(
    ' '
  )
)
