import type { Effort, EngineModel, EngineStatus, WebAccess } from '../../shared/types'
import type { EngineEvent } from './events'

/** One turn of a folder's conversation, as the chat asks for it. */
export interface Turn {
  /** The folder (unit of work) the turn belongs to: its scratch folder, its cards, its transcript. */
  folderId: string
  /** The user message with its context block and attachments, already scrubbed. */
  message: string
  /** Marianne's system prompt (see `systemPrompt`). */
  system: string
  /** The engine's session to resume (Claude: a UUID · Codex: a thread id · Vibe: a session id). */
  sessionId?: string
  /** Continue `sessionId` rather than start a new session. */
  resume: boolean
  /** A planned task's run: a session of its own, nobody's to resume, whose transcript isn't kept. */
  unattended?: boolean
  web: WebAccess
  signal: AbortSignal
  timeoutMs: number
  /** Time the turn spent waiting for the user on cards: not counted in `timeoutMs`. */
  waitedMs: () => number
  onEvent: (e: EngineEvent) => void
}

/** A turn with what `runTurn` resolved for the engine. */
export interface EngineTurn extends Turn {
  cli: string
  /** The folder's empty scratch folder. */
  cwd: string
  /** The engine's configuration folder. */
  home: string
  /** The environment, with the configuration folder's variable when it was chosen. */
  env: NodeJS.ProcessEnv
  /** Empty: the engine's own default. */
  model: string
  effort: Effort
  /** Claude: compact past this many tokens. */
  compactAt: number
  /** Hosts the engine may read in "public" web mode. */
  publicHosts: string[]
}

/** Where a CLI keeps a session's transcript: files relative to `root`. */
export interface TranscriptFiles {
  root: string
  files: string[]
}

export interface Engine {
  /** Usual install locations, tried after PATH. */
  candidates(): string[]
  /** Where to get it, for the "not found" message. */
  site: string
  /** Login state and account, read from the CLI without touching the credentials. */
  account(cli: string, env: NodeJS.ProcessEnv, home: string): Promise<Pick<EngineStatus, 'loggedIn' | 'account'>>
  /** Arguments of the CLI's own sign-in, opened in a terminal. */
  login: string[]
  models(home: string): Promise<EngineModel[]>
  turn(t: EngineTurn): Promise<void>
  /** The session's transcript files, if the CLI wrote any. */
  transcript(home: string, cwd: string, sessionId: string): TranscriptFiles | null
  /** Where a session's transcript goes back before resuming, in the current scratch folder's terms. */
  transcriptRoot(home: string, cwd: string): string
  /** Leftovers of Marianne's runs in the configuration folder, removed with the scratch folders. */
  sweep?(home: string): void
}

/** A method guide the engine reads before handling a kind of request. */
