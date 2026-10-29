import { useEffect, useState } from 'react'
import { useHost } from '@marianne/sdk/view'
import { AGENDA_PAGE, SENATE_AGENDA_PAGE } from '../links'
import { mondayOf } from '../senate'
import { addDays, parisDay } from '../time'
import type { AgendaMeeting, Chamber, Meeting } from '../types'
import { CHAMBER_NAMES } from '../types'
import { ChamberCode, dateTime, Failure, hour, Loading, shortDay, useFollowed, useMethod, useNav } from './common'
import { Thumb } from './home'
import { videoRef } from './members'
import { Player } from './player'

/** The week of both chambers, side by side: sittings and committees, what is filmed, live or cancelled, the meetings of the user's members marked. */

const title = (m: Meeting) => (m.kind === 'sitting' ? 'Séance publique' : m.organ || 'Réunion')

const BIG = /vote solennel|explications de vote|scrutin public solennel/i

function States({ m }: { m: Meeting & { live?: boolean } }) {
  return (
    <span className="small parlement-states">
      {m.live ? (
        <span className="parlement-live">● en direct</span>
      ) : m.state === 'cancelled' ? (
        <span className="bad">annulée</span>
      ) : m.state === 'tentative' ? (
        <span className="accent">à confirmer</span>
      ) : m.video ? (
        <span className="dim">filmée</span>
      ) : (
        <span className="muted">non filmée</span>
      )}
      {m.kind !== 'sitting' && m.place && <span className="dim">{m.place}</span>}
    </span>
  )
}

