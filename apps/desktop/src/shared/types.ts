import type { DomainId, ServiceTaskFollowUp, ServiceTaskTemplate, ServiceTile, TaskEvery } from '@marianne/sdk'

/**
 * Types shared by the main process and the screens. Identifiers are in English; everything the
 * user reads is in French.
 */

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] }

/** The ten domains of public life: part of the services' contract, so listed once, in the SDK. */
export type { DomainId, ServiceTaskFollowUp, ServiceTaskTemplate, TaskEvery }

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
  /**
   * Use the API key the environment sets (ANTHROPIC_API_KEY…) even when the engine has a sign-in of
   * its own. Off: Marianne leaves the key out of its runs, so a subscription isn't billed per use by surprise.
   */
  useEnvKey: boolean
}

/** An API key the environment sets for an engine, which would take the place of its own sign-in. */
export interface EngineEnvKey {
  /** The variable, e.g. ANTHROPIC_API_KEY. */
  name: string
  /** The engine also has a sign-in of its own (a subscription, a stored key). */
  login: boolean
  /** Marianne's runs use the key: chosen, or the engine has nothing else. */
  used: boolean
}

export interface EngineStatus {
  found: boolean
  path?: string
  version?: string
  loggedIn?: boolean
  /** e.g. "vous@exemple.fr · max". */
  account?: string
  /** An API key in the environment, and whether Marianne's runs use it. */
  envKey?: EngineEnvKey
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
  /** The runs use an API key from the environment, billed per use. */
  envKey?: boolean
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
  /**
   * Services by id. `pinned`: the tiles of the Services page, in their order. `added`: the user's
   * services (« mes services »); `offered`: the built-in services this account was offered, added
   * or not (a newer Marianne's new service shows in « découvrir »). `disabled`: switched off, with
   * their tools. `access`: the profile fields each was granted (absent: not asked yet). `reads`:
   * the day each last read the user's opinions (leaning, themes, sources), YYYY-MM-DD. `opened`: when the
   * user last opened each one's screen (ISO). `reviewed`: the file of each community service this
   * account reviewed (its SHA-256, its version): another one on this computer (another account
   * updated it) waits for this account's review.
   */
  services: {
    pinned: string[]
    added: string[]
    offered: string[]
    disabled: string[]
    access: Record<string, string[]>
    reads: Record<string, string>
    opened: Record<string, string>
    reviewed: Record<string, { sha256: string; version: string }>
  }
  /** How much Marianne asks before acting for the user (shared/approvals.ts). */
  approvals: ApprovalSettings
  browser: { show: 'ask' | 'always' | 'never' }
}

/**
 * What Marianne may do without a card: « tout demander » (`ask`), « équilibré » (`balanced`, going
 * online asked once per folder) or « autonomie » (`autonomous`, the sites Marianne knows).
 */
export type ApprovalLevel = 'ask' | 'balanced' | 'autonomous'

/** The kinds of action that may need the user's yes (shared/approvals.ts). */
export type ApprovalAction = 'online' | 'form' | 'profile' | 'task' | 'commit' | 'service' | 'add'

/** The only kinds a standing permission can cover: going to a site, filling forms on a site, saving deadlines. */
export type StandingAction = Extract<ApprovalAction, 'online' | 'form' | 'profile'>

/** A standing permission, given with « toujours … » on a card, until the user takes it back in Réglages › Autorisations. */
export interface ApprovalRule {
  id: string
  action: StandingAction
  /** online, form: the site it covers (a registrable domain). None for profile: it covers deadlines only. */
  site?: string
  /** When the user gave it (ISO). */
  at: string
}

export interface ApprovalSettings {
  level: ApprovalLevel
  rules: ApprovalRule[]
}

/** The user's answer to a card: « approuver », « toujours … » (the standing permission the card offers), « refuser ». */
export type ApprovalAnswer = 'approve' | 'always' | 'refuse'

/**
 * A pinned service's tile, as the Services page shows it: the last one its service returned
 * (null: none yet, or its default tile), when it did, and whether a newer one is being asked for.
 */
