import { useMemo } from 'react'
import { useHost } from '@marianne/sdk/view'
import { FIND_DEPUTY } from '../links'
import { isAhead, parisDay } from '../time'
import type { AgendaMeeting, DayBallots, LiveStream, MemberCard, Suggestion } from '../types'
import { BallotTable, DayTiles, dayMosaic, useDayVotes, useGroups } from './ballots'
import {
  ChamberCode,
  constituency,
  dateTime,
  Face,
  Failure,
  FollowButton,
  GroupChip,
  hour,
  LensChip,
  LensIcon,
  Loading,
  longDay,
  Mosaic,
  percent,
  plural,
  useBallotDay,
  useFollowed,
  useLens,
  useMethod,
  useNav,
  usePolling,
  useStore,
  yourTitle
} from './common'
import { NeedsData } from './data'
import { streamTarget } from './media'

/**
 * The home screen: the user's members first (from their address), what happens now beside them
 * (live, members to follow, what comes next), then the day at the Parlement in a double frame. No
 * hemicycle and no video shelf: their tabs have them.
 */

export function HomeTab() {
  return (
    <NeedsData>
      <Home />
    </NeedsData>
  )
}

function Home() {
  const nav = useNav()
  const live = useMethod('live', [])
  const agenda = useMethod('agenda', [parisDay(), 14])
  const day = useBallotDay()
  const result = useMethod('day', day ? [day] : null)
  // Broadcasts start and end through the day.
  usePolling(live, 60_000)
  const { mine } = useStore()
  if (!mine || !day || (!result.data && !result.error)) return <Loading label="votre journée au Parlement" />

  const streams = (live.data ?? []).filter((s) => nav.shows(s.chamber))
  const now = new Date().toISOString()
  const sitting = (agenda.data?.meetings ?? []).filter((m) => m.kind === 'sitting' && m.start.slice(0, 10) === parisDay() && m.state !== 'cancelled')
  const big = (agenda.data?.meetings ?? []).find((m) => isAhead(m.start) && BIG.test(m.items.join(' ')) && nav.shows(m.chamber))

  return (
    <>
      <div className="parlement-dayline">
        <span className="parlement-title big">{longDay(parisDay()).replace(/ \d{4}$/, '')}</span>
        <span className="dim">
          {hour(now)}
          {sitting.length ? ` · ${sittingText(sitting)}` : ' · pas de séance publique aujourd’hui'}
        </span>
        {streams.length > 0 && <span className="parlement-live">● {streams.length > 1 ? `${streams.length} directs` : 'en direct'}</span>}
        <span className="parlement-grow" />
        {big && (
          <span className="small dim">
            prochain grand rendez-vous :{' '}
            <button className="link hi parlement-left" onClick={() => nav.open({ kind: 'meeting', id: big.id, day: big.start.slice(0, 10) })}>
              {bigText(big)}, {dateTime(big.start)}
            </button>
          </span>
        )}
      </div>
      <div className="parlement-dash">
        <div>
          <Mine day={result.data} />
          <Followed day={result.data} />
        </div>
        <div>
          {streams.length > 0 && <Live streams={streams} />}
          <Suggestions />
          <Coming meetings={agenda.data?.meetings ?? null} error={agenda.error} />
        </div>
      </div>
      {result.error ? (
        <Failure inline error={result.error} retry={result.reload} />
      ) : result.data ? (
        <Bulletin day={result.data} />
      ) : (
        <Loading inline label="les scrutins du jour" />
      )}
    </>
  )
}

/** The great appointments: solemn votes, a whole text's vote. */
const BIG = /vote solennel|explications de vote|scrutin public solennel/i

const bigText = (m: AgendaMeeting) => {
  const item = m.items.find((i) => BIG.test(i)) ?? m.items[0] ?? ''
  return item.length > 80 ? `${item.slice(0, 78)}…` : item
}

