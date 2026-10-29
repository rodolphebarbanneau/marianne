import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import plans from '../hemicycle.json'
import { parisDay } from '../time'
import type { BallotLine, Chamber, DayPresence, GroupInfo, Hemicycle as HemicycleData, VoteMap } from '../types'
import {
  ChamberCode,
  Failure,
  GroupChip,
  LensIcon,
  Loading,
  percent,
  shortDay,
  useBallotDay,
  useFollowed,
  useLens,
  useMethod,
  useNav,
  useStore
} from './common'
import { NeedsData } from './data'

/**
 * The hemicycles: one dot per seat, at its place on the chamber's own plan (hemicycle.json). The
 * same drawing reads several ways: the groups, a ballot (pour, contre, abstention), who voted
 * today, how close each member votes to the user's deputy, or to the leaning they declared. The
 * user's own are ringed in yellow, those they follow dotted. A seat says who sits there; a click
 * opens their page.
 */

export type Reading = 'groups' | 'vote' | 'presence' | 'deputy' | 'lens'

interface Plan {
  width: number
  height: number
  r: number
  seats: Record<string, [number, number]>
}

const VOTE_COLORS: Record<string, string> = { p: 'var(--vert)', c: 'var(--rouge)', a: 'var(--jaune)', n: 'var(--cyan)' }

/** The colour of each seat's member in a reading; null: a hollow seat (no vote, too few votes to tell). */
export type Fill = (member: string, group: string) => string | null

/** A share as a shade of the accent colour, from the background (rarely) to bright (always). */
const shade = (share: number) => `color-mix(in srgb, var(--accent) ${Math.round(share * 100)}%, var(--bg-raised))`

interface DrawProps {
  data: HemicycleData
  fill: Fill
  /** What the seat's hover card adds: their vote, their presence… */
  detail?: (member: string) => string
  /** A label over the user's deputy, by their seat. */
  callout?: string
  center?: { big: string; small: string; color?: string }
  compact?: boolean
}

