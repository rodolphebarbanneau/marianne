import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { CONTRIBUTORS, issueUrl, projectLinks, REPO_URL } from '../src/shared/project'

const form = (name: string) => readFileSync(new URL(`../../../.github/ISSUE_TEMPLATE/${name}.yml`, import.meta.url), 'utf8')

describe('the project the app names', () => {
  it('has the address of its package, which the contributors script reads', () => {
    expect(pkg.homepage).toBe(REPO_URL)
  })

  it('names its authors, each with a name and a GitHub page', () => {
    expect(CONTRIBUTORS.length).toBeGreaterThan(0)
    for (const c of CONTRIBUTORS) {
      expect(c.name.trim()).not.toBe('')
      expect(c.url).toBe(`https://github.com/${c.login}`)
    }
    expect(new Set(CONTRIBUTORS.map((c) => c.login)).size).toBe(CONTRIBUTORS.length)
  })

  it('links to pages of its repository only, and to files of it that exist', () => {
    for (const link of projectLinks('0.1.0')) {
      expect(link.url.startsWith(REPO_URL)).toBe(true)
      const file = link.url.match(/\/blob\/main\/(.+)$/)?.[1]
      if (file) expect(existsSync(new URL(`../../../${file}`, import.meta.url))).toBe(true)
    }
  })

  it('opens new issues on forms of the repository, their version filled in', () => {
    for (const name of ['bug', 'idea'] as const) {
      // The form exists, and has the field the version goes in.
      expect(form(name)).toMatch(/^\s+id: version$/m)
      expect(issueUrl(name, '0.1.0-alpha.1')).toBe(`${REPO_URL}/issues/new?template=${name}.yml&version=0.1.0-alpha.1`)
    }
    expect(issueUrl('idea')).toBe(`${REPO_URL}/issues/new?template=idea.yml`)
  })
})
