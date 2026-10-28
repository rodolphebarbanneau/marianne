import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { splitFrontMatter } from '@marianne/content'
import { content } from '../content'
import { log } from '../log'
import { paths } from '../paths'
import { services } from '../host'
import type { SkillInfo } from '../../shared/types'

/**
 * Skills: method guides the engine reads before handling a kind of request (claiming benefits,
 * answering an administration, computing a deadline…). Markdown with a small front matter: the
 * content's (reviewed, updated by signed bundles), those of the services that are on, and the
 * user's own (~/.marianne/skills, local and unsigned).
 */

interface Skill extends SkillInfo {
  body: string
}

/** `---\nname: x\ntitle: y\ndescription: z\n---\nbody`; without front matter, the file's name, heading and first paragraph. */
export function parseSkill(text: string, file: string): Omit<Skill, 'builtin' | 'path'> {
  const fm = splitFrontMatter(text)
  const meta = fm?.meta ?? {}
  const body = (fm ? fm.body : text).trim()
  const heading = body.match(/^#\s+(.+)$/m)?.[1]
  const paragraph = body.split(/\n\s*\n/).find((p) => p.trim() && !p.startsWith('#'))
  return {
    name: meta.name || basename(file, '.md'),
    title: meta.title || heading || basename(file, '.md'),
    description: meta.description || (paragraph ?? '').replace(/\s+/g, ' ').slice(0, 200),
    body
  }
}

/** The user's skills. */
function own(): Skill[] {
  let files: string[] = []
  try {
    files = readdirSync(paths.skills).filter((f) => f.endsWith('.md'))
  } catch {
    return []
  }
  return files.flatMap((f) => {
    try {
      return [{ ...parseSkill(readFileSync(join(paths.skills, f), 'utf8'), f), builtin: false, path: join(paths.skills, f) }]
    } catch (err) {
      log.warn('Unreadable skill', f, err)
      return []
    }
  })
}

/** The content's skills, the services', then the user's (which replace one of the same name). */
function all(): Skill[] {
  const { skills } = content.get()
  const fromContent = skills.map(({ name, title, description, body }): Skill => ({ name, title, description, body, builtin: true, path: `skills/${name}.md` }))
  const fromServices = services
    .skills()
    .map(({ service, text }): Skill => ({ ...parseSkill(text, `${service}.md`), builtin: true, path: `3615 ${service.toUpperCase()}` }))
  const byName = new Map<string, Skill>()
  for (const s of [...fromContent, ...fromServices, ...own()]) byName.set(s.name, s)
  return [...byName.values()]
}

export function listSkills(): SkillInfo[] {
  return all().map(({ body: _body, ...info }) => info)
}

/** The guide's text, or null when there is no such skill. */
export function readSkill(name: string): string | null {
  return all().find((s) => s.name === name)?.body ?? null
}
