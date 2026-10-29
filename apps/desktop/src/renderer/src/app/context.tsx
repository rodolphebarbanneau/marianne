import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DOMAIN_IDS } from '@marianne/sdk'
import type { AccountSettings, Attachment, DeepPartial, DeviceConfig, DomainId, EngineLight, FolderSummary, SessionState } from '@shared/types'
import { api, useLive } from '../lib/api'

/** The pages, top to bottom: SUITE goes down one, RETOUR up one. */
export const PAGES = ['home', 'news', 'procedures', 'services'] as const
export type PageId = (typeof PAGES)[number]
export const PAGE_LABELS: Record<PageId, string> = { home: 'Marianne', news: 'Actualités', procedures: 'Démarches', services: 'Services' }

/** A domain's dashboard belongs to Démarches; a service, opened by its code ("meteo") with what to show first, to Services. */
export type View =
  | { kind: 'page'; page: PageId }
  | { kind: 'domain'; id: DomainId }
  | { kind: 'folder'; id: string }
  | { kind: 'service'; id: string; params?: Record<string, string | number> }

export type PaletteMode = 'commands' | 'menu' | 'search'

/** What the composer starts with ("demander à Marianne" about an article…). */
export interface ComposerSeed {
  text: string
  attachments: Attachment[]
  procedure?: string
  /** A new folder in this domain (from its dashboard). */
  domain?: DomainId
}

interface AppValue {
  config: DeviceConfig
  setConfig: (patch: DeepPartial<DeviceConfig>) => Promise<void>
  session: SessionState
  settings: AccountSettings | null
  setSettings: (patch: DeepPartial<AccountSettings>) => Promise<void>
  folders: FolderSummary[]
  lights: EngineLight[]
  view: View
  go: (view: View) => void
  goPage: (page: PageId) => void
  openRoute: (route: string) => void
  step: (direction: 'next' | 'prev') => void
  palette: PaletteMode | null
  openPalette: (mode: PaletteMode | null) => void
  settingsPage: string | null
  openSettings: (page: string | null) => void
  /** GUIDE (F1): what Marianne is, its keys, its links, its authors. */
  guideOpen: boolean
  openGuide: (open: boolean) => void
  browserOpen: boolean
  setBrowserOpen: (open: boolean) => void
  toggleSidebar: () => void
  /** Reload the window, back on this screen. */
  reload: () => void
  seed: ComposerSeed | null
  setSeed: (seed: ComposerSeed | null) => void
  toast: (text: string) => void
  toastText: string
}

const AppContext = createContext<AppValue | null>(null)

/** What a reload keeps of the screen, in the window's session storage until the screens come back. */
const RELOAD_KEY = 'marianne:reload'
interface Kept {
  account: string
  view: View
  settingsPage: string | null
  browserOpen: boolean
}
let kept: Kept | null = (() => {
  const raw = sessionStorage.getItem(RELOAD_KEY)
  sessionStorage.removeItem(RELOAD_KEY)
  try {
    return raw ? (JSON.parse(raw) as Kept) : null
  } catch {
    return null
  }
})()

export function useApp(): AppValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp outside AppProvider')
  return value
}

