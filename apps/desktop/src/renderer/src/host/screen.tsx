import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PROFILE_FIELDS, serviceCode, tabKey, type ProfileField, type ServiceState, type ServiceTab } from '@marianne/sdk'
import { Loading, ServiceFrameProvider, ServiceHostProvider, type ServiceFrame, type ServiceHost, type ShownPage } from '@marianne/sdk/view'
import { publicSource } from '@shared/public'
import { accelOf, matches, SHORTCUTS } from '@shared/shortcuts'
import type { PublicSourceId } from '@shared/types'
import { useApp } from '../app/context'
import { Boundary } from '../components/ui'
import { api, isMac } from '../lib/api'
import { useProfile } from '../lib/profile'
import { useServices } from '.'
import { SERVICE_VIEWS } from './registry'

/** The tab a screen opens on: the one its params name (a line of "Aujourd'hui"…), or the first. */
const firstTab = (tabs: ServiceTab[], params: Record<string, string | number>) => tabs.find((t) => t.id === params.tab)?.id ?? tabs[0]?.id ?? ''

/** A service's own page: the one place with the 3615 nod. Échap goes back to the Services. */
export function ServiceScreen({ id, params }: { id: string; params: Record<string, string | number> }) {
  // Another service, or the same opened with other params: a fresh screen, on its first tab.
  return <FramedScreen key={`${id}:${JSON.stringify(params)}`} id={id} params={params} />
}

