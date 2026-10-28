import type { ProfileField, ServiceState, ServiceSummary } from '@marianne/sdk'
import type { NewsSource } from './news'
import type { Deadline, DocumentMeta, Procedure, Profile, ProfileOp } from './profile'
import type { FranceDigest, NewsDigest, PublicSourceStatus, TodayEvent } from './public'
import type { Site } from './sites'
import type {
  AccountInfo,
  AccountSettings,
  AppInfo,
  Attachment,
  BrowserState,
  DeepPartial,
  DeviceConfig,
  DisplayChoice,
  DomainId,
  EngineId,
  EngineLight,
  EngineModel,
  EngineStatus,
  FolderSummary,
  FolderView,
  KeychainEntry,
  KeychainInput,
  PublicSourceId,
  SendRequest,
  SessionState,
  SkillInfo,
  UpdateState,
  Usage
} from './types'

export type UnlockSecret = { password: string } | { recoveryKey: string } | { pin: string }

/** A [[token]] and the user's value, to show the engine's answers with real values. */
export interface TokenValue {
  token: string
  label: string
  value: string
}

export interface AddressSuggestion {
  label: string
  street: string
  postcode: string
  city: string
  inseeCode: string
  lat: number
  lon: number
}

export interface CommuneSuggestion {
  name: string
  code: string
  department: string
  postcodes: string[]
}

export interface CompanyLookup {
  siren: string
  name: string
  legalForm: string
  activity: string
  created: string
  address: string
  association: boolean
  individual: boolean
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** API exposed to the screens as `window.marianne` by the preload script. */
export interface MarianneApi {
  platform: string

  // ---------- app ----------
  getInfo(): Promise<AppInfo>
  openExternal(url: string): void
  /** The main process asks to show something: "folder:<id>", "settings:<page>", "news"… */
  onNavigate(cb: (route: string) => void): () => void
  toggleFullscreen(): void
  onFullscreen(cb: (on: boolean) => void): () => void
  /** The user is active: postpones the automatic lock. */
  activity(): void

  // ---------- updates ----------
  getUpdateState(): Promise<UpdateState>
  checkForUpdates(): void
  downloadUpdate(): void
  installUpdate(): void
  onUpdate(cb: (s: UpdateState) => void): () => void

  // ---------- this computer ----------
  getConfig(): Promise<DeviceConfig>
  setConfig(patch: DeepPartial<DeviceConfig>): Promise<DeviceConfig>
  onConfig(cb: (config: DeviceConfig) => void): () => void

  // ---------- accounts and the session ----------
  getSession(): Promise<SessionState>
  onSession(cb: (s: SessionState) => void): () => void
  listAccounts(): Promise<AccountInfo[]>
  onAccounts(cb: (list: AccountInfo[]) => void): () => void
  /** Choose where the archives live (a folder dialog). */
  pickArchiveFolder(): Promise<string | null>
  /** Open an archive from anywhere (a USB key…). */
  pickArchiveFile(): Promise<AccountInfo | null>
  createAccount(input: { password: string; display: string; avoid: string[] }): Promise<{ recoveryKey: string; state: SessionState }>
  unlock(accountId: string, secret: UnlockSecret): Promise<SessionState>
  lock(): void
  setPin(pin: string): Promise<void>
  removePin(): Promise<void>
  changePassword(current: string, next: string): Promise<void>
  /** After unlocking with the recovery key. */
  resetPassword(next: string): Promise<void>
  renewRecoveryKey(): Promise<string>
  setDisplay(choice: DisplayChoice): Promise<void>
  getUsage(): Promise<Usage>
  /** A copy of the archive, still encrypted (a save dialog). */
  backupArchive(): Promise<string | null>
  /** Everything as ordinary files, in clear (a folder dialog). */
  exportAll(): Promise<string | null>
  showArchive(): void
  getAccountSettings(): Promise<AccountSettings>
  setAccountSettings(patch: DeepPartial<AccountSettings>): Promise<AccountSettings>
  onAccountSettings(cb: (s: AccountSettings) => void): () => void

  // ---------- folders ----------
  listFolders(): Promise<FolderSummary[]>
  onFolders(cb: (list: FolderSummary[]) => void): () => void
  getFolder(id: string): Promise<FolderView | null>
  onFolder(cb: (view: FolderView) => void): () => void
  /** The user looks at it: no longer "terminé" or "réveillé". */
  seeFolder(id: string): void
  renameFolder(id: string, title: string): Promise<void>
  pinFolder(id: string, pinned: boolean): Promise<void>
  /** ISO date until which it sleeps in "En veille". */
  snoozeFolder(id: string, until: string): Promise<void>
  settleFolder(id: string, settled: boolean): Promise<void>
  deleteFolder(id: string): Promise<void>
  setFolderEngine(id: string, engine: EngineId): Promise<void>
  /** A step of the folder's procedure, done or not. */
  setFolderStep(id: string, step: number, done: boolean): Promise<void>
  /** Starts a turn; resolves with the folder id once the user message is saved. */
  send(request: SendRequest): Promise<string>
  regenerate(folderId: string): Promise<void>
  cancel(folderId: string): void
  respondApproval(id: string, accepted: boolean): void
  /** Pick files: they join the archive as the folder's pièces. */
  attachFiles(folderId?: string): Promise<Attachment[]>

