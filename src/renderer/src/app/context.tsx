import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DossierState, TokenValue } from '@shared/api'
import { EMPTY_DOSSIER, type Deadline, type Dossier, type DossierOp } from '@shared/dossier'
import type { AgentStatus, Attachment, Config, DeepPartial, Route, Service } from '@shared/types'

const api = window.marianne

/** A request to the conversation panel from a page: a question to send or to prefill. */
export interface AskRequest {
  text: string
  send?: boolean
  attachments?: Attachment[]
  /** Start a new conversation rather than continue the current one. */
  fresh?: boolean
}

export interface AppContextValue {
  config: Config
  update: (patch: DeepPartial<Config>) => Promise<void>
  dossier: Dossier
  dossierState: DossierState['state']
  dossierError: string
  apply: (op: DossierOp) => Promise<void>
  services: Service[]
  deadlines: Deadline[]
  tokens: TokenValue[]
  /** Sites (gouv.fr subdomains folded) with a login in the keychain. */
  loginSites: Set<string>
  agent: AgentStatus | null
  route: Route
  go: (route: Route) => void
  ask: (request: AskRequest) => void
  /** The pending request for the panel (consumed by it). */
  asked: AskRequest | null
  consumeAsk: () => void
  help: string
  setHelp: (text: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp outside of AppProvider')
  return ctx
}

/** The site a URL belongs to, the way the keychain matches logins (gouv.fr is a public suffix). */
export function siteOf(url: string): string {
  try {
    const host = new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase()
    return host
      .split('.')
      .slice(host.endsWith('.gouv.fr') ? -3 : -2)
      .join('.')
  } catch {
    return ''
  }
}

export function AppProvider({ config, update, children }: { config: Config; update: (patch: DeepPartial<Config>) => Promise<void>; children: ReactNode }) {
  const [state, setState] = useState<DossierState>({ state: 'ok', error: '', dossier: EMPTY_DOSSIER })
  const [services, setServices] = useState<Service[]>([])
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [tokens, setTokens] = useState<TokenValue[]>([])
  const [loginSites, setLoginSites] = useState<Set<string>>(new Set())
  const [agent, setAgent] = useState<AgentStatus | null>(null)
  const [route, setRoute] = useState<Route>('moi')
  const [asked, setAsked] = useState<AskRequest | null>(null)
  const [help, setHelp] = useState('')

  const refreshDerived = useCallback(() => {
    void api.getDeadlines().then(setDeadlines)
    void api.tokenValues().then(setTokens)
  }, [])

  useEffect(() => {
    void api.getDossier().then(setState)
    refreshDerived()
    return api.onDossier((s) => {
      setState(s)
      refreshDerived()
    })
  }, [refreshDerived])
  useEffect(() => {
    void api.listServices().then(setServices)
    refreshDerived()
  }, [config.services.custom, refreshDerived])
  useEffect(() => {
    const load = () => void api.listVault().then((list) => setLoginSites(new Set(list.filter((e) => e.kind === 'login').map((e) => siteOf(e.url)))))
    load()
    return api.onVault(load)
  }, [])
  useEffect(() => api.onNavigate((r) => setRoute(r)), [])
  // The connection light follows the configured agent.
  useEffect(() => {
    let alive = true
    const check = () => void api.getAgentStatus(config.agent.provider).then((s) => alive && setAgent(s))
    check()
    const id = setInterval(check, 60_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [config.agent.provider, config.agent.claudeCode.path, config.agent.codex.path])

  const apply = useCallback(async (op: DossierOp) => {
    const dossier = await api.dossierUpdate(op)
    setState((s) => ({ ...s, dossier }))
  }, [])

  const go = useCallback((r: Route) => {
    setRoute(r)
    setHelp('')
  }, [])

  const ask = useCallback(
    (request: AskRequest) => {
      setAsked(request)
      if (!config.ui.chatOpen) void update({ ui: { chatOpen: true } })
    },
    [config.ui.chatOpen, update]
  )

  const value = useMemo<AppContextValue>(
    () => ({
      config,
      update,
      dossier: state.dossier,
      dossierState: state.state,
      dossierError: state.error,
      apply,
      services,
      deadlines,
      tokens,
      loginSites,
      agent,
      route,
      go,
      ask,
      asked,
      consumeAsk: () => setAsked(null),
      help,
      setHelp
    }),
    [config, update, state, apply, services, deadlines, tokens, loginSites, agent, route, go, ask, asked, help]
  )
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/** The anchor of the current route ("domaine/impots#compte:impots" → "compte:impots"). */
export function useAnchor(): string {
  const { route } = useApp()
  return route.split('#')[1] ?? ''
}

/** Scroll to the element of the route's anchor when the route changes. */
export function useScrollToAnchor(): void {
  const { route } = useApp()
  useEffect(() => {
    const anchor = route.split('#')[1]
    if (!anchor) return
    const t = setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    return () => clearTimeout(t)
  }, [route])
}