function FramedScreen({ id, params }: { id: string; params: Record<string, string | number> }) {
  const app = useApp()
  const state = useServices().find((s) => s.manifest.id === id)
  const profile = useProfile()
  const address = profile?.address
  const View = SERVICE_VIEWS[id]
  const { setSeed, goPage, openRoute, toast } = app
  const paramsKey = JSON.stringify(params)
  // The list of the services comes again whenever a setting changes or a sync reports progress, each
  // time with new objects: the host follows what the manifest says, not the object that carries it.
  const manifestKey = state ? JSON.stringify(state.manifest) : ''
  // What the service may read changed (an access given or taken back in Réglages, the opinions said): its screen reads again.
  const readsKey = JSON.stringify([state?.access.granted ?? null, profile?.opinions ?? null])

  const host = useMemo<ServiceHost | null>(() => {
    if (!state) return null
    const home = address?.inseeCode
      ? { code: address.inseeCode, name: address.city, postcode: address.postcode, latitude: address.lat, longitude: address.lon }
      : null
    return {
      manifest: state.manifest,
      call: (method: string, ...args: unknown[]) => api.callService(id, method, args) as never,
      params: JSON.parse(paramsKey) as Record<string, string | number>,
      home,
      // A new folder, in the service's first domain (Mobilité for 3615 PEAGE).
      ask: (text: string, page?: ShownPage) => {
        setSeed({ text, attachments: page ? [{ type: 'page', ...page }] : [], domain: state.manifest.domains[0] })
        goPage('home')
      },
      openRoute,
      openUrl: (url: string) => api.openExternal(url),
      copy: (text: string, done = 'copié') => void navigator.clipboard.writeText(text).then(() => toast(done)),
      toast,
      load: (key: string) => api.getServiceData(id, key),
      save: (key: string, value: unknown) => api.setServiceData(id, key, value)
    }
    // A new host only when what it carries changes: views reload their data with it.
  }, [
    id,
    manifestKey,
    readsKey,
    paramsKey,
    address?.inseeCode,
    address?.city,
    address?.postcode,
    address?.lat,
    address?.lon,
    setSeed,
    goPage,
    openRoute,
    toast
  ]) // eslint-disable-line react-hooks/exhaustive-deps

  // The frame: the tabs the manifest declares (a bar of their own from two), the one shown, the view's tools and counts.
  const tabsKey = JSON.stringify(state?.manifest.tabs ?? [])
  const tabs = useMemo(() => JSON.parse(tabsKey) as ServiceTab[], [tabsKey])
  const [tab, setTab] = useState(() => firstTab(tabs, params))
  const [badges, setBadges] = useState<Record<string, string>>({})
  const [tools, setTools] = useState<HTMLElement | null>(null)
  const listeners = useRef(new Set<(id: string) => void>())
  const body = useRef<HTMLDivElement>(null)
  // The services' list may come after the screen: its first tab then.
  const shown = tabs.some((t) => t.id === tab) ? tab : firstTab(tabs, params)
  const open = useCallback(
    (next: string) => {
      if (!tabs.some((t) => t.id === next)) return
      setTab(next)
      body.current?.scrollTo(0, 0)
    },
    [tabs]
  )
  const pick = useCallback(
    (next: string) => {
      open(next)
      for (const listener of listeners.current) listener(next)
    },
    [open]
  )
  const subscribe = useCallback((listener: (id: string) => void) => {
    listeners.current.add(listener)
    return () => void listeners.current.delete(listener)
  }, [])
  const frame = useMemo<ServiceFrame>(() => ({ tabs, tab: shown, open, subscribe, setBadges, tools }), [tabs, shown, open, subscribe, tools])
  const barred = tabs.length > 1

  // F2…F9: the tabs, in their order (F1 stays GUIDE), unless the key is one of the user's shortcuts or a dialog is open.
  const { palette, settingsPage, guideOpen, config } = app
  useEffect(() => {
    if (!barred) return
    const onKey = (e: KeyboardEvent) => {
      const n = /^F([2-9])$/.exec(e.key)
      if (!n || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
      if (palette || settingsPage || guideOpen || document.querySelector('#root > .overlay')) return
      if (SHORTCUTS.some((def) => matches(e, accelOf(def.id, isMac, config.shortcuts), isMac))) return
      const target = tabs[Number(n[1]) - 2]
      if (!target) return
      e.preventDefault()
      pick(target.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [barred, tabs, pick, palette, settingsPage, guideOpen, config.shortcuts])

  if (!state)
    return (
      <div className="page service-page">
        <Loading />
      </div>
    )
  const m = state.manifest
  const settings = app.settings?.services
  const star = () =>
    void app.setSettings({ services: { starred: state.starred ? (settings?.starred ?? []).filter((x) => x !== id) : [...(settings?.starred ?? []), id] } })
  const viewing = state.available && state.on && !state.error && !(state.access.asked.length > 0 && state.access.granted === null) && !!View && !!host

  return (
    <div className="page service-page">
      <div className="service-head">
        {/* The way back is the 3615 block itself: a click anywhere on it, as échap. */}
        <span className="t">
          <button className="inv service-back" title="retour aux Services (échap)" aria-label="retour aux Services" onClick={() => goPage('services')}>
            <span className="arrow" aria-hidden>
              ←
            </span>
            3615
          </button>{' '}
          {serviceCode(m)}
        </span>
        <span className="small dim">{m.name} · rattaché à aucun dossier</span>
        {/* A screen without tabs: its tools at the header's end. */}
        {viewing && !barred && <span className="service-tools" ref={setTools} />}
        <button className={`star${state.starred ? ' on' : ''}`} onClick={star} title={state.starred ? 'retirer des favoris' : 'mettre en favori'}>
          {state.starred ? '★' : '☆'}
        </button>
      </div>
      {/* The tabs stay above the content, which scrolls under them; each with its key. */}
      {viewing && barred && (
        <nav className="service-tabs" aria-label={`onglets de 3615 ${serviceCode(m)}`}>
          <div className="service-tab-list">
            {tabs.map((t, i) => (
              <button
                key={t.id}
                className={`service-tab${t.id === shown ? ' on' : ''}`}
                aria-current={t.id === shown ? 'page' : undefined}
                title={`${t.label} (${tabKey(i)})`}
                onClick={() => pick(t.id)}
              >
                <span className="fkey">{tabKey(i)}</span>
                {t.label}
                {badges[t.id] && <span className="count">{badges[t.id]}</span>}
              </button>
            ))}
          </div>
          <span className="service-tools" ref={setTools} />
        </nav>
      )}
      <div className="service-body" ref={body}>
        <div className="service-content">
          {state.error ? (
            <div className="box-note">Ce service n’a pas pu démarrer : {state.error}</div>
          ) : !state.available ? (
            <div className="box-note">
              Ce service s’appuie sur {m.connections.map((c) => publicSource(c as PublicSourceId)?.label ?? c).join(', ')}, désactivé dans les connexions.{' '}
              <button className="link" onClick={() => app.openSettings('data')}>
                l’activer
              </button>
            </div>
          ) : !state.on ? (
            <div className="box-note">
              Vous avez désactivé ce service.{' '}
              <button className="link" onClick={() => void app.setSettings({ services: { disabled: (settings?.disabled ?? []).filter((x) => x !== id) } })}>
                le réactiver
              </button>
            </div>
          ) : state.access.asked.length > 0 && state.access.granted === null ? (
            <Consent state={state} />
          ) : View && host ? (
            <ServiceHostProvider host={host}>
              <ServiceFrameProvider frame={frame}>
                <Boundary label={m.name}>
                  <View />
                </Boundary>
              </ServiceFrameProvider>
            </ServiceHostProvider>
          ) : (
            <div className="box-note">Ce service n’a pas d’écran.</div>
          )}
        </div>
      </div>
    </div>
  )
}

/** What a service asks to read of the profile, the first time it opens: field by field, the user decides. */
function Consent({ state }: { state: ServiceState }) {
  const m = state.manifest
  // Opinions are sensitive (RGPD, article 9): never ticked in advance; the rest is.
  const [chosen, setChosen] = useState<ProfileField[]>(m.permissions.profile.filter((f) => !f.startsWith('opinions.')))
  const answer = (granted: ProfileField[]) => void api.setServiceAccess(m.id, granted)
  return (
    <div className="consent">
      <span>
        <span className="inv">3615</span> {serviceCode(m)} demande à lire :
      </span>
      {m.permissions.profile.map((f) => (
        <label key={f}>
          <input type="checkbox" checked={chosen.includes(f)} onChange={(e) => setChosen(e.target.checked ? [...chosen, f] : chosen.filter((x) => x !== f))} />{' '}
          {PROFILE_FIELDS[f]}
        </label>
      ))}
      <span className="small dim">
        pour : {m.permissions.purpose} · {m.hosts.length ? `il se connecte à : ${m.hosts.join(', ')}` : 'il ne se connecte à aucun site'}
      </span>
      <span className="small dim">
        Il ne verra rien d’autre de votre profil, ni aucun de vos identifiants. Vous pourrez changer d’avis dans Réglages › Services.
      </span>
      <span>
        <button className="btn small primary" disabled={!chosen.length} onClick={() => answer(chosen)}>
          autoriser
        </button>{' '}
        <button className="btn small" onClick={() => answer([])}>
          refuser
        </button>
      </span>
    </div>
  )
}