export interface TileState {
  tile: ServiceTile | null
  /** When the service returned it (ISO); null: never yet. */
  at: string | null
  loading: boolean
  /** The last ask failed (the tile shown is older). */
  error?: string
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
 * step online (sign, pay, send), a payment by card, a built-in service to add. The turn waits for
 * the answer. Or, with `given`, the line of such an action the user allowed ahead, which went without a card.
 */
export interface ApprovalPart {
  type: 'approval'
  id: string
  kind: 'proposal' | 'form' | 'online' | 'service' | 'add' | 'payment'
  /** kind add: the built-in service it proposes, and whether it was off (switching it back on) rather than not added. */
  service?: { code: string; off: boolean }
  /**
   * kind payment: the card asks for the security code, which the user types in it. The code goes to
   * the main process with the answer (respondApproval), never into this part.
   */
  askCvv?: boolean
  /** The kind of action, as the approval policy knows it; absent on cards older than it. */
  action?: ApprovalAction
  title: string
  reason?: string
  /** What will be written or done, with real values (never sent to the engine). */
  fields: Array<{ label: string; value: string }>
  status: 'pending' | 'accepted' | 'refused' | 'expired'
  /** While pending, the standing permission the card offers (« toujours pour sanef.com »); once answered, kept only if the user chose it. */
  always?: string
  /** Allowed ahead, and how (« toujours pour sanef.com », « autonomie »): the action went without a card. */
  given?: string
}

/** A missing setting the engine needs: a link to where the user sets it. */
export interface SetupPart {
  type: 'setup'
  /** Settings page id, e.g. "identity". */
  page: string
  label: string
  reason: string
  /** The button's words, when « renseigner <label> » doesn't fit. */
  action?: string
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
  /**
   * System messages: "conversation résumée le…", the line that opens a planned task's run, or the one
   * that opens the turn Marianne starts herself once the user added a service from her card.
   */
  note?: 'compacted' | 'task' | 'resume'
  /** note 'task': how the run ended, once it has. */
  outcome?: TaskOutcome
  /** note 'task': the run said so itself (task_report); without, its outcome is the runner's conclusion (« à relire »). */
  reported?: boolean
  /**
   * A user message sent by a planned task's follow-up (its button on a run's line): the task's id.
   * The message shows the label; the engine reads the instruction the task keeps.
   */
  followUp?: string
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
  /** The planned task that comes back in it. */
  task?: string
}

// ---------------------------------------------------------------- planned tasks

/** marianne: she does the work on the task's day · remind: the folder only comes back. */
export type TaskRunner = 'marianne' | 'remind'
/** nothing: nothing to tell · found: something to see · waiting: she needs the user · failed · done: a reminder given. */
export type TaskOutcome = 'nothing' | 'found' | 'waiting' | 'failed' | 'done'

export interface TaskRun {
  at: string
  /** Its day, when it ran later than planned (« rattrapée »). */
  due?: string
  outcome: TaskOutcome
  /** French, one line. */
  text?: string
  /** The run said so itself (task_report); without, its outcome is the runner's conclusion. */
  reported?: boolean
}

export type TaskOrigin = { kind: 'user' } | { kind: 'agent' } | { kind: 'service'; service: string; template: string }

/** A folder that comes back: in the archive, its folder holds the conversation. */
export interface PlannedTask {
  id: string
  folderId: string
  domain: DomainId | ''
  /** French, short; it goes in notifications, so never an identifier. */
  title: string
  runner: TaskRunner
  origin: TaskOrigin
  every: TaskEvery
  /** French: "tous les 2 jours". */
  everyLabel: string
  /** What it is about, as the user knows it. */
  entity?: { id: string; label: string }
  /** What Marianne is asked at each run. */
  instruction?: string
  /** The hosts reachable without asking, for this task's runs only. */
  sites: string[]
  /** French, what the sheet said she may do. */
  allows?: string[]
  /** French, what she will never do. */
  never?: string
  /** French: why this rhythm. */
  why?: string
  /**
   * A service's task: what Marianne offers to do with the user once a run found something, copied
   * from its template when it was planned (`label` French, `instruction` English).
   */
  followUp?: ServiceTaskFollowUp
  notify: 'found' | 'always'
  /** Its next day, YYYY-MM-DD: it runs at the first opening on or after it. */
  next: string
  /** The day its rhythm counts from: a month's end keeps its day. */
  anchor?: string
  on: boolean
  runs: TaskRun[]
  /**
   * In the list the window gets only (tasks.listed): whether what the task relies on is still there
   * (its service on, its template still proposed, its plate still granted), as the main process checks.
   */
  offered?: boolean
}

/** A task a service proposes, with the service it comes from. */
export interface TaskTemplate extends ServiceTaskTemplate {
  service: string
}

export type CreateTask =
  | { kind: 'template'; service: string; template: string; rhythm: number; notify: PlannedTask['notify'] }
  | { kind: 'reminder'; title: string; domain: DomainId | ''; every: TaskEvery }

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
  /** The planned task that comes back in it. */
  task?: string
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

// ---------------------------------------------------------------- payment cards (in the archive)

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'maestro' | 'discover' | 'diners' | 'jcb' | 'unionpay' | 'other'

/** A payment card as the window and the engines know it: never its number nor its security code. */
export interface PaymentCard {
  id: string
  /** The user's name for it (« perso »). */
  label: string
  holder: string
  brand: CardBrand
  /** The number's last four digits. */
  last4: string
  /** MM/AA. */
  expiry: string
  /** The user chose to keep its security code (off by default): otherwise they type it at each payment. */
  cvvStored: boolean
  updatedAt: string
}

export interface PaymentCardInput {
  id?: string
  label: string
  holder: string
  /** Omitted when editing: the stored number stays (changing it means typing it again). */
  number?: string
  /** MM/AA. */
  expiry: string
  /** Keep the security code; false drops a stored one. */
  storeCvv: boolean
  /** With storeCvv: the code; omitted, the stored one stays. */
  cvv?: string
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