export function AppProvider({ config, session, children }: { config: DeviceConfig; session: SessionState; children: ReactNode }) {
  const folders = useLive(api.listFolders, api.onFolders) ?? []
  const lights = useLive(api.engineLights, api.onEngineLights) ?? []
  const settings = useLive(api.getAccountSettings, api.onAccountSettings)
  // Back from a reload: the same screen, for the same account only.
  const restored = kept?.account === session.account?.id ? kept : null
  const [view, setView] = useState<View>(restored?.view ?? { kind: 'page', page: 'home' })
  const [palette, setPalette] = useState<PaletteMode | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [settingsPage, setSettingsPage] = useState<string | null>(restored?.settingsPage ?? null)
  const [browserOpen, setBrowserOpen] = useState(restored?.browserOpen ?? false)
  useEffect(() => void (kept = null), [])
  const [seed, setSeed] = useState<ComposerSeed | null>(null)
  const [toastText, setToastText] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setConfig = useCallback(async (patch: DeepPartial<DeviceConfig>) => {
    await api.setConfig(patch)
  }, [])
  const setSettings = useCallback(async (patch: DeepPartial<AccountSettings>) => {
    await api.setAccountSettings(patch)
  }, [])

  const go = useCallback((next: View) => {
    setPalette(null)
    setSettingsPage(null)
    setView(next)
    if (next.kind === 'folder') api.seeFolder(next.id)
  }, [])
  const goPage = useCallback((page: PageId) => go({ kind: 'page', page }), [go])

  // SUITE / RETOUR: the next or previous page, at once (a Minitel had no transitions).
  const step = useCallback(
    (direction: 'next' | 'prev') =>
      setView((current) => {
        if (current.kind === 'service' && direction === 'prev') return { kind: 'page', page: 'services' }
        if (current.kind === 'domain' && direction === 'prev') return { kind: 'page', page: 'procedures' }
        if (current.kind !== 'page') return current
        const i = PAGES.indexOf(current.page)
        const target = PAGES[i + (direction === 'next' ? 1 : -1)]
        return target ? { kind: 'page', page: target } : current
      }),
    []
  )

  const toast = useCallback((text: string) => {
    setToastText(text)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastText(''), 1800)
  }, [])

  const toggleSidebar = useCallback(() => void api.setConfig({ ui: { sidebarOpen: !config.ui.sidebarOpen } }), [config.ui.sidebarOpen])

  const account = session.account?.id
  const reload = useCallback(() => {
    if (account) sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ account, view, settingsPage, browserOpen } satisfies Kept))
    api.reloadWindow()
  }, [account, view, settingsPage, browserOpen])

  // A route names a screen: "folder:<id>", "settings:<page>", "service:<code>", "news"… The
  // main process sends them (a notification, the tray), and Marianne links to them (marianne:news).
  const openRoute = useCallback(
    (route: string) => {
      const [kind, arg] = route.split(/[:/]/)
      if (kind === 'folder' && arg) go({ kind: 'folder', id: arg })
      else if (kind === 'settings') setSettingsPage(arg || 'identity')
      else if (kind === 'service' && arg) go({ kind: 'service', id: arg })
      else if (kind === 'domain' && (DOMAIN_IDS as readonly string[]).includes(arg)) go({ kind: 'domain', id: arg as DomainId })
      else if ((PAGES as readonly string[]).includes(kind)) go({ kind: 'page', page: kind as PageId })
    },
    [go]
  )
  useEffect(() => api.onNavigate(openRoute), [openRoute])

  // A deleted folder can't stay on screen.
  useEffect(() => {
    if (view.kind === 'folder' && folders.length && !folders.some((f) => f.id === view.id)) setView({ kind: 'page', page: 'home' })
  }, [folders, view])

  const value = useMemo<AppValue>(
    () => ({
      config,
      setConfig,
      session,
      settings,
      setSettings,
      folders,
      lights,
      view,
      go,
      goPage,
      openRoute,
      step,
      palette,
      openPalette: setPalette,
      settingsPage,
      openSettings: setSettingsPage,
      guideOpen,
      openGuide: setGuideOpen,
      browserOpen,
      setBrowserOpen,
      toggleSidebar,
      reload,
      seed,
      setSeed,
      toast,
      toastText
    }),
    [
      config,
      setConfig,
      session,
      settings,
      setSettings,
      folders,
      lights,
      view,
      go,
      goPage,
      openRoute,
      step,
      palette,
      settingsPage,
      guideOpen,
      browserOpen,
      toggleSidebar,
      reload,
      seed,
      toast,
      toastText
    ]
  )
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