  // ---------- engines ----------
  engineStatus(id: EngineId, refresh?: boolean): Promise<EngineStatus>
  engineLights(): Promise<EngineLight[]>
  onEngineLights(cb: (lights: EngineLight[]) => void): () => void
  engineModels(id: EngineId): Promise<EngineModel[]>
  /** Opens a terminal running the CLI's own sign-in. */
  engineLogin(id: EngineId): Promise<void>
  /** Choose an engine's configuration folder. */
  pickEngineHome(id: EngineId): Promise<string | null>

  // ---------- profile, documents, procedures ----------
  getProfile(): Promise<Profile>
  onProfile(cb: (p: Profile) => void): () => void
  updateProfile(op: ProfileOp): Promise<Profile>
  tokenValues(): Promise<TokenValue[]>
  getDeadlines(days?: number): Promise<Deadline[]>
  listProcedures(): Promise<Procedure[]>
  listDocuments(): Promise<DocumentMeta[]>
  onDocuments(cb: (list: DocumentMeta[]) => void): () => void
  /** Pick files and seal them into the archive (in a domain, as a folder's pièces). */
  addDocuments(options: { domain: DomainId; folderId?: string }): Promise<DocumentMeta[]>
  updateDocument(id: string, patch: Partial<Pick<DocumentMeta, 'title' | 'domain' | 'type' | 'date' | 'entity' | 'folderId'>>): Promise<DocumentMeta>
  /** Open a copy in the system's viewer (deleted after a while and on lock). */
  openDocument(id: string): Promise<void>
  exportDocument(id: string): Promise<boolean>
  deleteDocument(id: string): Promise<void>
  searchAddress(query: string): Promise<AddressSuggestion[]>
  searchCommunes(query: string): Promise<CommuneSuggestion[]>
  lookupSiren(siren: string): Promise<CompanyLookup | null>

  // ---------- keychain ----------
  listKeychain(): Promise<KeychainEntry[]>
  saveKeychain(input: KeychainInput): Promise<KeychainEntry>
  deleteKeychain(id: string): Promise<void>
  /** The stored password, for the user to see or copy. */
  revealKeychain(id: string): Promise<string>
  onKeychain(cb: () => void): () => void

  // ---------- built-in browser ----------
  browserState(): Promise<BrowserState>
  onBrowserState(cb: (s: BrowserState) => void): () => void
  /** Marianne wants the user to see the page of a folder. */
  onBrowserReveal(cb: (folderId: string) => void): () => void
  /** Where the panel is on screen (CSS pixels); null when it is closed. */
  browserBounds(rect: Rect | null): void
  browserOpen(url: string, folderId?: string): void
  browserNavigate(input: string): void
  browserBack(): void
  browserForward(): void
  browserReload(): void
  browserExternal(): void
  /** "Prendre la main" / "rendre la main". */
  browserControl(controller: BrowserState['controller']): void
  browserFillLogin(entryId: string): Promise<string[]>
  /** The page's text, to give to the conversation. */
  browserCapture(): Promise<Attachment | null>

  // ---------- public information (Actualités, Connexions) ----------
  listPublicSources(): Promise<PublicSourceStatus[]>
  onPublicSources(cb: (list: PublicSourceStatus[]) => void): () => void
  syncPublicSource(id: PublicSourceId): Promise<void>
  /** The headlines of the user's sources (feeds are fetched again after a few minutes). */
  news(): Promise<NewsDigest>
  /** What happens today in public life: sittings, holidays, school holidays, clock changes. */
  todayEvents(): Promise<TodayEvent[]>
  /** What changes in France, and the news of public services. */
  franceDigest(): Promise<FranceDigest>

  // ---------- services ----------
  listServices(): Promise<ServiceState[]>
  onServices(cb: (list: ServiceState[]) => void): () => void
  /** A method of a service's main side (see docs/services.md). */
  callService(id: string, method: string, args: unknown[]): Promise<unknown>
  /** The user's data for a service, in the archive. */
  getServiceData(id: string, key: string): Promise<unknown>
  setServiceData(id: string, key: string, value: unknown): Promise<void>
  /** Run a service's sync job now. */
  syncService(id: string): Promise<void>
  /** The lines of the services useful for a domain, for its dashboard. */
  serviceSummaries(domain: DomainId): Promise<Array<{ service: string; summary: ServiceSummary }>>
  /** The user's answer to what a service asks to read of the profile: the fields granted (none: refused). */
  setServiceAccess(id: string, granted: ProfileField[]): Promise<void>

  // ---------- skills ----------
  listSkills(): Promise<SkillInfo[]>
  openSkillsDir(): void

  // ---------- content (sites, news sources, procedures: updated by signed bundles) ----------
  /** The catalog of public-service websites. */
  listSites(): Promise<Site[]>
  /** The news sources of Actualités. */
  newsSources(): Promise<NewsSource[]>
  /** Newer content was taken: the sites, news sources and procedures are worth asking again. */
  onContent(cb: () => void): () => void
}
