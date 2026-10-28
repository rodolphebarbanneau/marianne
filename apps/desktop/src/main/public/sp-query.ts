import type { SpKind } from '../../shared/public'
import { ftsQuery } from './db'
import type { SpDocument } from './service-public'
import { sync } from './sync'

/** Queries on the local Service-Public index, for the assistant's tools and the fiche reader. */

export interface SpHit {
  id: string
  kind: SpKind
  title: string
  description: string
  url: string
  updated: string
  /** The matching passage, matches between « ». */
  excerpt: string
}

/** Every word first; any word when nothing matches all of them. */
export function searchSp(text: string, limit = 8, kind?: SpKind): { hits: SpHit[]; loose: boolean } {
  if (!sync.ready('service-public')) return { hits: [], loose: false }
  const run = (any: boolean) => {
    const q = ftsQuery(text, any)
    if (!q) return []
    return sync.db
      .prepare(
        `select d.id, d.kind, d.title, d.description, d.url, d.updated, snippet(sp_fts, 2, '«', '»', '…', 14) as excerpt
         from sp_fts join sp_documents d on d.rowid = sp_fts.rowid
         where sp_fts match ? ${kind ? 'and d.kind = ?' : ''}
         order by bm25(sp_fts, 12.0, 4.0, 1.0) limit ?`
      )
      .all(...(kind ? [q, kind, limit] : [q, limit])) as unknown as SpHit[]
  }
  const hits = run(false)
  return hits.length ? { hits, loose: false } : { hits: run(true), loose: true }
}

export function getSpDocument(id: string): SpDocument | null {
  if (!sync.ready('service-public')) return null
  return (sync.db.prepare('select * from sp_documents where id = ?').get(id.toUpperCase()) as SpDocument | undefined) ?? null
}

/** Titles of several documents at once (the key fiches of a domain page), in the order asked. */
export function spTitles(ids: string[]): Array<{ id: string; title: string; kind: SpKind }> {
  if (!ids.length || !sync.ready('service-public')) return []
  const rows = sync.db.prepare(`select id, title, kind from sp_documents where id in (${ids.map(() => '?').join(',')})`).all(...ids) as Array<{
    id: string
    title: string
    kind: SpKind
  }>
  return ids.flatMap((id) => rows.filter((r) => r.id === id))
}