export function AgendaTab() {
  const host = useHost()
  const nav = useNav()
  const [monday, setMonday] = useState(() => mondayOf(parisDay()))
  const [day, setDay] = useState(parisDay)
  const agenda = useMethod('agenda', [monday, 7])
  const { reload } = agenda
  const thisWeek = monday === mondayOf(parisDay())

  // This week's broadcasts start and end through the day.
  useEffect(() => {
    if (!thisWeek) return
    const t = setInterval(reload, 120_000)
    return () => clearInterval(t)
  }, [thisWeek, reload])

  const meetings = (agenda.data?.meetings ?? []).filter((m) => nav.shows(m.chamber) && m.kind !== 'other')
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const count = (d: string, c: Chamber) => meetings.filter((m) => m.chamber === c && m.start.slice(0, 10) === d).length
  const big = meetings.filter((m) => BIG.test(m.items.join(' ')) && m.state !== 'cancelled')
  const move = (weeks: number) => {
    const next = addDays(monday, weeks * 7)
    setMonday(next)
    setDay(next === mondayOf(parisDay()) ? parisDay() : next)
  }

  return (
    <>
      <div className="parlement-toolbar">
        <button className="btn small" onClick={() => move(-1)}>
          ‹ semaine précédente
        </button>
        <span className="hi">semaine du {shortDay(monday)}</span>
        <button className="btn small" onClick={() => move(1)}>
          semaine suivante ›
        </button>
        {!thisWeek && (
          <button
            className="link"
            onClick={() => {
              setMonday(mondayOf(parisDay()))
              setDay(parisDay())
            }}
          >
            cette semaine
          </button>
        )}
      </div>
      <div className="parlement-week">
        {days.map((d) => {
          const an = count(d, 'an')
          const se = count(d, 'se')
          const off = !an && !se
          return (
            <button key={d} className={`parlement-wd${d === day ? ' on' : ''}${off ? ' off' : ''}`} onClick={() => setDay(d)}>
              <span className={d === parisDay() ? 'accent' : 'hi'}>{shortDay(d)}</span>
              {off ? (
                <span className="small">{agenda.data ? 'pas de réunion' : '…'}</span>
              ) : (
                <span className="small">
                  {nav.shows('an') && (
                    <>
                      <ChamberCode chamber="an" /> {an}{' '}
                    </>
                  )}
                  {nav.shows('se') && (
                    <>
                      <ChamberCode chamber="se" /> {se}
                    </>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {agenda.error ? (
        <Failure error={agenda.error} retry={reload} />
      ) : !agenda.data ? (
        <Loading>chargement de l’agenda…</Loading>
      ) : (
        <div className={nav.chambers === 'both' ? 'parlement-two' : ''}>
          {(['an', 'se'] as Chamber[])
            .filter((c) => nav.shows(c))
            .map((c) => (
              <Column
                key={c}
                chamber={c}
                meetings={meetings.filter((m) => m.chamber === c && m.start.slice(0, 10) === day)}
                indexed={c === 'se' || agenda.data!.indexed}
              />
            ))}
        </div>
      )}
      {big.length > 0 && (
        <div className="box-note small">
          <span className="accent">grands rendez-vous ·</span>{' '}
          {big.map((m, i) => (
            <span key={m.id}>
              {i > 0 && ' · '}
              <button className="link" onClick={() => nav.open({ kind: 'meeting', id: m.id })}>
                {dateTime(m.start)}
              </button>{' '}
              {m.items.find((x) => BIG.test(x)) ?? m.items[0]} ({m.chamber === 'an' ? 'AN' : 'Sénat'})
            </span>
          ))}
        </div>
      )}
      <p className="small dim parlement-foot">
        agendas officiels :{' '}
        <button className="link" onClick={() => host.openUrl(AGENDA_PAGE)}>
          Assemblée nationale
        </button>{' '}
        ·{' '}
        <button className="link" onClick={() => host.openUrl(SENATE_AGENDA_PAGE)}>
          Sénat
        </button>
      </p>
    </>
  )
}

function Column({ chamber, meetings, indexed }: { chamber: Chamber; meetings: AgendaMeeting[]; indexed: boolean }) {
  const nav = useNav()
  const { mine, ids } = useFollowed()
  const people = useMethod('members', ids.length ? [{ chamber, ids }] : null)
  const whoIn = (m: AgendaMeeting) => (m.organId ? (people.data ?? []).filter((p) => p.organs.includes(m.organId)) : [])
  return (
    <div>
      <div className="parlement-h">
        <ChamberCode chamber={chamber} />
        <span className="hi">{CHAMBER_NAMES[chamber]}</span>
        <span className="small dim">
          {meetings.length} réunion{meetings.length > 1 ? 's' : ''}
        </span>
      </div>
      {!indexed ? (
        <p className="small dim">L’agenda de l’Assemblée vient de ses données ouvertes, pas encore téléchargées.</p>
      ) : meetings.length ? (
        meetings.map((m) => {
          const who = whoIn(m)
          return (
            <button
              key={m.id}
              className={`parlement-ev agenda${m.state === 'cancelled' ? ' cancelled' : ''}`}
              onClick={() => nav.open({ kind: 'meeting', id: m.id })}
            >
              <span className={m.live ? 'bad' : 'dim'}>{hour(m.start)}</span>
              <span className="parlement-stack">
                <span>
                  {title(m)}
                  {who.map((p) => (
                    <span key={p.id} className={`parlement-mine${mine.some((x) => x.id === p.id) ? '' : ' followed'}`}>
                      {p.name}
                    </span>
                  ))}
                </span>
                {m.items.slice(0, 2).map((item, i) => (
                  <span key={i} className="small parlement-clamp">
                    {item}
                  </span>
                ))}
                {m.items.length > 2 && (
                  <span className="small dim">… et {m.items.length === 3 ? 'un autre point' : `${m.items.length - 2} autres points`}</span>
                )}
                <States m={m} />
              </span>
            </button>
          )
        })
      ) : (
        <p className="small dim">Rien à l’agenda ce jour-là.</p>
      )}
    </div>
  )
}

/** A meeting: its agenda, its broadcast when live, its recordings once on the portal. */
export function MeetingPane({ id }: { id: string }) {
  const host = useHost()
  const nav = useNav()
  const detail = useMethod('meeting', [id])
  if (detail.error) return <Failure error={detail.error} retry={detail.reload} />
  if (!detail.data) return <Loading>chargement de la réunion…</Loading>
  const { meeting: m, stream, videos } = detail.data
  const past = Date.parse(m.start) < Date.now()
  return (
    <>
      <p className="parlement-row small">
        <ChamberCode chamber={m.chamber} />
        <span className="dim">{dateTime(m.start)}</span>
        <States m={{ ...m, live: !!stream?.live }} />
      </p>
      <h3 className="hi parlement-title">{title(m)}</h3>
      {m.items.length > 0 && (
        <ol className="parlement-items">
          {m.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      )}
      {stream?.live ? (
        <Player src={stream.hls} poster={stream.poster} autoPlay />
      ) : stream ? (
        <div className="box-note">Diffusion en direct annoncée à {hour(stream.startAt)}.</div>
      ) : null}
      {videos.length > 0 && (
        <div className="parlement-lines">
          <span className="label">en vidéo</span>
          {videos.map((v) => (
            <button key={v.id} className="parlement-vrow" onClick={() => nav.open({ kind: 'video', ref: videoRef(v) })}>
              <Thumb chamber={v.chamber} src={v.thumbnail} />
              <span className="parlement-stack">
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
      <p className="parlement-actions">
        <button
          className="btn small"
          onClick={() =>
            host.ask(
              `Explique-moi cette réunion ${m.chamber === 'an' ? 'de l’Assemblée nationale' : 'du Sénat'} (${title(m)}, ${dateTime(m.start)}) : ${m.items.join(' ; ')}`
            )
          }
        >
          demander à Marianne
        </button>
        <button className="btn small" onClick={() => host.openUrl(m.chamber === 'an' ? AGENDA_PAGE : SENATE_AGENDA_PAGE)}>
          agenda officiel
        </button>
      </p>
    </>
  )
}
