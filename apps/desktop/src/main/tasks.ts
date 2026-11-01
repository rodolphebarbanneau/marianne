import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { TaskEvery } from '@marianne/sdk'
import { addEvery, dayOf, dayStart, nextDay } from '../shared/tasks'
import type { DomainId, EngineId, PlannedTask, TaskOrigin, TaskOutcome, TaskRun, TaskRunner, TaskTemplate } from '../shared/types'
import { configStore } from './config'
import { folders } from './folders'
import { log } from './log'
import { session } from './session'

/**
 * Planned tasks: a folder that comes back. Between two runs its folder sleeps in « en veille »; on
 * its day it wakes, and either Marianne does the work in it (« Marianne vérifie ») or the folder
 * simply comes back with the reminder (« rappel »). A task has a day and no time of day: it needs
 * the archive open, so it runs at the first opening of its day (shared/tasks.ts).
 *
 * One at a time, and never during a turn of the user's: there is one browser, and a run must not
 * take it from them; their turn interrupts it. Locked or interrupted, a run is forgotten and comes
 * back at the next opening.
 *
 * Nobody watches a run, so it can't escalate: no card, no hand-over, its own sites and no other, and
 * of the app's tools only those that read or move through a page. Whatever is beyond that is refused
 * and the run reports « waiting ». What a page says can't get more than that out of it.
 */

const KIND = 'task'
/** Enough to show a rhythm; the conversation keeps the rest. */
const RUNS_KEPT = 40
const TICK_MS = 5 * 60_000
/** After the opening, once the services and the engines are there. */
const AFTER_UNLOCK_MS = 15_000
/** Each run spends the user's engine: a bad day doesn't spend it without end. */
const MAX_RUNS_A_DAY = 12
/** An awake task folder the user has read goes back to sleep after this long. */
const BACK_TO_SLEEP_MS = 86_400_000
/** What a run may do beyond reading: move through a page and say how it went. */
const RUN_TOOLS = new Set(['open_site', 'click', 'type_text', 'task_progress', 'task_report'])
/**
 * The app's reading tools a run may use, by name: its page, and what stays on this computer without
 * the user's data. Not their profile, deadlines or documents, which have no business near a page
 * nobody watches, nor a tool that asks a service elsewhere: its query would leave by a host the sheet
 * doesn't list. A new tool stays out of runs until it is named here.
 */
const RUN_READS = new Set(['read_page', 'read_form', 'skill', 'procedure', 'procedures', 'public_sites', 'compute_deadline'])
/** Where the day's runs are counted, interrupted ones included: a restart doesn't give the day new ones. */
const TRIES = 'task-tries'

/** The user's turn took over: the run leaves no trace, and stays due. */
export class RunInterrupted extends Error {
  override name = 'RunInterrupted'
}

/** How a run ended, as its engine turn tells it. */
export interface TaskTurnEnd {
  outcome: TaskOutcome
  /** French, one line. */
  text?: string
  /** The run said so itself (task_report), rather than the runner concluding for it. */
  reported?: boolean
}

/** What a task is made of, before it has a folder and a day. */
export interface NewTask {
  title: string
  domain: DomainId | ''
  runner: TaskRunner
  origin: TaskOrigin
  every: TaskEvery
  everyLabel: string
  entity?: PlannedTask['entity']
  instruction?: string
  sites?: string[]
  allows?: string[]
  never?: string
  why?: string
  /** A service's task: what Marianne offers once a run found something, from its template. */
  followUp?: PlannedTask['followUp']
  notify?: PlannedTask['notify']
  /** Its first day; by default the next time Marianne opens for a check, and one period away for a reminder. */
  first?: string
  /** The folder it comes back in: a conversation that planned it. None: a new one. */
  folderId?: string
  engine?: EngineId
}

/**
 * A service's task the user may still plan: among what the built-in services that are on propose
 * (`templates`), and not planned yet: what the user has taken is no longer proposed. The Démarches
 * sheet and task_propose both start here.
 */
export function offeredTemplate(templates: TaskTemplate[], planned: PlannedTask[], service: string, id: string): TaskTemplate | null {
  const taken = planned.some((t) => t.origin.kind === 'service' && t.origin.service === service && t.origin.template === id)
  return taken ? null : (templates.find((t) => t.service === service && t.id === id) ?? null)
}

