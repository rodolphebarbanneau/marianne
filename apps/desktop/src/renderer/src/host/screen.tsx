import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PROFILE_FIELDS, serviceCode, tabKey, type ProfileField, type ServiceState, type ServiceTab } from '@marianne/sdk'
import {
  Loading,
  LoadingGate,
  ServiceFrameProvider,
  ServiceHostProvider,
  type ServiceFrame,
  type ServiceHost,
  type ServiceKey,
  type ShownPage
} from '@marianne/sdk/view'
import { publicSource } from '@shared/public'
import { accelOf, matches, SHORTCUTS } from '@shared/shortcuts'
import type { ServiceFileReview } from '@shared/catalogue'
import type { PublicSourceId } from '@shared/types'
import { useApp } from '../app/context'
import { useMedia } from '../app/media'
import { SearchIcon } from '../components/icons'
import { Boundary } from '../components/ui'
import { api, errorText, isMac } from '../lib/api'
import { useProfile } from '../lib/profile'
import { ReviewDialog } from '../pages/services/dialogs'
import { useServiceList } from '.'
import { CommunityScreen } from './community-screen'
import { opensSearch, SEARCH_PAUSE_MS, searchOf, viewShows } from './frame'
import { SERVICE_VIEWS } from './registry'

/** The tab a screen opens on: the one its params name (a line of "Aujourd'hui"…), or the first. */
const firstTab = (tabs: ServiceTab[], params: Record<string, string | number>) => tabs.find((t) => t.id === params.tab)?.id ?? tabs[0]?.id ?? ''

/** A service's own page: the one place with the 3615 nod. Échap goes back to the Services. */
export function ServiceScreen({ id, params, opened = 0 }: { id: string; params: Record<string, string | number>; opened?: number }) {
  // Each opening is a fresh screen (app/context.tsx counts them): the same service opened again, with the
  // same params or none, starts on its first tab rather than where it was left.
  return <FramedScreen key={`${id}:${opened}:${JSON.stringify(params)}`} id={id} params={params} />
}

