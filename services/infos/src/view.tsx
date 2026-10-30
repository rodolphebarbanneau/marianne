import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Failure,
  Loading,
  Notice,
  ServiceTools,
  useCall,
  useHost,
  useKeys,
  useSearch,
  useStored,
  useTab,
  useTabBadges,
  type ServiceKey
} from '@marianne/sdk/view'
import { keyAction } from './keys'
import { newSince } from './model'
import type { InfosMethods, Kiosk, Reading, Subject } from './types'
import { FailedLine, GearIcon, InfosContext, infosOf } from './ui/common'
import { Band, FrontTab, SearchResults } from './ui/front'
import { KioskTab } from './ui/kiosk'
import { SubjectPane } from './ui/pane'
import { WireTab } from './ui/wire'
import './view.css'

/**
 * 3615 INFOS's screen: the user's sources' titles of the last 24 hours, arranged three ways (by
 * subject, by time, by source) in the tabs its manifest declares. A subject opens over the tab, with
 * a way back. One reading under every tab: a new one, read every five minutes, ranks the list again
 * only when the user comes back to the screen or asks (« actualiser »), so the list never moves under
 * their eyes; the subject chosen is kept by its id.
 */

type Tab = 'front' | 'wire' | 'kiosk'

/** Marianne reads the feeds again every five minutes while the screen shows. */
const READ_EVERY = 5 * 60 * 1000
/** Under this width (the screen's own), « à la une » is one column: the chosen row opens its subject under itself. */
const WIDE = 1000
const NO_KIOSK: Kiosk = { order: [], large: [] }

export function View() {
  const host = useHost<InfosMethods>()
  const since = useVisit()
  // Opened again with other params (the tile's subject): a fresh screen, in the same visit.
  return <Screen key={JSON.stringify(host.params)} since={since} />
}

/**
 * The last visit, read once when INFOS opens: what came since is new in the fil, for the whole visit.
 * Now is kept as the last visit only when the user leaves (the screen closed, the window hidden), so
 * a screen opened again with other params, or a failed opening, doesn't take « 3 neufs » away.
 */
function useVisit(): string | null {
  const host = useHost<InfosMethods>()
  const [since, setSince] = useState<string | null>(null)
  const asked = useRef(false)
  useEffect(() => {
    if (!asked.current) {
      asked.current = true
      void host.call('visit').then(setSince)
    }
    const leave = () => void host.call('leave')
    const onHide = () => document.visibilityState === 'hidden' && leave()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      leave()
    }
  }, [host])
  return since
}

