import type { AccountSettings, DeviceConfig, PublicSourceConfig, PublicSourceId } from './types'

const source = (enabled = true): PublicSourceConfig => ({ enabled, url: '' })

export const DEFAULT_CONFIG: DeviceConfig = {
  archiveFolder: '',
  otherArchives: [],
  lastAccount: '',
  ui: { theme: 'minitel', fontSize: 14, crt: false, sidebarOpen: true, sidebarWidth: 270, browserWidth: 560 },
  shortcuts: {},
  engines: {
    default: 'claude',
    compactAt: 300_000,
    claude: { enabled: true, home: '', model: 'sonnet', effort: 'medium', useEnvKey: false },
    codex: { enabled: true, home: '', model: '', effort: 'medium', useEnvKey: false },
    vibe: { enabled: false, home: '', model: '', effort: 'medium', useEnvKey: false }
  },
  web: 'public',
  lockAfterMinutes: 15,
  lockOnSleep: true,
  background: true,
  updates: { auto: true },
  sources: {
    'service-public': source(),
    legifrance: source(false),
    'code-travail': source(),
    datagouv: source(),
    entreprises: source(),
    geo: source(),
    adresse: source(),
    calendar: source(),
    openfisca: source()
  } satisfies Record<PublicSourceId, PublicSourceConfig>
}

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  display: 'initials',
  services: { pinned: [], added: [], offered: [], disabled: [], access: {}, reads: {}, opened: {}, reviewed: {} },
  approvals: { level: 'balanced', rules: [] },
  browser: { show: 'ask' }
}

/** Default config folder of each engine, and the variable that moves it. */
export const ENGINE_HOMES = {
  claude: { env: 'CLAUDE_CONFIG_DIR', folder: '.claude' },
  codex: { env: 'CODEX_HOME', folder: '.codex' },
  vibe: { env: 'VIBE_HOME', folder: '.vibe' }
} as const

export const ENGINE_LABELS = { claude: 'Claude Code', codex: 'Codex', vibe: 'Mistral Vibe' } as const
export const ENGINE_BADGES = { claude: 'CL', codex: 'CX', vibe: 'MI' } as const