/**
 * A service's template as a task, at one of its rhythms (an index): its instruction, sites, entity,
 * what it allows and what it never does, and its follow-up, come from the service, never from the
 * window or the engine. Null for a rhythm it doesn't offer.
 */
export function templateTask(template: TaskTemplate, rhythm: number): NewTask | null {
  // An index only: the window's request is data, and an array has more keys than its rhythms.
  const chosen = Number.isInteger(rhythm) ? template.rhythms[rhythm] : undefined
  if (!chosen) return null
  return {
    title: template.title,
    domain: template.domain,
    runner: 'marianne',
    origin: { kind: 'service', service: template.service, template: template.id },
    every: chosen.every,
    everyLabel: chosen.label,
    entity: template.entity,
    instruction: template.instruction,
    sites: template.sites,
    allows: template.allows,
    never: template.never,
    why: chosen.note,
    ...(template.followUp ? { followUp: { label: template.followUp.label, instruction: template.followUp.instruction } } : {})
  }
}

/** The title of the folder a task makes for itself: its own, and what it is about. */
const folderTitle = (title: string, entity: PlannedTask['entity']) => (entity ? `${title} · ${entity.label}` : title)

/** Whether two lists of sites hold the same sites, in any order. */
const sameSites = (a: string[], b: string[]) => [...a].sort().join(' ') === [...b].sort().join(' ')

/**
 * A service's task as its template says it now: its follow-up, its instruction, what it never does,
 * which an update of the service may have changed since the user planned it (a task planned before
 * follow-ups existed has none), and what it is about as the service names it now, when it is still
 * the same one (a plate the user corrected: its runs and follow-ups type that one). Never its sites:
 * what its runs reach stays what the user saw on the sheet; what it allows, which names them, only
 * while the template lists those same sites. Null when nothing changed.
 */
export function refreshedTask(task: PlannedTask, template: TaskTemplate): PlannedTask | null {
  const followUp = template.followUp ? { label: template.followUp.label, instruction: template.followUp.instruction } : undefined
  const entity = task.entity && template.entity?.id === task.entity.id ? { id: task.entity.id, label: template.entity.label } : task.entity
  const allows = sameSites(task.sites, template.sites) ? template.allows : task.allows
  const same =
    task.instruction === template.instruction &&
    JSON.stringify(task.allows) === JSON.stringify(allows) &&
    task.never === template.never &&
    JSON.stringify(task.followUp) === JSON.stringify(followUp) &&
    task.entity?.label === entity?.label
  if (same) return null
  const fresh: PlannedTask = { ...task, entity, instruction: template.instruction, allows, never: template.never, followUp }
  if (!followUp) delete fresh.followUp
  return fresh
}

/**
 * Whether a task's sites include an address: https, on a listed host or under it. Not by
 * registrable domain: the sheet says mairie.github.io, not all of github.io.
 */