function Screen({ since }: { since: string | null }) {
  const host = useHost<InfosMethods>()
  const search = useSearch()
  const query = search.query
  const [all, setAll] = useState(false)
  const reading = useCall<InfosMethods, 'reading'>('reading', [{ all }])
  const [shown, setShown] = useState<Reading | null>(null)
  const [pending, setPending] = useState(false)
  const [stack, setStack] = useState<string[]>(() => (typeof host.params.subject === 'string' ? [host.params.subject] : []))
  const [chosen, setChosen] = useState<string | null>(null)
  const [mine, setMine] = useState(false)
  const [typed, setTyped] = useState('')
  const [kiosk, setKiosk] = useStored<Kiosk>('kiosk', NO_KIOSK)
  const notice = useCall<InfosMethods, 'notice'>('notice', [])
  // The word Marianne left goes once it has been on screen, not when it is asked for.
  const noticed = notice.data
  useEffect(() => {
    if (noticed) void host.call('noticeSeen')
  }, [noticed, host])
  const root = useRef<HTMLDivElement | null>(null)
  // The screen's root, as an element to watch: it is drawn again once the titles come (the wait has one of its own).
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)
  const setRoot = useCallback((el: HTMLDivElement | null) => {
    root.current = el
    setRootEl(el)
  }, [])

  // A new reading shows at once when it reads otherwise (« toutes », a grant changed); else it waits for the user.
  const latest = reading.data
  useEffect(() => {
    if (!latest) return
    if (!shown || shown.all !== latest.all || shown.filtered !== latest.filtered) {
      setShown(latest)
      setPending(false)
    } else if (latest.readAt !== shown.readAt) setPending(true)
  }, [latest]) // eslint-disable-line react-hooks/exhaustive-deps
  const apply = useCallback(() => {
    if (latest) setShown(latest)
    setPending(false)
  }, [latest])
  const { reload } = reading
  useEffect(() => {
    const t = setInterval(reload, READ_EVERY)
    return () => clearInterval(t)
  }, [reload])
  // Coming back to the window: the new reading, ranked.
  useEffect(() => {
    const onShow = () => document.visibilityState === 'visible' && apply()
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [apply])

  // The user picked a tab (a click, its key), the one shown too: that tab, its subjects closed, the new reading.
  const { tab: picked, open } = useTab(() => {
    setStack([])
    setTyped('')
    apply()
  })
  const tab = (picked || 'front') as Tab

  // The screen's own width, whatever takes the rest of the window (the sidebar…).
  const [width, setWidth] = useState(1200)
  useLayoutEffect(() => {
    if (!rootEl) return
    setWidth(rootEl.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(rootEl)
    return () => observer.disconnect()
  }, [rootEl])

  const subjects = shown?.subjects ?? []
  const listed = useMemo(() => (mine ? subjects.filter((s) => s.themes.length) : subjects), [subjects, mine])
  // The subject shown is kept by its id; when it leaves the list (the theme filter, a source set aside), the first listed.
  const current: Subject | null = listed.find((s) => s.id === chosen) ?? listed[0] ?? null
  const opened = stack.length ? (subjects.find((s) => s.id === stack[stack.length - 1]) ?? null) : null

  const openSubject = useCallback((id: string) => {
    setStack((s) => [...s, id])
    setTyped('')
  }, [])
  const close = useCallback(() => setStack((s) => s.slice(0, -1)), [])
  const choose = useCallback((id: string) => {
    setChosen(id)
    // A row chosen by its keys stays in view: within the rows' box when the list has one (the page stays where it
    // is), else in the page.
    requestAnimationFrame(() => {
      const row = root.current?.querySelector<HTMLElement>(`[data-subject="${CSS.escape(id)}"]`)
      const box = row?.closest<HTMLElement>('.infos-rows')
      if (!row) return
      if (!box) return row.scrollIntoView({ block: 'nearest' })
      const [r, b] = [row.getBoundingClientRect(), box.getBoundingClientRect()]
      if (r.top < b.top) box.scrollTop -= b.top - r.top
      else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom
    })
  }, [])

  const fresh = shown ? newSince(shown.items, since).length : 0
  useTabBadges({ wire: fresh ? `${fresh} neuf${fresh > 1 ? 's' : ''}` : '' })

  // The keys: ↓ ↑ choose a subject, digits then ENVOI open one by its number, échap closes what is open.
  const front = tab === 'front' && !stack.length && !query
  const numbered = (tab === 'front' || tab === 'kiosk') && !stack.length && !query
  const keys: ServiceKey[] = stack.length
    ? [{ key: 'RETOUR', what: 'fermer le sujet', shortcut: 'Échap' }]
    : front && current
      ? [
          { key: 'ENVOI', what: `ouvrir le sujet ${typed || current.number}`, shortcut: typed ? `${typed} ▮ Entrée` : 'Entrée' },
          { key: 'SUITE', what: 'sujet suivant', shortcut: '↓' },
          { key: 'RETOUR', what: 'sujet précédent', shortcut: '↑' }
        ]
      : numbered && subjects.length
        ? [
            {
              key: 'ENVOI',
              what: typed ? `ouvrir le sujet ${typed}` : 'ouvrir un sujet',
              shortcut: typed ? `${typed} ▮ Entrée` : `1…${subjects.length} Entrée`
            }
          ]
        : []
  useKeys(keys)

  const state = useRef({ front, numbered, typed, listed, current, subjects, stack })
  state.current = { front, numbered, typed, listed, current, subjects, stack }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      const s = state.current
      const action = keyAction(e.key, e.target as HTMLElement | null, document.activeElement, {
        front: s.front,
        numbered: s.numbered,
        typed: s.typed,
        open: s.stack.length
      })
      if (!action) return
      // Taken before Marianne's own keys: her échap, which would leave the screen, skips a key taken.
      e.preventDefault()
      e.stopPropagation()
      if (action === 'clear') setTyped('')
      else if (action === 'close') close()
      else if (action === 'digit') setTyped((t) => (t + e.key).slice(-3))
      else if (action === 'erase') setTyped((t) => t.slice(0, -1))
      else if (action === 'typed' || action === 'chosen') {
        const subject = action === 'typed' ? s.subjects[Number(s.typed) - 1] : s.current
        setTyped('')
        if (subject) openSubject(subject.id)
      } else if (s.listed.length) {
        const at = s.current ? s.listed.indexOf(s.current) : -1
        const next = s.listed[Math.min(s.listed.length - 1, Math.max(0, at + (action === 'down' ? 1 : -1)))]
        choose(next.id)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [close, choose, openSubject])

  const infos = useMemo(
    () => (shown ? infosOf(shown, host, { openSubject, setAll, openTab: open, query, since }) : null),
    [shown, host, openSubject, open, query, since]
  )

  if (!infos) {
    return (
      <div ref={setRoot} className="infos">
        {reading.error ? <Failure title="Titres indisponibles" error={reading.error} retry={reload} /> : <Loading label="les titres de vos sources" />}
      </div>
    )
  }
  const r = infos.reading
  const nothing = r.offline && !r.items.length

  return (
    <InfosContext.Provider value={infos}>
      <div ref={setRoot} className="infos">
        <ServiceTools>
          <span className="infos-tools">
            <span className="seg">
              {r.filtered && (
                <button className={all ? '' : 'on'} onClick={() => setAll(false)} title="les sources que vous acceptez (Réglages › Identité)">
                  vos sources · {r.accepted}
                </button>
              )}
              <button
                className={all || !r.filtered ? 'on' : ''}
                onClick={() => setAll(true)}
                disabled={!r.filtered}
                title={r.filtered ? `aussi les ${r.sources.length - r.accepted} sources écartées, pour cette fois` : 'toutes les sources de Marianne'}
              >
                toutes · {r.sources.length}
              </button>
            </span>
            <button className="icon-btn" onClick={infos.openSources} title="vos sources et leurs couleurs (Réglages › Identité)" aria-label="vos sources">
              <GearIcon />
            </button>
          </span>
        </ServiceTools>
        {notice.data && <Notice>{notice.data}</Notice>}
        {nothing ? (
          <Failure title="Titres indisponibles" error="Aucune source n’a répondu, et Marianne n’a pas encore de titres gardés." retry={reload} />
        ) : opened ? (
          <div className="infos-body">
            <button className="btn small infos-back" onClick={close}>
              ← retour
            </button>
            <SubjectPane key={opened.id} subject={opened} />
          </div>
        ) : stack.length ? (
          <div className="infos-body">
            <button className="btn small infos-back" onClick={close}>
              ← retour
            </button>
            <p className="infos-empty">Ce sujet n’est plus dans les titres de vos sources.</p>
          </div>
        ) : (
          <div className="infos-body">
            {tab === 'front' && !query && <Band refreshing={reading.loading} pending={pending} apply={apply} choose={choose} />}
            {!r.filtered && (
              <p className="small dim infos-shared">
                vos sources ne sont pas partagées avec INFOS ·{' '}
                <button className="link" onClick={() => host.openRoute('settings/identity')}>
                  Réglages › Identité
                </button>
              </p>
            )}
            {tab === 'front' &&
              (query ? <SearchResults /> : <FrontTab listed={listed} chosen={current} choose={setChosen} mine={mine} setMine={setMine} wide={width >= WIDE} />)}
            {tab === 'wire' && <WireTab />}
            {tab === 'kiosk' && <KioskTab kiosk={kiosk} setKiosk={setKiosk} />}
          </div>
        )}
        <FailedLine />
      </div>
    </InfosContext.Provider>
  )
}
