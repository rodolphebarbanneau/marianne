import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, publicHosts } from '../src/shared/constants'
import { recap, systemPrompt, userMessage } from '../src/main/agent/prompt'
import { merge } from '../src/main/config'
import { plainLine } from '../src/main/conversations'
import { ftsQuery, openIndex } from '../src/main/data/db'
import { parseSkill } from '../src/main/skills'
import { articleNumber, findCode } from '../src/main/tools/legifrance'
import type { ChatMessage } from '../src/shared/types'

describe('config merge', () => {
  it('keeps known keys and types, replaces arrays', () => {
    const next = merge(structuredClone(DEFAULT_CONFIG), {
      ui: { theme: 'monochrome', textSize: 'big', unknown: 1 },
      sources: { legifrance: { enabled: false } },
      skills: { disabled: ['impots'] },
      extra: true
    })
    expect(next.ui.theme).toBe('monochrome')
    expect(next.ui.textSize).toBe(DEFAULT_CONFIG.ui.textSize)
    expect((next.ui as Record<string, unknown>).unknown).toBeUndefined()
    expect(next.sources.legifrance).toEqual({ enabled: false, url: '' })
    expect(next.sources.datagouv.enabled).toBe(true)
    expect(next.skills.disabled).toEqual(['impots'])
    expect((next as unknown as Record<string, unknown>).extra).toBeUndefined()
  })
})

describe('legifrance', () => {
  it('finds codes by name, loosely', () => {
    expect(findCode('Code civil')).toEqual({ name: 'Code civil', id: 'LEGITEXT000006070721' })
    expect(findCode('code de la securite sociale')?.id).toBe('LEGITEXT000006073189')
    expect(findCode('impôts')?.name).toBe('Code général des impôts')
    expect(findCode('LEGITEXT000006072050')?.name).toBe('Code du travail')
    expect(findCode('procédure')).toBeNull() // civile, pénale, d'exécution: ambiguous
  })

  it('normalizes article numbers', () => {
    expect(articleNumber('L. 1237-1')).toBe('L1237-1')
    expect(articleNumber('article 1240')).toBe('1240')
  })
})

describe('skills', () => {
  it('reads the front matter, or falls back to the file', () => {
    expect(parseSkill('---\nname: x\ntitle: Titre\ndescription: Une description\n---\n# Corps\n\nTexte', 'x.md')).toEqual({
      name: 'x',
      title: 'Titre',
      description: 'Une description',
      body: '# Corps\n\nTexte'
    })
    expect(parseSkill('# Mon guide\n\nPremier paragraphe.\n\nSuite.', 'mon-guide.md')).toMatchObject({
      name: 'mon-guide',
      title: 'Mon guide',
      description: 'Premier paragraphe.'
    })
  })
})

describe('index', () => {
  it('builds accent-insensitive prefix queries without stop words', () => {
    expect(ftsQuery('Les aides au logement étudiant')).toBe('"aides"* "logement"* "etudiant"*')
    expect(ftsQuery('APL étudiant', true)).toBe('"apl"* OR "etudiant"*')
    expect(ftsQuery('le de la')).toBe('')
  })

  it('searches Service-Public documents with FTS5', () => {
    const dir = mkdtempSync(join(tmpdir(), 'marianne-'))
    try {
      const db = openIndex(join(dir, 'index.db'))
      const insert = db.prepare('insert into sp_docs (id, kind, title, description, theme, url, updated, body) values (?, ?, ?, ?, ?, ?, ?, ?)')
      insert.run(
        'F1',
        'fiche',
        'Aide personnalisée au logement (APL)',
        'Aide pour payer le loyer',
        'Logement',
        'u',
        '2026-01-01',
        'Les étudiants peuvent en bénéficier.'
      )
      insert.run('F2', 'fiche', 'Carte grise', 'Certificat d’immatriculation', 'Transports', 'u', '2026-01-01', 'Véhicule.')
      db.exec("insert into sp_fts (sp_fts) values ('rebuild')")
      const hits = db
        .prepare('select d.id from sp_fts join sp_docs d on d.rowid = sp_fts.rowid where sp_fts match ? order by bm25(sp_fts)')
        .all(ftsQuery('logement étudiants'))
      expect(hits).toEqual([{ id: 'F1' }])
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('prompt', () => {
  it('tells the agent how to cite laws, with or without Légifrance', () => {
    const base = { skills: [], notes: '', custom: '', web: 'public' as const }
    expect(systemPrompt({ ...base, legifrance: true })).toContain('utilise les outils Légifrance')
    const without = systemPrompt({ ...base, legifrance: false })
    expect(without).toContain('ne sont pas configurés')
    expect(without).not.toContain('utilise les outils Légifrance')
  })

  it('puts the date, attachments and text in the user message', () => {
    const m = userMessage(
      'Mon loyer ?',
      [
        { type: 'page', url: 'https://caf.fr/x', title: 'Mon "compte"', text: 'Solde' },
        { type: 'file', name: 'avis.pdf', path: 'files/ab/avis.pdf', size: 10 }
      ],
      [],
      new Date(2026, 9, 27)
    )
    expect(m).toBe(
      '<contexte date="2026-10-27" jour="mardi" />\n\n<page url="https://caf.fr/x" titre="Mon \'compte\'">\nSolde\n</page>\n\n<fichier chemin="files/ab/avis.pdf" nom="avis.pdf" taille="10" />\n\nMon loyer ?'
    )
  })

  it('tells the agent the screen the user is on, and its vault documents', () => {
    const m = userMessage('Et ici ?', [{ type: 'document', id: 'd1', title: 'Avis 2026' }], [], new Date(2026, 9, 27), {
      route: 'domaine/impots',
      title: 'impôts & finances'
    })
    expect(m).toContain('<ecran route="domaine/impots" titre="impôts & finances" />')
    expect(m).toContain('<document id="d1" titre="Avis 2026" />')
  })

  it('recaps earlier turns for a new session, newest kept first when long', () => {
    const msg = (role: 'user' | 'assistant', text: string): ChatMessage => ({ id: text, role, at: '', parts: [{ type: 'text', text }] })
    expect(recap([msg('user', 'Bonjour'), msg('assistant', 'Salut')])).toContain('(utilisateur) Bonjour\n\n(marianne) Salut')
    const long = Array.from({ length: 30 }, (_, i) => msg('user', `${i} ${'x'.repeat(2400)}`))
    const r = recap(long)
    expect(r).toContain('(utilisateur) 29 ')
    expect(r).not.toContain('(utilisateur) 0 ')
  })
})

describe('public hosts', () => {
  it('includes the catalog, the sources and custom sites', () => {
    const hosts = publicHosts([{ id: 'x', name: 'x', url: 'https://www.mairie-exemple.fr/a', domain: 'identite', description: '', login: 'aucun' }])
    expect(hosts).toContain('www.impots.gouv.fr')
    expect(hosts).toContain('www.legifrance.gouv.fr')
    expect(hosts).toContain('www.mairie-exemple.fr')
  })
})

describe('conversation list', () => {
  it('previews answers as plain text', () => {
    const answer = ['## Délai', '', '**Vous pouvez contester** jusqu’au [lundi 4 janvier](https://x.fr) :', '- `calcul`', '> note'].join('\n')
    expect(plainLine(answer)).toBe('Délai Vous pouvez contester jusqu’au lundi 4 janvier : calcul note')
  })
})
