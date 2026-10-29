import type { DomainId } from '@marianne/sdk'

/**
 * Types shared by the main process and the screens. Identifiers are in English; everything the
 * user reads is in French.
 */

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] }

/** The ten domains of public life: part of the services' contract, so listed once, in the SDK. */
export type { DomainId }

// ---------------------------------------------------------------- engines

/** The coding-agent CLIs Marianne drives with the user's own login. */
export type EngineId = 'claude' | 'codex' | 'vibe'
export type Effort = 'low' | 'medium' | 'high'
/** off: no web tools · public: search + public-service websites only · all: search + any website. */
export type WebAccess = 'off' | 'public' | 'all'

export interface EngineConfig {
  enabled: boolean
  /** The CLI's configuration folder (its login lives there); empty = its default (~/.claude…). */
  home: string
  model: string
  effort: Effort
}

export interface EngineStatus {
  found: boolean
  path?: string
  version?: string
  loggedIn?: boolean
  /** e.g. "vous@exemple.fr · max". */
  account?: string
  error?: string
}

/** What the bottom bar shows for one engine. Disabled engines are not listed. */
export interface EngineLight {
  id: EngineId
  /** Found and usable. False: greyed with ✕. */
  ok: boolean
  /** A turn is running. */
  busy: boolean
  label: string
}

export interface EngineModel {
  id: string
  label: string
}

// ---------------------------------------------------------------- this computer

export type Theme = 'minitel' | 'monochrome'
export type PublicSourceId = 'service-public' | 'legifrance' | 'code-travail' | 'datagouv' | 'entreprises' | 'geo' | 'adresse' | 'calendar' | 'openfisca'

export interface PublicSourceConfig {
  enabled: boolean
  /** Base URL of the API, or URL of the dump; empty = the official default. */
  url: string
}

/** Preferences of this computer (config.json): nothing personal. */
export interface DeviceConfig {
  /** Where the account archives live. Empty until the first launch chooses it. */
  archiveFolder: string
  /** Archives opened from elsewhere (a USB key…), by path. */
  otherArchives: string[]
  lastAccount: string
  ui: {
    theme: Theme
    fontSize: number
    crt: boolean
    sidebarOpen: boolean
    sidebarWidth: number
    browserWidth: number
  }
  /** Changed shortcuts, by command id (Electron accelerators). */
  shortcuts: Record<string, string>
  engines: Record<EngineId, EngineConfig> & {
    default: EngineId
    /** Claude: compact the conversation after this many tokens. */
    compactAt: number
  }
  web: WebAccess
  /** Minutes without activity before locking; 0 = never. */
  lockAfterMinutes: number
  lockOnSleep: boolean
  /** Start with the computer, in the tray, for deadline reminders. */
  background: boolean
  updates: { auto: boolean }
  sources: Record<PublicSourceId, PublicSourceConfig>
}

// ---------------------------------------------------------------- accounts

export interface AccountInfo {
  id: string
  /** Initials, a first name, or empty. */
  display: string
  file: string
  size: number
  modified: string
  /** A PIN unlocks it on this computer. */
  hasPin: boolean
}

export type DisplayChoice = 'initials' | 'firstName' | 'none'

export interface Usage {
  used: number
  capacity: number
  /** By kind of content, in bytes. */
  documents: number
  conversations: number
  other: number
}

export interface SessionState {
  unlocked: boolean
  account: AccountInfo | null
  /** A PIN can be set on this computer (a real OS keystore is there). */
  pinAvailable: boolean
}

/** Preferences of the account, inside its archive. */
export interface AccountSettings {
  display: DisplayChoice
  news: { sources: string[]; perSource: number; group: boolean; custom: Array<{ id: string; name: string; url: string }> }
  /**
   * Services by id: starred ones come first on the Services page; disabled ones are hidden,
   * with their tools; `access`: the profile fields each was granted (absent: not asked yet).
   */
  services: { starred: string[]; disabled: string[]; access: Record<string, string[]> }
  browser: { askOnline: 'folder' | 'site'; show: 'ask' | 'always' | 'never' }
}

// ---------------------------------------------------------------- folders and their conversation

export interface TextPart {
  type: 'text'
  text: string
}

/** A tool call made by the engine: Marianne's tools, web search… */
export interface ToolPart {
  type: 'tool'
  id: string
  name: string
  input: unknown
  output?: string
  isError?: boolean
  status: 'running' | 'done'
}

/** A page of the built-in browser given to the conversation. */
export interface PagePart {
  type: 'page'
  url: string
  title: string
  text: string
}

