import { useMemo, useRef, useState, type RefObject } from 'react'
import { Field, useHost } from '@marianne/sdk/view'
import { videoPage } from '../links'
import { addDays, clock, parisDay, parseClock } from '../time'
import type { AssembleeMethods, Clip, LiveStream, VideoOpen, VideoQuery, VideoType } from '../types'
import { dateTime, Failure, Loading, useDebounced, useMethod, useNav, useStore } from './common'
import { Player, type PlayerHandle } from './player'

/** The Assemblée's videos: a search over a period, the player with its chapters, passages kept as clips, live streams. */

const PERIODS = [
  { days: 0, label: 'aujourd’hui' },
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' }
]

const TYPES: Array<{ id: VideoType | undefined; label: string }> = [
  { id: undefined, label: 'tout' },
  { id: 'seance', label: 'séance publique' },
  { id: 'commission', label: 'commissions' },
  { id: 'questions', label: 'questions au gouvernement' }
]

export interface VideoSearch {
  days: number
  type?: VideoType
  text: string
  speaker: string
}

export const DEFAULT_SEARCH: VideoSearch = { days: 7, text: '', speaker: '' }

export function VideosTab({ search, setSearch }: { search: VideoSearch; setSearch: (s: VideoSearch) => void }) {
  const nav = useNav()
  const host = useHost<AssembleeMethods>()
  const text = useDebounced(search.text)
  const speaker = useDebounced(search.speaker)
  const query = useMemo((): VideoQuery => {
    const to = parisDay()
    return { from: addDays(to, -search.days), to, ...(search.type ? { type: search.type } : {}), text: text.trim(), speaker: speaker.trim() }
  }, [search.days, search.type, text, speaker])
  const videos = useMethod('videos', [query])
  const live = useMethod('live', [])
  const streams = (live.data ?? []).filter((s) => s.live)

  return (
    <>
      {streams.length > 0 && <Streams streams={streams} />}
      <div className="assemblee-filters">
        <div className="assemblee-choices">
          {PERIODS.map((p) => (
            <button key={p.days} className={`chip${search.days === p.days ? ' on' : ''}`} onClick={() => setSearch({ ...search, days: p.days })}>
              {p.label}
            </button>
          ))}
          <span className="dim">·</span>
          {TYPES.map((t) => (
            <button key={t.label} className={`chip${search.type === t.id ? ' on' : ''}`} onClick={() => setSearch({ ...search, type: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="assemblee-fields">
          <Field label="mots du titre">
            <input value={search.text} onChange={(e) => setSearch({ ...search, text: e.target.value })} placeholder="budget, santé, logement…" />
          </Field>
          <Field label="orateur" hint="nom, ou « nom prénom »">
            <input value={search.speaker} onChange={(e) => setSearch({ ...search, speaker: e.target.value })} placeholder="Dupont" />
          </Field>
        </div>
      </div>
      {videos.loading && !videos.data ? (
        <Loading>recherche des vidéos…</Loading>
      ) : videos.error ? (
        <Failure error={videos.error} retry={videos.reload} />
      ) : !videos.data?.length ? (
        <p className="dim">Aucune vidéo publiée sur cette période avec ces critères.</p>
      ) : (
        <div className="assemblee-videos">
          {videos.data.map((v) => (
            <button key={v.id} className="assemblee-video" onClick={() => nav.open({ kind: 'video', id: v.id, ...(v.timecode ? { start: v.timecode } : {}) })}>
              {v.thumbnail ? (
                <img src={v.thumbnail} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
              ) : (
                <span className="assemblee-noimg" />
              )}
              <span className="assemblee-grow">
                <span className="small dim">
                  {dateTime(v.date)} · {v.type}
                  {v.commission ? ` · ${v.commission}` : ''}
                  {v.timecode ? ` · passage à ${clock(v.timecode)}` : ''}
                </span>
                <span className="hi">{v.title}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="small dim assemblee-foot">
        {videos.data ? `${videos.data.length} vidéos · ` : ''}elles restent en ligne environ un an ·{' '}
        <button className="link" onClick={() => host.openUrl('https://videos.assemblee-nationale.fr/')}>
          portail vidéo de l’Assemblée
        </button>
      </p>
    </>
  )
}

/** What is broadcast live, as cards. */
export function Streams({ streams }: { streams: LiveStream[] }) {
  const nav = useNav()
  return (
    <div className="grid assemblee-streams">
      {streams.map((s) => (
        <button key={s.meetingId} className="card" onClick={() => nav.open({ kind: 'live', meetingId: s.meetingId })}>
          {s.poster && <img src={s.poster} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
          <span className="assemblee-live">● en direct</span>
          <span className="t">{s.organ}</span>
          <span className="l dim">{s.title || s.subject}</span>
        </button>
      ))}
    </div>
  )
}

/** A broadcast: from the list of today's streams. */
export function LivePane({ meetingId }: { meetingId: string }) {
  const host = useHost()
  const live = useMethod('live', [])
  if (live.loading && !live.data) return <Loading />
  if (live.error) return <Failure error={live.error} retry={live.reload} />
  const stream = live.data?.find((s) => s.meetingId === meetingId)
  if (!stream) return <p className="dim">Cette diffusion n’est plus en direct : la vidéo sera sur le portail un peu après la réunion.</p>
  if (!stream.live)
    return (
      <div className="box-note">
        {stream.organ} : diffusion en direct annoncée le {stream.start}.{' '}
        <button className="link" onClick={live.reload}>
          actualiser
        </button>
      </div>
    )
  return (
    <>
      <p className="small">
        <span className="assemblee-live">● en direct</span> · {stream.organ} · depuis {stream.start}
      </p>
      <h3 className="hi assemblee-title">{stream.title || stream.subject}</h3>
      <Player src={stream.hls} poster={stream.poster} autoPlay />
      <p className="assemblee-actions">
        <button
          className="btn small"
          onClick={() => host.ask(`Que se passe-t-il en ce moment à l’Assemblée nationale (${stream.organ}) ? ${stream.title || stream.subject}`)}
        >
          demander à Marianne
        </button>
      </p>
    </>
  )
}

/** A video: the player at a passage, its chapters, and the passage kept as a clip. */
export function VideoPane({ id, start, stopAt, clip }: { id: string; start?: number; stopAt?: number; clip?: string }) {
  const host = useHost()
  const video = useMethod('video', [id])
  const player = useRef<PlayerHandle>(null)
  const [time, setTime] = useState(0)
  const { clips } = useStore()
  const [editing, setEditing] = useState<Clip | null>(() => clips.find((c) => c.id === clip) ?? null)

  const timed = useMemo(() => video.data?.chapters.filter((c) => c.timecode !== null) ?? [], [video.data])
  const current = useMemo(() => [...timed].reverse().find((c) => (c.timecode ?? 0) <= time)?.id, [timed, time])

  if (video.loading && !video.data) return <Loading>chargement de la vidéo…</Loading>
  if (video.error) return <Failure error={video.error} retry={video.reload} />
  const v = video.data
  if (!v) return null
  const at = start ?? v.timecode
  const link = (ms: number) => videoPage(v.id, ms)

  const chapterAt = (ms: number) => [...timed].reverse().find((c) => (c.timecode ?? 0) <= ms)
  const cut = () => {
    const from = Math.round(player.current?.time() ?? 0)
    setEditing({
      id: crypto.randomUUID(),
      video: v.id,
      title: chapterAt(from)?.title ?? v.title,
      videoTitle: v.title,
      date: v.date,
      start: from,
      end: Math.min(from + 60_000, v.durationMs || from + 60_000),
      thumbnail: v.thumbnail,
      createdAt: new Date().toISOString()
    })
  }

  return (
    <>
      <p className="small dim">{[v.type, v.organ, dateTime(v.date), v.durationMs ? `durée ${clock(v.durationMs)}` : ''].filter(Boolean).join(' · ')}</p>
      <h3 className="hi assemblee-title">{v.title}</h3>
      {v.hls ? (
        <Player ref={player} src={v.hls} poster={v.thumbnail} start={at} stopAt={stopAt} autoPlay={!!at} onTime={setTime} />
      ) : (
        <div className="box-note">La vidéo est en cours de traitement par l’Assemblée : elle sera visible un peu plus tard.</div>
      )}
      <p className="assemblee-actions">
        {v.hls && !editing && (
          <button className="btn small" onClick={cut}>
            découper un extrait
          </button>
        )}
        <button className="btn small" onClick={() => host.copy(link(player.current?.time() ?? 0), 'lien copié')}>
          copier le lien
        </button>
        <button
          className="btn small"
          onClick={() =>
            host.ask(
              `Résume ce qui s’est dit dans cette vidéo de l’Assemblée nationale (ordre du jour, positions des orateurs, décisions), avec des liens vers les passages clés : ${v.url}`
            )
          }
        >
          demander à Marianne
        </button>
        <button className="btn small" onClick={() => host.openUrl(link(player.current?.time() ?? 0))}>
          page officielle
        </button>
      </p>
      {editing && <ClipEditor clip={editing} video={v} player={player} onDone={() => setEditing(null)} />}
      {v.chapters.length > 0 && (
        <div className="assemblee-chapters">
          <span className="label">ordre du jour et interventions</span>
          {v.chapters.map((c) => (
            <button
              key={c.id}
              className={c.id === current ? 'on' : ''}
              disabled={c.timecode === null || !v.hls}
              onClick={() => c.timecode !== null && player.current?.seek(c.timecode)}
              style={{ paddingLeft: 8 + c.depth * 16 }}
            >
              <span className="assemblee-tc">{c.timecode !== null ? clock(c.timecode) : ''}</span>
              <span className={c.depth === 0 ? 'hi' : ''}>{c.title}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/** A passage being cut: its bounds (typed, or taken from the player) and its title. */
function ClipEditor({ clip, video, player, onDone }: { clip: Clip; video: VideoOpen; player: RefObject<PlayerHandle | null>; onDone: () => void }) {
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
  const here = (set: (value: string) => void) => set(clock(player.current?.time() ?? 0))

  const save = () => {
    const saved: Clip = { ...clip, title: title.trim() || video.title, start: from, end: to }
    setClips(known ? clips.map((c) => (c.id === clip.id ? saved : c)) : [saved, ...clips])
    host.toast(known ? 'extrait mis à jour' : 'extrait gardé dans « mes extraits »')
    onDone()
  }

  return (
    <div className="box-note assemblee-editor">
      <Field label="titre de l’extrait" wide>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="assemblee-fields">
        <Field label="début">
          <span className="assemblee-inline">
            <input value={start} onChange={(e) => setStart(e.target.value)} />
            <button className="btn small" onClick={() => here(setStart)}>
              position actuelle
            </button>
          </span>
        </Field>
        <Field label="fin" error={error}>
          <span className="assemblee-inline">
            <input value={end} onChange={(e) => setEnd(e.target.value)} />
            <button className="btn small" onClick={() => here(setEnd)}>
              position actuelle
            </button>
          </span>
        </Field>
      </div>
      <p className="assemblee-actions">
        <button className="btn small" disabled={!!error} onClick={() => player.current?.seek(from)}>
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
