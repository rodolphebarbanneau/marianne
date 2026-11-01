import { PROFILE_FIELDS, serviceCode, type ServiceManifest, type ServiceState } from '@marianne/sdk'
import * as z from 'zod'
import type { PlannedTask, TaskTemplate } from '../../shared/types'
import { accounts } from '../account'
import { approvals, type Decision } from '../approvals'
import { folders } from '../folders'
import { services } from '../host'
import { session } from '../session'
import { offeredTemplate, tasks } from '../tasks'
import { callingFolder } from './folder'
import { tool, ToolError } from './tool'

/**
 * Marianne's services, from the engines' side: what they are (on, off, not added), and proposing one
 * of hers that covers a request. Adding stays the user's own act, in « avant d’ajouter »: the card
 * leads there, and the tool waits for what they did. Never a community service: those are the
 * user's to find on the Services page. Neither tool is a run's (tasks.ts names what a run may use).
 */

/** The services each folder's user refused or left unanswered on a card, in this session: not proposed there again. */
const declined = new Map<string, Set<string>>()
session.on('locked', () => declined.clear())

/**
 * Whether the user declined a service in a folder: in this session, or on a card its conversation
 * kept (refused, or left without an answer).
 */
function declinedIn(folderId: string, code: string): boolean {
  if (declined.get(folderId)?.has(code)) return true
  return folders
    .messages(folderId)
    .some((m) =>
      m.parts.some((p) => p.type === 'approval' && p.kind === 'add' && p.service?.code === code && (p.status === 'refused' || p.status === 'expired'))
    )
}

const state = (code: string) => services.states().find((s) => s.manifest.id === code)

/** On, and what it asks to read of the profile answered: it works now, without the user opening its screen. */
function ready(code: string): boolean {
  const s = state(code)
  return !!s?.on && (!s.access.asked.length || s.access.granted !== null)
}

/**
 * Settles the card as accepted once the service is ready: the user added it (and answered what it
 * asks to read), from the card's « avant d’ajouter » or anywhere else. `stop` once the card is settled.
 */
function whenReady(code: string): { done: Promise<Decision>; stop: () => void } {
  let stop = () => {}
  const done = new Promise<Decision>((resolve) => {
    const check = () => {
      if (ready(code)) resolve('accepted')
    }
    accounts.on('settings', check)
    stop = () => void accounts.off('settings', check)
  })
  return { done, stop }
}

/**
 * What the card says of a service, as « avant d’ajouter » does: what it is, what it reaches, where
 * Marianne would act for it, what it would read, the tools it lends.
 */
export function offerFields(s: Pick<ServiceState, 'manifest' | 'tools'>): Array<{ label: string; value: string }> {
  const m = s.manifest
  const reads = m.permissions.profile.map((f) => PROFILE_FIELDS[f]).join(', ')
  return [
    { label: 'service', value: `3615 ${serviceCode(m)} · ${m.name}` },
    { label: 'ce qu’il fait', value: m.description },
    { label: 'se connecte à', value: m.hosts.join(', ') || 'aucun site' },
    ...(m.sites.length ? [{ label: 'Marianne pourra agir pour vous sur', value: m.sites.join(', ') }] : []),
    { label: 'lira de votre profil', value: reads ? `${reads}, pour ${m.permissions.purpose}, si vous l’acceptez` : 'rien' },
    { label: 'outils pour Marianne', value: s.tools.map((t) => t.label).join(', ') || 'aucun' }
  ]
}

/** What a service reaches, where Marianne acts for it, and what it reads, for the engine. */
const reach = (m: ServiceManifest) =>
  `reaches ${m.hosts.join(', ') || 'no site'}${m.sites.length ? ` · acts on: ${m.sites.join(', ')}` : ''} · ${m.permissions.profile.length ? `reads of the profile, once the user agrees: ${m.permissions.profile.join(', ')}` : 'reads nothing of the profile'}`

/** A service in a few lines: its code, name and words, its domains, its tools, what it reaches. */
function serviceLines(s: ServiceState): string {
  const m = s.manifest
  const whose = s.builtIn ? '' : ` · community service, ${s.trust === 'validated' ? '' : 'not '}reviewed by Marianne`
  const tools = s.tools.map((t) => `${t.name} (${t.label})`).join(', ') || 'none'
  return `- **${m.id}** · 3615 ${serviceCode(m)} · ${m.name}${whose}: ${m.description}\n  domains: ${m.domains.join(', ') || 'none'} · tools: ${tools} · ${reach(m)}`
}

/** The tasks a service that is on proposes, each with what task_propose names it by. */
function templateLines(code: string, templates: TaskTemplate[], planned: PlannedTask[]): string {
  const own = templates.filter((t) => t.service === code)
  if (!own.length) return ''
  const lines = own.map((t) => {
    const rhythms = t.rhythms.map((r, i) => `${i} ${r.label}${i === t.rhythm ? ' (usual)' : ''}`).join(', ')
    const taken = offeredTemplate(templates, planned, code, t.id) ? '' : ' · already planned'
    // Its follow-up's label only: what Marianne does then is the task's to say, when the user clicks it.
    const followUp = t.followUp ? ` · when a run finds something, the user gets a button: « ${t.followUp.label} »` : ''
    return `  - template "${t.id}": ${t.title} · checks ${t.checks}${t.entity ? ` · for ${t.entity.label}` : ''} · rhythms: ${rhythms}${followUp}${taken}`
  })
  return `\n  Planned tasks it proposes (task_propose with service "${code}", the template and a rhythm):\n${lines.join('\n')}`
}

