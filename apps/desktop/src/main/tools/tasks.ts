import { domainInfo } from '@marianne/profile'
import * as z from 'zod'
import { everyLabel } from '../../shared/tasks'
import { approvals } from '../approvals'
import { tasks } from '../tasks'
import { callingFolder } from './folder'
import { tool, ToolError } from './tool'

/**
 * Planned tasks, from the engines' side: proposing one during a conversation (the user's yes on a
 * card creates it) and, in a run, saying how it went. A run's only other powers are the sites the
 * user gave it (tools/browser.ts): nothing here lets the engine widen them.
 */

const HOST = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/
const NEVER = 'payer, signer ou envoyer : une tâche regarde et vous le dit'

const EVERY = z.object({ unit: z.enum(['day', 'week', 'month', 'year']), n: z.number().int().min(1).max(366) })

export const taskTools = [
  tool({
    name: 'task_propose',
    title: 'Plan a task',
    // A task's title goes in the system's notifications, and its words stay in the archive: no identifier in them.
    tokens: false,
    description:
      'Proposes a planned task to the user, on a card: something that comes back in this folder on a rhythm. "marianne": on its day you redo the work here, alone, with the sites listed; "remind": the folder only comes back with a reminder. Use it when the user wants something checked or remembered regularly. A task has a day and no time of day: it runs at the first opening of Marianne on or after its day, so say so if timing matters. Never plan paying, signing or sending: a task can only look and report. The user may refuse.',
    input: {
      title: z.string().trim().min(3).max(80).describe('In French, short'),
      runner: z.enum(['marianne', 'remind']),
      every: EVERY,
      instruction: z
        .string()
        .trim()
        .max(500)
        .optional()
        .describe('runner marianne: what to do at each run, in French: the user reads it word for word on the card, and on the task afterwards'),
      sites: z
        .array(z.string().regex(HOST, 'a host name: www.example.fr'))
        .max(5)
        .default([])
        .describe('runner marianne: the hosts a run may open without asking'),
      why: z.string().trim().max(160).optional().describe('In French, one line: why this rhythm')
    },
    run: async ({ title, runner, every, instruction, sites, why }, ctx) => {
      const folder = callingFolder(ctx.folderId)
      if (tasks.runningIn(folder.id)) throw new ToolError('A planned task cannot plan another one.')
      if (folder.task) throw new ToolError('This folder already comes back with a planned task: one task a folder.')
      if (runner === 'marianne' && !instruction) throw new ToolError('A task Marianne carries out needs its instruction.')
      const label = everyLabel(every)
      const decision = await approvals.request(folder.id, {
        kind: 'proposal',
        title: `Planifier « ${title} » ?`,
        reason: why ?? '',
        fields: [
          { label: 'tâche', value: title },
          { label: 'qui', value: runner === 'marianne' ? 'Marianne vérifie' : 'un rappel' },
          { label: 'quand', value: `${label}, à votre première ouverture du jour prévu` },
          ...(folder.domain ? [{ label: 'domaine', value: domainInfo(folder.domain).short }] : []),
          ...(runner === 'marianne'
            ? [
                { label: 'à chaque fois', value: instruction ?? '' },
                { label: 'sites sans redemander', value: sites.join(', ') || 'aucun' },
                { label: 'jamais', value: NEVER }
              ]
            : [])
        ]
      })
      if (decision !== 'accepted')
        throw new ToolError(`${decision === 'refused' ? 'The user refused' : 'No answer from the user'}: nothing was planned. Do not retry.`)
      const task = tasks.create({
        title,
        domain: folder.domain,
        runner,
        origin: { kind: 'agent' },
        every,
        everyLabel: label,
        instruction,
        sites,
        // On the task as on the card: what it does stays where the user can read it.
        allows: instruction ? [instruction, ...(sites.length ? [`aller sur ${sites.join(' et ')} sans redemander, pour cette tâche`] : [])] : undefined,
        never: runner === 'marianne' ? NEVER : undefined,
        why,
        folderId: folder.id
      })
      return `Planned: « ${task.title} », ${label}, next on ${task.next}. It comes back in this folder.`
    }
  }),

  tool({
    name: 'task_report',
    title: 'Task report',
    description:
      'Ends a run of a planned task, in that run only. Outcome "nothing": nothing to bring to the user; "found": something they should see; "waiting": you need them (a code, a captcha, an answer); "failed": you could not do it.',
    input: {
      outcome: z.enum(['nothing', 'found', 'waiting', 'failed']),
      text: z.string().trim().min(1).max(160).describe('In French, one line: what happened')
    },
    run: async ({ outcome, text }, ctx) => {
      if (!tasks.runningIn(ctx.folderId)) throw new ToolError('Only during a run of a planned task.')
      tasks.reportRun({ outcome, text })
      return 'Noted.'
    }
  })
]