/** A document of the archive given to the conversation (the engine reads it masked). */
export interface DocumentPart {
  type: 'document'
  id: string
  title: string
}

/**
 * Something that needs the user's yes: a change to the profile, a form to fill, a consequential
 * step online (sign, pay, send). The turn waits for the answer.
 */
export interface ApprovalPart {
  type: 'approval'
  id: string
  kind: 'proposal' | 'form' | 'online'
  title: string
  reason?: string
  /** What will be written or done, with real values (never sent to the engine). */
  fields: Array<{ label: string; value: string }>
  status: 'pending' | 'accepted' | 'refused' | 'expired'
}

/** A missing setting the engine needs: a link to where the user sets it. */
export interface SetupPart {
  type: 'setup'
  /** Settings page id, e.g. "identity". */
  page: string
  label: string
  reason: string
}

/** Progress of a task in the built-in browser. */
export interface ProgressPart {
  type: 'progress'
  id: string
  site: string
  steps: Array<{ label: string; done: boolean }>
}

export type ChatPart = TextPart | ToolPart | PagePart | DocumentPart | ApprovalPart | SetupPart | ProgressPart
export type Attachment = PagePart | DocumentPart

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  at: string
  parts: ChatPart[]
  status?: 'running' | 'done' | 'cancelled' | 'error'
  error?: string
  engine?: EngineId
  model?: string
  ms?: number
  /** System messages: "conversation résumée le…". */
  note?: 'compacted'
}

/** One folder = one conversation, a unit of work like a branch and its pull request. */
export interface Folder {
  id: string
  title: string
  domain: DomainId | ''
  /** The guided procedure it follows, if any. */
  procedure: string
  /** Steps of that procedure already done (0-based). */
  stepsDone: number[]
  pinned: boolean
  /** ISO date: hidden in "En veille" until then. */
  snoozedUntil: string
  /** ISO date: in "Classés". */
  settledAt: string
  engine: EngineId
  /** Each engine's own session id, to resume. */
  sessions: Partial<Record<EngineId, string>>
  createdAt: string
  updatedAt: string
  /** The user opened it since the last answer. */
  seen: boolean
  /** It came back from "En veille" and the user hasn't opened it yet. */
  woke: boolean
  /** Taken out of "Classés" by hand: not settled automatically again until a new message. */
  keepOpen: boolean
}

export type FolderStatus = 'approval' | 'question' | 'working' | 'failed' | 'done' | 'woke' | 'idle'

export interface FolderSummary {
  id: string
  title: string
  domain: DomainId | ''
  pinned: boolean
  snoozedUntil: string
  settledAt: string
  engine: EngineId
  status: FolderStatus
  updatedAt: string
  /** "étape 3 sur 5 · avant le 28/05" */
  meta: string
  unread: boolean
}

export interface FolderView {
  folder: Folder
  messages: ChatMessage[]
  running: boolean
}

export interface SendRequest {
  /** Omitted: a new folder. */
  folderId?: string
  text: string
  attachments: Attachment[]
  engine?: EngineId
  /** Start the folder on a guided procedure. */
  procedure?: string
  /** A new folder's domain, when started from its dashboard (a procedure brings its own). */
  domain?: DomainId
}

// ---------------------------------------------------------------- keychain (in the archive)

export type KeychainKind = 'login' | 'api'

export interface KeychainEntry {
  id: string
  kind: KeychainKind
  label: string
  /** The site's address (logins are matched by site), or the API's. */
  url: string
  username: string
  updatedAt: string
}

export interface KeychainInput {
  id?: string
  kind: KeychainKind
  label: string
  url: string
  username: string
  /** Omitted: keep the stored one. */
  password?: string
}

// ---------------------------------------------------------------- built-in browser

export interface BrowserState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  /** Shown in the split panel (otherwise it runs out of sight). */
  visible: boolean
  /** Who drives the page: Marianne, or the user after "prendre la main". */
  controller: 'agent' | 'human'
  /** The folder the page belongs to. */
  folderId: string
  /** What Marianne is about to do, waiting for the user's yes. */
  waiting: string
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
  /** A development run (npm run dev), not an installed version. */
  dev: boolean
  /** When this run started (ISO): tells an old window from a fresh one. */
  startedAt: string
}

/** A guide the engines read when a request calls for it (taxes, deadlines and appeals…). */
export interface SkillInfo {
  name: string
  title: string
  description: string
  /** Built into the app, rather than added by the user. */
  builtin: boolean
  path: string
}
