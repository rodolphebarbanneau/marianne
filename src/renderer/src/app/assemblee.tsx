import { useEffect, useMemo, useRef, useState } from 'react'
import type { LiveStream, VideoDetail, VideoItem, VideoQuery } from '@shared/types'
import { Player, type PlayerHandle } from '../components/video'
import { Action, Spinner } from '../components/ui'
import { useApp } from './context'
import { ipcError } from './hooks'

const api = window.marianne

const RANGES = [
  { id: 'today', label: 'aujourd’hui', days: 0 },
  { id: 'week', label: '7 jours', days: 7 },
  { id: 'month', label: '30 jours', days: 30 }
] as const

const TYPES: Array<{ id: VideoQuery['type'] | undefined; label: string }> = [
  { id: undefined, label: 'tout' },
  { id: 'seance', label: 'séance publique' },
  { id: 'commission', label: 'commissions' },
  { id: 'questions', label: 'questions au gouvernement' }
]

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtDate = (s: string) => new Date(s).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function hms(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  return `${h ? `${h}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`
}

type Selection = { kind: 'video'; id: string; timecode?: number } | { kind: 'live'; stream: LiveStream }

function VideoPane({ id, timecode }: { id: string; timecode?: number }) {
  const { ask: askMarianne } = useApp()
  const [detail, setDetail] = useState<VideoDetail | null>(null)
  const [error, setError] = useState('')
  const [time, setTime] = useState(0)
  const player = useRef<PlayerHandle>(null)
  useEffect(() => {
    setDetail(null)
    setError('')
    let alive = true
    api
      .getVideo(id)
      .then((d) => alive && setDetail(d))
      .catch((e: Error) => alive && setError(ipcError(e)))
    return () => {
      alive = false
    }
  }, [id])

  const timed = useMemo(() => detail?.chapters.filter((c) => c.timecode !== null) ?? [], [detail])
  const current = useMemo(() => [...timed].reverse().find((c) => (c.timecode ?? 0) <= time)?.id, [timed, time])

  if (error) return <p className="line error">✗ {error}</p>
  if (!detail)
    return (
      <p className="line dim">
        <Spinner /> chargement de la vidéo…
      </p>
    )
  const ask = () =>
    askMarianne({
      text: `Résume ce qui s'est dit dans cette vidéo de l'Assemblée nationale (ordre du jour, positions des orateurs, décisions), avec des liens vers les passages clés : ${detail.url}`,
      send: true,
      fresh: true
    })
  return (
    <>
      <div className="bar-fill inv-bleu" style={{ marginBottom: 8 }}>
        <span className="upper">{detail.type}</span>
        <span>{detail.organ}</span>
      </div>
      <h3 className="hi" style={{ margin: '0 0 8px', fontWeight: 400 }}>
        {detail.title}
      </h3>
      <p className="dim" style={{ marginBottom: 8 }}>
        {fmtDate(detail.date)} · durée {hms(detail.durationMs)} · <Action onClick={ask}>demander à marianne</Action>{' '}
        <Action onClick={() => api.openBrowser(detail.url)}>page officielle</Action>
      </p>
      {detail.hls ? (
        <Player ref={player} src={detail.hls} startMs={timecode} onTime={setTime} />
      ) : (
        <p className="line yellow">vidéo en cours de traitement par l’assemblée : elle sera visible un peu plus tard</p>
      )}
      {detail.chapters.length > 0 && (
        <div className="chapters">
          <div className="bar-fill inv-cyan" style={{ marginBottom: 4 }}>
            <span className="upper">ordre du jour et interventions</span>
          </div>
          {detail.chapters.map((c) => (
            <button
              key={c.id}
              className={c.id === current ? 'on' : ''}
              disabled={c.timecode === null}
              onClick={() => c.timecode !== null && player.current?.seek(c.timecode)}
              style={{ paddingLeft: 8 + c.depth * 16 }}
            >
              <span className="tc">{c.timecode !== null ? hms(c.timecode) : ''}</span>
              <span className={c.depth === 0 ? 'hi' : ''}>{c.title}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function LivePane({ stream }: { stream: LiveStream }) {
  return (
    <>
      <div className="bar-fill inv-rouge" style={{ marginBottom: 8 }}>
        <span className="upper blink">● en direct</span>
        <span>{stream.organ}</span>
      </div>
      <p className="dim" style={{ marginBottom: 8 }}>
        depuis {stream.start} · {stream.subject}
      </p>
      <Player src={stream.hls} poster={stream.poster} autoPlay />
    </>
  )
}

/** The Assemblée's videos: recent sittings and committee meetings, live streams, a player with chapters. */
export function AssembleeVideos() {
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('week')
  const [type, setType] = useState<VideoQuery['type']>()
  const [text, setText] = useState('')
  const [items, setItems] = useState<VideoItem[] | null>(null)
  const [live, setLive] = useState<LiveStream[]>([])
  const [error, setError] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)

  useEffect(() => {
    void api
      .liveStreams()
      .then(setLive)
      .catch(() => setLive([]))
  }, [])
  useEffect(() => {
    const days = RANGES.find((r) => r.id === range)!.days
    const now = new Date()
    setItems(null)
    setError('')
    const t = setTimeout(
      () =>
        void api
          .searchVideos({ from: iso(new Date(now.getTime() - days * 86_400_000)), to: iso(now), type, text: text.trim() || undefined })
          .then((list) => {
            setItems(list)
            setSelection((s) => s ?? (list[0] ? { kind: 'video', id: list[0].id, timecode: list[0].timecode } : null))
          })
          .catch((e: Error) => {
            setItems([])
            setError(ipcError(e))
          }),
      text ? 350 : 0
    )
    return () => clearTimeout(t)
  }, [range, type, text])

  return (
    <div className="an-embed">
      <div className="an">
        <aside className="an-list">
          <div className="an-filters">
            <div className="choices">
              {RANGES.map((r) => (
                <button key={r.id} className={range === r.id ? 'on' : ''} onClick={() => setRange(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="choices">
              {TYPES.map((t) => (
                <button key={t.label} className={type === t.id ? 'on' : ''} onClick={() => setType(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="mots du titre : budget, santé, logement…" />
          </div>
          <div className="an-items">
            {live.map((l) => (
              <button
                key={l.meetingId}
                className={`an-item ${selection?.kind === 'live' && selection.stream.meetingId === l.meetingId ? 'on' : ''}`}
                onClick={() => setSelection({ kind: 'live', stream: l })}
              >
                {l.poster ? <img src={l.poster} alt="" /> : <span className="noimg" />}
                <span>
                  <span className="meta">
                    <span className="red blink">●</span> en direct · {l.organ}
                  </span>
                  <span className="title">{l.subject}</span>
                </span>
              </button>
            ))}
            {items === null && (
              <p className="empty">
                <Spinner /> recherche des vidéos…
              </p>
            )}
            {error && <p className="empty error">✗ {error}</p>}
            {items?.length === 0 && !error && <p className="empty">aucune vidéo publiée sur cette période</p>}
            {items?.map((v) => (
              <button
                key={v.id}
                className={`an-item ${selection?.kind === 'video' && selection.id === v.id ? 'on' : ''}`}
                onClick={() => setSelection({ kind: 'video', id: v.id, timecode: v.timecode })}
              >
                {v.thumbnail ? (
                  <img src={v.thumbnail} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                ) : (
                  <span className="noimg" />
                )}
                <span>
                  <span className="meta">
                    {fmtDate(v.date)} · {v.type}
                  </span>
                  <span className="title">{v.title}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>
        <div className="an-detail">
          {selection?.kind === 'video' && <VideoPane key={selection.id} id={selection.id} timecode={selection.timecode} />}
          {selection?.kind === 'live' && <LivePane stream={selection.stream} />}
          {!selection && items !== null && <p className="empty">choisissez une vidéo</p>}
        </div>
      </div>
      <p className="dim" style={{ marginTop: 6 }}>
        {items ? `${items.length} vidéos sur la période` : '…'} · elles restent en ligne environ un an ·{' '}
        <Action onClick={() => api.openBrowser('https://videos.assemblee-nationale.fr')}>portail vidéo</Action>
      </p>
    </div>
  )
}
