import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { ChatMessage, EngineId, Folder, FolderStatus, FolderSummary } from '../shared/types'
import { content } from './content'
import { session } from './session'

/**
 * Folders: one folder = one conversation, a unit of work (a branch and its pull request). Each
 * is two records in the archive: 'folder' (what the sidebar shows) and 'messages'.
 *
 * Lifecycle, after T3 Code: pinned folders stay on top and are never settled automatically;
 * a snoozed folder ("en veille") comes back on its date; a folder is settled ("classé") by hand,
 * when its procedure's last step is done, or after AUTO_SETTLE_DAYS without activity if it
 * follows no procedure. A new message reopens it.
 */

export const AUTO_SETTLE_DAYS = 7
const DAY = 86_400_000

const KIND = 'folder'
const MESSAGES = 'messages'

const now = () => new Date().toISOString()

/** The last user line, as a title until the engine proposes one. */
export function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line || 'Nouveau dossier'
}

export function statusOf(folder: Folder, messages: ChatMessage[], running: boolean): FolderStatus {
  if (running) return 'working'
  const last = [...messages].reverse().find((m) => m.role === 'assistant')
  if (last?.parts.some((p) => p.type === 'approval' && p.status === 'pending')) return 'approval'
  if (last?.status === 'error') return 'failed'
  if (folder.woke) return 'woke'
  if (last && !folder.seen) return 'done'
  return 'idle'
}

/**
 * The message an answer is redone from: the last of the user's, unless a planned task's run came
 * after it, which redoing would wipe; then -1.
 */
export function redoFrom(messages: ChatMessage[]): number {
  const last = messages.map((m) => m.role).lastIndexOf('user')
  return messages.slice(last + 1).some((m) => m.note === 'task') ? -1 : last
}

/** Whether a folder should be settled now, by the automatic rule. */
export function shouldAutoSettle(folder: Folder, status: FolderStatus, at = Date.now()): boolean {
  if (folder.settledAt || folder.pinned || folder.keepOpen || folder.procedure || folder.snoozedUntil || folder.task) return false
  if (status === 'working' || status === 'approval') return false
  return at - Date.parse(folder.updatedAt) >= AUTO_SETTLE_DAYS * DAY
}

class Folders extends EventEmitter {
  /** Running turns, set by the chat runner. */
  isRunning: (id: string) => boolean = () => false
  /** The summary line under a folder's title ("étape 3 sur 5 · avant le 28/05"), set by the app. */
  describe: (folder: Folder) => string = () => ''

  get(id: string): Folder | null {
    return session.archive.get<Folder>(KIND, id)
  }

  messages(id: string): ChatMessage[] {
    return session.archive.get<ChatMessage[]>(MESSAGES, id) ?? []
  }

  create(options: { title: string; engine: EngineId; procedure?: string; domain?: Folder['domain'] }): Folder {
    const at = now()
    const folder: Folder = {
      id: randomUUID(),
      title: options.title,
      domain: options.domain ?? '',
      procedure: options.procedure ?? '',
      stepsDone: [],
      pinned: false,
      snoozedUntil: '',
      settledAt: '',
      engine: options.engine,
      sessions: {},
      createdAt: at,
      updatedAt: at,
      seen: true,
      woke: false,
      keepOpen: false
    }
    session.archive.put(KIND, folder.id, folder)
    session.archive.put(MESSAGES, folder.id, [])
    this.changed(folder.id)
    return folder
  }

  update(id: string, patch: Partial<Folder>): Folder {
    const folder = this.get(id)
    if (!folder) throw new Error('Dossier introuvable.')
    const next = { ...folder, ...patch, id }
    session.archive.put(KIND, id, next)
    this.changed(id)
    return next
  }

  /** Save the conversation; a new user message reopens a settled or snoozed folder. */
  saveMessages(id: string, messages: ChatMessage[], options: { touched?: boolean } = {}): void {
    session.archive.put(MESSAGES, id, messages)
    const folder = this.get(id)
    if (folder && options.touched) {
      this.update(id, { updatedAt: now(), settledAt: '', snoozedUntil: '', woke: false, keepOpen: false })
      return
    }
    this.changed(id)
  }

  remove(id: string): void {
    session.archive.remove(KIND, id)
    session.archive.remove(MESSAGES, id)
    this.emit('list')
  }

  markSeen(id: string): void {
    const folder = this.get(id)
    if (folder && (!folder.seen || folder.woke)) this.update(id, { seen: true, woke: false })
  }

  pin(id: string, pinned: boolean): void {
    this.update(id, { pinned, ...(pinned ? { settledAt: '' } : {}) })
  }

  snooze(id: string, until: string): void {
    this.update(id, { snoozedUntil: until, settledAt: '' })
  }

  settle(id: string, settled: boolean): void {
    this.update(id, settled ? { settledAt: now(), snoozedUntil: '', keepOpen: false } : { settledAt: '', keepOpen: true })
  }

  /** A step of the folder's procedure, done or not; the last one done settles the folder. */
  setStep(id: string, step: number, done: boolean): Folder | null {
    const folder = this.get(id)
    if (!folder) return null
    const stepsDone = done ? [...new Set([...folder.stepsDone, step])].sort((a, b) => a - b) : folder.stepsDone.filter((s) => s !== step)
    const total = folder.procedure ? (content.procedure(folder.procedure)?.steps.length ?? 0) : 0
    const finished = total > 0 && stepsDone.length >= total && !folder.pinned
    return this.update(id, { stepsDone, ...(finished ? { settledAt: now() } : {}) })
  }

  /**
   * Every folder for the sidebar. Applies the clock first: snoozed folders whose date has come
   * wake up, idle ones get settled.
   */
  list(): FolderSummary[] {
    const archive = session.archive
    const at = Date.now()
    const out: FolderSummary[] = []
    for (const folder of archive.list<Folder>(KIND)) {
      let f = folder
      // A task's folder wakes by its run, which may find nothing to wake it for.
      if (f.snoozedUntil && !f.task && Date.parse(f.snoozedUntil) <= at) {
        f = { ...f, snoozedUntil: '', woke: true, seen: false }
        archive.put(KIND, f.id, f)
      }
      const messages = this.messages(f.id)
      const status = statusOf(f, messages, this.isRunning(f.id))
      if (shouldAutoSettle(f, status, at)) {
        f = { ...f, settledAt: new Date(at).toISOString() }
        archive.put(KIND, f.id, f)
      }
      out.push({
        id: f.id,
        title: f.title,
        domain: f.domain,
        pinned: f.pinned,
        snoozedUntil: f.snoozedUntil,
        settledAt: f.settledAt,
        engine: f.engine,
        status,
        updatedAt: f.updatedAt,
        meta: this.describe(f),
        unread: !f.seen,
        task: f.task
      })
    }
    return out.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
  }

  private changed(id: string): void {
    this.emit('folder', id)
    this.emit('list')
  }
}

export const folders = new Folders()
