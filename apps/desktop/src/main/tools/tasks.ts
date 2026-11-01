import { domainInfo } from '@marianne/profile'
import * as z from 'zod'
import { isSharedHost } from '../../shared/hosts'
import { everyLabel } from '../../shared/tasks'
import type { Folder } from '../../shared/types'
import { approvals } from '../approvals'
import { services } from '../host'
import { offeredTemplate, tasks, templateTask } from '../tasks'
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

const refused = (decision: string) =>
  new ToolError(`${decision === 'refused' ? 'The user refused' : 'No answer from the user'}: nothing was planned. Do not retry.`)

/**
 * A service's own task, as the Démarches sheet plans it (tasks.ts: offeredTemplate, templateTask):
 * what it does, where it goes, what it allows and never does come from the service's template, never
 * from the engine, which only chooses the rhythm. The card shows what the sheet shows. Planned in the
 * calling folder, or in a new one when that folder already has its task.
 */
async function proposeServiceTask(
  folder: Folder,
  args: { service?: string; template?: string; rhythm?: number; why?: string; own: string[] },
  run: boolean
): Promise<string> {
  const { service, template: id, rhythm, why, own } = args
  if (!service || !id) throw new ToolError('A service’s task needs both service and template (services lists the tasks the services that are on propose).')
  if (own.length) throw new ToolError(`A service’s task takes everything from the service: leave out ${own.join(', ')}, and choose its rhythm with rhythm.`)
  const template = offeredTemplate(services.taskTemplates(), tasks.list(), service, id)
  if (!template)
    throw new ToolError(
      `3615 ${service.toUpperCase()} doesn’t propose the task "${id}" now: the service may be off, the task already planned, or not one it proposes (see services).`
    )
  const index = rhythm ?? template.rhythm
  const task = templateTask(template, index)
  if (!task) throw new ToolError(`Not one of its rhythms. Its rhythms: ${template.rhythms.map((r, i) => `${i} ${r.label}`).join(', ')}.`)
  const chosen = template.rhythms[index]
  const title = task.entity ? `${task.title} · ${task.entity.label}` : task.title
  const { decision } = await approvals.ask(
    folder.id,
    { action: 'task' },
    {
      kind: 'proposal',
      title: `Planifier « ${title} » ?`,
      reason: why ?? '',
      fields: [
        { label: 'tâche', value: title },
        { label: 'service', value: `3615 ${template.service.toUpperCase()}` },
        { label: 'vérifier', value: template.detail ? `${template.checks} · ${template.detail}` : template.checks },
        ...(template.entity ? [{ label: 'pour', value: template.entity.label }] : []),
        { label: 'quand', value: `${chosen.label}, à votre première ouverture du jour prévu${chosen.note ? ` · ${chosen.note}` : ''}` },
        { label: 'Marianne pourra', value: template.allows.join(' · ') },
        { label: 'sites sans redemander', value: template.sites.join(', ') || 'aucun' },
        { label: 'jamais', value: template.never },
        ...(template.followUp ? [{ label: 'si elle trouve quelque chose', value: template.followUp.label }] : []),
        { label: 'vous prévenir', value: 'seulement si elle trouve' },
        { label: 'dossier', value: folder.task ? `un nouveau dossier, « ${title} » : celui-ci a déjà sa tâche` : 'celui-ci' }
      ]
    },
    { run }
  )
  if (decision !== 'accepted') throw refused(decision)
  // What the card showed, if it is still to plan: the user may have planned it on its sheet meanwhile, or switched its service off.
  if (!offeredTemplate(services.taskTemplates(), tasks.list(), service, id))
    throw new ToolError('The task is no longer offered (planned meanwhile, or its service is off): nothing was planned.')
  const here = !callingFolder(folder.id).task
  const created = tasks.create({ ...task, ...(here ? { folderId: folder.id } : {}) })
  return `Planned: « ${title} », ${chosen.label}, next on ${created.next}. It comes back ${here ? 'in this folder' : 'in a new folder of its own: this one already has its task'}.`
}

