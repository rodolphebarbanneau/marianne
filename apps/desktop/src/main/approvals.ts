import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { ApprovalPart, ProgressPart, SetupPart } from '../shared/types'

/**
 * Cards the engine puts in a folder's conversation: things that need the user's yes (a change
 * to the profile, a form to fill, a consequential step online) — the tool call waits for the
 * answer — links to a settings page, and progress of a task in the built-in browser. The chat
 * runner inserts them into the answer being written; the user answers from the window.
 */

export type Decision = 'accepted' | 'refused' | 'expired'

const WAIT_MS = 14 * 60_000

interface Pending {
  folderId: string
  part: ApprovalPart
  resolve: (d: Decision) => void
  timer: NodeJS.Timeout
  started: number
}

class Approvals extends EventEmitter {
  private pending = new Map<string, Pending>()
  /** Time each folder's turn spent waiting for answers, cards settled so far. */
  private waited = new Map<string, number>()
  /** Other waits for the user in progress (a hand-over in the browser): their start, by folder. */
  private holds = new Map<string, Set<number>>()
  /** Whether a folder has an answer being written (set by the chat runner). */
  canShow: (folderId: string) => boolean = () => false

  /** Show a card and wait for the user's decision. */
  request(folderId: string | undefined, card: Omit<ApprovalPart, 'type' | 'id' | 'status'>): Promise<Decision> {
    if (!folderId || !this.canShow(folderId)) return Promise.resolve('expired')
    const part: ApprovalPart = { ...card, type: 'approval', id: randomUUID(), status: 'pending' }
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.settle(part.id, 'expired'), WAIT_MS)
      this.pending.set(part.id, { folderId, part, resolve, timer, started: Date.now() })
      this.emit('part', folderId, part)
    })
  }

  respond(id: string, accepted: boolean): void {
    this.settle(id, accepted ? 'accepted' : 'refused')
  }

  /** A turn ended or was cancelled: its open cards expire. */
  expire(folderId: string): void {
    for (const [id, p] of this.pending) if (p.folderId === folderId) this.settle(id, 'expired')
    this.waited.delete(folderId)
  }

  /** How long the folder's turn has waited for the user (it doesn't count in its time limit). */
  waitedMs(folderId: string | undefined): number {
    if (!folderId) return 0
    let total = this.waited.get(folderId) ?? 0
    for (const p of this.pending.values()) if (p.folderId === folderId) total += Date.now() - p.started
    for (const started of this.holds.get(folderId) ?? []) total += Date.now() - started
    return total
  }

  /** Wait for the user some other way than a card (a hand-over): that time doesn't count in the turn's limit either. */
  async hold<T>(folderId: string, wait: Promise<T>): Promise<T> {
    const started = Date.now()
    const holds = this.holds.get(folderId) ?? new Set<number>()
    this.holds.set(folderId, holds.add(started))
    try {
      return await wait
    } finally {
      holds.delete(started)
      this.waited.set(folderId, (this.waited.get(folderId) ?? 0) + Date.now() - started)
    }
  }

  setup(folderId: string | undefined, card: Omit<SetupPart, 'type'>): boolean {
    if (!folderId || !this.canShow(folderId)) return false
    this.emit('part', folderId, { ...card, type: 'setup' } satisfies SetupPart)
    return true
  }

  /** Show or update the progress card of a browser task (same id = same card). */
  progress(folderId: string | undefined, part: Omit<ProgressPart, 'type'>): void {
    if (!folderId || !this.canShow(folderId)) return
    this.emit('progress', folderId, { ...part, type: 'progress' } satisfies ProgressPart)
  }

  private settle(id: string, decision: Decision): void {
    const p = this.pending.get(id)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(id)
    this.waited.set(p.folderId, (this.waited.get(p.folderId) ?? 0) + Date.now() - p.started)
    p.part.status = decision
    this.emit('update', p.folderId, p.part)
    p.resolve(decision)
  }
}

export const approvals = new Approvals()