/** One chamber's hemicycle, drawn. */
export function HemicycleDrawing({ data, fill, detail, callout, center, compact }: DrawProps) {
  const nav = useNav()
  const { prefs } = useStore()
  const { mine, ids } = useFollowed()
  const [tip, setTip] = useState<{ x: number; y: number; left: boolean; seat: HemicycleData['seats'][number] } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const plan = plans[data.chamber] as unknown as Plan
  const own = new Set(mine.map((m) => m.id))
  const followed = new Set(ids)
  const groups = new Map(data.groups.map((g) => [g.id, g]))
  const mosaic = prefs.style === 'mosaic'
  const r = plan.r
  const pad = r * 4
  const seats = useMemo(
    () =>
      data.seats.flatMap((s) => {
        const at = plan.seats[String(s.seat)]
        return at ? [{ ...s, x: at[0], y: at[1] }] : []
      }),
    [data.seats, plan]
  )
  // The figure sits in the bay, on the last row; its caption under it.
  const base = seats.length ? Math.max(...seats.map((s) => s.y)) : plan.height
  const calloutSeat = callout ? seats.find((s) => own.has(s.member) && data.chamber === 'an') : undefined

  /**
   * The callout: a line from the seat, out of the hemicycle along its radius, then up to the empty
   * corner on its side, where the label goes (above the arc for a seat near the top). The circle is
   * the plan's: centred across, its outer row as far from the centre as its widest seats.
   */
  const leader = useMemo(() => {
    if (!calloutSeat || !seats.length) return null
    const left = Math.min(...seats.map((s) => s.x))
    const high = Math.min(...seats.map((s) => s.y))
    const cx = plan.width / 2
    const radius = cx - left
    const cy = high + radius
    const dx = calloutSeat.x - cx
    const dy = calloutSeat.y - cy
    const d = Math.hypot(dx, dy) || 1
    const [ux, uy] = [dx / d, dy / d]
    const from = { x: calloutSeat.x + ux * r * 1.95, y: calloutSeat.y + uy * r * 1.95 }
    const out = { x: cx + ux * (radius + r * 3.5), y: cy + uy * (radius + r * 3.5) }
    const end = { x: out.x, y: Math.min(out.y, high + radius * 0.3) }
    return { points: [from, out, end], end, side: Math.abs(ux) < 0.45 ? ('above' as const) : dx < 0 ? ('left' as const) : ('right' as const) }
  }, [calloutSeat, seats, plan.width, r])
  // Room above the arc for a label that goes there; under the last row, the bay's figure.
  const high = seats.length ? Math.min(...seats.map((s) => s.y)) : 0
  const top = leader && leader.end.y < high + r * 4 ? Math.max(pad, high - leader.end.y + r * 7) : pad
  const view = { x: -pad, y: -top, width: plan.width + pad * 2, height: base + top + (center?.big ? r * 2.4 : pad) }

  // The label in the page's text (a constant size), placed by the line's end, within the drawing.
  const svg = useRef<SVGSVGElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const [labelAt, setLabelAt] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!leader || !box.current) return setLabelAt(null)
    const place = () => {
      const drawing = svg.current?.getBoundingClientRect()
      const el = label.current
      if (!drawing || !el) return
      const scale = drawing.width / view.width
      const x = (leader.end.x - view.x) * scale
      const y = (leader.end.y - view.y) * scale
      const [w, h, gap] = [el.offsetWidth, el.offsetHeight, 6]
      let at = leader.side === 'above' ? { left: x - w / 2, top: y - h - gap } : { left: leader.side === 'left' ? x - w - gap : x + gap, top: y - h / 2 }
      // Not enough room beside its line: above it.
      if (at.left < 0 || at.left + w > drawing.width) at = { left: x - w / 2, top: y - h - gap }
      const next = { left: Math.round(Math.max(0, Math.min(drawing.width - w, at.left))), top: Math.round(Math.max(0, at.top)) }
      setLabelAt((prev) => (prev && prev.left === next.left && prev.top === next.top ? prev : next))
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(box.current)
    return () => observer.disconnect()
  }, [leader, view.x, view.y, view.width])
  // The hover card, in the drawing's own coordinates; on its left side near the right edge.
  const hover = (s: (typeof seats)[number]) => (e: MouseEvent) => {
    const r = box.current?.getBoundingClientRect()
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, left: e.clientX - r.left > r.width - 260, seat: s })
  }
  return (
    <div ref={box} className={`parlement-hemi${compact ? ' compact' : ''}`} onMouseLeave={() => setTip(null)}>
      <svg
        ref={svg}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        role="img"
        aria-label={`hémicycle ${data.chamber === 'an' ? 'de l’Assemblée nationale' : 'du Sénat'}`}
      >
        {seats.map((s) => {
          const color = fill(s.member, s.groupId)
          const style = color ? { fill: color } : { fill: 'none', stroke: 'var(--muted)', strokeWidth: r * 0.22 }
          const props = { key: s.seat, style, onMouseMove: hover(s), onClick: () => nav.open({ kind: 'member', chamber: data.chamber, id: s.member }) }
          return mosaic ? (
            <rect {...props} x={s.x - r * 0.85} y={s.y - r * 0.85} width={r * 1.7} height={r * 1.7} shapeRendering="crispEdges" />
          ) : (
            <circle {...props} cx={s.x} cy={s.y} r={color ? r : r * 0.85} />
          )
        })}
        {seats
          .filter((s) => own.has(s.member) || followed.has(s.member))
          .map((s) => (
            <circle
              key={`ring-${s.seat}`}
              cx={s.x}
              cy={s.y}
              r={r * 1.75}
              className={own.has(s.member) ? 'parlement-ring mine' : 'parlement-ring'}
              style={{ strokeWidth: r * (own.has(s.member) ? 0.4 : 0.28) }}
            />
          ))}
        {leader && (
          <g className="parlement-leader">
            <polyline className="halo" points={leader.points.map((p) => `${p.x},${p.y}`).join(' ')} style={{ strokeWidth: r * 0.95 }} />
            <polyline points={leader.points.map((p) => `${p.x},${p.y}`).join(' ')} style={{ strokeWidth: r * 0.3 }} />
            <circle cx={leader.end.x} cy={leader.end.y} r={r * 0.5} />
          </g>
        )}
        {center?.big && (
          <text className="parlement-center" x={plan.width / 2} y={base + r * 0.5} style={{ fontSize: r * (compact ? 11 : 8), fill: center.color }}>
            {center.big}
          </text>
        )}
      </svg>
      {leader && (
        <span ref={label} className="parlement-callout" style={labelAt ?? { visibility: 'hidden' }}>
          {callout}
        </span>
      )}
      {/* The caption in the page's text, readable whatever the drawing's size. */}
      {center?.small && <div className="parlement-center-sub small">{center.small}</div>}
      {tip && (
        <div className="parlement-tip" style={tip.left ? { right: `calc(100% - ${tip.x - 14}px)`, top: tip.y + 14 } : { left: tip.x + 14, top: tip.y + 14 }}>
          <div className="hi">{tip.seat.name}</div>
          <div className="small">
            <GroupChip short={groups.get(tip.seat.groupId)?.shortName ?? ''} color={groups.get(tip.seat.groupId)?.color ?? ''} small />{' '}
            <span className="dim">{tip.seat.place}</span>
          </div>
          {detail && <div className="small">{detail(tip.seat.member)}</div>}
          {own.has(tip.seat.member) ? (
            <div className="small accent">votre élu</div>
          ) : followed.has(tip.seat.member) ? (
            <div className="small">★ suivi</div>
          ) : null}
        </div>
      )}
    </div>
  )
}

