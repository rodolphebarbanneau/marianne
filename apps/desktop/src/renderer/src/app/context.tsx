import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AccountSettings, Attachment, DeepPartial, DeviceConfig, DomainId, EngineLight, FolderSummary, SessionState } from '@shared/types'
import { BrowserReveals } from '../browser/reveal'
import type { ServiceBar } from '../host/frame'
import { api, useLive } from '../lib/api'
import { PAGES, routeTarget, type PageId, type View } from './routes'

export { PAGES, PAGE_LABELS, type DomainTab, type PageId, type View } from './routes'

export type PaletteMode = 'commands' | 'menu' | 'search'

/**
 * A Minitel key a screen shows in the bottom bar while it has keys of its own (a search, a
 * dialog): its name, its shortcut (a command's id, or keys: "Enter", "ArrowDown"), what it does,
 * and what a click on it does.
 */
export interface ScreenKey {
  key: string
  shortcut: string
  what: string
  run?: () => void
}

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
  /** `params`: what a service's screen opens with (its `host.params`). */
  openRoute: (route: string, params?: Record<string, string | number>) => void
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
  /** The keys a screen shows in the bottom bar instead of its page's (null: the page's). */
  screenKeys: ScreenKey[] | null
  setScreenKeys: (keys: ScreenKey[] | null) => void
  /** What the service on screen adds to the bottom bar (null: no service on screen). */
  serviceBar: ServiceBar | null
  setServiceBar: (bar: ServiceBar | null) => void
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
  // Undefined until the list comes, then the list: none left is not the same as not there yet.
  const listed = useLive(api.listFolders, api.onFolders)
  const folders = listed ?? []
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
  const [screenKeys, setScreenKeys] = useState<ScreenKey[] | null>(null)
  const [serviceBar, setServiceBar] = useState<ServiceBar | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setConfig = useCallback(async (patch: DeepPartial<DeviceConfig>) => {
    await api.setConfig(patch)
  }, [])
  const setSettings = useCallback(async (patch: DeepPartial<AccountSettings>) => {
    await api.setAccountSettings(patch)
  }, [])

  const openings = useRef(0)
  const go = useCallback((next: View) => {
    setPalette(null)
    setSettingsPage(null)
    // Each opening of a service is a fresh screen, even of the one on screen: it starts on its first tab.
    setView(next.kind === 'service' ? { ...next, opened: ++openings.current } : next)
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

  // A route (routes.ts): a screen, or a page of the settings scrolled to one of its sections.
  const openRoute = useCallback(
    (route: string, params?: Record<string, string | number>) => {
      const target = routeTarget(route, params)
      if (target?.kind === 'view') go(target.view)
      // The settings dialog brings the section into view itself (« identity#sources »).
      else if (target?.kind === 'settings') setSettingsPage(target.section ? `${target.page}#${target.section}` : target.page)
    },
    [go]
  )
  useEffect(() => api.onNavigate(openRoute), [openRoute])

  // Marianne asks to show a folder's browser: its panel opens now on its screen, or when the user
  // goes there (browser/reveal.ts says why the window never leaves the screen they are on).
  const latest = useRef({ view, folders })
  latest.current = { view, folders }
  const [reveals] = useState(
    () =>
      new BrowserReveals({
        view: () => latest.current.view,
        open: () => setBrowserOpen(true),
        away: (id) => {
          const title = latest.current.folders.find((f) => f.id === id)?.title
          toast(`Marianne veut vous montrer le navigateur, dans ${title ? `« ${title} »` : 'un autre dossier'}`)
        }
      })
  )
  useEffect(() => reveals.listen(api), [reveals])
  useEffect(() => reveals.visit(view), [reveals, view])

  // A deleted folder can't stay on screen, the last one included.
  useEffect(() => {
    if (listed && view.kind === 'folder' && !listed.some((f) => f.id === view.id)) setView({ kind: 'page', page: 'home' })
  }, [listed, view])

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
      toastText,
      screenKeys,
      setScreenKeys,
      serviceBar,
      setServiceBar
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
      toastText,
      screenKeys,
      serviceBar
    ]
  )
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