export const taskTools = [
  tool({
    name: 'task_propose',
    title: 'Plan a task',
    // A task's title goes in the system's notifications, and its words stay in the archive: no identifier in them.
    tokens: false,
    description:
      'Proposes a planned task to the user, on a card: something that comes back in this folder on a rhythm. "marianne": on its day you redo the work here, alone, with the sites listed; "remind": the folder only comes back with a reminder. Use it when the user wants something checked or remembered regularly. When a service that is on proposes a task for it (services lists them), give only service, template and, if the user wants another than the usual one, rhythm: everything else comes from the service, and the task comes back in this folder, or in a new folder of its own when this one already has its task. A task has a day and no time of day: it runs at the first opening of Marianne on or after its day, so say so if timing matters. Never plan paying, signing or sending: a task can only look and report. The user may refuse.',
    input: {
      title: z.string().trim().min(3).max(80).optional().describe('In French, short (not for a service’s task)'),
      runner: z.enum(['marianne', 'remind']).optional().describe('Not for a service’s task'),
      every: EVERY.optional().describe('Not for a service’s task'),
      instruction: z
        .string()
        .trim()
        .max(500)
        .optional()
        .describe('runner marianne: what to do at each run, in French: the user reads it word for word on the card, and on the task afterwards'),
      sites: z
        .array(z.string().regex(HOST, 'a host name: www.example.fr'))
        .max(5)
        .optional()
        .describe('runner marianne: the hosts a run may open without asking'),
      why: z.string().trim().max(160).optional().describe('In French, one line: why this rhythm'),
      service: z.string().trim().min(1).max(40).optional().describe('A service’s own task: the service’s code'),
      template: z.string().trim().min(1).max(200).optional().describe('With service: the id of the task it proposes'),
      rhythm: z.number().int().min(0).max(20).optional().describe('With service: the index of one of the task’s rhythms; its usual one by default')
    },
    run: async ({ title, runner, every, instruction, sites, why, service, template, rhythm }, ctx) => {
      const folder = callingFolder(ctx.folderId)
      if (tasks.runningIn(folder.id)) throw new ToolError('A planned task cannot plan another one.')
      if (service || template) {
        const own = Object.entries({ title, runner, every, instruction, sites }).flatMap(([key, value]) => (value === undefined ? [] : [key]))
        return proposeServiceTask(folder, { service, template, rhythm, why, own }, !!ctx.run)
      }
      if (!title || !runner || !every) throw new ToolError('A task needs its title, runner and every; or, for a service’s own task, service and template.')
      if (folder.task) throw new ToolError('This folder already comes back with a planned task: one task a folder.')
      if (runner === 'marianne' && !instruction) throw new ToolError('A task Marianne carries out needs its instruction.')
      const hosts = sites ?? []
      const shared = hosts.find((site) => isSharedHost(site))
      if (shared)
        throw new ToolError(
          `${shared} is shared by many sites (a hosting service or a public suffix): list the one site the task needs (mairie.github.io, not github.io).`
        )
      const label = everyLabel(every)
      // A task is never allowed ahead: what it will do alone, the user reads on its card each time.
      const { decision } = await approvals.ask(
        folder.id,
        { action: 'task' },
        {
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
                  { label: 'sites sans redemander', value: hosts.join(', ') || 'aucun' },
                  { label: 'jamais', value: NEVER }
                ]
              : [])
          ]
        },
        { run: !!ctx.run }
      )
      if (decision !== 'accepted') throw refused(decision)
      const task = tasks.create({
        title,
        domain: folder.domain,
        runner,
        origin: { kind: 'agent' },
        every,
        everyLabel: label,
        instruction,
        sites: hosts,
        // On the task as on the card: what it does stays where the user can read it.
        allows: instruction ? [instruction, ...(hosts.length ? [`aller sur ${hosts.join(' et ')} sans redemander, pour cette tâche`] : [])] : undefined,
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
