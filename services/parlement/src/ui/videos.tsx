import { useEffect, useMemo, useRef, useState } from 'react'
import { Field, Modal, useHost } from '@marianne/sdk/view'
import { PORTAL, SENATE_PORTAL, videoKey, videoPage } from '../links'
import { addDays, clock, parisDay, parseClock } from '../time'
import type { Chamber, Clip, LiveStream, MemberCard, Passage, VideoItem, VideoOpen, VideoQuery, VideoType } from '../types'
import { CHAMBER_NAMES } from '../types'
import {
  ChamberCode,
  dateTime,
  Face,
  Failure,
  GroupChip,
  hour,
  Loading,
  longDay,
  plural,
  shortDate,
  shortDay,
  useDebounced,
  useFollowed,
  useMethod,
  useNav,
  useStore,
  yourTitle
} from './common'
import { Thumb } from './home'
import { videoRef } from './members'
import { Player, type PlayerHandle } from './player'

/**
 * The videos of both chambers: shelves before the list (live, pinned to watch with where the user
 * stopped, their members' passages), the list sorted by day, text or member, the player with its
 * chapters, and passages kept as clips.
 */

type Shelf = 'all' | 'pinned' | 'starred' | 'clips'
type By = 'day' | 'text' | 'member'

export interface VideoSearch {
  days: number
  type?: VideoType
  text: string
  /** The words are a speaker's name, not the title's. */
  speaker: boolean
  chamber?: Chamber
}

export const DEFAULT_SEARCH: VideoSearch = { days: 7, text: '', speaker: false }

const PERIODS = [
  { days: 0, label: 'aujourd’hui' },
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 365, label: 'un an' }
]

const TYPES: Array<{ id: VideoType | undefined; label: string }> = [
  { id: undefined, label: 'tout' },
  { id: 'seance', label: 'séance publique' },
  { id: 'questions', label: 'questions au gouvernement' },
  { id: 'commission', label: 'commissions' },
  { id: 'autre', label: 'autres' }
]

/** The pin of the folders: "to watch soon". */
export function PinIcon() {
  return <span className="parlement-pin" aria-hidden />
}

/** Pin, star, cut: what a video's line offers. */
function VideoActions({ video }: { video: VideoItem }) {
  const nav = useNav()
  const { pinned, starred, togglePin, toggleStar } = useShelf()
  const key = videoKey(video.chamber, video.id)
  return (
    <span className="parlement-vacts" onClick={(e) => e.stopPropagation()}>
      <button
        className={`parlement-vbtn${pinned(key) ? ' on' : ''}`}
        onClick={() => togglePin(video)}
        title={pinned(key) ? 'retirer de « à voir »' : 'épingler : à voir'}
      >
        <PinIcon />
      </button>
      <button
        className={`parlement-vbtn${starred(key) ? ' on' : ''}`}
        onClick={() => toggleStar(video)}
        title={starred(key) ? 'retirer des favoris' : 'mettre en favori'}
      >
        {starred(key) ? '★' : '☆'}
      </button>
      <button
        className="parlement-vbtn"
        onClick={() => nav.open({ kind: 'video', ref: videoRef(video), ...(video.timecode ? { start: video.timecode } : {}), clip: 'new' })}
        title="garder un extrait"
      >
        ✂
      </button>
    </span>
  )
}

/** The shelf: pinned and starred videos, and where the user stopped. */
export function useShelf() {
  const { shelf, setShelf, keepVideo } = useStore()
  const keyOf = (e: { video: string; chamber: Chamber }) => videoKey(e.chamber, e.video)
  return {
    pinned: (key: string) => shelf.pinned.some((e) => keyOf(e) === key),
    starred: (key: string) => shelf.starred.some((e) => keyOf(e) === key),
    togglePin(v: VideoItem) {
      const key = videoKey(v.chamber, v.id)
      const on = shelf.pinned.some((e) => keyOf(e) === key)
      if (!on) keepVideo(v)
      setShelf({
        pinned: on ? shelf.pinned.filter((e) => keyOf(e) !== key) : [{ video: v.id, chamber: v.chamber, at: new Date().toISOString() }, ...shelf.pinned]
      })
    },
    toggleStar(v: VideoItem) {
      const key = videoKey(v.chamber, v.id)
      const on = shelf.starred.some((e) => keyOf(e) === key)
      if (!on) keepVideo(v)
      setShelf({
        starred: on ? shelf.starred.filter((e) => keyOf(e) !== key) : [{ video: v.id, chamber: v.chamber, at: new Date().toISOString() }, ...shelf.starred]
      })
    },
    progress: (key: string) => shelf.progress[key]
  }
}

/** The kind and organ of a video, in a few words. */
const what = (v: VideoItem) => [v.type, v.kind === 'commission' && v.commission ? v.commission : ''].filter(Boolean).join(' · ')

