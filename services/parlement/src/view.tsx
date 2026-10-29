import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useHost, useStored } from '@marianne/sdk/view'
import { parseVideoRef, videoKey } from './links'
import type { Clips, Favorites, ParlementMethods, Shelf, VideoItem } from './types'
import { AgendaTab, MeetingPane } from './ui/agenda'
import { BallotPane, BallotsTab } from './ui/ballots'
import { LensIcon, NavContext, StoreContext, useMethod, type Chambers, type Nav, type Prefs, type Store, type Tab, type Target } from './ui/common'
import { DataLine, DataProvider, useData } from './ui/data'
import { HemicycleTab } from './ui/hemicycle'
import { HomeTab } from './ui/home'
import { GroupPane, MemberPane, MembersTab } from './ui/members'
import { DEFAULT_SEARCH, LivePane, VideoPane, VideosTab, type VideoSearch } from './ui/videos'
import { VotePane } from './ui/vote'
import './view.css'

/**
 * 3615 PARLEMENT's screen: the user's members and the day at the Parlement, the hemicycles, the
 * public ballots, the members, the videos and the agenda of both chambers. A member, a ballot, a
 * meeting or a video opens over the tabs, with a way back. "◐ mes idées" compares with the leaning
 * the user declared (only when they did, and let the service read it).
 */

const NO_FAVORITES: Favorites = { members: [], groups: [] }
const NO_CLIPS: Clips = { items: [] }
const NO_SHELF: Shelf = { pinned: [], starred: [], progress: {} }
const NO_VIDEOS: { items: Record<string, VideoItem> } = { items: {} }
const DEFAULT_PREFS: Prefs = { lens: true }

/** What the screen opens on: a portal link (a video cited in an answer), a video at a passage, a meeting of "Aujourd'hui". */
function opening(params: Record<string, string | number>): { tab: Tab; stack: Target[] } {
  if (typeof params.url === 'string' && parseVideoRef(params.url)) return { tab: 'videos', stack: [{ kind: 'video', ref: params.url }] }
  if (params.video) {
    const start = Number(params.start)
    return { tab: 'videos', stack: [{ kind: 'video', ref: String(params.video), ...(start > 0 ? { start } : {}) }] }
  }
  if (params.meeting) return { tab: 'agenda', stack: [{ kind: 'meeting', id: String(params.meeting) }] }
  return { tab: 'home', stack: [] }
}

export function View() {
  const host = useHost<ParlementMethods>()
  // Opened again with other params (another link, another line of the day): a fresh screen.
  return (
    <DataProvider>
      <Screen key={JSON.stringify(host.params)} />
    </DataProvider>
  )
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'home', label: 'accueil' },
  { id: 'hemicycle', label: 'hémicycle' },
  { id: 'ballots', label: 'scrutins' },
  { id: 'members', label: 'élus' },
  { id: 'videos', label: 'vidéos' },
  { id: 'agenda', label: 'agenda' }
]