/** The groups of a chamber, left to right, each with its seats as a bar. */
export function GroupLegend({ groups, compact }: { groups: GroupInfo[]; compact?: boolean }) {
  const nav = useNav()
  const max = Math.max(1, ...groups.map((g) => g.members))
  return (
    <div className={`parlement-legend${compact ? ' compact' : ''}`}>
      {groups.map((g) => (
        <button key={g.id} className="parlement-lg" title={g.name} onClick={() => nav.open({ kind: 'group', chamber: g.chamber, id: g.id })}>
          <GroupChip short={g.shortName} color={g.color} />
          <span className="parlement-stack">
            <span className="parlement-lgbar" style={{ width: `${(g.members / max) * 100}%`, background: g.color }} />
            {!compact && <span className="small dim parlement-ell">{g.name}</span>}
          </span>
          <span className="hi parlement-num">{g.members}</span>
        </button>
      ))}
    </div>
  )
}

export const groupFill: Fill = (_member, group) => group

/** The fill of a reading from its data: the groups' colours, the votes, the presence, a share of agreement. */
export function readingFill(
  data: HemicycleData,
  reading: Reading,
  values: { votes?: VoteMap; presence?: Record<string, DayPresence>; shares?: Record<string, number> }
): Fill {
  const colors = new Map(data.groups.map((g) => [g.id, g.color]))
  switch (reading) {
    case 'vote':
      return (m) => (values.votes?.[m] ? VOTE_COLORS[values.votes[m].toLowerCase()] : null)
    case 'presence':
      return (m) => {
        const p = values.presence?.[m]
        if (!p || !p.voted) return null
        return p.voted > p.proxy ? 'var(--fg)' : 'var(--cyan)'
      }
    case 'deputy':
    case 'lens':
      return (m) => (values.shares && m in values.shares ? shade(values.shares[m]) : null)
    default:
      return (_m, g) => colors.get(g) ?? 'var(--dim)'
  }
}

const READINGS: Array<{ id: Reading; label: string; chambers: Chamber[] }> = [
  { id: 'groups', label: 'groupes', chambers: ['an', 'se'] },
  { id: 'vote', label: 'un scrutin', chambers: ['an', 'se'] },
  { id: 'presence', label: 'présence du jour', chambers: ['an'] },
  { id: 'deputy', label: 'proche de mon député', chambers: ['an'] },
  { id: 'lens', label: 'proche de mes idées', chambers: ['an', 'se'] }
]

/** The Hémicycle tab: a chamber's hemicycle (or both) in the reading the user chooses. */
export function HemicycleTab() {
  return (
    <NeedsData>
      <Hemicycles />
    </NeedsData>
  )
}

