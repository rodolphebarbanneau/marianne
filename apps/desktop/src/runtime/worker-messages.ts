import type { BridgeReply, SandboxInvoke, SandboxReply } from '../shared/community'

/**
 * What crosses between a sandbox's page (main.ts, which holds the bridge) and its worker
 * (main-worker.ts, which runs the service's code). The page relays; the main process checks.
 */

/** The shared buffer's size: two numbers (a flag, a length), then a sync answer as JSON. */
export const SHARED_BYTES = 8 + 4 * 1024 * 1024

/** From the page to the worker. */
export type ToWorker =
  { kind: 'init'; shared: SharedArrayBuffer } | { kind: 'invoke'; message: SandboxInvoke } | { kind: 'result'; id: number; ok?: unknown; error?: string }

/** From the worker to the page. */
export type FromWorker =
  | { kind: 'call'; id: number; name: string; args: unknown[] }
  | { kind: 'sync'; name: string; args: unknown[] }
  | { kind: 'reply'; id: number; reply: SandboxReply }
  | { kind: 'log'; level: 'info' | 'warn' | 'error'; text: string }

/** The bridge as the worker has it: calls by message to its page (which makes their arguments JSON text). */
export interface WorkerBridge {
  call(name: string, args: unknown[]): Promise<unknown>
  callSync(name: string, args: unknown[]): BridgeReply
  onInvoke(listener: (message: SandboxInvoke) => void): void
  reply(id: number, reply: SandboxReply): void
  log(level: 'info' | 'warn' | 'error', text: string): void
}