export const servicesTools = [
  tool({
    name: 'services',
    title: 'Services',
    readOnly: true,
    description:
      'Marianne’s services (3615 codes): those that are on, with their tools and the planned tasks they propose (for task_propose: the template’s id and its rhythms); then Marianne’s own that are off or not added, which service_propose can offer the user. What each does, its domains, what it reaches, the sites where you act for the user for it (acts on), and what it reads of the profile.',
    input: {},
    run: async () => {
      const all = services.states()
      const templates = services.taskTemplates()
      const planned = tasks.list()
      const on = all.filter((s) => s.on).map((s) => `${serviceLines(s)}${templateLines(s.manifest.id, templates, planned)}`)
      // Community services only while they are on: one that isn't is the user's business, on the Services page.
      const off = all.filter((s) => s.builtIn && s.added && !s.on).map((s) => `${serviceLines(s)}\n  ${s.available ? 'switched off' : 'unavailable for now'}`)
      const absent = all.filter((s) => s.builtIn && !s.added).map(serviceLines)
      return [
        `## On\n\n${on.join('\n') || 'None.'}`,
        ...(off.length ? [`## Off\n\nAdded, but lending no tool now. service_propose offers to switch one back on.\n\n${off.join('\n')}`] : []),
        ...(absent.length ? [`## Not added\n\nBuilt into Marianne, in « découvrir ». service_propose offers to add one.\n\n${absent.join('\n')}`] : [])
      ].join('\n\n')
    }
  }),

  tool({
    name: 'service_propose',
    title: 'Propose a service',
    tokens: false,
    description:
      'Proposes to the user, on a card, one of Marianne’s own services that covers their request and isn’t on (not added, or switched off): what it does, what it reaches, what it would read of their profile. The card leads to « avant d’ajouter », where adding stays their own act, and the service asks there what it reads. Waits for what they do, then tells you. Its tools reach you only in the next turn, which Marianne starts herself once it is added. Never a community service. Refused or unanswered: carry on without it, and don’t propose it again in this folder.',
    input: {
      code: z.string().trim().min(1).max(40).describe('The service’s code, as services lists it'),
      reason: z.string().trim().min(1).max(200).describe('How it helps with the user’s request, in one sentence for the user (in French)')
    },
    run: async ({ code, reason }, ctx) => {
      const folder = callingFolder(ctx.folderId)
      if (ctx.run || tasks.runningIn(folder.id)) throw new ToolError('A planned task’s run cannot propose a service.')
      const s = state(code.toLowerCase())
      if (!s?.builtIn)
        throw new ToolError('Marianne proposes only her own services (services lists them): a community service is the user’s to find on the Services page.')
      const m = s.manifest
      const name = `3615 ${serviceCode(m)}`
      if (s.on) return `${name} is already on: use its tools.`
      if (!s.available)
        throw new ToolError(
          s.error
            ? `${name} could not start (${s.error}): carry on without it.`
            : `${name} needs a connection the user turned off (${m.connections.join(', ')}): they can turn it on in Réglages › Données publiques (request_setup, target data).`
        )
      if (declinedIn(folder.id, m.id)) throw new ToolError(`The user already declined ${name} in this folder: carry on without it, and don’t propose it again.`)
      const off = s.added
      const watch = whenReady(m.id)
      const { decision } = await approvals
        .ask(
          folder.id,
          { action: 'add' },
          { kind: 'add', service: { code: m.id, off }, title: `${off ? 'Réactiver' : 'Ajouter'} ${name}`, reason, fields: offerFields(s) },
          { run: !!ctx.run, until: watch.done }
        )
        .finally(watch.stop)
      // Whatever the card says, the service must be on: adding is the user's act, never the card's answer.
      if (decision === 'accepted' && ready(m.id)) {
        const { asked, granted } = state(m.id)!.access
        const withheld = asked.filter((f) => !granted?.includes(f))
        const reads = !asked.length
          ? ''
          : withheld.length
            ? ` The user didn’t let it read ${withheld.join(', ')}: what needs it won’t work.`
            : ` It may read ${asked.join(', ')}.`
        return `The user ${off ? `switched ${name} back on` : `added ${name}`}.${reads} Its tools reach you in a new turn, which Marianne starts herself as soon as this one ends: end your answer now, in one short sentence, without asking the user anything.`
      }
      // Locked meanwhile, the session's list is gone, and so is the card that says it.
      if (session.unlocked) declined.set(folder.id, (declined.get(folder.id) ?? new Set()).add(m.id))
      throw new ToolError(
        `${decision === 'expired' ? 'No answer from the user' : `The user didn’t ${off ? 'switch it back on' : 'add it'}`}: carry on without ${name}, and don’t propose it again in this folder.`
      )
    }
  })
]