function Hemicycles() {
  const nav = useNav()
  const { prefs, setPrefs, mine } = useStore()
  const lens = useLens()
  const [reading, setReading] = useState<Reading>('groups')
  const [ballot, setBallot] = useState<{ chamber: Chamber; id: string } | null>(null)
  const chambers: Chamber[] = nav.chambers === 'both' ? ['an', 'se'] : [nav.chambers]
  const deputy = mine?.exact ? mine.deputies[0] : undefined
  const readings = READINGS.filter((r) => (r.id !== 'lens' || lens.on) && (r.id !== 'deputy' || deputy))
  const current = readings.some((r) => r.id === reading) ? reading : 'groups'
  const recent = useMethod('ballots', current === 'vote' ? [{ limit: 40, ...(nav.chambers === 'both' ? {} : { chamber: nav.chambers }) }] : null)
  const choice = (ballot && nav.shows(ballot.chamber) ? ballot : null) ?? (recent.data?.[0] ? { chamber: recent.data[0].chamber, id: recent.data[0].id } : null)
  return (
    <>
      <div className="parlement-toolbar">
        <span className="small dim">lecture</span>
        <span className="chips">
          {readings.map((r) => (
            <button key={r.id} className={`chip${current === r.id ? ' on' : ''}`} onClick={() => setReading(r.id)}>
              {r.id === 'lens' && <LensIcon />} {r.label}
            </button>
          ))}
        </span>
        <span className="parlement-grow" />
        <span className="parlement-row nowrap">
          <span className="small dim">style</span>
          <span className="parlement-seg">
            <button className={prefs.style === 'dots' ? 'on' : ''} onClick={() => setPrefs({ style: 'dots' })}>
              ● points
            </button>
            <button className={prefs.style === 'mosaic' ? 'on' : ''} onClick={() => setPrefs({ style: 'mosaic' })}>
              ▪ mosaïque
            </button>
          </span>
        </span>
      </div>
      {current === 'vote' && (
        <div className="parlement-toolbar">
          <span className="small dim">scrutin</span>
          <select
            value={choice ? `${choice.chamber}:${choice.id}` : ''}
            onChange={(e) => setBallot({ chamber: e.target.value.slice(0, 2) as Chamber, id: e.target.value.slice(3) })}
          >
            {(recent.data ?? []).map((b: BallotLine) => (
              <option key={b.id} value={`${b.chamber}:${b.id}`}>
                {b.chamber === 'an' ? 'AN' : 'Sénat'} n° {b.number} · {b.date.split('-').reverse().join('/')} · {b.title.slice(0, 110)}
              </option>
            ))}
          </select>
        </div>
      )}
      {['presence', 'deputy', 'lens'].includes(current) && chambers.includes('se') && current !== 'lens' && (
        <div className="box-note small">
          {current === 'presence'
            ? 'Au Sénat, les scrutins publics sont votés par groupe : ils ne disent pas qui était présent. Son hémicycle reste en groupes.'
            : 'Votre député siège à l’Assemblée : au Sénat, l’hémicycle reste en groupes.'}
        </div>
      )}
      <div className="parlement-hemis">
        {chambers.map((c) => (
          <ChamberReading
            key={c}
            chamber={c}
            reading={READINGS.find((r) => r.id === current)!.chambers.includes(c) ? current : 'groups'}
            ballot={choice?.chamber === c ? choice.id : null}
          />
        ))}
      </div>
      <div className="parlement-keyrow">
        <span>
          <i className="ring" />
          vos élus
        </span>
        <span>
          <i className="dring" />
          vos suivis
        </span>
        <span>survol : l’élu · clic : sa fiche</span>
      </div>
    </>
  )
}

