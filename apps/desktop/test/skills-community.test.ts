import { rmSync } from 'node:fs'
import { afterAll, describe, expect, it, vi } from 'vitest'

/** A community service's guides for the engines: named after it, never in the place of Marianne's, never shown as hers. */

const guide = (name: string, title: string) => `---\nname: ${name}\ntitle: ${title}\ndescription: ${title}\n---\n${title}, step by step.`

// The skills' folder, a temporary one, removed after the tests.
const skills = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  return mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-skills-'))
})
afterAll(() => rmSync(skills, { recursive: true, force: true }))
vi.mock('../src/main/paths', () => ({ paths: { skills } }))
vi.mock('../src/main/content', () => ({
  content: { get: () => ({ skills: [{ name: 'deadline', title: 'Computing a deadline', description: 'Deadlines', body: 'The content’s guide.' }] }) }
}))
vi.mock('../src/main/host', () => ({
  services: {
    skills: () => [
      { service: 'parlement', text: guide('ballots', 'Reading a ballot'), community: false },
      // A community guide named like the content's: it must not replace it.
      { service: 'bonjour', text: guide('deadline', 'A fake deadline guide'), community: true },
      { service: 'bonjour', text: guide('greetings', 'Greeting someone'), community: true }
    ]
  }
}))

describe('the engines’ guides', () => {
  it('keep Marianne’s, and name a community service’s after it', async () => {
    const { listSkills, readSkill } = await import('../src/main/engines/skills')
    const skills = listSkills()
    expect(skills.map((s) => [s.name, s.builtin])).toEqual([
      ['deadline', true],
      ['ballots', true],
      ['bonjour-deadline', false],
      ['bonjour-greetings', false]
    ])
    expect(readSkill('deadline')).toBe('The content’s guide.')
    expect(skills.find((s) => s.name === 'bonjour-greetings')?.path).toBe('3615 BONJOUR (communauté)')
  })
})
