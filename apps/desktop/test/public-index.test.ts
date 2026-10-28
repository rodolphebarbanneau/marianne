import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ftsQuery, openPublicDb } from '../src/main/public/db'

describe('public index', () => {
  it('builds accent-insensitive prefix queries without stop words', () => {
    expect(ftsQuery('Les aides au logement étudiant')).toBe('"aides"* "logement"* "etudiant"*')
    expect(ftsQuery('APL étudiant', true)).toBe('"apl"* OR "etudiant"*')
    expect(ftsQuery('le de la')).toBe('')
  })

  it('searches Service-Public documents with FTS5', () => {
    const dir = mkdtempSync(join(tmpdir(), 'marianne-'))
    try {
      const db = openPublicDb(join(dir, 'public.db'))
      const insert = db.prepare('insert into sp_documents (id, kind, title, description, theme, url, updated, body) values (?, ?, ?, ?, ?, ?, ?, ?)')
      insert.run(
        'F1',
        'sheet',
        'Aide personnalisée au logement (APL)',
        'Aide pour payer le loyer',
        'Logement',
        'u',
        '2026-01-01',
        'Les étudiants peuvent en bénéficier.'
      )
      insert.run('F2', 'sheet', 'Carte grise', 'Certificat d’immatriculation', 'Transports', 'u', '2026-01-01', 'Véhicule.')
      db.exec("insert into sp_fts (sp_fts) values ('rebuild')")
      const hits = db
        .prepare('select d.id from sp_fts join sp_documents d on d.rowid = sp_fts.rowid where sp_fts match ? order by bm25(sp_fts)')
        .all(ftsQuery('logement étudiants'))
      expect(hits.map((h) => h.id)).toEqual(['F1'])
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