function sittingText(sitting: AgendaMeeting[]): string {
  const an = sitting.some((m) => m.chamber === 'an')
  const se = sitting.some((m) => m.chamber === 'se')
  return an && se ? 'l’Assemblée et le Sénat siègent' : an ? 'l’Assemblée siège' : 'le Sénat siège'
}

/** "vos élus": the deputy (their day: votes, committees, amendments, the lens) and the senators. */
function Mine({ day }: { day: DayBallots | null }) {
  const host = useHost()
  const nav = useNav()
  const { mine } = useStore()
  if (!mine) return <Loading inline />
  if (!mine.commune)
    return (
      <div className="parlement-blk">
        <div className="parlement-h">
          <span className="label">vos élus</span>
        </div>
        <div className="box-note">
          Vos députés et vos sénateurs se trouvent d’après votre adresse, qui n’est pas encore renseignée. Le calcul se fait sur cet ordinateur : rien n’est
          envoyé.{' '}
          <button className="link" onClick={() => host.openRoute('settings/identity')}>
            renseigner mon adresse
          </button>
        </div>
      </div>
    )
  const c = mine.commune
  const deputy = mine.exact ? mine.deputies[0] : undefined
  return (
    <div className="parlement-blk">
      <div className="parlement-h">
        <span className="label">vos élus</span>
        <span className="small dim">
          d’après votre adresse : {c.name} ({c.department}){deputy ? ` · ${constituency(deputy.constituency)}` : ''} ·{' '}
          <button className="link" onClick={() => host.openRoute('settings/identity')}>
            modifier
          </button>
        </span>
      </div>
      {nav.shows('an') &&
        (deputy ? (
          <DeputyCard deputy={deputy} day={day} />
        ) : mine.deputies.length ? (
          <div className="box-note small">
            {c.name} compte {mine.deputies.length} circonscriptions et votre adresse ne dit pas laquelle est la vôtre :{' '}
            {mine.deputies.map((d, i) => (
              <span key={d.id}>
                {i > 0 && ', '}
                <button className="link" onClick={() => nav.open({ kind: 'member', chamber: 'an', id: d.id })}>
                  {d.name}
                </button>{' '}
                ({constituency(d.constituency)})
              </span>
            ))}
            .{' '}
            <button className="link" onClick={() => host.openUrl(FIND_DEPUTY)}>
              la trouver sur le site de l’Assemblée
            </button>
          </div>
        ) : (
          <p className="small dim">Aucun député en exercice pour votre circonscription.</p>
        ))}
      {nav.shows('se') && mine.senators.length > 0 && <Senators senators={mine.senators} day={day} department={c.departmentName || c.department} />}
    </div>
  )
}

