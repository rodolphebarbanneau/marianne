import { useEffect, useMemo, useRef, useState } from 'react'
import {
  chapterIndexAt,
  clockTime,
  onMediaPrefs,
  Player,
  readMediaPrefs,
  timeWriter,
  videoTime,
  type MediaClip,
  type PlayerHandle,
  type TimeMode
} from '@marianne/sdk/media'
import { Field, Modal, useHost } from '@marianne/sdk/view'
import { PORTAL, SENATE_PORTAL, videoKey, videoPage } from '../links'
import { addDays, clock, parisDay } from '../time'
import type { Chamber, Clip, LiveStream, MemberCard, Passage, VideoItem, VideoOpen, VideoQuery, VideoType } from '../types'
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
  usePolling,
  useStore,
  yourTitle
} from './common'
import { Thumb } from './home'
import { clipOf, keptOf, mediaChapters, shareLine, shareLink, snapAt, streamOf, streamTarget, suspensions, type AgendaLine } from './media'
import { videoRef } from './members'

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

/** Pin and star: what a video's line offers. */
function VideoActions({ video }: { video: VideoItem }) {
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
              <Failure inline error={videos.error} retry={videos.reload} />
            ) : tab === 'all' && !videos.data ? (
              <Loading inline label="recherche des vidéos" />
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
  if (loading) return <Loading inline label="les passages de vos élus" />
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
          <div key={`${s.chamber}:${s.video ?? s.id}`} className="parlement-vcard onair wide">
            <Thumb chamber={s.chamber} src={s.poster} live large />
            <span className="parlement-stack">
              <span className="parlement-row small">
                <ChamberCode chamber={s.chamber} />
                <span className="parlement-live">● depuis {hour(s.startAt)}</span>
              </span>
              <span className="hi parlement-clamp">{s.title || s.subject || s.organ}</span>
              <span className="small dim">{s.organ}</span>
              <span className="parlement-row parlement-push">
                <button className="btn small primary" onClick={() => nav.open(streamTarget(s))}>
                  regarder
                </button>
                {s.meeting && (
                  <button className="btn small" onClick={() => nav.open({ kind: 'meeting', id: s.meeting! })}>
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
  const [renaming, setRenaming] = useState<{ clip: Clip; title: string } | null>(null)
  const shown = clips.filter((c) => nav.shows(c.chamber ?? 'an'))
  if (!shown.length)
    return (
      <div className="box-note">
        Aucun extrait pour l’instant. Dans une vidéo, « garder un extrait » (dans les options du lecteur, ou la touche X) garde un passage ici, privé, dans
        votre archive : pour le revoir, le partager ou en parler avec Marianne.
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
                <button className="btn small" onClick={() => setRenaming({ clip: c, title: c.title })}>
                  renommer
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
      {renaming && (
        <Modal onClose={() => setRenaming(null)}>
          <div className="in">
            <span className="label">renommer l’extrait</span>
            <Field label="titre de l’extrait" wide>
              <input autoFocus value={renaming.title} onChange={(e) => setRenaming({ ...renaming, title: e.target.value })} />
            </Field>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setRenaming(null)}>
              annuler
            </button>
            <button
              className="btn primary"
              disabled={!renaming.title.trim()}
              onClick={() => {
                setClips(clips.map((c) => (c.id === renaming.clip.id ? { ...c, title: renaming.title.trim() } : c)))
                setRenaming(null)
              }}
            >
              renommer
            </button>
          </div>
        </Modal>
      )}
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

/** A broadcast is asked again this often: its chapters grow, it ends (the main side keeps its answers 20 s). */
const POLL_MS = 30_000
const DAY_MS = 86_400_000

const badgeOf = (chamber: Chamber) => (chamber === 'an' ? 'AN' : 'SÉNAT')
const theChamber = (chamber: Chamber) => (chamber === 'an' ? 'l’Assemblée' : 'le Sénat')

/** The time's mode the user chose in a player (« temps » in its options), for the agenda beside it. */
function useTimeMode(): TimeMode {
  const [mode, setMode] = useState(() => readMediaPrefs().time)
  useEffect(() => onMediaPrefs((p) => setMode(p.time)), [])
  return mode
}

/**
 * The stream to play: the first of the playlists that answers (a live's mirror when its origin
 * doesn't); null while trying them. A single one is played as it is.
 */
function usePlayable(urls: string[]): string | null {
  const key = urls.join('\n')
  const [found, setFound] = useState<{ key: string; src: string } | null>(null)
  useEffect(() => {
    const list = key ? key.split('\n') : []
    if (list.length < 2) return
    let alive = true
    void (async () => {
      for (const url of list) {
        const ok = await fetch(url, { signal: AbortSignal.timeout(8000) }).then(
          (r) => r.ok,
          () => false
        )
        if (ok || !alive) return alive && setFound({ key, src: url })
      }
      // None answers: the first, and the player says it can't play it.
      if (alive) setFound({ key, src: list[0] })
    })()
    return () => {
      alive = false
    }
  }, [key])
  if (urls.length < 2) return urls[0] ?? ''
  return found?.key === key ? found.src : null
}

/**
 * A broadcast the portal doesn't have the video of yet: the Assemblée's live stream, its last
 * seconds only. Asked again every 30 s: once the portal has its video, that video, the whole sitting.
 */
export function LivePane({ chamber, id }: { chamber: Chamber; id: string }) {
  const host = useHost()
  const nav = useNav()
  const live = useMethod('live', [])
  usePolling(live, POLL_MS)
  const stream = live.data?.find((s) => s.chamber === chamber && (s.id === id || s.video === id))
  const src = usePlayable(stream?.hls ? [stream.hls, ...stream.mirrors] : [])
  if (live.error && !live.data) return <Failure error={live.error} retry={live.reload} />
  if (!live.data) return <Loading label="le direct" />
  if (stream?.video) return <VideoPane refId={videoKey(chamber, stream.video)} />
  if (!stream)
    return (
      <div className="box-note">
        Cette diffusion ne figure plus parmi les directs de {theChamber(chamber)}. Sa vidéo sera dans les vidéos du jour une fois publiée sur le portail.{' '}
        <button className="link" onClick={() => nav.tab('videos')}>
          voir les vidéos
        </button>
      </div>
    )
  const title = stream.title || stream.subject || stream.organ
  const items = stream.items ?? []
  return (
    <>
      <p className="parlement-row small">
        <ChamberCode chamber={chamber} />
        <span className="parlement-live">● en direct</span>
        <span className="dim">· {[stream.organ, `depuis ${hour(stream.startAt)}`].filter(Boolean).join(' · ')}</span>
      </p>
      <h3 className="hi parlement-title">{title}</h3>
      <div className={`parlement-watch${items.length ? '' : ' solo'}`}>
        <div className="parlement-stack">
          {src === null ? (
            <Loading inline label="le direct" />
          ) : (
            <Player src={src} poster={stream.poster} live autoPlay title={title} badge={badgeOf(chamber)} />
          )}
          <p className="small dim">
            Le portail ne propose pas encore la vidéo de ce direct : on n’en voit ici que les dernières secondes, sans retour en arrière. Dès qu’il la propose,
            la séance entière s’ouvre ici.
          </p>
          <p className="parlement-actions">
            {stream.meeting && (
              <button className="btn small" onClick={() => nav.open({ kind: 'meeting', id: stream.meeting! })}>
                la réunion
              </button>
            )}
            <button
              className="btn small"
              onClick={() =>
                host.ask(`Que se passe-t-il en ce moment ${chamber === 'an' ? 'à l’Assemblée nationale' : 'au Sénat'} (${stream.organ}) ? ${title}`)
              }
            >
              demander à Marianne
            </button>
            <button className="btn small" onClick={() => host.openUrl(stream.url)}>
              page officielle
            </button>
          </p>
        </div>
        {items.length > 0 && <LiveAgenda items={items} />}
      </div>
    </>
  )
}

/** Beside a broadcast without its video: the agenda of the meeting it shows (no times: they come with the video). */
export function LiveAgenda({ items }: { items: string[] }) {
  return (
    <div className="parlement-chapters">
      <span className="parlement-chapters-h">
        <span className="label">ordre du jour</span>
      </span>
      {items.map((item, i) => (
        <span key={i} className="parlement-chapter">
          {item}
        </span>
      ))}
    </div>
  )
}

/** A video's detail; asked again every 30 s while it is broadcast (its chapters grow), or, a day at most, until the portal has processed it. */
export function useVideo(ref: string | null) {
  const video = useMethod('video', ref ? [ref] : null)
  const v = video.data
  usePolling(video, POLL_MS, !!v && (v.live || (!v.hls && Date.now() - Date.parse(v.date) < DAY_MS)))
  return video
}

/** A video as a line of the lists (its pin and star keep it so). */
function itemOf(v: VideoOpen): VideoItem {
  return {
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
}

/**
 * A video: the player (at a passage, where the user stopped, or `t`, the mini-player's position),
 * pin and star, the agenda beside it. A broadcast is the same page, live: its agenda grows, and it
 * becomes the recording under the same id.
 */
export function VideoPane({ refId, start, t, stopAt }: { refId: string; start?: number; t?: number; stopAt?: number }) {
  const { pinned, starred, togglePin, toggleStar } = useShelf()
  const video = useVideo(refId)
  const v = video.data
  if (video.error && !v) return <Failure error={video.error} retry={video.reload} />
  if (!v) return <Loading label="la vidéo" />
  const item = itemOf(v)
  const key = videoKey(v.chamber, v.id)
  const length = item.durationMs ?? 0
  return (
    <>
      <p className="parlement-row small">
        <ChamberCode chamber={v.chamber} />
        {v.live ? (
          <>
            <span className="parlement-live">● en direct</span>
            <span className="dim">· {[v.type, v.organ, `depuis ${hour(v.date)}`].filter(Boolean).join(' · ')}</span>
          </>
        ) : (
          <>
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
          </>
        )}
      </p>
      <h3 className="hi parlement-title">{v.title || v.organ || v.type}</h3>
      <VideoWatch v={v} start={start} t={t} stopAt={stopAt} />
    </>
  )
}

/**
 * The player and the agenda beside it. Positions: the player's are the stream's (`t`, the track,
 * the agenda shown); the portal's (links' timecodes, `start`, `stopAt`, clips) are later by
 * offsetMs at the Sénat. `inMeeting`: shown in its meeting's page (no "la réunion").
 */
export function VideoWatch({ v, start, t, stopAt, inMeeting }: { v: VideoOpen; start?: number; t?: number; stopAt?: number; inMeeting?: boolean }) {
  const host = useHost()
  const nav = useNav()
  const { clips, setClips, shelf, setShelf } = useStore()
  const player = useRef<PlayerHandle>(null)
  const agenda = useRef<HTMLDivElement>(null)
  const [time, setTime] = useState(0)
  const mode = useTimeMode()
  const offset = v.offsetMs
  const key = videoKey(v.chamber, v.id)
  const length = Math.max(0, v.durationMs - offset)
  const lines = useMemo(() => mediaChapters(v), [v])
  // A live's last suspension lasts up to its edge: the track cuts what goes past it.
  const gaps = useMemo(() => suspensions(lines, v.live ? Number.MAX_SAFE_INTEGER : length), [lines, v.live, length])
  const kept = useMemo(() => keptOf(clips, v), [clips, v])
  const clockStart = v.clockStart || undefined
  const title = v.title || v.organ || v.type
  const badge = badgeOf(v.chamber)
  const live = useMethod('live', !v.hls && !v.live ? [] : null)

  /**
   * Where the user stopped, in the player's time (as the lists' lengths are): kept every 15
   * seconds of watching and when the page closes. A pinned video seen to the end leaves "à voir".
   */
  const saved = useRef({ at: 0, written: 0 })
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

  // Where to start, at the player's time: the mini-player's position, a passage, where the user stopped (not in a live: at its edge).
  const [first] = useState(() => {
    const resume = shelf.progress[key] ?? 0
    const resumable = !v.live && resume > 0 && (!length || resume < length * 0.95)
    const at = t ?? (start !== undefined ? start - offset : v.timecode !== undefined ? v.timecode - offset : resumable ? resume : undefined)
    return { at: at !== undefined ? Math.max(0, at) : undefined, resumed: t === undefined && start === undefined && v.timecode === undefined && resumable }
  })

  /**
   * The stream: a live's first playlist that answers. The broadcast over, it is kept until the
   * recording comes (the same timeline), which then plays from where the user is.
   */
  const picked = usePlayable(v.hls ? [v.hls, ...v.mirrors] : [])
  const [src, setSrc] = useState<{ url: string; at?: number }>(() => ({ url: picked ?? '', at: first.at }))
  useEffect(() => {
    if (picked) setSrc((s) => (s.url === picked ? s : { url: picked, at: s.url ? (player.current?.time() ?? 0) : first.at }))
  }, [picked, first.at])

  // The agenda follows the player: its line in view, unless the user is reading it (the pointer over it).
  const current = lines[chapterIndexAt(lines, time)]?.id
  const [shown, setShown] = useState<string | null>(null)
  const reading = useRef(false)
  const bringIntoView = (id: string | undefined, always = false) => {
    const list = agenda.current
    const el = id ? list?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`) : null
    if (!list || !el || (reading.current && !always)) return
    const top = el.offsetTop - list.clientHeight / 3
    if (always || el.offsetTop < list.scrollTop || el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTo({ top, behavior: 'smooth' })
  }
  useEffect(() => bringIntoView(current), [current]) // eslint-disable-line react-hooks/exhaustive-deps
  const showLine = (id: string) => {
    bringIntoView(id, true)
    setShown(id)
  }
  useEffect(() => {
    if (!shown) return
    const timer = setTimeout(() => setShown(null), 1600)
    return () => clearTimeout(timer)
  }, [shown])

  const onTime = (ms: number) => {
    setTime(ms)
    saved.current.at = Math.round(ms)
    keep(false)
  }
  const seek = (at: number) => player.current?.seek(at)
  const when = timeWriter(mode, clockStart, length)
  // The agenda's times: the video's, or the hémicycle's clock to the minute.
  const lineTime = (ms: number) => (mode === 'heure' && clockStart !== undefined ? clockTime(clockStart + ms, false) : videoTime(ms, length))
  const share = (ms: number) => timeWriter(readMediaPrefs().time, clockStart, length)(ms)
  const keepClip = (clip: MediaClip) => {
    setClips([clipOf(v, clip, crypto.randomUUID(), new Date()), ...clips])
    host.toast('extrait gardé dans « vidéos › extraits »')
  }
  const pin = useMemo(() => ({ title, badge, route: 'service/parlement', params: { video: key } }), [title, badge, key])
  const timed = v.chapters.some((c) => c.timecode !== null)
  const last = lines.at(-1)?.id
  const onAir = !v.hls && !v.live ? streamOf(live.data ?? [], v) : null

  return (
    <div className={`parlement-watch${v.chapters.length ? '' : ' solo'}`}>
      <div className="parlement-stack">
        {src.url ? (
          <Player
            ref={player}
            src={src.url}
            poster={v.thumbnail}
            live={v.live}
            start={src.at}
            stopAt={stopAt !== undefined ? stopAt - offset : undefined}
            autoPlay={src.at !== undefined || v.live}
            chapters={lines}
            gaps={gaps}
            kept={kept}
            clockStart={clockStart}
            title={title}
            badge={badge}
            onTime={onTime}
            onChapter={(c) => showLine((c as AgendaLine).id)}
            onAgenda={() => {
              const list = agenda.current
              void (document.fullscreenElement ? document.exitFullscreen() : Promise.resolve())
                .catch(() => undefined)
                .then(() => {
                  list?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                  if (current) showLine(current)
                })
            }}
            shareUrl={(at, clip) => shareLink(v, at, clip)}
            shareText={(url, at, clip) => shareLine(v, lines, url, at, clip, share)}
            onKeepClip={keepClip}
            snapClip={(ms) => snapAt(lines, ms, v.live ? Math.max(ms, player.current?.time() ?? ms) : length || ms + 60_000)}
            pin={pin}
          />
        ) : picked === null ? (
          <Loading inline label="la vidéo" />
        ) : (
          <div className="box-note">
            {v.live
              ? 'Le portail ne donne pas encore le flux de ce direct : la page le prendra dès qu’il le donnera.'
              : `La vidéo est en cours de traitement par ${theChamber(v.chamber)} : elle s’ouvrira ici dès qu’elle sera prête.`}
            {onAir && (
              <>
                {' '}
                En ce moment, {onAir.title || onAir.subject || onAir.organ} est en direct sur la même chaîne :{' '}
                <button className="link" onClick={() => nav.open(streamTarget(onAir))}>
                  ▶ regarder le direct
                </button>
              </>
            )}
          </div>
        )}
        {src.url && !v.live && !v.hls && (
          <span className="small dim">La séance est terminée : le portail prépare la vidéo enregistrée, qui reprendra ici au même endroit.</span>
        )}
        {first.resumed && <span className="small dim">reprise à {when(first.at ?? 0)}, là où vous vous étiez arrêté</span>}
        <p className="parlement-actions">
          <button
            className="btn small"
            onClick={() =>
              host.ask(
                v.live
                  ? `Que se passe-t-il en ce moment ${v.chamber === 'an' ? 'à l’Assemblée nationale' : 'au Sénat'} (${title}) ? ${v.url}`
                  : `Résume ce qui s’est dit dans cette vidéo ${v.chamber === 'an' ? 'de l’Assemblée nationale' : 'du Sénat'} (ordre du jour, positions des orateurs, décisions), avec des liens vers les passages clés : ${v.url}`
              )
            }
          >
            demander à Marianne
          </button>
          {!inMeeting && v.meetingIds[0] && (
            <button className="btn small" onClick={() => nav.open({ kind: 'meeting', id: v.meetingIds[0] })}>
              la réunion
            </button>
          )}
          <button className="btn small" onClick={() => host.openUrl(shareLink(v, src.url && !v.live ? (player.current?.time() ?? null) : null))}>
            page officielle
          </button>
        </p>
      </div>
      {v.chapters.length > 0 && (
        <div ref={agenda} className="parlement-chapters" onPointerEnter={() => (reading.current = true)} onPointerLeave={() => (reading.current = false)}>
          <span className="parlement-chapters-h">
            <span className="label">ordre du jour et interventions</span>
            <span className="small dim">{timed ? lines.length : v.chapters.length}</span>
          </span>
          {!timed && <span className="small dim parlement-chapter-note">Le portail ne donne pas encore les horaires de ces points.</span>}
          {v.chapters.map((c) => {
            const line = c.timecode !== null ? lines.find((l) => l.id === c.id) : undefined
            return (
              <button
                key={c.id}
                data-id={c.id}
                className={[c.id === current ? 'on' : '', c.id === shown ? 'shown' : ''].filter(Boolean).join(' ')}
                disabled={!line || !src.url}
                onClick={() => line && seek(line.at)}
                style={{ paddingLeft: 8 + c.depth * 14 }}
              >
                <span className="parlement-tc">{line ? lineTime(line.at) : ''}</span>
                <span className={c.depth === 0 ? 'hi' : ''}>{c.title}</span>
                {v.live && c.id === last && <span className="parlement-now">● en cours</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
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
