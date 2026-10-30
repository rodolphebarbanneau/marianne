import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { TaskEvery } from '@marianne/sdk'
import { addEvery, dayOf, dayStart, nextDay } from '../shared/tasks'
import type { DomainId, EngineId, PlannedTask, TaskOrigin, TaskOutcome, TaskRun, TaskRunner } from '../shared/types'
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
/** Reading tools a run has no need of: the user's documents have no business near a page nobody watches. */
const NOT_IN_A_RUN = new Set(['documents', 'read_document'])

/** The user's turn took over: the run leaves no trace, and stays due. */
export class RunInterrupted extends Error {
  override name = 'RunInterrupted'
}

/** How a run ended, as its engine turn tells it. */
export interface TaskTurnEnd {
  outcome: TaskOutcome
  /** French, one line. */
  text?: string
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
  notify?: PlannedTask['notify']
  /** Its first day; by default the next time Marianne opens for a check, and one period away for a reminder. */
  first?: string
  /** The folder it comes back in: a conversation that planned it. None: a new one. */
  folderId?: string
  engine?: EngineId
}

class Tasks extends EventEmitter {
  /** Runs a task's engine turn, set by the chat runner. */
  runTurn: (task: PlannedTask, line: string) => Promise<TaskTurnEnd> = () => Promise.reject(new Error('Aucun moteur.'))
  /** A turn is running: the user's, or another's. Set by the chat runner. */
  isBusy: () => boolean = () => false
  /** Adds the reminder's line to the folder. Set by the chat runner. */
  addLine: (folderId: string, text: string, outcome: TaskOutcome) => void = () => {}
  /** Whether what a task relies on is still there: a service switched off, a plate taken back. Set by the chat runner. */
  isOffered: (task: PlannedTask) => boolean = () => true

  /** The folder of the run under way, and its task. */
  private current: PlannedTask | null = null
  /** What the run under way said of itself (the `task_report` tool). */
  private report: TaskTurnEnd | null = null
  private ticking = false
  private started = false
  /** Runs started today by this account, recorded or not: a run the lock cut short still spent the engine. */
  private tries: { archive: unknown; day: string; count: number } = { archive: null, day: '', count: 0 }

  get(id: string): PlannedTask | null {
    return session.unlocked ? session.archive.get<PlannedTask>(KIND, id) : null
  }

  list(): PlannedTask[] {
    return session.unlocked ? session.archive.list<PlannedTask>(KIND).sort((a, b) => a.next.localeCompare(b.next)) : []
  }

  byFolder(folderId: string): PlannedTask | null {
    return this.list().find((t) => t.folderId === folderId) ?? null
  }

  private put(task: PlannedTask): PlannedTask {
    session.archive.put(KIND, task.id, task)
    this.emit('change')
    return task
  }

  create(input: NewTask): PlannedTask {
    const today = dayOf()
    const engine = input.engine ?? configStore.get().engines.default
    const title = input.entity ? `${input.title} · ${input.entity.label}` : input.title
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

  /**
   * Whether the run under way in a folder may reach an address: a listed host and what is under it.
   * Not by registrable domain: the sheet says mairie.github.io, not all of github.io.
   */
  allows(folderId: string, url: string): boolean {
    const task = this.runningIn(folderId)
    if (!task) return false
    let host: string
    try {
      host = new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase()
    } catch {
      return false
    }
    return task.sites.some((site) => {
      const listed = site.toLowerCase().replace(/^www\./, '')
      return host === listed || host.endsWith(`.${listed}`)
    })
  }

  /** Whether a tool may be called in a folder: anything outside a run; in one, what reads or moves through a page, and its own service's tools. */
  mayUse(folderId: string | undefined, tool: { name: string; readOnly?: boolean }, own: boolean): boolean {
    const task = this.runningIn(folderId)
    if (!task) return true
    if (own) return RUN_TOOLS.has(tool.name) || (!!tool.readOnly && !NOT_IN_A_RUN.has(tool.name))
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
    if (task.runner === 'marianne') this.tries = { archive: session.maybe, day: today, count: this.triesToday(today) + 1 }
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
    const run: TaskRun = { at: started.toISOString(), outcome: end.outcome, text: end.text, ...(latest.next < today ? { due: latest.next } : {}) }
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

  private triesToday(today: string): number {
    return this.tries.day === today && this.tries.archive === session.maybe ? this.tries.count : 0
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