function DeputyCard({ deputy, day }: { deputy: MemberCard; day: DayBallots | null }) {
  const nav = useNav()
  const lens = useLens()
  const groups = useGroups()
  const votes = useDayVotes(day, [deputy])
  const presence = useMethod('presence', day ? [day.day] : null)
  const passages = useMethod('passages', [[deputy.id], 2])
  const lensGroup = groups.byAcronym('an', lens.an)
  const agreement = useMethod('agreement', lensGroup ? ['an', { group: lensGroup.id }, 30] : null)
  const m = dayMosaic(day, deputy, votes)
  const lines = (day?.bills ?? []).filter((b) => b.chamber === 'an').flatMap((b) => b.ballots)
  const theirs = votes[deputy.id] ?? {}
  const gaps = lensGroup
    ? lines.filter((l) => {
        const own = theirs[l.id]?.position
        const ref = l.majorities?.[lensGroup.id]
        return own && own !== 'nonVoting' && ref && own !== ref
      }).length
    : 0
  const adopted = lines.filter((l) => l.author?.id === deputy.id && l.adopted)
  const committees = presence.data?.[deputy.id]?.committees ?? []
  const spoke = (passages.data ?? []).filter((p) => p.member === deputy.id).slice(0, 2)
  const today = day?.day === parisDay()
  return (
    <div className="parlement-me">
      <Face member={deputy} size={54} />
      <div className="parlement-stack">
        <span className="parlement-row">
          <span className="small accent">{yourTitle(deputy)}</span>
          <ChamberCode chamber="an" />
        </span>
        <button className="hi parlement-me-name" onClick={() => nav.open({ kind: 'member', chamber: 'an', id: deputy.id })}>
          {deputy.name}
        </button>
        <span className="parlement-row small">
          <GroupChip short={deputy.groupShort} color={deputy.groupColor} />
          <span className="dim">
            {deputy.group} · {deputy.department} · {constituency(deputy.constituency)}
          </span>
        </span>
      </div>
      <div className="parlement-stack parlement-me-acts">
        <FollowButton id={deputy.id} />
        <button className="btn small" onClick={() => nav.open({ kind: 'member', chamber: 'an', id: deputy.id })}>
          sa fiche
        </button>
      </div>
      <div className="parlement-me-today">
        <span className="label">{today ? 'aujourd’hui' : day ? longDay(day.day) : ''}</span>
        {m.total ? (
          <span className="parlement-row">
            <Mosaic votes={m.blocks} />
            <span>
              <span className="hi">
                {m.voted}/{m.total}
              </span>{' '}
              scrutins{m.proxy ? ` · dont ${m.proxy} par délégation` : ''}
            </span>
          </span>
        ) : (
          <span className="small dim">aucun scrutin public à l’Assemblée</span>
        )}
        <span />
        <span className="small">
          {[
            ...committees.map((c) => (
              <span key={c.meeting}>
                {c.organ.replace(/^Commission (des |de la |de l’|du )?/, 'commission $1').toLowerCase()}, {hour(c.start)} :{' '}
                <span className={c.status === 'present' ? 'ok' : c.status === 'excused' ? 'accent' : 'dim'}>
                  {c.status === 'present'
                    ? deputy.female
                      ? 'présente'
                      : 'présent'
                    : c.status === 'excused'
                      ? deputy.female
                        ? 'excusée'
                        : 'excusé'
                      : 'absent·e'}
                </span>
              </span>
            )),
            ...adopted.slice(0, 2).map((l) => (
              <span key={l.id}>
                a fait adopter son amendement{' '}
                <button className="link" onClick={() => nav.open({ kind: 'ballot', chamber: 'an', id: l.id })}>
                  {l.amendment || `n° ${l.number}`}
                </button>
              </span>
            )),
            ...spoke.map((p) => (
              <span key={`${p.video.id}:${p.timecode}`}>
                a parlé ({p.video.type || 'vidéo'}){' '}
                <button className="link" onClick={() => nav.open({ kind: 'video', ref: p.video.id, start: p.timecode })}>
                  ▶ {shortTitle(p.video.title)}
                </button>
              </span>
            ))
          ].flatMap((el, i) => (i ? [<span key={`sep${i}`}> · </span>, el] : [el]))}
          {!committees.length && !adopted.length && !spoke.length && <span className="dim">ni commission ni intervention filmée relevées</span>}
        </span>
        {lensGroup && (
          <>
            <span className="label accent">vos idées</span>
            <span className="parlement-row small">
              <LensChip group={lensGroup.shortName} />
              <span>
                même vote que {lensGroup.shortName} :{' '}
                <span className="hi">{agreement.data?.[deputy.id] !== undefined ? percent(agreement.data[deputy.id]) : '—'}</span> (30 j.)
              </span>
              {m.total > 0 &&
                (gaps ? (
                  <button className="link" onClick={() => nav.tab('ballots')}>
                    · {gaps} écart{gaps > 1 ? 's' : ''} {today ? 'aujourd’hui' : 'ce jour-là'} ›
                  </button>
                ) : (
                  <span className="dim">· {today ? 'aujourd’hui' : 'ce jour-là'}, aucun écart</span>
                ))}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

const shortTitle = (title: string) => (title.length > 48 ? `${title.slice(0, 46)}…` : title)

function Senators({ senators, day, department }: { senators: MemberCard[]; day: DayBallots | null; department: string }) {
  const nav = useNav()
  const votes = useDayVotes(day, senators)
  return (
    <>
      <div className="parlement-h parlement-h2">
        <span className="small dim">vos sénateurs · {department}</span>
        <ChamberCode chamber="se" />
        <span className="parlement-more small dim">élus par les grands électeurs du département</span>
      </div>
      <div className="parlement-senators">
        {senators.map((s) => {
          const m = dayMosaic(day, s, votes)
          return (
            <button key={s.id} className="parlement-person" onClick={() => nav.open({ kind: 'member', chamber: 'se', id: s.id })}>
              <Face member={s} size={30} />
              <span className="parlement-stack">
                <span className="hi parlement-ell">{s.name}</span>
                <span className="small dim">
                  <GroupChip short={s.groupShort} color={s.groupColor} small />
                  {m.total ? ` · ${m.voted}/${m.total} votes` : ''}
                </span>
              </span>
              <span className="small dim">›</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

/** "vos suivis": each followed member's day, as a mosaic. */
function Followed({ day }: { day: DayBallots | null }) {
  const nav = useNav()
  const lens = useLens()
  const groups = useGroups()
  const { favorites } = useStore()
  const { mine } = useFollowed()
  const own = new Set(mine.map((m) => m.id))
  const ids = favorites.members.filter((id) => !own.has(id))
  const people = useMethod('members', ids.length ? [{ ids }] : null)
  const shown = useMemo(() => (people.data ?? []).filter((m) => nav.shows(m.chamber)), [people.data, nav])
  const votes = useDayVotes(day, shown)
  const lensGroup = groups.byAcronym('an', lens.an)
  const agreement = useMethod('agreement', lensGroup && shown.some((m) => m.chamber === 'an') ? ['an', { group: lensGroup.id }, 30] : null)
  return (
    <div className="parlement-blk">
      <div className="parlement-h">
        <span className="label">vos suivis ★</span>
        <button className="parlement-more link" onClick={() => nav.tab('members')}>
          gérer · chercher un élu
        </button>
      </div>
      {!ids.length ? (
        <p className="small dim">Suivez des élus (☆ sur leur fiche, ou dans « à suivre ? ») pour voir ici ce qu’ils font chaque jour.</p>
      ) : people.error ? (
        <Failure inline error={people.error} retry={people.reload} />
      ) : !people.data ? (
        <Loading inline />
      ) : (
        <div className="parlement-lines">
          {shown.map((p) => {
            const m = dayMosaic(day, p, votes)
            return (
              <button
                key={`${p.chamber}:${p.id}`}
                className={`parlement-line parlement-followed${lensGroup ? ' lens' : ''}`}
                onClick={() => nav.open({ kind: 'member', chamber: p.chamber, id: p.id })}
              >
                <Face member={p} size={22} />
                <span className="parlement-stack">
                  <span className="hi parlement-ell">{p.name}</span>
                  <span className="small dim parlement-ell">
                    <GroupChip short={p.groupShort} color={p.groupColor} small /> · {p.department}
                    {p.constituency ? ` · ${constituency(p.constituency)}` : ''}
                  </span>
                </span>
                <ChamberCode chamber={p.chamber} />
                <span>{m.total > 0 && <Mosaic votes={m.blocks} />}</span>
                <span className={`small${m.voted ? '' : ' dim'}`}>
                  {m.total ? (m.voted ? `${m.voted}/${m.total} votes${m.proxy ? ` · ${m.proxy} ⇄` : ''}` : 'pas de vote') : 'pas de scrutin'}
                </span>
                {lensGroup && (
                  <span className="small" title={`vote comme vos idées (${lensGroup.shortName}), 30 jours`}>
                    <LensIcon /> {p.chamber === 'an' && agreement.data?.[p.id] !== undefined ? percent(agreement.data[p.id]) : '—'}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Live({ streams }: { streams: LiveStream[] }) {
  const nav = useNav()
  return (
    <div className="parlement-blk">
      <div className="parlement-h">
        <span className="label">en direct</span>
        <button className="parlement-more link" onClick={() => nav.tab('videos')}>
          toutes les vidéos ›
        </button>
      </div>
      <div className="parlement-shelf" style={{ ['--n' as string]: Math.min(streams.length, 2) }}>
        {streams.map((s) => (
          <button key={`${s.chamber}:${s.video ?? s.id}`} className="parlement-vcard onair" onClick={() => nav.open(streamTarget(s))}>
            <Thumb chamber={s.chamber} src={s.poster} live large />
            <span className="parlement-row small">
              <ChamberCode chamber={s.chamber} />
              <span className="parlement-live">● depuis {hour(s.startAt)}</span>
            </span>
            <span className="hi small parlement-clamp">{s.title || s.subject || s.organ}</span>
            <span className="small dim parlement-ell">{s.organ}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** A video's thumbnail: the portal's image, or the chamber's code as a Videotex card when there is none; live, length, progress over it. */
export function Thumb({
  chamber,
  src,
  live,
  large,
  duration,
  progress
}: {
  chamber: 'an' | 'se'
  src?: string
  live?: boolean
  large?: boolean
  duration?: string
  progress?: number
}) {
  return (
    <span className={`parlement-thumb ${chamber}${large ? ' lg' : ''}`}>
      <span className="glyph">
        {chamber === 'an' ? 'AN' : 'SÉNAT'} <b>▶</b>
      </span>
      {src && <img src={src} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />}
      {live && <span className="lv">● DIRECT</span>}
      {duration && <span className="dur">{duration}</span>}
      {progress !== undefined && (
        <span className="prog">
          <i style={{ width: `${Math.max(progress * 100, 2)}%` }} />
        </span>
      )}
    </span>
  )
}

/** "à suivre ?": members to follow, each with its reason. */
export function Suggestions({ wide }: { wide?: boolean }) {
  const nav = useNav()
  const suggestions = useMethod('suggestions', [])
  const list = (suggestions.data ?? []).filter((s) => nav.shows(s.member.chamber))
  return (
    <div className="parlement-blk">
      <div className="parlement-h">
        <span className="label">à suivre ?</span>
        <span className="small dim">{wide ? 'pourquoi : toujours dit, jamais deviné' : 'd’après votre adresse et vos thèmes'}</span>
      </div>
      {suggestions.error ? (
        <Failure inline error={suggestions.error} retry={suggestions.reload} />
      ) : !suggestions.data ? (
        <Loading inline />
      ) : list.length ? (
        <div className="parlement-lines">
          {list.map((s) => (
            <SuggestionLine key={s.member.id} s={s} wide={wide} />
          ))}
        </div>
      ) : (
        <p className="small dim">
          Pas de suggestion pour l’instant : elles viennent de votre adresse, du texte de la semaine et des thèmes que vous laissez lire.
        </p>
      )}
    </div>
  )
}

function SuggestionLine({ s, wide }: { s: Suggestion; wide?: boolean }) {
  const nav = useNav()
  const m = s.member
  const lensKind = s.kind === 'close' || s.kind === 'counterpoint'
  return (
    <div className={`parlement-line parlement-sugg${wide ? ' wide' : ''}`}>
      <Face member={m} size={22} />
      <span className="parlement-stack">
        <span className="parlement-row">
          <button className="hi" onClick={() => nav.open({ kind: 'member', chamber: m.chamber, id: m.id })}>
            {m.name}
          </button>
          <GroupChip short={m.groupShort} color={m.groupColor} small />
          <ChamberCode chamber={m.chamber} />
        </span>
        {!wide && (
          <span className="small dim">
            {lensKind && <LensIcon />} {s.why}
          </span>
        )}
      </span>
      {wide && (
        <span className={`parlement-why${s.kind === 'counterpoint' ? ' counter' : ''}`} title={s.why}>
          {lensKind && <LensIcon />} {s.why}
        </span>
      )}
      <FollowButton id={m.id} />
    </div>
  )
}

/** "à venir": the next sittings and great appointments of both chambers. */
function Coming({ meetings, error }: { meetings: AgendaMeeting[] | null; error: string }) {
  const nav = useNav()
  const { mine } = useFollowed()
  const organs = new Set(mine.flatMap((m) => m.organs))
  const next = (meetings ?? [])
    .filter((m) => isAhead(m.start) && m.state !== 'cancelled' && nav.shows(m.chamber))
    .filter((m) => m.kind === 'sitting' || BIG.test(m.items.join(' ')) || organs.has(m.organId))
  // A sitting a day per chamber, the rest as they come.
  const seen = new Set<string>()
  const shown = next
    .filter((m) => {
      const key = `${m.chamber}:${m.kind}:${m.start.slice(0, 10)}`
      if (m.kind === 'sitting' && !BIG.test(m.items.join(' '))) {
        if (seen.has(key)) return false
        seen.add(key)
      }
      return true
    })
    .slice(0, 6)
  return (
    <div className="parlement-blk">
      <div className="parlement-h">
        <span className="label">à venir</span>
        <button className="parlement-more link" onClick={() => nav.tab('agenda')}>
          agenda ›
        </button>
      </div>
      {error ? (
        <Failure inline error={error} />
      ) : !meetings ? (
        <Loading inline />
      ) : shown.length ? (
        shown.map((m) => {
          const isBig = BIG.test(m.items.join(' '))
          return (
            <button key={m.id} className="parlement-ev" onClick={() => nav.open({ kind: 'meeting', id: m.id, day: m.start.slice(0, 10) })}>
              <span className={isBig ? 'accent' : 'dim'}>{dateTime(m.start)}</span>
              <span className="parlement-ell">
                <ChamberCode chamber={m.chamber} />{' '}
                {m.kind === 'sitting'
                  ? isBig
                    ? bigText(m)
                    : `séance publique${m.items[0] ? ` · ${m.items[0]}` : ''}`
                  : `${m.organ ?? 'réunion'}${m.items[0] ? ` · ${m.items[0]}` : ''}`}
                {organs.has(m.organId) && <span className="parlement-mine">vos élus</span>}
              </span>
            </button>
          )
        })
      ) : (
        <p className="small dim">Rien d’annoncé pour les deux semaines qui viennent.</p>
      )}
    </div>
  )
}

/** "le jour au Parlement": the day's figures, then its ballots by bill, in a double frame. */
function Bulletin({ day }: { day: DayBallots }) {
  const nav = useNav()
  const lines = day.bills.filter((b) => nav.shows(b.chamber)).flatMap((b) => b.ballots)
  const today = day.day === parisDay()
  return (
    <div className="news parlement-news">
      <div className="parlement-h">
        <span className="parlement-title">le jour au parlement</span>
        <span className="small dim">
          {today ? longDay(day.day) : `dernier jour de scrutins : ${longDay(day.day)}`} · {plural(lines.length, 'scrutin public', 'scrutins publics')}
        </span>
        <button className="parlement-more link" onClick={() => nav.tab('ballots')}>
          récap complet et présence ›
        </button>
      </div>
      {lines.length ? (
        <>
          <DayTiles data={day} compact />
          <BallotTable day={day} limit={6} onSelect={(line) => nav.open({ kind: 'ballot', chamber: line.chamber, id: line.id })} />
        </>
      ) : (
        <p className="dim">
          Aucun scrutin public {today ? 'aujourd’hui' : 'ce jour-là'} dans {nav.chambers === 'both' ? 'les deux chambres' : 'cette chambre'}.
        </p>
      )}
    </div>
  )
}