export function siteAllowed(task: Pick<PlannedTask, 'sites'>, url: string): boolean {
  let u: URL
  try {
    u = new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  return task.sites.some((site) => {
    const listed = site.toLowerCase()
    // « www.x » on a sheet is that site, with or without its www: not every other host under x.
    return host === listed || host === listed.replace(/^www\./, '') || host.endsWith(`.${listed}`)
  })
}

class Tasks extends EventEmitter {
  /** Runs a task's engine turn, set by the chat runner. */
  runTurn: (task: PlannedTask, line: string) => Promise<TaskTurnEnd> = () => Promise.reject(new Error('Aucun moteur.'))
  /** A turn is running: the user's, or another's. Set by the chat runner. */
  isBusy: () => boolean = () => false
  /** Adds the reminder's line to the folder. Set by the chat runner. */
  addLine: (folderId: string, text: string, outcome: TaskOutcome) => void = () => {}
  /**
   * Whether what a task relies on is still there: a service switched off, a plate taken back; among
   * `templates` when given (what the services propose, read once for many tasks). Set by the chat runner.
   */
  isOffered: (task: PlannedTask, templates?: TaskTemplate[]) => boolean = () => true
  /** The task whose follow-up the user started the turn under way in a folder with, until that turn ends. Set by the chat runner. */
  followingUp: (folderId: string | undefined) => PlannedTask | null = () => null
  /** What the built-in services that are on propose now. Set by the chat runner. */
  templates: () => TaskTemplate[] = () => []

  /** The folder of the run under way, and its task. */
  private current: PlannedTask | null = null
  /** What the run under way said of itself (the `task_report` tool). */
  private report: TaskTurnEnd | null = null
  private ticking = false
  private started = false
  /** The tasks whose template's sites differ from theirs, said once in the log. */
  private moved = new Set<string>()

  get(id: string): PlannedTask | null {
    return session.unlocked ? session.archive.get<PlannedTask>(KIND, id) : null
  }

  list(): PlannedTask[] {
    return session.unlocked ? session.archive.list<PlannedTask>(KIND).sort((a, b) => a.next.localeCompare(b.next)) : []
  }

  byFolder(folderId: string): PlannedTask | null {
    return this.list().find((t) => t.folderId === folderId) ?? null
  }

  /** The tasks as the window gets them: each with whether what it relies on is still there (`offered`). */
  listed(): PlannedTask[] {
    const templates = this.templates()
    return this.list().map((t) => ({ ...t, offered: this.isOffered(t, templates) }))
  }

  /**
   * Each service's task takes what its template says now (refreshedTask), when its service still
   * proposes it: a task planned before an update keeps none of the old words, nor misses a follow-up,
   * nor types a plate the user has since corrected. Its sites stay its own; a template that lists
   * others is said in the log.
   */
  refresh(templates = this.templates()): void {
    for (const task of this.list()) {
      const { origin } = task
      if (origin.kind !== 'service') continue
      const template = templates.find((t) => t.service === origin.service && t.id === origin.template)
      if (!template) continue
      const fresh = refreshedTask(task, template)
      if (fresh) this.put(fresh)
      // Its folder, named after the plate it was planned with, takes the new one: the old one is no longer
      // the profile's, so nothing would mask it. A title the user gave stays theirs.
      if (fresh && fresh.entity?.label !== task.entity?.label) {
        const folder = folders.get(task.folderId)
        if (folder?.title === folderTitle(task.title, task.entity)) folders.update(folder.id, { title: folderTitle(task.title, fresh.entity) })
      }
      if (!sameSites(template.sites, task.sites) && !this.moved.has(task.id)) {
        this.moved.add(task.id)
        log.warn(`Task ${origin.template} of 3615 ${origin.service.toUpperCase()}: its template lists other sites; it keeps those its sheet showed.`)
      }
    }
  }

  private put(task: PlannedTask): PlannedTask {
    session.archive.put(KIND, task.id, task)
    this.emit('change')
    return task
  }

  create(input: NewTask): PlannedTask {
    const today = dayOf()
    const engine = input.engine ?? configStore.get().engines.default
    const title = folderTitle(input.title, input.entity)
    const folder = input.folderId ? folders.get(input.folderId) : folders.create({ title, engine, domain: input.domain || undefined })
    if (!folder) throw new Error('Dossier introuvable.')
    if (folder.task) throw new Error('Ce dossier a déjà sa tâche planifiée.')
    const id = randomUUID()
    const next = input.first ?? (input.runner === 'remind' ? nextDay({ next: today, every: input.every }, today) : today)
    const task: PlannedTask = {
      id,
      folderId: folder.id,
      domain: input.domain,
      title: input.title,
      runner: input.runner,
      origin: input.origin,
      every: input.every,
      everyLabel: input.everyLabel,
      entity: input.entity,
      instruction: input.instruction,
      sites: input.sites ?? [],
      allows: input.allows,
      never: input.never,
      why: input.why,
      ...(input.followUp ? { followUp: input.followUp } : {}),
      notify: input.notify ?? 'found',
      next,
      anchor: next,
      on: true,
      runs: []
    }
    folders.update(folder.id, { task: id })
    this.sleep(task)
    return this.put(task)
  }

  /** Its rhythm or how it tells the user. */
  update(id: string, patch: Partial<Pick<PlannedTask, 'every' | 'everyLabel' | 'why' | 'notify'>>): PlannedTask {
    const task = this.get(id)
    if (!task) throw new Error('Tâche introuvable.')
    const rhythm = patch.every && (patch.every.unit !== task.every.unit || patch.every.n !== task.every.n) ? patch.every : null
    if (!rhythm) return this.put({ ...task, ...patch })
    // The reason given was for the old rhythm, and the next day counts from the last run in the new one.
    const last = task.runs[task.runs.length - 1]
    const today = dayOf()
    // A check not yet run still checks at once; a reminder counts from today.
    const counted = last || task.runner === 'remind' ? addEvery(last ? dayOf(new Date(last.at)) : today, rhythm) : task.next
    const next = counted < today ? today : counted
    const changed = this.put({ ...task, ...patch, why: undefined, next, anchor: next })
    if (folders.get(task.folderId)?.snoozedUntil) this.sleep(changed)
    return changed
  }

  /** Paused, its folder goes to « classés »; taken up again, it sleeps until its day. */
  setOn(id: string, on: boolean): PlannedTask {
    const task = this.get(id)
    if (!task) throw new Error('Tâche introuvable.')
    const next = this.put({ ...task, on, next: on && task.next < dayOf() ? dayOf() : task.next })
    if (!on) folders.settle(task.folderId, true)
    else {
      folders.settle(task.folderId, false)
      this.sleep(next)
    }
    return next
  }

  /** The task goes; its folder stays, a conversation like any other. */
  remove(id: string): void {
    const task = this.get(id)
    if (!task) return
    session.archive.remove(KIND, id)
    if (folders.get(task.folderId)) folders.update(task.folderId, { task: undefined, snoozedUntil: '' })
    this.emit('change')
  }

  /** The folder was deleted: its task goes with it. */
  forgetFolder(folderId: string): void {
    const task = this.byFolder(folderId)
    if (!task) return
    session.archive.remove(KIND, task.id)
    this.emit('change')
  }

  /** The folder sleeps until the task's day; on that day, or past it, it stays awake for the run. */
  private sleep(task: PlannedTask): void {
    if (!folders.get(task.folderId)) return
    if (task.on && task.next > dayOf()) folders.update(task.folderId, { snoozedUntil: dayStart(task.next) })
  }

  // ---------------------------------------------------------------- the run under way

  /** The task running in a folder, while it does. */
  runningIn(folderId: string | undefined): PlannedTask | null {
    return folderId && this.current?.folderId === folderId ? this.current : null
  }

  /** Whether a tool may be called in a folder: anything outside a run; in one, what reads or moves through a page, and its own service's tools. */
  mayUse(folderId: string | undefined, tool: { name: string; readOnly?: boolean }, own: boolean): boolean {
    const task = this.runningIn(folderId)
    if (!task) return true
    if (own) return RUN_TOOLS.has(tool.name) || RUN_READS.has(tool.name)
    return task.origin.kind === 'service' && tool.name.startsWith(`${task.origin.service}_`)
  }

  /** The engine's own account of the run: `task_report`. */
  reportRun(end: TaskTurnEnd): void {
    this.report = end
  }

  /** What the run under way reported, once. */
  takeReport(): TaskTurnEnd | null {
    const report = this.report
    this.report = null
    return report
  }

  /** Run a task now, whatever its day: « lancer maintenant ». */
  async runNow(id: string): Promise<void> {
    // As before a scheduled run: the task as its template says it now.
    this.refresh()
    const task = this.get(id)
    if (!task) throw new Error('Tâche introuvable.')
    if (!task.on) throw new Error('Cette tâche est en pause.')
    if (this.current || this.isBusy()) throw new Error('Marianne est déjà au travail : réessayez dans un instant.')
    if (!this.isOffered(task)) throw new Error('Ce que cette tâche utilise n’est plus disponible.')
    await this.run(task)
  }

  private async run(task: PlannedTask): Promise<void> {
    const started = new Date()
    const today = dayOf(started)
    const line = `${started.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · tâche planifiée`
    this.current = task
    this.report = null
    if (task.runner === 'marianne') session.archive.put(TRIES, 'day', { day: today, count: this.triesToday(today) + 1 })
    this.emit('change')
    let end: TaskTurnEnd
    try {
      if (task.runner === 'remind') {
        end = { outcome: 'done', text: task.title }
        this.addLine(task.folderId, `${line} · rappel : ${task.title}`, 'done')
      } else end = await this.runTurn(task, line)
    } catch (err) {
      if (err instanceof RunInterrupted) {
        this.emit('change')
        return
      }
      end = { outcome: 'failed', text: (err as Error).message }
    } finally {
      this.current = null
    }
    // Locked meanwhile: nothing can be written, and the task is still due at the next opening.
    if (!session.unlocked) return
    const latest = this.get(task.id)
    if (!latest) return
    const run: TaskRun = {
      at: started.toISOString(),
      outcome: end.outcome,
      text: end.text,
      ...(end.reported ? { reported: true } : {}),
      ...(latest.next < today ? { due: latest.next } : {})
    }
    // Run before its day, with « lancer maintenant », it keeps that day: its next occurrence isn't spent.
    const next = this.put({ ...latest, next: latest.next > today ? latest.next : nextDay(latest, today), runs: [...latest.runs, run].slice(-RUNS_KEPT) })
    // Paused while it ran: its folder stays where the user filed it, and nobody is told.
    if (!next.on) return
    const folder = folders.get(task.folderId)
    if (folder) {
      if (end.outcome !== 'nothing') folders.update(task.folderId, { woke: true, seen: false, snoozedUntil: '', settledAt: '' })
      // Nothing to tell: what the user hadn't read yet stays awake.
      else if (folder.seen && !folder.woke) this.sleep(next)
    }
    if (end.outcome !== 'nothing' || next.notify === 'always') this.emit('run', next, run)
  }

  // ---------------------------------------------------------------- the clock

  /** Runs today, Marianne's: reminders cost nothing. */
  private spentToday(today: string): number {
    const recorded = this.list().reduce((n, t) => n + (t.runner === 'marianne' ? t.runs.filter((r) => dayOf(new Date(r.at)) === today).length : 0), 0)
    return Math.max(recorded, this.triesToday(today))
  }

  /** Runs started today, recorded or not, counted in the archive: a restart doesn't give the day new ones. */
  private triesToday(today: string): number {
    const tries = session.unlocked ? session.archive.get<{ day: string; count: number }>(TRIES, 'day') : null
    return tries?.day === today ? tries.count : 0
  }

  /** Task folders the user has read go back to sleep rather than stay in the way until the next run. */
  private settleBack(now: number): void {
    for (const task of this.list()) {
      if (!task.on || task.next <= dayOf(new Date(now))) continue
      const folder = folders.get(task.folderId)
      if (!folder || folder.snoozedUntil || folder.settledAt || folder.pinned || !folder.seen || folder.woke || folders.isRunning(folder.id)) continue
      if (now - Date.parse(folder.updatedAt) >= BACK_TO_SLEEP_MS) this.sleep(task)
    }
  }

  /** Run what is due, oldest first, while the user isn't using Marianne's engine or browser. */
  async tick(now = new Date()): Promise<void> {
    if (this.ticking || !session.unlocked) return
    this.ticking = true
    try {
      // Before anything runs: a service's task runs, and offers its follow-up, as its template says now.
      this.refresh()
      this.settleBack(now.getTime())
      const today = dayOf(now)
      for (const { id } of this.list().filter((t) => t.on && t.next <= today)) {
        if (!session.unlocked || this.current || this.isBusy()) break
        // Read again: a run takes time, and the user may have paused or removed this one meanwhile.
        const task = this.get(id)
        if (!task?.on || task.next > today || !this.isOffered(task)) continue
        if (task.runner === 'marianne' && this.spentToday(today) >= MAX_RUNS_A_DAY) continue
        await this.run(task)
      }
    } catch (err) {
      log.warn('Planned tasks:', (err as Error).message)
    } finally {
      this.ticking = false
    }
  }

  /** Called once by the app: at each opening, then every few minutes while it stays open. */
  start(): void {
    if (this.started) return
    this.started = true
    session.on('unlocked', () => setTimeout(() => void this.tick(), AFTER_UNLOCK_MS).unref())
    setInterval(() => void this.tick(), TICK_MS).unref()
  }
}

export const tasks = new Tasks()
