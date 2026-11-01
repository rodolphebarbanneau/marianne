import { domainInfo } from '@marianne/profile'
import * as z from 'zod'
import type { Folder } from '../../shared/types'
import { content } from '../content'
import { guides, listSkills, readSkill } from '../engines/skills'
import { folders } from '../folders'
import { documents } from '../profile/documents'
import { DOMAIN_IDS, tool, ToolError } from './tool'

/** The work at hand: the calling folder (one folder = one conversation), its guided procedure, and the method guides. */

/** The calling folder; the tools that act on it need one. */
export function callingFolder(folderId: string | undefined): Folder {
  const folder = folderId ? folders.get(folderId) : null
  if (!folder) throw new ToolError('Only available in a folder’s conversation.')
  return folder
}

const progress = (folder: Folder, total: number) => `${folder.stepsDone.length}/${total} steps done`

export const folderTools = [
  tool({
    name: 'folder',
    title: 'Folder',
    description:
      'The folder this conversation is (one folder = one matter): its title, domain, the guided procedure it follows with the steps done, and its pièces (the documents filed in it). Give a title or a domain to set them, e.g. once the matter is clear.',
    input: {
      title: z.string().trim().min(1).max(80).optional().describe('A short title for the sidebar, in French'),
      domain: z.enum(DOMAIN_IDS).optional()
    },
    run: async ({ title, domain }, ctx) => {
      let folder = callingFolder(ctx.folderId)
      if (title || domain) folder = folders.update(folder.id, { ...(title ? { title } : {}), ...(domain ? { domain } : {}) })
      const lines = [`# ${folder.title}`, '', `- domain: ${folder.domain ? `${folder.domain} (${domainInfo(folder.domain).label})` : 'none'}`]
      const followed = folder.procedure ? content.procedure(folder.procedure) : null
      if (followed) {
        lines.push(`- procedure: ${followed.id} « ${followed.title} » · ${progress(folder, followed.steps.length)}`)
        followed.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${folder.stepsDone.includes(i) ? '[x]' : '[ ]'} ${s.title}`))
      } else lines.push('- procedure: none')
      const pieces = documents.list().filter((d) => d.folderId === folder.id)
      lines.push('', pieces.length ? '## Pièces' : 'No pièce yet: documents the user drops in the conversation are filed here.')
      for (const d of pieces) lines.push(`- ${d.id} · ${d.type} · ${d.title} · ${d.date}`)
      return `${title || domain ? 'Updated.\n\n' : ''}${lines.join('\n')}`
    }
  }),

  tool({
    name: 'procedures',
    title: 'Guided procedures',
    readOnly: true,
    description: 'The guided procedures available (step by step, with links and documents to have at hand), by domain.',
    input: { domain: z.enum(DOMAIN_IDS).optional() },
    run: async ({ domain }, ctx) => {
      const followed = ctx.folderId ? folders.get(ctx.folderId) : null
      const { procedures } = content.get()
      return procedures
        .filter((x) => !domain || x.domain === domain)
        .map(
          (x) =>
            `- ${x.id} · ${x.domain} · **${x.title}**: ${x.description}${followed?.procedure === x.id ? ` (this folder follows it: ${progress(followed, x.steps.length)})` : ''}`
        )
        .join('\n')
    }
  }),

  tool({
    name: 'procedure',
    title: 'Guided procedure',
    readOnly: true,
    description:
      'A guided procedure in full: its steps with their actions and the documents to have at hand, and the steps done when this folder follows it. An action "service <code>" is a 3615 service of Marianne: link it as marianne:service/<code>.',
    input: { id: z.string() },
    run: async ({ id }, ctx) => {
      const x = content.procedure(id)
      if (!x) throw new ToolError(`Unknown procedure: ${id}.`)
      const folder = ctx.folderId ? folders.get(ctx.folderId) : null
      const done = new Set(folder?.procedure === id ? folder.stepsDone : [])
      const steps = x.steps.map((s, i) => {
        const actions = s.actions.length ? `\n\nActions: ${s.actions.map((a) => `${a.kind} ${a.target}`).join(' · ')}` : ''
        return `## ${i + 1}. ${s.title}${done.has(i) ? ' (done)' : ''}\n\n${s.body}${actions}`
      })
      const have = x.documents.length ? `\nTo have at hand: ${x.documents.join(' ; ')}` : ''
      return `# ${x.title}\n\n${x.description}\n\nWhen: ${x.when || '—'} · time: ${x.duration || '—'}${have}\n\n${steps.join('\n\n')}`
    }
  }),

  tool({
    name: 'complete_step',
    title: 'Procedure step',
    description: 'Ticks (or unticks) a step of the procedure this folder follows, when the user says it is done. The folder is settled once every step is.',
    input: { step: z.number().int().min(1).describe('Step number, from 1'), done: z.boolean().default(true) },
    run: async ({ step, done }, ctx) => {
      const folder = callingFolder(ctx.folderId)
      const x = folder.procedure ? content.procedure(folder.procedure) : null
      if (!x) throw new ToolError('This folder follows no guided procedure.')
      if (step > x.steps.length) throw new ToolError(`The procedure has ${x.steps.length} steps.`)
      const next = folders.setStep(folder.id, step - 1, done) ?? folder
      const all = next.stepsDone.length >= x.steps.length ? ' Every step is done.' : ''
      return `Step ${step} « ${x.steps[step - 1].title} » ${done ? 'ticked' : 'unticked'} (${progress(next, x.steps.length)}).${all}`
    }
  }),

  tool({
    name: 'skill',
    title: 'Skill',
    readOnly: true,
    description:
      'Reads a method guide (skill) by its name, among those listed in your instructions. Read the matching guide before handling a request of that kind.',
    input: { name: z.string() },
    run: async ({ name }, ctx) => {
      const body = readSkill(name.trim())
      if (!body)
        throw new ToolError(
          `Unknown skill « ${name} ». Available: ${listSkills()
            .map((s) => s.name)
            .join(', ')}.`
        )
      // Read here: a service's guide won't come again with its first use (guides.ts).
      if (ctx.folderId) guides.noteRead(ctx.folderId, name.trim())
      return body
    }
  })
]