/** One chamber in a reading, with its key. */
function ChamberReading({ chamber, reading, ballot }: { chamber: Chamber; reading: Reading; ballot: string | null }) {
  const { mine } = useStore()
  const day = useBallotDay()
  const lens = useLens()
  const data = useMethod('hemicycle', [chamber])
  const deputy = mine?.exact ? mine.deputies[0] : undefined
  const lensGroup = chamber === 'an' ? lens.an : lens.se
  const votes = useMethod('votes', reading === 'vote' && ballot ? [chamber, ballot] : null)
  const presence = useMethod('presence', reading === 'presence' && day ? [day] : null)
  const today = day === parisDay()
  const shares = useMethod(
    'agreement',
    reading === 'deputy' && deputy ? [chamber, { member: deputy.id }, 30] : reading === 'lens' && lensGroup ? [chamber, { group: lensGroup }, 30] : null
  )
  const fill = useMemo(
    () =>
      data.data
        ? readingFill(data.data, reading, { votes: votes.data ?? undefined, presence: presence.data ?? undefined, shares: shares.data ?? undefined })
        : null,
    [data.data, reading, votes.data, presence.data, shares.data]
  )
  if (data.error) return <Failure error={data.error} retry={data.reload} />
  if (!data.data || !fill) return <Loading />
  const counts = (code: string) => Object.values(votes.data ?? {}).filter((v) => v.toLowerCase() === code).length
  const voted = Object.values(presence.data ?? {}).filter((p) => p.voted > 0).length
  const center =
    reading === 'vote' && votes.data
      ? { big: `${counts('p')} – ${counts('c')}`, small: `pour – contre · ${counts('a')} abstentions` }
      : reading === 'presence' && presence.data
        ? { big: String(voted), small: today ? 'ont voté aujourd’hui' : `ont voté le ${shortDay(day!)}` }
        : reading === 'deputy'
          ? { big: '', small: `avec ${deputy?.name ?? 'votre député'} · 30 jours` }
          : reading === 'lens'
            ? { big: '', small: `accord avec ${lensGroup} · 30 jours` }
            : { big: String(data.data.seats.length), small: `${chamber === 'an' ? 'députés' : 'sénateurs'} · majorité absolue ${chamber === 'an' ? 289 : 175}` }
  const detail = (m: string) =>
    reading === 'vote'
      ? votes.data?.[m]
        ? `${{ p: 'pour', c: 'contre', a: 'abstention', n: 'non-votant' }[votes.data[m].toLowerCase()]}${votes.data[m] === votes.data[m].toUpperCase() ? ' · par délégation' : ''}`
        : 'pas de vote'
      : reading === 'presence'
        ? presence.data?.[m]?.voted
          ? `${presence.data[m].voted} votes aujourd’hui${presence.data[m].proxy ? ` · ${presence.data[m].proxy} par délégation` : ''}`
          : 'pas de vote aujourd’hui'
        : reading === 'deputy' || reading === 'lens'
          ? shares.data && m in shares.data
            ? `vote comme ${reading === 'lens' ? `vos idées (${lensGroup})` : 'votre député'} dans ${percent(shares.data[m])} des cas`
            : 'trop peu de votes en commun'
          : ''
  return (
    <div>
      <div className="parlement-h">
        <ChamberCode chamber={chamber} />
        <span className="hi">{chamber === 'an' ? 'Assemblée nationale' : 'Sénat'}</span>
      </div>
      <div className="parlement-hemi-side">
        <HemicycleDrawing
          data={data.data}
          fill={fill}
          detail={detail}
          callout={deputy && chamber === 'an' ? (deputy.female ? 'votre députée' : 'votre député') : undefined}
          center={center}
        />
        <div>
          <ReadingKey reading={reading} chamber={chamber} lensGroup={lensGroup} />
          {reading === 'groups' && <GroupLegend groups={data.data.groups} />}
        </div>
      </div>
    </div>
  )
}

function ReadingKey({ reading, chamber, lensGroup }: { reading: Reading; chamber: Chamber; lensGroup: string | null }) {
  if (reading === 'vote')
    return (
      <div className="parlement-keyrow">
        <span>
          <i style={{ background: 'var(--vert)' }} />
          pour
        </span>
        <span>
          <i style={{ background: 'var(--rouge)' }} />
          contre
        </span>
        <span>
          <i style={{ background: 'var(--jaune)' }} />
          abstention
        </span>
        <span>
          <i className="hollow" />
          pas de vote
        </span>
      </div>
    )
  if (reading === 'presence')
    return (
      <>
        <div className="parlement-keyrow">
          <span>
            <i style={{ background: 'var(--fg)' }} />a voté en personne
          </span>
          <span>
            <i style={{ background: 'var(--cyan)' }} />
            seulement par délégation
          </span>
          <span>
            <i className="hollow" />
            pas de vote aujourd’hui
          </span>
        </div>
        <p className="small dim">
          Pas de vote ne veut pas dire absent : commission, circonscription, mission… Les données ouvertes disent qui a voté, pas qui était là.
        </p>
      </>
    )
  if (reading === 'deputy' || reading === 'lens')
    return (
      <>
        <div className="parlement-keyrow">
          <span>vote rarement {reading === 'lens' ? 'comme vos idées' : 'comme lui'}</span>
          <span className="parlement-ramp" />
          <span>presque toujours</span>
          <span>
            <i className="hollow" />
            trop peu de votes
          </span>
        </div>
        {reading === 'lens' && (
          <p className="small dim">
            Comparé à la position majoritaire du groupe {lensGroup} {chamber === 'se' ? 'au Sénat' : ''}, que vous avez indiqué dans Réglages › Identité. Une
            comparaison, pas un classement : rien n’est trié ni caché.
          </p>
        )}
      </>
    )
  return null
}
