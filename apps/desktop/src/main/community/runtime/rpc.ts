import type { SandboxInvoke, SandboxKind } from '../../../shared/community'
import { logLine, MAX_REPLY_BYTES } from './limits'

/**
 * The main process's calls into a community service's sandbox: each request goes with an id,
 * its answer comes back by that id, and a request that isn't answered in time fails on its own
 * (the sandbox may be stuck: `onTimeout` lets its owner find out). When the sandbox is gone,
 * every request still waiting fails at once. What comes back is the service's: checked here, its
 * value a JSON text whose length is checked before it is read (MAX_REPLY_BYTES).
 */

/** How long each kind of request may take. */
export const TIMEOUTS: Record<SandboxKind, number> = {
  activate: 20_000,
  ping: 5_000,
  method: 30_000,
  tool: 60_000,
  tile: 10_000,
  summary: 10_000,
  today: 10_000,
  deadlines: 10_000
}

/** A request not answered in time (named Error still: its message is what the user reads). */
export class RpcTimeout extends Error {}

const MAX_MESSAGE = 2000

interface Waiting {
  kind: SandboxKind
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface RpcOptions {
  /** Sends a request to the sandbox (throws when it can't). */
  send: (message: SandboxInvoke) => void
  /** "3615 BONJOUR", for the errors the user may read. */
  label: string
  /** A request timed out. */
  onTimeout?: (kind: SandboxKind) => void
  timeouts?: Partial<Record<SandboxKind, number>>
}

export class SandboxRpc {
  private next = 1
  private readonly waiting = new Map<number, Waiting>()
  private closed: string | null = null

  constructor(private readonly opts: RpcOptions) {}

  /** The requests still waiting for their answer. */
  get pending(): number {
    return this.waiting.size
  }

  /** A request to the sandbox; its answer, or an error saying why there is none. */
  invoke(kind: SandboxKind, name: string, args: unknown[], timeoutMs = this.opts.timeouts?.[kind] ?? TIMEOUTS[kind]): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error(this.closed))
    const id = this.next++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.waiting.delete(id)) return
        reject(new RpcTimeout(`${this.opts.label} n’a pas répondu à temps.`))
        this.opts.onTimeout?.(kind)
      }, timeoutMs)
      this.waiting.set(id, { kind, resolve, reject, timer })
      try {
        this.opts.send({ id, kind, name, args })
      } catch {
        clearTimeout(timer)
        this.waiting.delete(id)
        reject(new Error(`${this.opts.label} n’a pas pu être appelé.`))
      }
    })
  }

  /** An answer from the sandbox: to a request still waiting, in the shape of a SandboxReply; anything else is dropped. */
  settle(id: unknown, reply: unknown): void {
    if (typeof id !== 'number') return
    const w = this.waiting.get(id)
    if (!w || typeof reply !== 'object' || reply === null) return
    const r = reply as { json?: unknown; error?: { name?: unknown; message?: unknown } }
    if ('error' in r) {
      // One line: the message is the service's, and goes to Marianne's log (a failing tile, a failed start) as well as to the user and the model.
      const e = new Error(typeof r.error?.message === 'string' ? logLine(r.error.message, MAX_MESSAGE) : `${this.opts.label} a échoué.`)
      // By name: the service's ToolError stays one, for the model to read.
      if (r.error?.name === 'ToolError') e.name = 'ToolError'
      this.finish(id, w)
      w.reject(e)
    } else if (typeof r.json === 'string') {
      this.finish(id, w)
      const max = w.kind === 'tool' ? MAX_REPLY_BYTES.tool : w.kind === 'tile' ? MAX_REPLY_BYTES.tile : MAX_REPLY_BYTES.other
      if (r.json.length > max) return w.reject(new Error(`${this.opts.label} : sa réponse est trop longue (${Math.round(max / 1024)} ko au plus).`))
      try {
        w.resolve(JSON.parse(r.json))
      } catch {
        w.reject(new Error(`${this.opts.label} : sa réponse est illisible.`))
      }
    }
  }

  /** The sandbox is gone: every request waiting fails with `message`, and the next ones too. */
  close(message: string): void {
    this.closed = message
    for (const [id, w] of this.waiting) {
      this.finish(id, w)
      w.reject(new Error(message))
    }
  }

  private finish(id: number, w: Waiting): void {
    clearTimeout(w.timer)
    this.waiting.delete(id)
  }
}
