import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { SkillInfo } from '../shared/types'
import { configStore } from './config'
import { log } from './log'
import { paths, resource } from './paths'

/**
 * Skills: method guides the agent reads before handling a kind of request (claiming benefits,
 * answering an administration, computing a deadline…). Markdown files with a small front matter,
 * built into the app (resources/skills) or added by the user (~/.marianne/skills).
 */

interface Skill extends SkillInfo {
  body: string
}

/** `---\nname: x\ntitle: y\ndescription: z\n---\nbody` (front matter optional). */
export function parseSkill(text: string, file: string): Omit<Skill, 'builtin' | 'enabled' | 'path'> {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  const meta: Record<string, string> = {}
  for (const line of fm?.[1].split(/\r?\n/) ?? []) {
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (m) meta[m[1]] = m[2].trim()
  }
  const body = (fm ? text.slice(fm[0].length) : text).trim()
  const heading = body.match(/^#\s+(.+)$/m)?.[1]
  const paragraph = body.split(/\n\s*\n/).find((p) => p.trim() && !p.startsWith('#'))
  return {
    name: meta.name || basename(file, '.md'),
    title: meta.title || heading || basename(file, '.md'),
    description: meta.description || (paragraph ?? '').replace(/\s+/g, ' ').slice(0, 200),
    body
  }
}

function load(dir: string, builtin: boolean): Skill[] {
  let files: string[] = []
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'))
  } catch {
    return []
  }
  const disabled = new Set(configStore.get().skills.disabled)
  return files.flatMap((f) => {
    try {
      const s = parseSkill(readFileSync(join(dir, f), 'utf8'), f)
      return [{ ...s, builtin, enabled: !disabled.has(s.name), path: join(dir, f) }]
    } catch (err) {
      log.warn('Unreadable skill', f, err)
      return []
    }
  })
}

/** Built-in skills, then the user's (which replace a built-in one of the same name). */
function all(): Skill[] {
  const byName = new Map<string, Skill>()
  for (const s of [...load(resource('skills'), true), ...load(paths.skills, false)]) byName.set(s.name, s)
  return [...byName.values()]
}

export const skills = {
  list(): SkillInfo[] {
    return all().map(({ body: _body, ...info }) => info)
  },
  enabled(): SkillInfo[] {
    return this.list().filter((s) => s.enabled)
  },
  read(name: string): string | null {
    const s = all().find((x) => x.name === name && x.enabled)
    return s ? s.body : null
  }
}
