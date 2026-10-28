import type { Deadline, DocumentMeta, DomainId, Dossier, DossierOp } from './dossier'
import type {
  AgentId,
  AgentModel,
  AgentStatus,
  AgentTestResult,
  AppInfo,
  Attachment,
  BackupResult,
  BrowserState,
  Config,
  Conversation,
  ConversationSummary,
  DeepPartial,
  Demarche,
  LiveStream,
  Route,
  SendRequest,
  Service,
  SkillInfo,
  SourceId,
  SourceStatus,
  UpdateState,
  VaultEntry,
  VaultEntryInput,
  VaultStatus,
  VideoDetail,
  VideoItem,
  VideoQuery
} from './types'

export interface DossierState {
  /** 'locked': the vault can't be opened with this computer's keystore (restore a backup). */
  state: 'ok' | 'locked' | 'error'
  error: string
  dossier: Dossier
}

export interface TokenValue {
  token: string
  label: string
  value: string
}

export interface SpDocument {
  id: string
  kind: string
  title: string
  description: string
  theme: string
  url: string
  updated: string
  body: string
}

export interface SpHit {
  id: string
  kind: string
  title: string
  description: string
  url: string
  updated: string
  extrait: string
}

export interface AddressSuggestion {
  label: string
  rue: string
  codePostal: string
  commune: string
  codeInsee: string
  lat: number
  lon: number
}

export interface CompanyLookup {
  siren: string
  denomination: string
  forme: string
  activite: string
  creation: string
  adresse: string
  association: boolean
  individual: boolean
}

export interface Deputy {
  id: string
  name: string
  circo: string
  departement: string
  groupe: string
  email: string
}

/** API exposed to renderers as `window.marianne` by the preload script. */
export interface MarianneApi {
  platform: string

  // App
  getInfo(): Promise<AppInfo>
  openDataDir(): void
  /** Open a link in the system browser. */
  openExternal(url: string): void
  onNavigate(cb: (route: Route) => void): () => void

  // Updates
  getUpdateState(): Promise<UpdateState>
  checkForUpdates(): void
  downloadUpdate(): void
  installUpdate(): void
  openReleases(): void
  onUpdate(cb: (s: UpdateState) => void): () => void

  // Config
  getConfig(): Promise<Config>
  setConfig(patch: DeepPartial<Config>): Promise<Config>
  onConfig(cb: (config: Config) => void): () => void

  // Agents
  getAgentStatus(id: AgentId, refresh?: boolean): Promise<AgentStatus>
  /** Opens a terminal running the CLI's own sign-in. */
  openAgentLogin(id: AgentId): Promise<void>
  listAgentModels(id: AgentId): Promise<AgentModel[]>
  /** One short turn through the configured agent, with Marianne's tools. */
  testAgent(): Promise<AgentTestResult>

  // Conversations
  listConversations(): Promise<ConversationSummary[]>
  getConversation(id: string): Promise<Conversation | null>
  deleteConversation(id: string): Promise<void>
  renameConversation(id: string, title: string): Promise<void>
  /** Starts a turn; resolves with the conversation id once the user message is saved. */
  send(request: SendRequest): Promise<string>
  /** Sends the last user message again, replacing the answer that followed it. */
  regenerate(conversationId: string): Promise<void>
  cancel(conversationId: string): void
  /** Pick files to attach: documents with text join the vault (in `domain`), images the agent's workspace. */
  pickFiles(domain?: DomainId): Promise<Attachment[]>
  /** Answer a card of the agent (accept or refuse its proposal). */
  respondAction(id: string, accepted: boolean): void
  onConversation(cb: (c: Conversation) => void): () => void
  onConversations(cb: (list: ConversationSummary[]) => void): () => void
  /** The built-in browser sent a page to the chat. */
  onAttach(cb: (a: Attachment) => void): () => void

  // Personal file
  getDossier(): Promise<DossierState>
  dossierUpdate(op: DossierOp): Promise<Dossier>
  onDossier(cb: (s: DossierState) => void): () => void
  /** The file's identifiers by token, to show [[tokens]] of the agent's answers with their values. */
  tokenValues(): Promise<TokenValue[]>
  getDeadlines(days?: number): Promise<Deadline[]>
  listDemarches(): Promise<Demarche[]>
  /** Pick files and encrypt them into the vault. */
  addDocuments(domain: DomainId): Promise<DocumentMeta[]>
  openDocument(id: string): Promise<void>
  exportDocument(id: string): Promise<boolean>
  deleteDocument(id: string): Promise<boolean>
  spFiche(id: string): Promise<SpDocument | null>
  spSearch(query: string, limit?: number): Promise<SpHit[]>
  spTitles(ids: string[]): Promise<Array<{ id: string; title: string; kind: string }>>
  searchAddress(query: string): Promise<AddressSuggestion[]>
  searchCommunes(query: string): Promise<Array<{ nom: string; code: string; departement: string; codesPostaux: string[] }>>
  lookupSiren(siren: string): Promise<CompanyLookup | null>
  myDeputies(): Promise<Deputy[]>

  // Backup
  exportBackup(passphrase: string): Promise<BackupResult>
  importBackup(passphrase: string): Promise<BackupResult>

  // Data sources
  listSources(): Promise<SourceStatus[]>
  syncSource(id: SourceId): Promise<void>
  onSources(cb: (list: SourceStatus[]) => void): () => void

  // Keychain
  vaultStatus(): Promise<VaultStatus>
  listVault(): Promise<VaultEntry[]>
  saveVaultEntry(entry: VaultEntryInput): Promise<VaultEntry>
  deleteVaultEntry(id: string): Promise<void>
  /** The stored password, for the user to see or copy. */
  revealVaultSecret(id: string): Promise<string>
  onVault(cb: () => void): () => void

  // Public-service websites and the built-in browser
  listServices(): Promise<Service[]>
  /** Open a page in the built-in browser. */
  openBrowser(url: string): void
  getBrowserState(): Promise<BrowserState>
  onBrowserState(cb: (s: BrowserState) => void): () => void
  browserNavigate(url: string): void
  browserBack(): void
  browserForward(): void
  browserReload(): void
  /** Fill the page's login form with a keychain entry. */
  browserFill(entryId: string): void
  /** Send the visible text of the page to the chat. */
  browserSendToChat(): void
  browserOpenExternal(): void

  // Assemblée nationale videos
  searchVideos(q: VideoQuery): Promise<VideoItem[]>
  getVideo(id: string): Promise<VideoDetail>
  liveStreams(): Promise<LiveStream[]>

  // Skills
  listSkills(): Promise<SkillInfo[]>
  openSkillsDir(): void
}