/** The bill a video is about, from its title or description; '' when it doesn't name one. */
export function billOf(v: VideoItem): string {
  const m = `${v.title} ${v.description}`.match(/((?:projet|proposition) de loi(?: organique| constitutionnelle)?[^.;:()\n«»]{4,140})/i)
  if (!m) return ''
  const text = m[1]
    .replace(/\s+(?:-|–)\s+.*$/, '')
    .replace(/\s+\(.*$/, '')
    .trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function VideoRow({ video, members }: { video: VideoItem; members?: MemberCard[] }) {
  const nav = useNav()
  const { progress } = useShelf()
  const key = videoKey(video.chamber, video.id)
  const done = progress(key)
  const bill = billOf(video)
  return (
    <div
      className="parlement-vrow"
      role="button"
      tabIndex={0}
      onClick={() => nav.open({ kind: 'video', ref: videoRef(video), ...(video.timecode ? { start: video.timecode } : {}) })}
    >
      <Thumb
        chamber={video.chamber}
        src={video.thumbnail}
        duration={video.durationMs ? clock(video.durationMs) : undefined}
        progress={done && video.durationMs ? done / video.durationMs : undefined}
      />
      <span className="parlement-stack">
        <span className="parlement-vmeta">
          <ChamberCode chamber={video.chamber} />
          <span>{hour(video.date)}</span>
          <span>· {what(video)}</span>
          {bill && <span className="parlement-why parlement-ell">{bill}</span>}
        </span>
        <span className="hi parlement-clamp">{video.title}</span>
        {video.timecode !== undefined && <span className="small parlement-tc">▶ passage à {clock(video.timecode)}</span>}
        {members && members.length > 0 && (
          <span className="parlement-row">
            {members.map((m) => (
              <WhoChip key={m.id} member={m} />
            ))}
          </span>
        )}
      </span>
      <VideoActions video={video} />
    </div>
  )
}

function WhoChip({ member }: { member: MemberCard }) {
  const { mine } = useFollowed()
  const own = mine.some((m) => m.id === member.id)
  return (
    <span className={`parlement-who${own ? ' me' : ''}`} title={own ? 'votre élu' : 'suivi'}>
      <Face member={member} size={14} />
      {member.name}
    </span>
  )
}

export function VideosTab({ search, setSearch }: { search: VideoSearch; setSearch: (s: VideoSearch) => void }) {
  const host = useHost()
  const nav = useNav()
  const { shelf, clips, videos: kept } = useStore()
  const { ids } = useFollowed()
  const [tab, setTab] = useState<Shelf>('all')
  const [sortBy, setBy] = useState<By>('day')
  // By member: the passages of the user's members, a shelf of "toutes" only.
  const by: By = sortBy === 'member' && tab !== 'all' ? 'day' : sortBy
  const text = useDebounced(search.text.trim())
  const chamber = nav.chambers === 'both' ? search.chamber : nav.chambers
  const query = useMemo((): VideoQuery => {
    const to = parisDay()
    return {
      from: addDays(to, -search.days),
      to,
      ...(chamber ? { chamber } : {}),
      ...(search.type ? { type: search.type } : {}),
      ...(text ? (search.speaker ? { speaker: text } : { text }) : {})
    }
  }, [search.days, search.type, search.speaker, chamber, text])
  const videos = useMethod('videos', [query])
  const live = useMethod('live', [])
  const passages = useMethod('passages', ids.length ? [ids, 7] : null)
  const people = useMethod('members', ids.length ? [{ ids }] : null)
  const byId = useMemo(() => new Map((people.data ?? []).map((m) => [m.id, m])), [people.data])

  const streams = (live.data ?? []).filter((s) => nav.shows(s.chamber))
  const shown = (v: VideoItem) => nav.shows(v.chamber) && (!search.type || v.kind === search.type)
  const shelfOf = (entries: Array<{ video: string; chamber: Chamber }>) =>
    entries.map((e) => kept[videoKey(e.chamber, e.video)]).filter((v): v is VideoItem => !!v && shown(v))
  const pinned = shelfOf(shelf.pinned)
  const starred = shelfOf(shelf.starred)
  const spoken = (passages.data ?? []).filter((p) => shown(p.video))
  const speakersOf = useMemo(() => {
    const map = new Map<string, MemberCard[]>()
    for (const p of passages.data ?? []) {
      const key = videoKey(p.video.chamber, p.video.id)
      const m = byId.get(p.member)
      if (m && !(map.get(key) ?? []).some((x) => x.id === m.id)) map.set(key, [...(map.get(key) ?? []), m])
    }
    return map
  }, [passages.data, byId])

  const list = tab === 'pinned' ? pinned : tab === 'starred' ? starred : (videos.data ?? []).filter(shown)
  const shelves: Array<[Shelf, string]> = [
    ['all', 'toutes'],
    ['pinned', `à voir · ${shelf.pinned.length}`],
    ['starred', `★ favoris · ${shelf.starred.length}`],
    ['clips', `✂ extraits · ${clips.length}`]
  ]

  return (
    <>
      <div className="parlement-toolbar">
        <span className="chips">
          {shelves.map(([id, label]) => (
            <button key={id} className={`chip${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </span>
        <span className="parlement-grow" />
        {tab !== 'clips' && (
          <span className="parlement-row nowrap">
            <span className="small dim">ranger par</span>
            <span className="parlement-seg">
              {([['day', 'jour'], ['text', 'texte'], ...(tab === 'all' ? [['member', 'élu']] : [])] as Array<[By, string]>).map(([id, label]) => (
                <button key={id} className={by === id ? 'on' : ''} onClick={() => setBy(id)}>
                  {label}
                </button>
              ))}
            </span>
          </span>
        )}
      </div>
      {tab !== 'clips' && (
        <div className="parlement-toolbar">
          <span className="chips">
            {TYPES.map((t) => (
              <button key={t.label} className={`chip${search.type === t.id ? ' on' : ''}`} onClick={() => setSearch({ ...search, type: t.id })}>
                {t.label}
              </button>
            ))}
          </span>
          {search.chamber && nav.chambers === 'both' && (
            <button className="chip on" onClick={() => setSearch({ ...search, chamber: undefined })} title="voir les vidéos des deux chambres">
              {search.chamber === 'an' ? 'Assemblée seulement' : 'Sénat seulement'} ✕
            </button>
          )}
          <span className="parlement-grow" />
          {tab === 'all' && (
            <>
              <label className="search-field parlement-search">
                <svg viewBox="0 0 16 16" aria-hidden>
                  <path d="M6.8 2a4.8 4.8 0 1 1 0 9.6a4.8 4.8 0 1 1 0-9.6z M10.3 10.3l4 4" />
                </svg>
                <input
                  value={search.text}
                  onChange={(e) => setSearch({ ...search, text: e.target.value, ...(e.target.value ? {} : { chamber: undefined }) })}
                  placeholder={search.speaker ? 'un orateur : nom, ou « nom prénom »' : 'mots du titre'}
                />
              </label>
              <select value={search.speaker ? 'speaker' : 'title'} onChange={(e) => setSearch({ ...search, speaker: e.target.value === 'speaker' })}>
                <option value="title">dans le titre</option>
                <option value="speaker">un orateur</option>
              </select>
              <select value={search.days} onChange={(e) => setSearch({ ...search, days: Number(e.target.value) })}>
                {PERIODS.map((p) => (
                  <option key={p.days} value={p.days}>
                    {p.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}
      {tab === 'clips' ? (
        <ClipsShelf />
      ) : (
        <>
          {tab === 'all' && streams.length > 0 && <LiveShelf streams={streams} />}
          {tab === 'all' && pinned.length > 0 && <PinnedShelf videos={pinned} />}
          {tab === 'all' && spoken.length > 0 && by !== 'member' && <PassagesShelf passages={spoken} byId={byId} />}
          <div>
            <div className="parlement-h">
              <span className="label">{tab === 'all' ? 'toutes les vidéos' : tab === 'pinned' ? 'à voir' : 'favoris'}</span>
              <span className="small dim">
                {by === 'member' ? plural(spoken.length, 'passage de vos élus', 'passages de vos élus') : plural(list.length, 'vidéo')} · rangées par{' '}
                {by === 'day' ? 'jour' : by === 'text' ? 'texte' : 'élu'}
              </span>
            </div>
            {tab === 'all' && videos.error ? (
              <Failure error={videos.error} retry={videos.reload} />
            ) : tab === 'all' && !videos.data ? (
              <Loading>recherche des vidéos…</Loading>
            ) : by === 'member' ? (
              <ByMember passages={spoken} byId={byId} loading={!!ids.length && !passages.data} />
            ) : list.length ? (
              <Grouped videos={list} by={by} speakersOf={speakersOf} />
            ) : (
              <p className="dim">
                {tab === 'pinned'
                  ? 'Rien à voir pour l’instant : épinglez une vidéo pour la retrouver ici, avec l’endroit où vous vous êtes arrêté.'
                  : tab === 'starred'
                    ? 'Aucun favori : ☆ sur une vidéo la garde ici.'
                    : 'Aucune vidéo publiée sur cette période avec ces critères.'}
              </p>
            )}
          </div>
        </>
      )}
      <p className="small dim parlement-foot">
        Les vidéos restent en ligne environ un an sur les portails ·{' '}
        <button className="link" onClick={() => host.openUrl(`${PORTAL}/`)}>
          portail de l’Assemblée
        </button>{' '}
        ·{' '}
        <button className="link" onClick={() => host.openUrl(`${SENATE_PORTAL}/`)}>
          portail du Sénat
        </button>
      </p>
    </>
  )
}

function Grouped({ videos, by, speakersOf }: { videos: VideoItem[]; by: 'day' | 'text'; speakersOf: Map<string, MemberCard[]> }) {
  const groups = new Map<string, VideoItem[]>()
  const sorted = [...videos].sort((a, b) => b.date.localeCompare(a.date))
  for (const v of sorted) {
    const key = by === 'day' ? v.date.slice(0, 10) : billOf(v) || ''
    groups.set(key, [...(groups.get(key) ?? []), v])
  }
  const keys = [...groups.keys()]
  if (by === 'text') keys.sort((a, b) => Number(a === '') - Number(b === '') || groups.get(b)!.length - groups.get(a)!.length)
  const today = parisDay()
  return (
    <>
      {keys.map((key) => {
        const list = groups.get(key)!
        const label =
          by === 'day'
            ? key === today
              ? `aujourd’hui · ${longDay(key)}`
              : key === addDays(today, -1)
                ? `hier · ${longDay(key)}`
                : longDay(key)
            : key || 'hors texte de loi'
        return (
          <div key={key || 'none'}>
            <div className="parlement-day-h">
              <span className={by === 'day' ? 'label' : 'hi'}>{label}</span>
              <span className="small dim">
                {list.length} vidéo{list.length > 1 ? 's' : ''}
                {by === 'text' ? ` · ${[...new Set(list.map((v) => (v.chamber === 'an' ? 'AN' : 'Sénat')))].join(' + ')}` : ''}
              </span>
            </div>
            {list.map((v) => (
              <VideoRow key={`${v.chamber}:${v.id}:${v.timecode ?? ''}`} video={v} members={speakersOf.get(videoKey(v.chamber, v.id))} />
            ))}
          </div>
        )
      })}
    </>
  )
}

function ByMember({ passages, byId, loading }: { passages: Passage[]; byId: Map<string, MemberCard>; loading: boolean }) {
  if (loading) return <Loading>les passages de vos élus…</Loading>
  const members = [...new Set(passages.map((p) => p.member))]
  if (!members.length) return <p className="dim">Aucun passage de vos élus ni de vos suivis ces 7 derniers jours, d’après les chapitres des portails.</p>
  return (
    <>
      {members.map((id) => {
        const m = byId.get(id)
        const theirs = passages.filter((p) => p.member === id)
        return (
          <div key={id}>
            <div className="parlement-day-h">
              {m && <Face member={m} size={18} />}
              <span className="hi">{m?.name ?? id}</span>
              {m && <GroupChip short={m.groupShort} color={m.groupColor} small />}
              {m && <ChamberCode chamber={m.chamber} />}
              <span className="small dim">
                {theirs.length} passage{theirs.length > 1 ? 's' : ''}
              </span>
            </div>
            {theirs.map((p) => (
              <VideoRow key={`${p.video.id}:${p.timecode}`} video={{ ...p.video, timecode: p.timecode }} />
            ))}
          </div>
        )
      })}
    </>
  )
}

function LiveShelf({ streams }: { streams: LiveStream[] }) {
  const nav = useNav()
  return (
    <div>
      <div className="parlement-h">
        <span className="label">en direct</span>
      </div>
      <div className="parlement-shelf" style={{ ['--n' as string]: Math.max(streams.length, 2) }}>
        {streams.map((s) => (
          <div key={`${s.chamber}:${s.id}`} className="parlement-vcard onair wide">
            <Thumb chamber={s.chamber} src={s.poster} live large />
            <span className="parlement-stack">
              <span className="parlement-row small">
                <ChamberCode chamber={s.chamber} />
                <span className="parlement-live">● depuis {hour(s.startAt)}</span>
              </span>
              <span className="hi parlement-clamp">{s.title || s.subject || s.organ}</span>
              <span className="small dim">{s.organ}</span>
              <span className="parlement-row parlement-push">
                <button className="btn small primary" onClick={() => nav.open({ kind: 'live', chamber: s.chamber, id: s.id })}>
                  regarder
                </button>
                {s.chamber === 'an' && (
                  <button className="btn small" onClick={() => nav.open({ kind: 'meeting', id: s.id })}>
                    ordre du jour
                  </button>
                )}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PinnedShelf({ videos }: { videos: VideoItem[] }) {
  const nav = useNav()
  const { progress } = useShelf()
  return (
    <div>
      <div className="parlement-h">
        <span className="label">à voir · épinglées</span>
        <span className="small dim">retirées une fois vues</span>
      </div>
      <div className="parlement-shelf" style={{ ['--n' as string]: 4 }}>
        {videos.slice(0, 7).map((v) => {
          const at = progress(videoKey(v.chamber, v.id))
          return (
            <div
              key={`${v.chamber}:${v.id}`}
              className="parlement-vcard"
              role="button"
              tabIndex={0}
              onClick={() => nav.open({ kind: 'video', ref: videoRef(v) })}
            >
              <Thumb
                chamber={v.chamber}
                src={v.thumbnail}
                large
                duration={v.durationMs ? clock(v.durationMs) : undefined}
                progress={at && v.durationMs ? at / v.durationMs : undefined}
              />
              <span className="parlement-row small">
                <ChamberCode chamber={v.chamber} />
                <span className="dim">{shortDay(v.date.slice(0, 10))}</span>
                <span className="parlement-grow" />
                <VideoActions video={v} />
              </span>
              <span className="hi small parlement-clamp">{v.title}</span>
              <span className="small accent">{at ? `reprendre à ${clock(at)}` : 'pas encore commencée'}</span>
            </div>
          )
        })}
        {videos.length < 4 && (
          <div className="parlement-vcard empty">
            <PinIcon />
            <span className="small">épinglez une vidéo pour la retrouver ici</span>
          </div>
        )}
      </div>
    </div>
  )
}

function PassagesShelf({ passages, byId }: { passages: Passage[]; byId: Map<string, MemberCard> }) {
  const nav = useNav()
  const { mine } = useFollowed()
  return (
    <div>
      <div className="parlement-h">
        <span className="label">vos élus en vidéo</span>
        <span className="small dim">les passages où ils parlent, d’après les chapitres des portails</span>
      </div>
      <div className="parlement-lines">
        {passages.slice(0, 8).map((p) => {
          const m = byId.get(p.member)
          const own = mine.some((x) => x.id === p.member)
          return (
            <div
              key={`${p.member}:${p.video.id}:${p.timecode}`}
              className="parlement-line parlement-passage"
              role="button"
              tabIndex={0}
              onClick={() => nav.open({ kind: 'video', ref: videoRef(p.video), start: p.timecode })}
            >
              {m ? <Face member={m} size={22} /> : <span />}
              <span className="parlement-stack">
                <span className="hi parlement-ell">{m?.name ?? p.member}</span>
                <span className="small dim">
                  {m && <GroupChip short={m.groupShort} color={m.groupColor} small />} {m && own ? `· ${yourTitle(m)}` : '· suivi'}
                </span>
              </span>
              <span className="parlement-stack">
                <span className="parlement-ell">{p.video.title}</span>
                <span className="small dim">
                  <ChamberCode chamber={p.video.chamber} /> {what(p.video)} · {shortDay(p.video.date.slice(0, 10))}
                </span>
              </span>
              <span className="parlement-tc">▶ {clock(p.timecode)}</span>
              <VideoActions video={p.video} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** « extraits »: the passages the user kept, in their archive. */
function ClipsShelf() {
  const host = useHost()
  const nav = useNav()
  const { clips, setClips } = useStore()
  const [removing, setRemoving] = useState<Clip | null>(null)
  const shown = clips.filter((c) => nav.shows(c.chamber ?? 'an'))
  if (!shown.length)
    return (
      <div className="box-note">
        Aucun extrait pour l’instant. Dans une vidéo, ✂ garde un passage ici, privé, dans votre archive : pour le revoir, le partager ou en parler avec
        Marianne.
      </div>
    )
  return (
    <>
      <div className="parlement-lines">
        {shown.map((c) => {
          const chamber = c.chamber ?? 'an'
          const ref = videoKey(chamber, c.video)
          return (
            <div key={c.id} className="parlement-vrow">
              <Thumb chamber={chamber} src={c.thumbnail} />
              <span className="parlement-stack">
                <span className="parlement-vmeta">
                  <ChamberCode chamber={chamber} />
                  <span>{shortDate(c.date)}</span>
                  <span className="parlement-tc">
                    ▶ {clock(c.start)} · {clock(c.end - c.start)}
                  </span>
                </span>
                <span className="hi">{c.title}</span>
                <span className="small dim parlement-ell">{c.videoTitle}</span>
              </span>
              <span className="parlement-vacts">
                <button className="btn small" onClick={() => nav.open({ kind: 'video', ref, start: c.start, stopAt: c.end })}>
                  regarder
                </button>
                <button className="btn small" onClick={() => nav.open({ kind: 'video', ref, start: c.start, clip: c.id })}>
                  modifier
                </button>
                <button className="btn small" onClick={() => host.copy(videoPage(chamber, c.video, c.start), 'lien copié')}>
                  copier le lien
                </button>
                <button
                  className="btn small"
                  onClick={() =>
                    host.ask(
                      `Que dit ce passage d’une vidéo ${chamber === 'an' ? 'de l’Assemblée nationale' : 'du Sénat'} (« ${c.title} », de ${clock(c.start)} à ${clock(c.end)}) ? ${videoPage(chamber, c.video, c.start)}`
                    )
                  }
                >
                  demander à Marianne
                </button>
                <button className="btn small danger" onClick={() => setRemoving(c)}>
                  supprimer
                </button>
              </span>
            </div>
          )
        })}
      </div>
      {removing && (
        <Modal onClose={() => setRemoving(null)}>
          <div className="in">
            <span className="label">supprimer l’extrait</span>
            <p>
              « {removing.title} » ({clock(removing.start)} → {clock(removing.end)}) sera retiré de vos extraits. La vidéo reste sur le portail{' '}
              {removing.chamber === 'se' ? 'du Sénat' : 'de l’Assemblée'}.
            </p>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setRemoving(null)}>
              annuler
            </button>
            <button
              className="btn danger"
              onClick={() => {
                setClips(clips.filter((c) => c.id !== removing.id))
                setRemoving(null)
              }}
            >
              supprimer
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ---------------------------------------------------------------- watching

/** A broadcast, from the list of what is live. */
export function LivePane({ chamber, id }: { chamber: Chamber; id: string }) {
  const host = useHost()
  const nav = useNav()
  const live = useMethod('live', [])
  if (live.error) return <Failure error={live.error} retry={live.reload} />
  if (!live.data) return <Loading />
  const stream = live.data.find((s) => s.chamber === chamber && s.id === id)
  if (!stream) return <p className="dim">Cette diffusion n’est plus en direct : la vidéo sera sur le portail un peu après la réunion.</p>
  return (
    <>
      <p className="parlement-row small">
        <ChamberCode chamber={chamber} />
        <span className="parlement-live">● en direct</span>
        <span className="dim">
          · {stream.organ} · depuis {hour(stream.startAt)}
        </span>
      </p>
      <h3 className="hi parlement-title">{stream.title || stream.subject}</h3>
      <div className="parlement-watch">
        <div className="parlement-stack">
          <Player src={stream.hls} poster={stream.poster} autoPlay />
          <p className="parlement-actions">
            {stream.meeting && (
              <button className="btn small" onClick={() => nav.open({ kind: 'meeting', id: stream.meeting! })}>
                la réunion
              </button>
            )}
            <button
              className="btn small"
              onClick={() =>
                host.ask(
                  `Que se passe-t-il en ce moment ${chamber === 'an' ? 'à l’Assemblée nationale' : 'au Sénat'} (${stream.organ}) ? ${stream.title || stream.subject}`
                )
              }
            >
              demander à Marianne
            </button>
            <button className="btn small" onClick={() => host.openUrl(stream.url)}>
              page officielle
            </button>
          </p>
        </div>
        <LiveAgenda stream={stream} />
      </div>
    </>
  )
}

/**
 * Beside a broadcast, what it is about: at the Sénat, its video's chapters (the portal names them
 * before their times, at the end of the sitting); otherwise the agenda of the meeting it shows.
 */
export function LiveAgenda({ stream }: { stream: LiveStream }) {
  const video = useMethod('video', stream.chamber === 'se' ? [`se:${stream.id}`] : null)
  const chapters = video.data?.chapters ?? []
  const items = stream.items ?? []
  if (stream.chamber === 'se' && !video.data && !video.error) return <Loading />
  if (!chapters.length && !items.length) return <p className="small dim">L’ordre du jour n’est pas publié pour cette diffusion.</p>
  return (
    <div className="parlement-chapters">
      <span className="label">ordre du jour</span>
      {chapters.length
        ? chapters.map((c) => (
            <span key={c.id} className={`parlement-chapter${c.depth === 0 ? ' hi' : ''}`} style={{ paddingLeft: 8 + c.depth * 14 }}>
              {c.title}
            </span>
          ))
        : items.map((item, i) => (
            <span key={i} className="parlement-chapter">
              {item}
            </span>
          ))}
      <span className="small dim parlement-chapter-note">Les horaires des interventions arrivent avec la vidéo, après la séance.</span>
    </div>
  )
}

/**
 * A video: the player (at a passage, or where the user stopped), its chapters, pin and star, and the
 * passage kept as a clip. Positions are the portal's (a link's timecode); the Sénat's streams start
 * later than its recordings, by offsetMs.
 */
export function VideoPane({ refId, start, stopAt, clip }: { refId: string; start?: number; stopAt?: number; clip?: string }) {
  const host = useHost()
  const nav = useNav()
  const { clips, shelf, setShelf } = useStore()
  const { pinned, starred, togglePin, toggleStar } = useShelf()
  const video = useMethod('video', [refId])
  // A video still being processed: what its chamber broadcasts now, to watch it live meanwhile.
  const live = useMethod('live', video.data && !video.data.hls ? [] : null)
  const player = useRef<PlayerHandle>(null)
  const [time, setTime] = useState(0)
  const [editing, setEditing] = useState<Clip | null>(() => clips.find((c) => c.id === clip) ?? null)
  const saved = useRef({ at: 0, written: 0 })

  const v = video.data
  const offset = v?.offsetMs ?? 0
  const key = v ? videoKey(v.chamber, v.id) : ''
  const timed = useMemo(() => v?.chapters.filter((c) => c.timecode !== null) ?? [], [v])
  const current = useMemo(() => [...timed].reverse().find((c) => (c.timecode ?? 0) <= time)?.id, [timed, time])
  const item = useMemo(
    (): VideoItem | null =>
      v
        ? {
            id: v.id,
            chamber: v.chamber,
            title: v.title,
            description: '',
            date: v.date,
            type: v.type,
            kind: kindOf(v.type),
            commission: v.organ,
            thumbnail: v.thumbnail,
            durationMs: Math.max(0, v.durationMs - v.offsetMs),
            url: v.url
          }
        : null,
    [v]
  )

  /**
   * Where the user stopped, in the stream's own time (as the player counts, and the lists' lengths
   * are): kept every 15 seconds of watching and when the pane closes. A pinned video seen to the
   * end leaves "à voir".
   */
  const length = item?.durationMs ?? 0
  const latest = useRef({ shelf, setShelf, key, length })
  latest.current = { shelf, setShelf, key, length }
  const keep = (final: boolean) => {
    const { shelf: s, setShelf: set, key: k, length: total } = latest.current
    const at = saved.current.at
    if (!k || at <= 0 || at === saved.current.written || (!final && Math.abs(at - saved.current.written) < 15_000)) return
    saved.current.written = at
    const seen = total > 0 && at > total * 0.95
    set({
      progress: { ...s.progress, [k]: at },
      ...(seen ? { pinned: s.pinned.filter((e) => videoKey(e.chamber, e.video) !== k) } : {})
    })
  }
  const keepRef = useRef(keep)
  keepRef.current = keep
  useEffect(() => () => keepRef.current(true), [])
  const onTime = (ms: number) => {
    setTime(ms + offset)
    saved.current.at = Math.round(ms)
    keep(false)
  }

  const resume = shelf.progress[key] ?? 0
  // A new clip starts where the user is: the passage asked for, or where they stopped; never before the stream.
  useEffect(() => {
    if (clip === 'new' && v && !editing) setEditing(newClip(v, Math.max(v.offsetMs, start ?? v.timecode ?? resume + v.offsetMs)))
  }, [clip, v]) // eslint-disable-line react-hooks/exhaustive-deps

  if (video.error) return <Failure error={video.error} retry={video.reload} />
  if (!v || !item) return <Loading>chargement de la vidéo…</Loading>
  const resumable = resume > 0 && (!length || resume < length * 0.95)
  const at = start ?? v.timecode ?? (resumable ? resume + offset : undefined)
  const link = (ms: number) => videoPage(v.chamber, v.id, ms)
  const now = () => (player.current?.time() ?? 0) + offset
  const seek = (ms: number) => player.current?.seek(Math.max(0, ms - offset))

  return (
    <>
      <p className="parlement-row small">
        <ChamberCode chamber={v.chamber} />
        <span className="dim">{[v.type, v.organ, dateTime(v.date), length ? `durée ${clock(length)}` : ''].filter(Boolean).join(' · ')}</span>
        <span className="parlement-grow" />
        <button
          className={`parlement-vbtn${pinned(key) ? ' on' : ''}`}
          onClick={() => togglePin(item)}
          title={pinned(key) ? 'retirer de « à voir »' : 'épingler : à voir'}
        >
          <PinIcon />
        </button>
        <button
          className={`parlement-vbtn${starred(key) ? ' on' : ''}`}
          onClick={() => toggleStar(item)}
          title={starred(key) ? 'retirer des favoris' : 'mettre en favori'}
        >
          {starred(key) ? '★' : '☆'}
        </button>
      </p>
      <h3 className="hi parlement-title">{v.title}</h3>
      <div className={`parlement-watch${v.chapters.length ? '' : ' solo'}`}>
        <div className="parlement-stack">
          {v.hls ? (
            <Player
              ref={player}
              src={v.hls}
              poster={v.thumbnail}
              start={at !== undefined ? Math.max(0, at - offset) : undefined}
              stopAt={stopAt !== undefined ? stopAt - offset : undefined}
              autoPlay={at !== undefined}
              onTime={onTime}
            />
          ) : (
            <div className="box-note">
              La vidéo est en cours de traitement par {CHAMBER_NAMES[v.chamber] === 'Sénat' ? 'le Sénat' : 'l’Assemblée'} : elle sera visible un peu plus tard.
              {(() => {
                // The same kind of meeting broadcast now by its chamber: the sitting, or the committee.
                const now = (live.data ?? []).find((s) => s.chamber === v.chamber && (s.organ === 'Séance publique') === /s[ée]ance/i.test(v.type))
                return now ? (
                  <>
                    {' '}
                    Elle est diffusée en direct :{' '}
                    <button className="link" onClick={() => nav.open({ kind: 'live', chamber: now.chamber, id: now.id })}>
                      ▶ la regarder en direct
                    </button>
                  </>
                ) : null
              })()}
            </div>
          )}
          {resumable && start === undefined && v.timecode === undefined && (
            <span className="small dim">reprise à {clock(resume)}, là où vous vous étiez arrêté</span>
          )}
          <p className="parlement-actions">
            {v.hls && !editing && (
              <button className="btn small" onClick={() => setEditing(newClip(v, now()))}>
                ✂ garder un extrait
              </button>
            )}
            <button className="btn small" onClick={() => host.copy(link(now()), 'lien copié')}>
              copier le lien
            </button>
            <button
              className="btn small"
              onClick={() =>
                host.ask(
                  `Résume ce qui s’est dit dans cette vidéo ${v.chamber === 'an' ? 'de l’Assemblée nationale' : 'du Sénat'} (ordre du jour, positions des orateurs, décisions), avec des liens vers les passages clés : ${v.url}`
                )
              }
            >
              demander à Marianne
            </button>
            <button className="btn small" onClick={() => host.openUrl(link(now()))}>
              page officielle
            </button>
          </p>
          {editing && <ClipEditor clip={editing} video={v} now={now} seek={seek} onDone={() => setEditing(null)} />}
        </div>
        {v.chapters.length > 0 && (
          <div className="parlement-chapters">
            <span className="label">ordre du jour et interventions</span>
            {!v.chapters.some((c) => c.timecode !== null) && (
              <span className="small dim parlement-chapter-note">
                Les horaires des interventions arrivent à la fin de la séance : la vidéo est encore en cours.
              </span>
            )}
            {v.chapters.map((c) => (
              <button
                key={c.id}
                className={c.id === current ? 'on' : ''}
                disabled={c.timecode === null || !v.hls}
                onClick={() => c.timecode !== null && seek(c.timecode)}
                style={{ paddingLeft: 8 + c.depth * 14 }}
              >
                <span className="parlement-tc">{c.timecode !== null ? clock(c.timecode) : ''}</span>
                <span className={c.depth === 0 ? 'hi' : ''}>{c.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/** The filter a video falls under, from its type as the portals write it. */
const kindOf = (type: string): VideoType =>
  /questions/i.test(type)
    ? 'questions'
    : /s[ée]ance/i.test(type)
      ? 'seance'
      : /commission|audition|d[ée]l[ée]gation|mission/i.test(type)
        ? 'commission'
        : 'autre'

function newClip(v: VideoOpen, from: number): Clip {
  const chapter = [...v.chapters].reverse().find((c) => c.timecode !== null && c.timecode <= from)
  return {
    id: crypto.randomUUID(),
    video: v.id,
    chamber: v.chamber,
    title: chapter?.title ?? v.title,
    videoTitle: v.title,
    date: v.date,
    start: Math.round(from),
    end: Math.round(Math.min(from + 60_000, v.durationMs || from + 60_000)),
    thumbnail: v.thumbnail,
    createdAt: new Date().toISOString()
  }
}

/** A passage being cut: its bounds (typed, or taken from the player) and its title. */
function ClipEditor({ clip, video, now, seek, onDone }: { clip: Clip; video: VideoOpen; now: () => number; seek: (ms: number) => void; onDone: () => void }) {
  const host = useHost()
  const { clips, setClips } = useStore()
  const [title, setTitle] = useState(clip.title)
  const [start, setStart] = useState(clock(clip.start))
  const [end, setEnd] = useState(clock(clip.end))
  const from = parseClock(start)
  const to = parseClock(end)
  const error =
    Number.isNaN(from) || Number.isNaN(to)
      ? 'positions attendues en minutes:secondes (12:04) ou heures:minutes:secondes'
      : to <= from
        ? 'la fin doit venir après le début'
        : ''
  const known = clips.some((c) => c.id === clip.id)
  const here = (set: (value: string) => void) => set(clock(now()))

  const save = () => {
    const kept: Clip = { ...clip, title: title.trim() || video.title, start: from, end: to }
    setClips(known ? clips.map((c) => (c.id === clip.id ? kept : c)) : [kept, ...clips])
    host.toast(known ? 'extrait mis à jour' : 'extrait gardé dans « extraits »')
    onDone()
  }

  return (
    <div className="box-note parlement-editor">
      <Field label="titre de l’extrait" wide>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="parlement-fields">
        <Field label="début">
          <span className="parlement-inline">
            <input value={start} onChange={(e) => setStart(e.target.value)} />
            <button className="btn small" onClick={() => here(setStart)}>
              position actuelle
            </button>
          </span>
        </Field>
        <Field label="fin" error={error}>
          <span className="parlement-inline">
            <input value={end} onChange={(e) => setEnd(e.target.value)} />
            <button className="btn small" onClick={() => here(setEnd)}>
              position actuelle
            </button>
          </span>
        </Field>
      </div>
      <p className="parlement-actions">
        <button className="btn small" disabled={!!error} onClick={() => seek(from)}>
          revoir depuis le début
        </button>
        <button className="btn small primary" disabled={!!error} onClick={save}>
          {known ? 'mettre à jour l’extrait' : 'garder l’extrait'}
        </button>
        <button className="btn small" onClick={onDone}>
          annuler
        </button>
      </p>
    </div>
  )
}
