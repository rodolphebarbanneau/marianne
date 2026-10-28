import { useMemo, useState, type ReactNode } from 'react'
import { useHost, useStored } from '@marianne/sdk/view'
import { parseVideoRef } from './links'
import type { AssembleeMethods, Clips, DeputyCard, Favorites } from './types'
import { BallotPane, BallotsTab } from './ui/ballots'
import { ClipsTab } from './ui/clips'
import { NavContext, StoreContext, useMethod, type Nav, type Store, type Tab, type Target } from './ui/common'
import { DataLine, DataProvider, NeedsData, useData } from './ui/data'
import { DeputyPane, FavoritesTab, GroupPane, MineTab } from './ui/deputies'
import { MeetingPane, TodayTab } from './ui/today'
import { DEFAULT_SEARCH, LivePane, VideoPane, VideosTab, type VideoSearch } from './ui/videos'
import './view.css'

/**
 * 3615 ASSEMBLEE's screen: the agenda and what is live, the user's deputies and favorites, the
 * public ballots, the videos and the passages the user kept. A deputy, a ballot, a meeting or a
 * video opens over the tabs, with a way back.
 */

const NO_FAVORITES: Favorites = { deputies: [], groups: [] }
const NO_CLIPS: Clips = { items: [] }

/** What the screen opens on: a portal link (a video cited in an answer), a video at a passage, a meeting of "Aujourd'hui". */
function opening(params: Record<string, string | number>): { tab: Tab; stack: Target[] } {
  const ref = typeof params.url === 'string' ? parseVideoRef(params.url) : null
  if (ref) return { tab: 'videos', stack: [{ kind: 'video', id: ref.id, ...(ref.timecode ? { start: ref.timecode } : {}) }] }
  if (params.video) {
    const start = Number(params.start)
    return { tab: 'videos', stack: [{ kind: 'video', id: String(params.video), ...(start > 0 ? { start } : {}) }] }
  }
  if (params.meeting) return { tab: 'today', stack: [{ kind: 'meeting', id: String(params.meeting) }] }
  return { tab: 'today', stack: [] }
}

export function View() {
  const host = useHost<AssembleeMethods>()
  // Opened again with other params (another link, another line of the day): a fresh screen.
  return (
    <DataProvider>
      <Screen key={JSON.stringify(host.params)} />
    </DataProvider>
  )
}

function Screen() {
  const host = useHost<AssembleeMethods>()
  const { status } = useData()
  const [{ tab, stack }, setView] = useState(() => opening(host.params))
  const [videoSearch, setVideoSearch] = useState<VideoSearch>(DEFAULT_SEARCH)
  const [favorites, setFavorites] = useStored<Favorites>('favorites', NO_FAVORITES)
  const [clips, setClips] = useStored<Clips>('clips', NO_CLIPS)

  const ready = !!status?.ready
  const mine = useMethod('myDeputies', ready && host.home ? [] : null)
  const starred = useMethod('deputies', ready && favorites.deputies.length ? [{ ids: favorites.deputies }] : null)
  const followed = useMemo(() => {
    const all = [...(host.home ? (mine.data?.deputies ?? []) : []), ...(starred.data ?? []).filter((d) => favorites.deputies.includes(d.id))]
    return [...new Map(all.map((d): [string, DeputyCard] => [d.id, d])).values()]
  }, [host.home, mine.data, starred.data, favorites.deputies])

  const nav = useMemo<Nav>(
    () => ({
      open: (target) => setView((v) => ({ ...v, stack: [...v.stack, target] })),
      searchVideos: (query) => {
        setVideoSearch({ ...DEFAULT_SEARCH, days: 30, ...query, text: query.text ?? '', speaker: query.speaker ?? '' })
        setView({ tab: 'videos', stack: [] })
      }
    }),
    []
  )
  const store = useMemo<Store>(
    () => ({ favorites, setFavorites, clips: clips.items, setClips: (items) => setClips({ items }), followed }),
    [favorites, setFavorites, clips, setClips, followed]
  )

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'today', label: 'aujourd’hui' },
    { id: 'mine', label: 'mes députés' },
    {
      id: 'favorites',
      label: `favoris${favorites.deputies.length + favorites.groups.length ? ` (${favorites.deputies.length + favorites.groups.length})` : ''}`
    },
    { id: 'ballots', label: 'scrutins' },
    { id: 'videos', label: 'vidéos' },
    { id: 'clips', label: `mes extraits${clips.items.length ? ` (${clips.items.length})` : ''}` }
  ]
  const top = stack.at(-1)

  return (
    <NavContext.Provider value={nav}>
      <StoreContext.Provider value={store}>
        <div className="assemblee">
          <div className="tabs">
            {tabs.map((t) => (
              <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setView({ tab: t.id, stack: [] })}>
                {t.label}
              </button>
            ))}
          </div>
          {top ? (
            <div key={JSON.stringify(top)} className="assemblee-body">
              <button className="small dim assemblee-back" onClick={() => setView((v) => ({ ...v, stack: v.stack.slice(0, -1) }))}>
                ← retour
              </button>
              <Pane target={top} />
            </div>
          ) : (
            // A sync that brings new data shows it: the tab loads again.
            <div key={status?.sync.syncedAt ?? ''} className="assemblee-body">
              {content(tab, videoSearch, setVideoSearch)}
            </div>
          )}
          <DataLine />
        </div>
      </StoreContext.Provider>
    </NavContext.Provider>
  )
}

function content(tab: Tab, search: VideoSearch, setSearch: (s: VideoSearch) => void): ReactNode {
  switch (tab) {
    case 'today':
      return <TodayTab />
    case 'mine':
      return <MineTab />
    case 'favorites':
      return <FavoritesTab />
    case 'ballots':
      return <BallotsTab />
    case 'videos':
      return <VideosTab search={search} setSearch={setSearch} />
    case 'clips':
      return <ClipsTab />
  }
}

function Pane({ target }: { target: Target }) {
  switch (target.kind) {
    case 'deputy':
      return (
        <NeedsData>
          <DeputyPane id={target.id} />
        </NeedsData>
      )
    case 'group':
      return (
        <NeedsData>
          <GroupPane id={target.id} />
        </NeedsData>
      )
    case 'ballot':
      return (
        <NeedsData>
          <BallotPane id={target.id} />
        </NeedsData>
      )
    case 'meeting':
      return <MeetingPane id={target.id} />
    case 'live':
      return <LivePane meetingId={target.meetingId} />
    case 'video':
      return <VideoPane id={target.id} start={target.start} stopAt={target.stopAt} clip={target.clip} />
  }
}
