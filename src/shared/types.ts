import type { DomainId } from './dossier'

/** Coding-agent CLIs Marianne drives with the user's own login. */
export type AgentId = 'claude-code' | 'codex'
export type Effort = 'low' | 'medium' | 'high'
export type Theme = 'minitel' | 'monochrome'
/** off: no web tools · public: search + reading public-service websites only · all: search + any website. */
export type WebAccess = 'off' | 'public' | 'all'

/** Public data sources the assistant's tools draw on. */
export type SourceId =
  'service-public' | 'annuaire' | 'legifrance' | 'code-travail' | 'datagouv' | 'entreprises' | 'geo' | 'adresse' | 'calendrier' | 'openfisca' | 'assemblee'
/** offline: a dump downloaded and indexed on this computer · live: queried on demand. */
export type SourceKind = 'offline' | 'live'

export interface SourceConfig {
  enabled: boolean
  /** Base URL of the API, or URL of the dump; empty = the official default. */
  url: string
}

export interface AgentConfig {
  /** Path to the CLI; empty = find it automatically. */
  path: string
  model: string
  effort: Effort
}

export interface Config {
  onboarded: boolean
  ui: {
    theme: Theme
    /** Pixel font everywhere, like a real Minitel; off = a sharper monospace for long texts. */
    retroFont: boolean
    /** Scanlines and phosphor glow on top of the dot pattern. */
    crt: boolean
    /** Base text size in px. */
    textSize: number
    /** The conversation panel, beside every page. */
    chatOpen: boolean
    chatWidth: number
  }
  /** Start with the system in the tray, and notify upcoming deadlines. */
  background: { launchAtLogin: boolean; reminders: boolean }
  agent: {
    provider: AgentId
    claudeCode: AgentConfig
    codex: AgentConfig
    web: WebAccess
    customInstructions: string
    /** Stop a turn that runs longer than this. */
    maxMinutes: number
  }
  sources: Record<SourceId, SourceConfig>
  /** Refresh the offline dumps in the background when they are older than `everyHours`. */
  sync: { auto: boolean; everyHours: number }
  skills: { disabled: string[] }
  /** Public-service websites added by the user, next to the built-in catalog. */
  services: { custom: Service[] }
  updates: { auto: boolean }
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] }

// ---------------------------------------------------------------- chat

export interface TextPart {
  type: 'text'
  text: string
}

/** A tool call made by the agent: Marianne's own tools, web search, page reads… */
export interface ToolPart {
  type: 'tool'
  id: string
  name: string
  input: unknown
  output?: string
  isError?: boolean
  status: 'running' | 'done'
}

/** A web page the user sent from the built-in browser (e.g. their tax account once logged in). */
export interface PagePart {
  type: 'page'
  url: string
  title: string
  text: string
}

/** A file attached by the user, copied into the agent's workspace. */
export interface FilePart {
  type: 'file'
  name: string
  /** Relative to the workspace, with forward slashes. */
  path: string
  size: number
}

/** A document of the encrypted vault, given to the agent (which reads it, scrubbed, with lire_document). */
export interface DocumentRefPart {
  type: 'document'
  id: string
  title: string
}

/**
 * A change the agent proposes (to the personal file, or a form in the built-in browser): the turn
 * waits until the user accepts or refuses it.
 */
export interface ActionPart {
  type: 'action'
  id: string
  kind: 'proposal' | 'form'
  title: string
  reason?: string
  /** What will be written, with real values (resolved locally, never sent to the agent). */
  fields: Array<{ label: string; value: string }>
  status: 'pending' | 'accepted' | 'refused' | 'expired'
}

/** Something the agent needs is not configured: a link to the screen where the user sets it up. */
export interface SetupPart {
  type: 'setup'
  /** Route of the screen, e.g. "domaine/impots#compte:impots". */
  route: string
  label: string
  reason: string
}

export type ChatPart = TextPart | ToolPart | PagePart | FilePart | DocumentRefPart | ActionPart | SetupPart
export type Attachment = PagePart | FilePart | DocumentRefPart

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  at: string
  parts: ChatPart[]
  status?: 'running' | 'done' | 'cancelled' | 'error'
  error?: string
  agent?: AgentId
  model?: string
  ms?: number
  /** User messages: the screen the user was on. */
  screen?: { route: string; title: string }
}

export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  /** The agent that holds `sessionId`. Switching agents starts a new session with a recap. */
  agent?: AgentId
  /** The agent CLI's own session id, to resume the conversation. */
  sessionId?: string
  messages: ChatMessage[]
}

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
  preview: string
  running: boolean
}

export interface SendRequest {
  /** Omitted: start a new conversation. */
  conversationId?: string
  text: string
  attachments: Attachment[]
  /** The page the user is on, so the agent knows what "this" refers to. */
  page?: { route: string; title: string }
}

// ---------------------------------------------------------------- agents

export interface AgentStatus {
  found: boolean
  path?: string
  version?: string
  loggedIn?: boolean
  /** e.g. "you@example.com · max" or "chatgpt". */
  account?: string
  error?: string
}

