import { createPublicKey } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { files, signingKey } from '../src/files'
import { readContent } from '../src/index'

describe('the shipped content', () => {
  const content = readContent(files)

  it('is valid, every file of it', () => {
    expect(Object.keys(files).filter((path) => path.endsWith('.md')).length).toBe(content.skills.length + content.procedures.length)
    expect(content.skills.length).toBeGreaterThanOrEqual(7)
    expect(content.procedures.length).toBeGreaterThanOrEqual(14)
    expect(content.calendar.length).toBeGreaterThan(0)
    expect(content.sites.length).toBeGreaterThan(40)
    expect(content.newsSources.length).toBeGreaterThan(20)
    expect(content.parliament.filter((g) => g.chamber === 'an').length).toBeGreaterThanOrEqual(10)
    expect(content.parliament.filter((g) => g.chamber === 'se').length).toBeGreaterThanOrEqual(8)
  })

  it('gives every news source an editorial line, and every regional one its regions', () => {
    for (const s of content.newsSources) {
      expect(s.lean, s.id).toBeDefined()
      if (s.lean !== 'aucune') expect(s.leanBasis, s.id).toMatch(/consulté le \d{1,2} \w+ \d{4}/)
      expect(!!s.regions, s.id).toBe(s.group === 'regional')
    }
    // Public broadcasters and fact-checkers declare no line.
    for (const id of ['franceinfo', 'france-24', 'rfi', 'les-decodeurs', 'vrai-ou-faux'])
      expect(content.newsSources.find((s) => s.id === id)?.lean, id).toBe('aucune')
  })

  it('files each démarche in its domain’s folder, under its id', () => {
    for (const p of content.procedures) expect(files[`procedures/${p.domain}/${p.id}.md`], p.id).toBeDefined()
  })

  it('holds the public signing key only, if any', () => {
    if (!signingKey) return
    expect(signingKey).not.toMatch(/PRIVATE KEY/)
    expect(createPublicKey(signingKey).asymmetricKeyType).toBe('ed25519')
  })
})
