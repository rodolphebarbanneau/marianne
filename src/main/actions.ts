import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { ActionPart, SetupPart } from '../shared/types'

/**
 * Cards the agent puts in a conversation: proposals to accept or refuse (the tool call waits for
 * the answer), and links to configuration screens. The chat runner inserts them into the answer
 * being written; the user answers from the window.
 */

export type Decision = 'accepted' | 'refused' | 'expired'

const WAIT_MS = 14 * 60_000

interface Pending {
  conversationId: string
  part: ActionPart
  resolve: (d: Decision) => void
  timer: NodeJS.Timeout
  started: number
}

class Actions extends EventEmitter {
  private pending = new Map<string, Pending>()
  /** Time each conversation's turn spent waiting for answers, cards settled so far. */
  private waited = new Map<string, number>()
  /** Whether a conversation has an answer being written (set by the chat runner). */
  canShow: (conversationId: string) => boolean = () => false

  /** Show a card and wait for the user's decision. */
  request(conversationId: string | undefined, card: Omit<ActionPart, 'type' | 'id' | 'status'>): Promise<Decision> {
    if (!conversationId || !this.canShow(conversationId)) return Promise.resolve('expired')
    const part: ActionPart = { ...card, type: 'action', id: randomUUID(), status: 'pending' }
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.settle(part.id, 'expired'), WAIT_MS)
      this.pending.set(part.id, { conversationId, part, resolve, timer, started: Date.now() })
      this.emit('part', conversationId, part)
    })
  }

  respond(id: string, accepted: boolean): void {
    this.settle(id, accepted ? 'accepted' : 'refused')
  }

  /** A turn ended or was cancelled: its open cards expire. */
  expire(conversationId: string): void {
    for (const [id, p] of this.pending) if (p.conversationId === conversationId) this.settle(id, 'expired')
    this.waited.delete(conversationId)
  }

  /** How long the conversation's turn has waited for the user (it doesn't count in its time limit). */
  waitedMs(conversationId: string | undefined): number {
    if (!conversationId) return 0
    let total = this.waited.get(conversationId) ?? 0
    for (const p of this.pending.values()) if (p.conversationId === conversationId) total += Date.now() - p.started
    return total
  }

  setup(conversationId: string | undefined, card: Omit<SetupPart, 'type'>): boolean {
    if (!conversationId || !this.canShow(conversationId)) return false
    this.emit('part', conversationId, { ...card, type: 'setup' } satisfies SetupPart)
    return true
  }

  private settle(id: string, decision: Decision): void {
    const p = this.pending.get(id)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(id)
    this.waited.set(p.conversationId, (this.waited.get(p.conversationId) ?? 0) + Date.now() - p.started)
    p.part.status = decision
    this.emit('update', p.conversationId, p.part)
    p.resolve(decision)
  }
}

export const actions = new Actions()