export interface AgentModel {
  id: string
  label: string
}

export interface AgentTestResult {
  ok: boolean
  text?: string
  error?: string
  ms?: number
  tools?: number
}

// ---------------------------------------------------------------- sources

export interface SourceInfo {
  id: SourceId
  label: string
  description: string
  kind: SourceKind
  /** Official API base URL, or dump URL for offline sources. */
  defaultUrl: string
  homepage: string
  license: string
  /** A keychain entry the source needs (API credentials). */
  key?: 'piste'
}

export interface SourceStatus {
  id: SourceId
  enabled: boolean
  /** Offline sources: last successful sync and what it holds. */
  syncedAt?: string
  count?: number
  syncing?: { phase: 'download' | 'index'; done: number; total: number }
  error?: string
  /** Sources that need credentials: whether they are in the keychain. */
  hasKey?: boolean
}

// ---------------------------------------------------------------- public-service websites

export type LoginKind = 'franceconnect' | 'compte' | 'aucun'

/** An identifier a service needs, kept in the personal file (and reached by the agent as [[key]]). */
export interface ServiceField {
  key: string
  label: string
  hint?: string
  /** Regular expression the value must match (without spaces). */
  pattern?: string
}

export interface Service {
  id: string
  name: string
  url: string
  domain: DomainId
  description: string
  login: LoginKind
  fields?: ServiceField[]
  /** The service identifies you by your social security number. */
  needsNir?: boolean
  custom?: boolean
}

// ---------------------------------------------------------------- keychain

export type VaultKind = 'login' | 'api'

export interface VaultEntry {
  id: string
  kind: VaultKind
  label: string
  /** Site the login is for (its origin is matched for autofill), or the API it unlocks. */
  url: string
  username: string
  createdAt: string
  updatedAt: string
}

export interface VaultEntryInput {
  id?: string
  kind: VaultKind
  label: string
  url: string
  username: string
  /** Omitted when editing: keep the stored secret. */
  password?: string
}

export interface VaultStatus {
  /** OS encryption available (Keychain, DPAPI, libsecret/kwallet). */
  available: boolean
  /** Linux without a keyring: secrets are only obfuscated. */
  weak: boolean
  backend: string
  count: number
}

// ---------------------------------------------------------------- built-in browser

export interface BrowserState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  /** Keychain logins for this site, offered for autofill. */
  logins: Array<{ id: string; label: string; username: string }>
  /** Feedback after an action (autofill, sent to chat). */
  notice?: string
}

// ---------------------------------------------------------------- Assemblée nationale videos

export interface VideoItem {
  /** "19632460_6ae0ce76adf9c" */
  id: string
  title: string
  description: string
  date: string
  type: string
  commission: string
  thumbnail: string
  /** Search hits on a speaker point to their passage, ms. */
  timecode?: number
  url: string
}

export interface VideoChapter {
  id: string
  title: string
  depth: number
  /** Position in the video, ms; null when the chapter isn't timed. */
  timecode: number | null
  speaker?: string
  /** The speaker's deputy id (PA…), when they are one. */
  deputy?: string
}

export interface VideoDetail {
  id: string
  title: string
  date: string
  type: string
  organ: string
  /** The open-data meeting (réunion) uid. */
  meetingId: string
  durationMs: number
  chapters: VideoChapter[]
  speakers: Array<{ name: string; deputy?: string }>
  /** HLS playlist (multi-bitrate). */
  hls: string
  url: string
}

export interface LiveStream {
  meetingId: string
  organ: string
  start: string
  subject: string
  hls: string
  poster: string
}

export interface VideoQuery {
  /** YYYY-MM-DD */
  from: string
  to: string
  type?: 'seance' | 'commission' | 'questions' | 'autre'
  text?: string
}

// ---------------------------------------------------------------- skills

export interface SkillInfo {
  name: string
  title: string
  description: string
  builtin: boolean
  enabled: boolean
  path: string
}

// ---------------------------------------------------------------- app

export interface UpdateState {
  status: 'disabled' | 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'downloaded' | 'error'
  current: string
  latest?: string
  percent?: number
  error?: string
  checkedAt?: string
}

export interface AppInfo {
  version: string
  platform: string
  dataDir: string
}

/**
 * A screen of the main window: "moi", "dossier", "entites", "agenda", "documents",
 * "domaine/<id>", "demarche/<id>", "fiche/<id>", "reglages/<page>", with an optional "#anchor".
 */
export type Route = string

// ---------------------------------------------------------------- guided procedures

export interface DemarcheStep {
  title: string
  /** Markdown. */
  body: string
  actions: Array<{ kind: 'ouvrir' | 'configurer' | 'document' | 'demander' | 'fiche'; target: string; label: string }>
}

export interface Demarche {
  id: string
  domain: DomainId
  title: string
  description: string
  when: string
  duration: string
  pieces: string[]
  steps: DemarcheStep[]
}

export interface BackupResult {
  ok: boolean
  path?: string
  error?: string
}
