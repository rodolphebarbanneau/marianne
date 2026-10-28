import { useEffect, useState } from 'react'
import { useHost } from '@marianne/sdk/view'
import { AGENDA_PAGE } from '../links'
import { addDays, parisDay } from '../time'
import type { AgendaMeeting, Meeting } from '../types'
import { dateTime, Failure, hour, Loading, longDay, useMethod, useNav } from './common'
import { NeedsData } from './data'
import { Player } from './player'
import { Streams } from './videos'

/** "Aujourd'hui": the agenda of a day, what is broadcast live, and a meeting opened from it. */

type Kind = 'all' | 'sitting' | 'committee'

const KINDS: Array<{ id: Kind; label: string }> = [
  { id: 'all', label: 'tout' },
  { id: 'sitting', label: 'séance publique' },
  { id: 'committee', label: 'commissions' }
]

const title = (m: Meeting) => (m.kind === 'sitting' ? 'Séance publique' : m.organ || 'Réunion')

function States({ m }: { m: Meeting & { live?: boolean } }) {
  return (
    <>
      {m.live && <span className="assemblee-live">● en direct</span>}
      {m.state === 'cancelled' && <span className="bad">annulée</span>}
      {m.state === 'tentative' && <span className="accent">à confirmer</span>}
      {m.video && !m.live && m.state !== 'cancelled' && <span className="dim">filmée</span>}
    </>
  )
}

export function TodayTab() {
  const [day, setDay] = useState(parisDay)
  const [kind, setKind] = useState<Kind>('all')
  const agenda = useMethod('agenda', [day])
  const today = day === parisDay()
  const { reload } = agenda

  // Today's broadcasts start and end through the day.
  useEffect(() => {
    if (!today) return
    const t = setInterval(reload, 60_000)
    return () => clearInterval(t)
  }, [today, reload])

  const data = agenda.data?.day === day ? agenda.data : null
  const live = data?.streams.filter((s) => s.live) ?? []
  const later = data?.streams.filter((s) => !s.live) ?? []
  const meetings = (data?.meetings ?? []).filter((m) => (kind === 'all' ? m.kind !== 'other' : m.kind === kind))

  return (
    <>
      <div className="assemblee-day">
        <button className="btn small" onClick={() => setDay(addDays(day, -1))}>
          ‹ veille
        </button>
        <span className="hi">{longDay(day)}</span>
        <button className="btn small" onClick={() => setDay(addDays(day, 1))}>
          lendemain ›
        </button>
        {!today && (
          <button className="link" onClick={() => setDay(parisDay())}>
            aujourd’hui
          </button>
        )}
      </div>
      {live.length > 0 && <Streams streams={live} />}
      {later.length > 0 && <p className="small dim">diffusions annoncées : {later.map((s) => `${s.organ} à ${s.start.split(' à ').pop()}`).join(' · ')}</p>}
      {agenda.error ? (
        <Failure error={agenda.error} retry={reload} />
      ) : !data ? (
        <Loading>chargement de l’agenda…</Loading>
      ) : (
        <NeedsData>
          <div className="assemblee-choices">
            {KINDS.map((k) => (
              <button key={k.id} className={`chip${kind === k.id ? ' on' : ''}`} onClick={() => setKind(k.id)}>
                {k.label}
              </button>
            ))}
          </div>
          {meetings.length ? <Agenda meetings={meetings} /> : <p className="dim">Rien à l’agenda de l’Assemblée ce jour-là.</p>}
        </NeedsData>
      )}
    </>
  )
}

function Agenda({ meetings }: { meetings: AgendaMeeting[] }) {
  const nav = useNav()
  return (
    <div className="assemblee-agenda">
      {meetings.map((m) => (
        <button key={m.id} className={`assemblee-meeting${m.state === 'cancelled' ? ' off' : ''}`} onClick={() => nav.open({ kind: 'meeting', id: m.id })}>
          <span className="assemblee-hour">
            {hour(m.start)}
            {m.end ? <span className="dim">–{hour(m.end)}</span> : null}
          </span>
          <span className="assemblee-grow">
            <span className="hi">{title(m)}</span>
            {m.items.slice(0, 2).map((item, i) => (
              <span key={i} className="small">
                {item}
              </span>
            ))}
            {m.items.length > 2 && <span className="small dim">… et {m.items.length - 2} autres points</span>}
            <span className="small dim assemblee-states">
              {m.kind !== 'sitting' && m.place && <span>{m.place}</span>}
              <States m={m} />
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

/** A meeting: its agenda, its broadcast when live, its recordings once on the portal. */
export function MeetingPane({ id }: { id: string }) {
  const host = useHost()
  const nav = useNav()
  const detail = useMethod('meeting', [id])
  if (detail.loading && !detail.data) return <Loading>chargement de la réunion…</Loading>
  if (detail.error) return <Failure error={detail.error} retry={detail.reload} />
  if (!detail.data) return null
  const { meeting: m, stream, videos } = detail.data
  const past = Date.parse(m.start) < Date.now()
  return (
    <>
      <p className="small dim assemblee-states">
        <span>{dateTime(m.start)}</span>
        {m.kind !== 'sitting' && m.place && <span>{m.place}</span>}
        <States m={{ ...m, live: !!stream?.live }} />
      </p>
      <h3 className="hi assemblee-title">{title(m)}</h3>
      {m.items.length > 0 && (
        <ol className="assemblee-items">
          {m.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      )}
      {stream?.live ? (
        <Player src={stream.hls} poster={stream.poster} autoPlay />
      ) : stream ? (
        <div className="box-note">Diffusion en direct annoncée le {stream.start}.</div>
      ) : null}
      {videos.length > 0 && (
        <div className="assemblee-videos">
          <span className="label">en vidéo</span>
          {videos.map((v) => (
            <button key={v.id} className="assemblee-video" onClick={() => nav.open({ kind: 'video', id: v.id })}>
              {v.thumbnail ? (
                <img src={v.thumbnail} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
              ) : (
                <span className="assemblee-noimg" />
              )}
              <span className="assemblee-grow">
                <span className="small dim">{dateTime(v.date)}</span>
                <span className="hi">{v.title}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {!videos.length && !stream && m.video && past && m.state !== 'cancelled' && (
        <p className="dim">La vidéo n’est pas encore sur le portail : elle y arrive un peu après la réunion.</p>
      )}
      <p className="assemblee-actions">
        <button
          className="btn small"
          onClick={() => host.ask(`Explique-moi cette réunion de l’Assemblée nationale (${title(m)}, ${dateTime(m.start)}) : ${m.items.join(' ; ')}`)}
        >
          demander à Marianne
        </button>
        <button className="btn small" onClick={() => host.openUrl(AGENDA_PAGE)}>
          agenda officiel
        </button>
      </p>
    </>
  )
}