function Screen() {
  const host = useHost<ParlementMethods>()
  const { status } = useData()
  const [{ tab, stack }, setView] = useState(() => opening(host.params))
  const [chambers, setChambers] = useState<Chambers>('both')
  const [videoSearch, setVideoSearch] = useState<VideoSearch>(DEFAULT_SEARCH)
  const [favorites, setFavorites] = useStored<Favorites & { deputies?: string[] }>('favorites', NO_FAVORITES)
  const [clips, setClips] = useStored<Clips>('clips', NO_CLIPS)
  const [shelf, setShelf] = useStored<Shelf>('shelf', NO_SHELF)
  const [kept, setKept] = useStored('shelf-videos', NO_VIDEOS)
  const [prefs, setPrefs] = useStored<Prefs>('prefs', DEFAULT_PREFS)

  // Favorites of 3615 ASSEMBLEE: deputies only.
  useEffect(() => {
    if (favorites.deputies?.length) setFavorites({ members: [...new Set([...favorites.members, ...favorites.deputies])], deputies: undefined })
  }, [favorites, setFavorites])

  const ready = !!status?.ready
  const mine = useMethod('mine', ready ? [] : null)

  // A pane opens at the top of the page; "retour" brings the page back where it was, its tab as it was left.
  const root = useRef<HTMLDivElement>(null)
  const scrolls = useRef<number[]>([])
  const scroller = (): HTMLElement | null => {
    for (let el = root.current?.parentElement ?? null; el; el = el.parentElement) if (/auto|scroll/.test(getComputedStyle(el).overflowY)) return el
    return null
  }
  const scrollTo = (y: number) => requestAnimationFrame(() => scroller()?.scrollTo(0, y))

  // The screen's own width, whatever takes the rest of the window (the sidebar…).
  const [width, setWidth] = useState(1200)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const wide = width >= 1000
  const back = () => {
    setView((v) => ({ ...v, stack: v.stack.slice(0, -1) }))
    scrollTo(scrolls.current.pop() ?? 0)
  }
  const goTab = (id: Tab) => {
    scrolls.current = []
    setView({ tab: id, stack: [] })
    scrollTo(0)
  }

  const nav = useMemo<Nav>(
    () => ({
      open: (target) => {
        scrolls.current.push(scroller()?.scrollTop ?? 0)
        setView((v) => ({ ...v, stack: [...v.stack, target] }))
        scrollTo(0)
      },
      tab: goTab,
      searchVideos: (query) => {
        setVideoSearch({
          ...DEFAULT_SEARCH,
          days: 30,
          text: query.speaker ?? query.text ?? '',
          speaker: !!query.speaker,
          ...(query.type ? { type: query.type } : {}),
          ...(query.chamber ? { chamber: query.chamber } : {})
        })
        goTab('videos')
      },
      chambers,
      shows: (chamber) => chambers === 'both' || chambers === chamber,
      wide
    }),
    [chambers, wide] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const store = useMemo<Store>(
    () => ({
      favorites: { members: favorites.members, groups: favorites.groups },
      setFavorites,
      clips: clips.items,
      setClips: (items) => setClips({ items }),
      shelf,
      setShelf,
      videos: kept.items,
      keepVideo: (v) => {
        const key = videoKey(v.chamber, v.id)
        if (!kept.items[key]) setKept({ items: { ...kept.items, [key]: { ...v, timecode: undefined, live: undefined } } })
      },
      prefs,
      setPrefs,
      mine: mine.data
    }),
    [favorites, setFavorites, clips, setClips, shelf, setShelf, kept, setKept, prefs, setPrefs, mine.data]
  )

  const declared = !!(mine.data?.leaning && (mine.data.leaning.an.length || mine.data.leaning.se.length))
  const lensName = declared ? [mine.data!.leaning!.an[0], mine.data!.leaning!.se[0]].filter(Boolean).join(' · ') : ''
  const counts: Partial<Record<Tab, string>> = {
    members: favorites.members.length ? String(favorites.members.length) : '',
    videos: shelf.pinned.length ? `${shelf.pinned.length} à voir` : ''
  }
  const top = stack.at(-1)

  return (
    <NavContext.Provider value={nav}>
      <StoreContext.Provider value={store}>
        <div ref={root} className="parlement service-wide">
          <div className="tabs parlement-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id && !top ? 'on' : ''} onClick={() => goTab(t.id)}>
                {t.label}
                {counts[t.id] && <span className="parlement-count">{counts[t.id]}</span>}
              </button>
            ))}
            <span className="parlement-chamber">
              {declared && (
                <span className="parlement-seg">
                  <button
                    className={prefs.lens ? 'on' : ''}
                    onClick={() => setPrefs({ lens: !prefs.lens })}
                    title={`comparer avec la sensibilité indiquée dans Réglages › Identité (${lensName})`}
                  >
                    <LensIcon /> mes idées
                  </button>
                </span>
              )}
              <span className="small dim">chambre</span>
              <span className="parlement-seg">
                {(
                  [
                    ['both', 'les deux'],
                    ['an', 'Assemblée'],
                    ['se', 'Sénat']
                  ] as Array<[Chambers, string]>
                ).map(([id, label]) => (
                  <button key={id} className={chambers === id ? 'on' : ''} onClick={() => setChambers(id)}>
                    {label}
                  </button>
                ))}
              </span>
            </span>
          </div>
          {top && (
            <div key={JSON.stringify(top)} className="parlement-body">
              <button className="small dim parlement-back" onClick={back}>
                ← retour
              </button>
              <Pane target={top} />
            </div>
          )}
          {/* The tab stays under its panes, as it was left. A sync that brings new data shows it: the tab loads again. */}
          <div key={`${tab}:${status?.sync.syncedAt ?? ''}`} className="parlement-body" hidden={!!top}>
            {content(tab, videoSearch, setVideoSearch)}
          </div>
          <DataLine />
        </div>
      </StoreContext.Provider>
    </NavContext.Provider>
  )
}

function content(tab: Tab, search: VideoSearch, setSearch: (s: VideoSearch) => void): ReactNode {
  switch (tab) {
    case 'home':
      return <HomeTab />
    case 'hemicycle':
      return <HemicycleTab />
    case 'ballots':
      return <BallotsTab />
    case 'members':
      return <MembersTab />
    case 'videos':
      return <VideosTab search={search} setSearch={setSearch} />
    case 'agenda':
      return <AgendaTab />
  }
}

function Pane({ target }: { target: Target }) {
  switch (target.kind) {
    case 'member':
      return <MemberPane chamber={target.chamber} id={target.id} />
    case 'group':
      return <GroupPane chamber={target.chamber} id={target.id} />
    case 'ballot':
      return <BallotPane chamber={target.chamber} id={target.id} />
    case 'vote':
      return <VotePane chamber={target.chamber} id={target.id} />
    case 'meeting':
      return <MeetingPane id={target.id} />
    case 'live':
      return <LivePane chamber={target.chamber} id={target.id} />
    case 'video':
      return <VideoPane refId={target.ref} start={target.start} stopAt={target.stopAt} clip={target.clip} />
  }
}