function FramedScreen({ id, params }: { id: string; params: Record<string, string | number> }) {
  const app = useApp()
  const list = useServiceList()
  const state = list?.find((s) => s.manifest.id === id)
  const profile = useProfile()
  const address = profile?.address
  // A built-in service's screen is bundled; a community service's runs in a view of its own, over its body.
  const community = !!state && !state.builtIn
  const View = community ? undefined : SERVICE_VIEWS[id]
  const { setSeed, goPage, openRoute, toast } = app
  const { media } = useMedia()
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
      save: (key: string, value: unknown) => api.setServiceData(id, key, value),
      // The app's mini-player; a community screen's goes through the bridge (community-screen.tsx).
      media
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
    toast,
    media
  ]) // eslint-disable-line react-hooks/exhaustive-deps

  // The frame: the tabs the manifest declares (a bar of their own from two), the one shown, the view's tools and counts.
  const tabsKey = JSON.stringify(state?.manifest.tabs ?? [])
  const tabs = useMemo(() => JSON.parse(tabsKey) as ServiceTab[], [tabsKey])
  const [tab, setTab] = useState(() => firstTab(tabs, params))
  const [badges, setBadges] = useState<Record<string, string>>({})
  const [tools, setTools] = useState<HTMLElement | null>(null)
  const [reviewing, setReviewing] = useState(false)
  // A community service another account updated here: the version now on this computer, to review.
  const [newVersion, setNewVersion] = useState<ServiceFileReview | null>(null)
  const [reviewError, setReviewError] = useState('')
  const listeners = useRef(new Set<(id: string) => void>())
  const body = useRef<HTMLDivElement>(null)
  // The frame's search field (a manifest with `search`): what is typed, and the query the view reads,
  // trimmed, once typing pauses. Kept across the tabs; a new screen (another service, other params) starts afresh.
  const searchable = !!state?.manifest.search
  const [typed, setTyped] = useState(() => searchOf(params))
  const [query, setQueryNow] = useState(() => searchOf(params).trim())
  const [focused, setFocused] = useState(false)
  const [keys, setKeys] = useState<ServiceKey[]>([])
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const timer = setTimeout(() => setQueryNow(typed.trim()), SEARCH_PAUSE_MS)
    return () => clearTimeout(timer)
  }, [typed])
  const setQuery = useCallback((text: string) => {
    setTyped(text)
    setQueryNow(text.trim())
  }, [])
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
  const frameQuery = searchable ? query : ''
  const frame = useMemo<ServiceFrame>(
    () => ({ tabs, tab: shown, open, subscribe, setBadges, tools, query: frameQuery, setQuery, setKeys }),
    [tabs, shown, open, subscribe, tools, frameQuery, setQuery]
  )
  const barred = tabs.length > 1
  const viewing = !!state && viewShows(state, (community || !!View) && !!host)
  const searching = viewing && searchable

  // F2…F9: the tabs, in their order (F1 stays GUIDE), unless the key is one of the user's shortcuts or a dialog is open.
  const { palette, settingsPage, guideOpen, config, setServiceBar } = app
  const covered = !!palette || !!settingsPage || guideOpen

  // Opening a screen of one's services: the Services page says when it was last opened.
  const added = !!state?.added
  useEffect(() => {
    if (added) void api.serviceOpened(id)
  }, [id, added])
  useEffect(() => {
    if (!barred) return
    const onKey = (e: KeyboardEvent) => {
      const n = /^F([2-9])$/.exec(e.key)
      if (!n || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
      if (covered || document.querySelector('#root > .overlay')) return
      if (SHORTCUTS.some((def) => matches(e, accelOf(def.id, isMac, config.shortcuts), isMac))) return
      const target = tabs[Number(n[1]) - 2]
      if (!target) return
      e.preventDefault()
      pick(target.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [barred, tabs, pick, covered, config.shortcuts])

  // « / »: to the search field, from anywhere on the screen but another field or a dialog.
  useEffect(() => {
    if (!searching) return
    const onKey = (e: KeyboardEvent) => {
      const typing = !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')
      if (!opensSearch(e, typing) || covered || document.querySelector('#root > .overlay')) return
      e.preventDefault()
      field.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searching, covered])

  // The bottom bar: the tabs, CHERCHER (ANNULATION while typing in the field), the screen's own keys.
  const code = state ? serviceCode(state.manifest) : ''
  const focusField = useCallback(() => field.current?.focus(), [])
  const keysKey = JSON.stringify(keys)
  useEffect(() => {
    setServiceBar({
      tabs: viewing ? tabs.length : 0,
      search: searching ? { what: `dans ${code}`, focused, focus: focusField } : null,
      keys: viewing ? (JSON.parse(keysKey) as ServiceKey[]) : []
    })
  }, [setServiceBar, viewing, searching, tabs.length, code, focused, focusField, keysKey])
  useEffect(() => () => setServiceBar(null), [setServiceBar])

  // Removed while on screen (Réglages › Services), or never added: said, with the way back.
  if (!state)
    return (
      <div className="page service-page">
        {list ? (
          <div className="box-note">
            Ce service n’est plus installé.{' '}
            <button className="link" onClick={() => goPage('services')}>
              retour aux services
            </button>
          </div>
        ) : (
          <Loading />
        )}
      </div>
    )
  const m = state.manifest
  // The star pins the service as a tile of the Services page, at the end.
  const pin = () => void api.pinService(id, !state.pinned)

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
        {/* The screen's one search field, Marianne's: « / » reaches it, échap empties it and leaves it. */}
        {searching && m.search && (
          <label className="search-field framed service-search" title="chercher (/)">
            <SearchIcon />
            <input
              ref={field}
              value={typed}
              placeholder={m.search.placeholder}
              spellCheck={false}
              aria-label={m.search.placeholder}
              onChange={(e) => setTyped(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setQueryNow(typed.trim())
                if (e.key !== 'Escape' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
                // Taken here: the next échap, out of the field, is the way back.
                e.preventDefault()
                setQuery('')
                e.currentTarget.blur()
              }}
            />
          </label>
        )}
        {state.added && (
          <button
            className={`star${state.pinned ? ' on' : ''}`}
            onClick={pin}
            title={state.pinned ? 'désépingler' : 'épingler en tuile'}
            aria-pressed={state.pinned}
          >
            {state.pinned ? '★' : '☆'}
          </button>
        )}
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
      {/* A community screen scrolls in its own view, which fills the body. */}
      <div className={`service-body${viewing && community ? ' community-host' : ''}`} ref={body}>
        <div className="service-content">
          {!state.added ? (
            <div className="box-note">
              3615 {serviceCode(m)} n’est pas parmi vos services.{' '}
              <button className="link" onClick={() => setReviewing(true)}>
                + l’ajouter
              </button>
            </div>
          ) : state.reviewedVersion ? (
            <div className="box-note">
              Une nouvelle version de 3615 {serviceCode(m)} ({m.version}) a été ajoutée sur cet ordinateur : elle remplace celle que vous aviez vue (
              {state.reviewedVersion}).{' '}
              <button
                className="link"
                onClick={() =>
                  void api
                    .reviewInstalledService(id)
                    .then(setNewVersion)
                    .catch((err: unknown) => setReviewError(errorText(err)))
                }
              >
                la revoir avant de l’utiliser
              </button>
              {reviewError && <span className="bad"> · {reviewError}</span>}
            </div>
          ) : state.error ? (
            <div className="box-note">Ce service n’a pas pu démarrer : {state.error}</div>
          ) : !state.available ? (
            <div className="box-note">
              Une connexion dont ce service a besoin est coupée ({m.connections.map((c) => publicSource(c as PublicSourceId)?.label ?? c).join(', ')}).{' '}
              <button className="link" onClick={() => app.openSettings('data')}>
                l’activer
              </button>
            </div>
          ) : !state.on ? (
            <div className="box-note">
              Vous avez désactivé ce service.{' '}
              <button className="link" onClick={() => void api.switchService(id, true)}>
                le réactiver
              </button>
            </div>
          ) : state.access.asked.length > 0 && state.access.granted === null ? (
            <Consent state={state} />
          ) : community && host ? (
            <CommunityScreen host={host} frame={frame} barred={barred} />
          ) : View && host ? (
            <ServiceHostProvider host={host}>
              <ServiceFrameProvider frame={frame}>
                <Boundary label={m.name}>
                  <LoadingGate tab={shown} label={tabs.find((t) => t.id === shown)?.label ?? m.name}>
                    <View />
                  </LoadingGate>
                </Boundary>
              </ServiceFrameProvider>
            </ServiceHostProvider>
          ) : (
            <div className="box-note">Ce service n’a pas d’écran.</div>
          )}
        </div>
      </div>
      {newVersion && (
        <ReviewDialog
          subject={{ kind: 'file', review: newVersion }}
          onAdded={() => {
            setNewVersion(null)
            toast(`3615 ${serviceCode(m)} ${m.version} est à nouveau parmi vos services`)
          }}
          onClose={() => setNewVersion(null)}
        />
      )}
      {reviewing && (
        <ReviewDialog
          subject={{ kind: 'official', state }}
          onAdded={() => {
            setReviewing(false)
            toast(`3615 ${serviceCode(m)} ajouté à mes services`)
          }}
          onClose={() => setReviewing(false)}
        />
      )}
    </div>
  )
}

/** What a service asks to read of the profile, the first time it opens: field by field, the user decides. */
function Consent({ state }: { state: ServiceState }) {
  const m = state.manifest
  // Opinions are sensitive (RGPD, article 9): never ticked in advance; the rest is.
  const [chosen, setChosen] = useState<ProfileField[]>(m.permissions.profile.filter((f) => !f.startsWith('opinions.')))
  const answer = (granted: ProfileField[]) => void api.setServiceAccess(m.id, granted)
  // The news it reads come through Marianne (ctx.news), which also says what it gets without the user's sources.
  const news = 'les journaux, Marianne les lit pour lui'
  const reach = m.hosts.length
    ? `il se connecte à : ${m.hosts.join(', ')}${m.news ? ` · ${news}` : ''}`
    : `il ne se connecte à aucun site${m.news ? ` : ${news}` : ''}`
  const withoutSources =
    m.news && m.permissions.profile.includes('opinions.sources') ? ' Sans vos sources d’information : les titres de toutes les sources de Marianne.' : ''
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
        pour : {m.permissions.purpose} · {reach}
      </span>
      <span className="small dim">
        Il ne verra rien d’autre de votre profil, ni aucun de vos identifiants.{withoutSources} Vous pourrez changer d’avis dans Réglages › Services.
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
