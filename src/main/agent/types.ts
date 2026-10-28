import type { Effort, WebAccess } from '../../shared/types'
import type { AgentEvent } from './events'

export interface TurnOptions {
  /** The user message, with its context block and attachments. */
  message: string
  /** The conversation the turn belongs to: cards of its tool calls are shown there. */
  conversationId?: string
  /** Claude Code: our UUID for the session · Codex: the thread id of a previous turn. */
  sessionId?: string
  /** Continue `sessionId` rather than start a new session. */
  resume: boolean
  system: string
  model: string
  effort: Effort
  web: WebAccess
  /** Hosts the agent may read in "public" web mode. */
  publicHosts: string[]
  cwd: string
  signal: AbortSignal
  timeoutMs: number
  /** Time the turn spent waiting for the user on cards: not counted in `timeoutMs`. */
  waitedMs?: () => number
  onEvent: (e: AgentEvent) => void
}
