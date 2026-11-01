import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { alwaysLabel, decide, givenLabel, offerFor, type ApprovalRequest, type Offer } from '../shared/approvals'
import type { ApprovalAnswer, ApprovalPart, ProgressPart, SetupPart } from '../shared/types'
import { accounts } from './account'
import { session } from './session'
import { tasks } from './tasks'

/**
 * Cards the engine puts in a folder's conversation: things that need the user's yes (a change
 * to the profile, a form to fill, a consequential step online) — the tool call waits for the
 * answer — links to a settings page, and progress of a task in the built-in browser. The chat
 * runner inserts them into the answer being written; the user answers from the window.
 *
 * Whether an action needs a card is the approval policy's to say (shared/approvals.ts): what the
 * user allowed ahead goes without one, and still shows in the conversation, as a line.
 */

export type Decision = 'accepted' | 'refused' | 'expired'

type Card = Omit<ApprovalPart, 'type' | 'id' | 'status'>

const WAIT_MS = 14 * 60_000

interface Pending {
  folderId: string
  part: ApprovalPart
  /** The standing permission the card offers with « toujours… »: the one kept if the user chooses it. */
  offer: Offer | null
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
  /** The sites each folder went to without a card, whose line is shown: once a site, not at every page read there. */
  private lines = new Map<string, Set<string>>()
  /** Whether a folder has an answer being written (set by the chat runner). */
  canShow: (folderId: string) => boolean = () => false

  constructor() {
    super()
    session.on('locked', () => this.lines.clear())
  }

  /**
   * Whether an action may go, as the approval policy decides from the account's level, its standing
   * permissions and the floor. Allowed ahead, it goes at once and shows as a line (`ahead`); otherwise
   * a card asks, offering « toujours… » when the action can be allowed ahead, and `onCard` is told
   * before it shows. A planned task's run (`run`, or the folder's) gets neither: no. Neither does a
   * line that can't be shown: nothing goes out of the user's sight.
   */
  async ask(
    folderId: string | undefined,
    request: ApprovalRequest,
    card: Omit<Card, 'action' | 'always' | 'given'>,
    options: { run?: boolean; onCard?: () => void } = {}
  ): Promise<{ decision: Decision; ahead: boolean }> {
    const run = !!options.run || !!tasks.runningIn(folderId)
    const verdict = decide(request, accounts.settings().approvals, run)
    switch (verdict.by) {
      case 'run':
        return { decision: 'expired', ahead: false }
      case 'folder':
        return { decision: 'accepted', ahead: false }
      case 'rule':
      case 'level':
        return {
          decision: this.given(folderId, request, { ...card, action: request.action, given: givenLabel(verdict) }) ? 'accepted' : 'expired',
          ahead: true
        }
      case 'card': {
        const offer = offerFor(request)
        options.onCard?.()
        const decision = await this.request(folderId, { ...card, action: request.action, ...(offer ? { always: alwaysLabel(offer) } : {}) }, offer)
        return { decision, ahead: false }
      }
    }
  }

  /** Show a card and wait for the user's decision; `offer`: the standing permission its « toujours… » gives. */
  request(folderId: string | undefined, card: Card, offer: Offer | null = null): Promise<Decision> {
    // Nobody watches a planned task's run: no card shows there. Its tools refuse before asking; this holds if one didn't.
    if (!folderId || !this.canShow(folderId) || tasks.runningIn(folderId)) return Promise.resolve('expired')
    const part: ApprovalPart = { ...card, type: 'approval', id: randomUUID(), status: 'pending' }
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.settle(part.id, 'expired'), WAIT_MS)
      this.pending.set(part.id, { folderId, part, offer, resolve, timer, started: Date.now() })
      this.emit('part', folderId, part)
    })
  }

  respond(id: string, answer: ApprovalAnswer): void {
    const p = this.pending.get(id)
    if (!p) return
    // The standing permission kept is the one the card offered, never one the window would name.
    const kept = answer === 'always' && !!p.offer
    if (kept) this.keep(p.offer!)
    this.settle(id, answer === 'approve' || answer === 'always' ? 'accepted' : 'refused', kept)
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

  /** Réglages › Autorisations, « retirer »: the standing permission goes, for the actions to come. */
  removeRule(id: string): void {
    const { rules } = accounts.settings().approvals
    accounts.updateSettings({ approvals: { rules: rules.filter((r) => r.id !== id) } })
  }

  /** A standing permission the user gave on a card: kept in the account's settings until they take it back. */
  private keep(offer: Offer): void {
    const { rules } = accounts.settings().approvals
    if (rules.some((r) => r.action === offer.action && r.site === offer.site)) return
    accounts.updateSettings({ approvals: { rules: [...rules, { id: randomUUID(), ...offer, at: new Date().toISOString() }] } })
  }

  /** The line of an action allowed ahead; going to a site shows once a site and folder. False when it can't be shown. */
  private given(folderId: string | undefined, request: ApprovalRequest, line: Card): boolean {
    if (!folderId || !this.canShow(folderId)) return false
    if (request.action === 'online') {
      const shown = this.lines.get(folderId) ?? new Set<string>()
      if (shown.has(request.site)) return true
      this.lines.set(folderId, shown.add(request.site))
    }
    this.emit('part', folderId, { ...line, type: 'approval', id: randomUUID(), status: 'accepted' } satisfies ApprovalPart)
    return true
  }

  private settle(id: string, decision: Decision, kept = false): void {
    const p = this.pending.get(id)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(id)
    this.waited.set(p.folderId, (this.waited.get(p.folderId) ?? 0) + Date.now() - p.started)
    p.part.status = decision
    // Answered, the card says « toujours… » only if that is what the user chose.
    if (!kept) delete p.part.always
    this.emit('update', p.folderId, p.part)
    p.resolve(decision)
  }
}

export const approvals = new Approvals()
