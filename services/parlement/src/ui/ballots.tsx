import { useMemo, useState } from 'react'
import { formatNumber, themesOf, THEMES, useHost } from '@marianne/sdk/view'
import { addDays, parisDay } from '../time'
import type { BallotKind, BallotLine, Chamber, DayBallots, GroupInfo, MemberCard, MemberVote, Position } from '../types'
import {
  ChamberCode,
  dayMonth,
  Face,
  Failure,
  GroupChip,
  hour,
  LensChip,
  LensIcon,
  Loading,
  longDay,
  Mosaic,
  percent,
  plural,
  POSITION_SHORT,
  Result,
  shortDate,
  StickyPanel,
  useBallotDay,
  useDebounced,
  useFollowed,
  useLens,
  useMethod,
  useNav,
  useStore,
  Vote,
  VoteBar,
  yourTitle
} from './common'
import { NeedsData } from './data'
import { HemicycleDrawing, readingFill } from './hemicycle'

/**
 * The public ballots of both chambers: the day (its table by bill, a ballot's detail beside it,
 * who took part), how the user's members vote by the colour of the amendments, and a search.
 * Only public ballots record each member's vote; at the Sénat a group often votes for all.
 */

const START_OF_LEGISLATURE = '2024-07-18'

/** How some members voted in a day's ballots, per chamber: member → ballot → vote. */
export function useDayVotes(day: DayBallots | null, members: MemberCard[]): Record<string, Record<string, MemberVote>> {
  const ids = (chamber: Chamber) => {
    const ballots = (day?.bills ?? []).filter((b) => b.chamber === chamber).flatMap((b) => b.ballots.map((l) => l.id))
    const who = members.filter((m) => m.chamber === chamber).map((m) => m.id)
    return ballots.length && who.length ? ([chamber, ballots, who] as [Chamber, string[], string[]]) : null
  }
  const an = useMethod('positions', ids('an'))
  const se = useMethod('positions', ids('se'))
  return useMemo(() => ({ ...an.data, ...se.data }), [an.data, se.data])
}

/** A member's votes in a day's ballots of their chamber, as a mosaic's blocks, and how many they cast. */
export function dayMosaic(day: DayBallots | null, member: MemberCard, votes: Record<string, Record<string, MemberVote>>) {
  const lines = (day?.bills ?? []).filter((b) => b.chamber === member.chamber).flatMap((b) => b.ballots)
  const theirs = votes[member.id] ?? {}
  const cast = lines.filter((l) => theirs[l.id]?.position && theirs[l.id].position !== 'nonVoting')
  return {
    blocks: lines.map((l) => ({ title: `n° ${l.number} · ${l.title}`, vote: theirs[l.id] })),
    total: lines.length,
    voted: cast.length,
    proxy: cast.filter((l) => theirs[l.id].proxy).length
  }
}

/** The groups of each chamber, by id and by acronym. */
export function useGroups(): { an: GroupInfo[]; se: GroupInfo[]; byAcronym(chamber: Chamber, acronym: string | null): GroupInfo | undefined } {
  const an = useMethod('groups', ['an'])
  const se = useMethod('groups', ['se'])
  return useMemo(() => {
    const lists = { an: an.data ?? [], se: se.data ?? [] }
    return {
      ...lists,
      byAcronym: (chamber: Chamber, acronym: string | null) =>
        acronym ? lists[chamber].find((g) => g.shortName.toLowerCase() === acronym.toLowerCase()) : undefined
    }
  }, [an.data, se.data])
}

/** What a ballot is about, in a few words: its amendment, its article, the whole text. */
export function ballotMeta(line: BallotLine): string {
  if (line.kind === 'amendment')
    return `amendement ${line.amendment || ''}${line.author && line.author.id !== line.author.groupId ? ` · ${line.author.name}` : ''}`.trim()
  if (line.kind === 'text') return 'vote sur l’ensemble du texte'
  if (line.kind === 'article') return 'vote sur un article'
  if (line.kind === 'motion') return 'motion'
  return 'scrutin public'
}

/** The themes a ballot is about, among those the user let the service read. */
function useThemes() {
  const { mine } = useStore()
  const themes = mine?.themes ?? []
  return (title: string) => (themes.length ? themesOf(title, themes).map((id) => THEMES.find((t) => t.id === id)!.label) : [])
}

/** A ballot in the day's table: two lines, always (time and number, title and what it is, the bar and its counts, the votes). */
export function BallotRow({
  line,
  selected,
  onSelect,
  mineVote,
  lensPosition
}: {
  line: BallotLine
  selected: boolean
  onSelect: () => void
  mineVote?: MemberVote | null
  lensPosition?: Position | null
}) {
  const lens = useLens()
  const themes = useThemes()(line.title)
  return (
    <button className={`parlement-bt-row${selected ? ' sel' : ''}`} onClick={onSelect} title={line.title}>
      <span className="parlement-stack parlement-bt-time">
        <span className="small">{line.sittingStart ? hour(line.sittingStart) : dayMonth(line.date)}</span>
        <span className="small muted">n° {line.number}</span>
      </span>
      <span className="parlement-bt-author">
        {line.author ? (
          <GroupChip short={line.author.groupShort} color={line.author.groupColor} name={line.author.name} small />
        ) : (
          <span className="small muted">—</span>
        )}
      </span>
      <span className="parlement-stack parlement-bt-obj">
        <span className="parlement-ell parlement-bt-title">{line.title.replace(/^sur /, '')}</span>
        <span className="small dim parlement-ell">
          {ballotMeta(line)}
          {themes.length > 0 && <span className="parlement-theme"> ◆ {themes.join(', ')}</span>}
        </span>
      </span>
      <span className="parlement-stack parlement-bt-votes">
        <VoteBar line={line} />
        <span className="small muted">
          {line.for} · {line.against} · {line.abstentions}
        </span>
      </span>
      <span className="parlement-bt-res">
        <Result line={line} />
      </span>
      <span className="parlement-stack small parlement-bt-mine">
        {mineVote === undefined ? <span className="muted">{line.chamber === 'se' ? 'groupe' : ''}</span> : <Vote vote={mineVote} />}
        {lens.on &&
          (lensPosition ? (
            <span className={`parlement-pos ${lensPosition}`}>
              <LensIcon /> {POSITION_SHORT[lensPosition]}
            </span>
          ) : (
            <span className="muted">
              <LensIcon /> —
            </span>
          ))}
      </span>
    </button>
  )
}

/** The day's ballots, by bill, as a table; a click selects one. */
export function BallotTable({
  day,
  selected,
  onSelect,
  limit
}: {
  day: DayBallots
  selected?: string
  onSelect: (line: BallotLine) => void
  /** Ballots shown per bill (the home screen shows a few). */
  limit?: number
}) {
  const nav = useNav()
  const lens = useLens()
  const groups = useGroups()
  const { mine } = useStore()
  const deputy = mine?.exact ? mine.deputies[0] : undefined
  const anIds = day.bills.filter((b) => b.chamber === 'an').flatMap((b) => b.ballots.map((l) => l.id))
  const votes = useMethod('positions', deputy && anIds.length ? ['an', anIds, [deputy.id]] : null)
  const bills = day.bills.filter((b) => nav.shows(b.chamber))
  return (
    <div className="parlement-btable">
      <div className="parlement-bt-row parlement-bt-head">
        <span>heure</span>
        <span>auteur</span>
        <span>objet</span>
        <span>votes</span>
        <span>résultat</span>
        <span>
          {deputy ? deputy.lastName : ''}
          {lens.on && (
            <>
              {' · '}
              <LensIcon />
            </>
          )}
        </span>
      </div>
      {bills.map((bill) => {
        const lensGroup = groups.byAcronym(bill.chamber, bill.chamber === 'an' ? lens.an : lens.se)
        const shown = limit ? bill.ballots.slice(0, limit) : bill.ballots
        return (
          <div key={`${bill.chamber}:${bill.bill}:${bill.title}`}>
            <div className="parlement-bt-group">
              <ChamberCode chamber={bill.chamber} />
              <span className="hi parlement-ell parlement-grow">{bill.title}</span>
              <span className="small dim">
                {plural(bill.ballots.length, 'scrutin')} · {plural(bill.ballots.filter((l) => l.adopted).length, 'adopté')}
              </span>
            </div>
            {shown.map((line) => (
              <BallotRow
                key={line.id}
                line={line}
                selected={line.id === selected}
                onSelect={() => onSelect(line)}
                mineVote={bill.chamber === 'an' && deputy ? (votes.data?.[deputy.id]?.[line.id] ?? { position: null, proxy: false }) : undefined}
                lensPosition={lensGroup ? (line.majorities?.[lensGroup.id] ?? null) : undefined}
              />
            ))}
            {limit && bill.ballots.length > limit && (
              <button className="link small parlement-more-line" onClick={() => nav.tab('ballots')}>
                + {bill.ballots.length - limit} autres scrutins de la journée
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * A ballot, detailed: its map, its groups, the user's members, those who voted otherwise than their
 * group, and the way to see it in its hemicycle; `inHemicycle`: beside that hemicycle, without its map.
 */
export function BallotCard({ chamber, id, inHemicycle }: { chamber: Chamber; id: string; inHemicycle?: boolean }) {
  const host = useHost()
  const nav = useNav()
  const lens = useLens()
  const groups = useGroups()
  const store = useStore()
  const { ids } = useFollowed()
  const detail = useMethod('ballot', [chamber, id, ids])
  const map = useMethod('votes', [chamber, id])
  const data = useMethod('hemicycle', [chamber])
  if (detail.error) return <Failure error={detail.error} retry={detail.reload} />
  const b = detail.data
  if (!b) return <Loading />
  const lensGroup = groups.byAcronym(chamber, chamber === 'an' ? lens.an : lens.se)
  const lensPosition = lensGroup ? (b.groups.find((g) => g.groupId === lensGroup.id)?.position ?? null) : null
  // The comparison names the user's deputy only (they have several senators).
  const own = chamber === 'an' && store.mine?.exact ? store.mine.deputies[0] : undefined
  const mine = own ? b.votes.find((v) => v.member.id === own.id) : undefined
  const fill = data.data && map.data ? readingFill(data.data, 'vote', { votes: map.data }) : null
  return (
    <div className="parlement-card parlement-bt-card">
      <span className="parlement-row nowrap small">
        <ChamberCode chamber={chamber} />
        <span className="dim parlement-ell">
          scrutin n° {b.number} · {b.sittingStart ? `${shortDate(b.date)} · ${hour(b.sittingStart)}` : shortDate(b.date)}
        </span>
        <span className="parlement-grow" />
        <Result line={b} />
      </span>
      <span className="hi parlement-bt-heading">{b.title.replace(/^sur /, '')}</span>
      <span className="small">
        {b.author ? (
          <>
            <span className="dim">{b.kind === 'amendment' ? `amendement ${b.amendment} de` : 'de'}</span>{' '}
            {b.author.id === b.author.groupId ? (
              b.author.name
            ) : (
              <button className="link" onClick={() => nav.open({ kind: 'member', chamber, id: b.author!.id })}>
                {b.author.name}
              </button>
            )}{' '}
            <GroupChip short={b.author.groupShort} color={b.author.groupColor} small />
          </>
        ) : (
          <span className="dim">{ballotMeta(b)}</span>
        )}
      </span>
      {lensGroup && (
        <span className="parlement-row small">
          <LensChip group={lensGroup.shortName} />
          <span>
            {lensGroup.shortName} a voté {lensPosition ? <span className={`parlement-pos ${lensPosition}`}>{POSITION_SHORT[lensPosition]}</span> : '—'}
          </span>
          {mine?.vote.position && lensPosition && (
            <span className={mine.vote.position === lensPosition ? 'ok' : 'accent'}>
              · {yourTitle(mine.member)} {mine.vote.position === lensPosition ? 'aussi' : `a voté ${POSITION_SHORT[mine.vote.position]}`}
            </span>
          )}
        </span>
      )}
      {inHemicycle ? null : data.data && fill ? (
        <div className="parlement-bt-hemi">
          <HemicycleDrawing
            data={data.data}
            fill={fill}
            compact
            center={{
              big: `${b.for} – ${b.against}`,
              small: `pour – contre · ${formatNumber(b.voters)} votants`,
              color: b.adopted ? 'var(--vert)' : 'var(--rouge)'
            }}
          />
        </div>
      ) : (
        <Loading />
      )}
      <div className="parlement-keyrow dots">
        <span>
          <i style={{ background: 'var(--vert)' }} />
          pour {b.for}
        </span>
        <span>
          <i style={{ background: 'var(--rouge)' }} />
          contre {b.against}
        </span>
        <span>
          <i style={{ background: 'var(--jaune)' }} />
          abst. {b.abstentions}
        </span>
        {chamber === 'an' && <span>⇄ {b.proxies} par délégation</span>}
        {!inHemicycle && (
          <button className="link parlement-more" onClick={() => nav.open({ kind: 'vote', chamber, id })} title="chaque siège, et ce scrutin à côté">
            ⤢ voir dans l’hémicycle
          </button>
        )}
      </div>
      {b.votes.length > 0 && (
        <>
          <div className="parlement-sec">
            <span className="label">vos élus</span>
          </div>
          {b.votes.map((v) => (
            <div key={v.member.id} className="parlement-bt-elu">
              <Face member={v.member} size={16} />
              <button className="hi parlement-ell" onClick={() => nav.open({ kind: 'member', chamber, id: v.member.id })}>
                {v.member.name}
              </button>
              <Vote vote={v.vote} />
              <span
                className="small dim"
                title={
                  v.vote.position && v.groupPosition && v.vote.position !== v.groupPosition ? 'a voté autrement que son groupe' : 'la position de son groupe'
                }
              >
                {v.member.groupShort} {v.groupPosition ? POSITION_SHORT[v.groupPosition] : '—'}
                {v.vote.position && v.groupPosition && v.vote.position !== v.groupPosition && <span className="accent"> ≠</span>}
              </span>
            </div>
          ))}
        </>
      )}
      <div className="parlement-sec">
        <span className="label">les groupes</span>
      </div>
      <div className="parlement-gbars">
        {b.groups.map((g) => {
          const voted = g.for + g.against + g.abstentions
          const w = (n: number) => `${(n / Math.max(1, g.members)) * 100}%`
          return (
            <div key={g.groupId} className={`parlement-gb${lensGroup?.id === g.groupId ? ' lens' : ''}`}>
              <GroupChip short={g.shortName} color={g.color} name={g.name} small />
              <span className="parlement-track" title={`${g.for} pour · ${g.against} contre · ${g.abstentions} abst. · ${g.members - voted} sans vote`}>
                {g.for > 0 && <i style={{ width: w(g.for), background: 'var(--vert)' }} />}
                {g.against > 0 && <i style={{ width: w(g.against), background: 'var(--rouge)' }} />}
                {g.abstentions > 0 && <i style={{ width: w(g.abstentions), background: 'var(--jaune)' }} />}
              </span>
              <span className="small">
                {g.position ? <span className={`parlement-pos ${g.position}`}>{POSITION_SHORT[g.position]}</span> : <span className="muted">—</span>}{' '}
                <span className="dim">
                  {voted}/{g.members}
                </span>
              </span>
            </div>
          )
        })}
      </div>
      {b.dissidentCount > 0 && (
        <span className="small">
          <span className="accent">{plural(b.dissidentCount, 'voix dissidente', 'voix dissidentes')}</span>{' '}
          <span className="dim">
            :{' '}
            {b.dissidents
              .slice(0, 3)
              .map((d) => `${d.member.name} (${d.member.groupShort}, ${POSITION_SHORT[d.position]})`)
              .join(', ')}
            {b.dissidentCount > 3 ? '…' : ''}
          </span>
        </span>
      )}
      <span className="parlement-row parlement-actions">
        {b.sitting && (
          <button className="btn small" onClick={() => nav.open({ kind: 'meeting', id: b.sitting })}>
            ▶ la séance en vidéo
          </button>
        )}
        <button
          className="btn small"
          onClick={() =>
            host.ask(
              `Explique-moi le scrutin n° ${b.number} ${chamber === 'an' ? 'de l’Assemblée nationale' : 'du Sénat'} (${b.title}) : de quoi s’agissait-il, et qui a voté quoi. ${b.url}`
            )
          }
        >
          demander à Marianne
        </button>
        <button className="btn small" onClick={() => host.openUrl(b.url)}>
          page officielle
        </button>
      </span>
    </div>
  )
}

export function BallotPane({ chamber, id }: { chamber: Chamber; id: string }) {
  return (
    <NeedsData>
      <BallotCard chamber={chamber} id={id} />
    </NeedsData>
  )
}

type Sub = 'day' | 'analysis' | 'search'

/** The Scrutins tab. */
export function BallotsTab() {
  return (
    <NeedsData>
      <Ballots />
    </NeedsData>
  )
}

function Ballots() {
  const [sub, setSub] = useState<Sub>('day')
  const last = useBallotDay()
  const [picked, setPicked] = useState<string | null>(null)
  const day = picked ?? last
  if (!day) return <Loading />
  const setDay = (d: string) => setPicked(d)
  return (
    <>
      <div className="parlement-toolbar">
        <span className="chips">
          {(
            [
              ['day', 'le jour'],
              ['analysis', 'analyse par couleur'],
              ['search', 'tous les scrutins']
            ] as Array<[Sub, string]>
          ).map(([id, label]) => (
            <button key={id} className={`chip${sub === id ? ' on' : ''}`} onClick={() => setSub(id)}>
              {label}
            </button>
          ))}
        </span>
        <span className="parlement-grow" />
        {sub === 'day' && (
          <span className="parlement-row">
            <button className="btn small" onClick={() => setDay(addDays(day, -1))}>
              ‹ veille
            </button>
            <span className="hi">{longDay(day)}</span>
            <button className="btn small" disabled={day >= parisDay()} onClick={() => setDay(addDays(day, 1))}>
              lendemain ›
            </button>
          </span>
        )}
      </div>
      {sub === 'day' ? <DayBallotsView day={day} /> : sub === 'analysis' ? <AnalysisView /> : <SearchView />}
    </>
  )
}

function DayBallotsView({ day }: { day: string }) {
  const nav = useNav()
  const result = useMethod('day', [day])
  const [selected, setSelected] = useState<BallotLine | null>(null)
  if (result.error) return <Failure error={result.error} retry={result.reload} />
  const data = result.data
  if (!data) return <Loading>les scrutins du jour…</Loading>
  const lines = data.bills.filter((b) => nav.shows(b.chamber)).flatMap((b) => b.ballots)
  if (!lines.length)
    return (
      <p className="dim">Aucun scrutin public ce jour-là{nav.chambers === 'both' ? ' dans les deux chambres' : ''}. Beaucoup de votes se font à main levée.</p>
    )
  const current = selected && lines.some((l) => l.id === selected.id) ? selected : lines[0]
  return (
    <>
      <DayTiles data={data} />
      <div className={`parlement-bt-wrap${nav.wide ? '' : ' alone'}`}>
        <BallotTable
          day={data}
          selected={nav.wide ? current.id : undefined}
          onSelect={(line) => (nav.wide ? setSelected(line) : nav.open({ kind: 'ballot', chamber: line.chamber, id: line.id }))}
        />
        {nav.wide && (
          <StickyPanel className="parlement-bt-detail">
            <BallotCard key={current.id} chamber={current.chamber} id={current.id} />
          </StickyPanel>
        )}
      </div>
      {nav.shows('an') && data.bills.some((b) => b.chamber === 'an') && <PresenceBlock day={day} data={data} />}
    </>
  )
}

/** The day in figures. */
export function DayTiles({ data, compact }: { data: DayBallots; compact?: boolean }) {
  const nav = useNav()
  const { mine } = useStore()
  const lines = data.bills.filter((b) => nav.shows(b.chamber)).flatMap((b) => b.ballots)
  const an = lines.filter((l) => l.chamber === 'an')
  const adopted = lines.filter((l) => l.adopted).length
  const deputy = mine?.exact ? mine.deputies[0] : undefined
  const votes = useMethod('positions', compact && deputy && an.length ? ['an', an.map((l) => l.id), [deputy.id]] : null)
  const mineVotes = deputy ? Object.values(votes.data?.[deputy.id] ?? {}).filter((v) => v.position && v.position !== 'nonVoting') : []
  return (
    <div className={`parlement-tiles n${compact ? 4 : 5}`}>
      <div className="parlement-tile">
        <span className="n">{lines.length}</span>
        <span className="u">
          {lines.length > 1 ? 'scrutins publics' : 'scrutin public'}
          {nav.chambers === 'both' ? ` · AN ${an.length} · Sénat ${lines.length - an.length}` : ''}
        </span>
      </div>
      <div className="parlement-tile">
        <span className="n">
          {adopted}
          <small> / {lines.length - adopted}</small>
        </span>
        <span className="u">adoptés / rejetés</span>
      </div>
      {!compact && (
        <div className="parlement-tile">
          <span className="n">{lines.filter((l) => l.kind === 'amendment').length}</span>
          <span className="u">amendements · {lines.filter((l) => l.kind !== 'amendment').length} articles ou textes</span>
        </div>
      )}
      {an.length > 0 && (
        <div className="parlement-tile">
          <span className="n">
            {data.averageVoters}
            <small> / 577</small>
          </span>
          <span className="u">votants par scrutin à l’Assemblée · {data.proxies} délégations</span>
        </div>
      )}
      {compact && deputy && an.length > 0 && (
        <div className="parlement-tile mine">
          <span className="n">
            {mineVotes.length}
            <small> / {an.length}</small>
          </span>
          <span className="u">
            votes de {yourTitle(deputy)} · {mineVotes.filter((v) => v.proxy).length} par délégation
          </span>
        </div>
      )}
      {!compact && an.length > 0 && (
        <div className="parlement-tile">
          <span className="n">{an.length ? Math.round((data.averageVoters / 577) * 100) : 0} %</span>
          <span className="u">des députés votent, en moyenne</span>
        </div>
      )}
    </div>
  )
}

/** Who took part in the day's ballots at the Assemblée: the hemicycle, and the user's members one by one. */
function PresenceBlock({ day, data }: { day: string; data: DayBallots }) {
  const nav = useNav()
  const { ids } = useFollowed()
  const { mine } = useStore()
  const presence = useMethod('presence', [day])
  const hemi = useMethod('hemicycle', ['an'])
  const lines = data.bills.filter((b) => b.chamber === 'an').flatMap((b) => b.ballots)
  const members = useMethod('members', ids.length ? [{ chamber: 'an', ids }] : null)
  const votes = useMethod('positions', ids.length && lines.length ? ['an', lines.map((l) => l.id), ids] : null)
  const own = new Set((mine?.deputies ?? []).map((d) => d.id))
  return (
    <div className="news parlement-news">
      <div className="parlement-h">
        <span className="parlement-title">présence du jour</span>
        <span className="small dim">Assemblée nationale · {plural(lines.length, 'scrutin public', 'scrutins publics')}</span>
      </div>
      <div className="parlement-presence">
        <div>
          {hemi.data && presence.data ? (
            <HemicycleDrawing
              data={hemi.data}
              fill={readingFill(hemi.data, 'presence', { presence: presence.data })}
              detail={(m) =>
                presence.data?.[m]?.voted
                  ? `${presence.data[m].voted} votes${presence.data[m].proxy ? ` · ${presence.data[m].proxy} par délégation` : ''}`
                  : 'pas de vote aujourd’hui'
              }
              compact
              center={{ big: String(Object.values(presence.data).filter((p) => p.voted > 0).length), small: 'ont voté aujourd’hui' }}
            />
          ) : (
            <Loading />
          )}
          <div className="parlement-keyrow dots">
            <span>
              <i style={{ background: 'var(--fg)' }} />a voté en personne
            </span>
            <span>
              <i style={{ background: 'var(--cyan)' }} />
              seulement par délégation
            </span>
            <span>
              <i className="hollow" />
              pas de vote
            </span>
          </div>
          <p className="small dim">
            Pas de vote ne veut pas dire absent : commission, circonscription, mission… Les données ouvertes disent qui a voté, pas qui était là.
          </p>
        </div>
        <div>
          {(members.data ?? []).length > 0 ? (
            <div className="parlement-lines">
              <div className="parlement-line parlement-presence-row head">
                <span />
                <span className="small muted">élu</span>
                <span className="small muted">ses {lines.length} votes</span>
                <span className="small muted">votés</span>
                <span className="small muted">commission</span>
              </div>
              {(members.data ?? []).map((m: MemberCard) => {
                const p = presence.data?.[m.id]
                const theirs = votes.data?.[m.id] ?? {}
                return (
                  <button key={m.id} className="parlement-line parlement-presence-row" onClick={() => nav.open({ kind: 'member', chamber: 'an', id: m.id })}>
                    <Face member={m} size={18} />
                    <span className="parlement-stack">
                      <span className="hi">{m.name}</span>
                      <span className="small dim">
                        {m.groupShort}
                        {own.has(m.id) ? ` · ${yourTitle(m)}` : ''}
                      </span>
                    </span>
                    <Mosaic votes={lines.map((l) => ({ title: `n° ${l.number} · ${l.title}`, vote: theirs[l.id] }))} />
                    <span className="small">
                      {p?.voted ?? 0}/{lines.length}
                      {p?.proxy ? <span className="dim"> · {p.proxy}⇄</span> : null}
                    </span>
                    <span className="small">
                      {(p?.committees ?? []).map((c) => (
                        <span key={c.meeting} className="parlement-block">
                          {c.organ.replace(/^Commission (des |de la |de l’|du )?/, '').slice(0, 40)} {hour(c.start)} :{' '}
                          <span className={c.status === 'present' ? 'ok' : c.status === 'excused' ? 'accent' : 'dim'}>
                            {c.status === 'present'
                              ? m.female
                                ? 'présente'
                                : 'présent'
                              : c.status === 'excused'
                                ? m.female
                                  ? 'excusée'
                                  : 'excusé'
                                : 'absent·e'}
                          </span>
                        </span>
                      ))}
                      {!p?.committees.length && <span className="muted">—</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="small dim">Suivez des députés (☆) pour voir ici leurs votes et leurs présences du jour.</p>
          )}
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
              abst.
            </span>
            <span>
              <i className="half" />
              par délégation (un collègue vote pour lui)
            </span>
            <span>
              <i className="hollow" />
              pas de vote
            </span>
          </div>
          <p className="small dim">
            Les présences en commission viennent des comptes rendus (présents, excusés). Les votes à main levée ne laissent pas de trace individuelle.
          </p>
        </div>
      </div>
    </div>
  )
}

const PERIODS: Array<{ id: string; label: string; from: () => string }> = [
  { id: '30', label: '30 jours', from: () => addDays(parisDay(), -30) },
  { id: '90', label: '90 jours', from: () => addDays(parisDay(), -90) },
  { id: 'all', label: 'depuis juillet 2024', from: () => START_OF_LEGISLATURE }
]

/** How the user's members vote, by the colour of the amendments: a group's members and the lens as rows, the authors' groups as columns. */
function AnalysisView() {
  const nav = useNav()
  const lens = useLens()
  const groups = useGroups()
  const { mine, ids } = useFollowed()
  const [period, setPeriod] = useState('30')
  const [picked, setPicked] = useState<Chamber>('an')
  const chamber: Chamber = nav.chambers === 'both' ? picked : nav.chambers
  const from = PERIODS.find((p) => p.id === period)!.from()
  const people = useMethod('members', ids.length ? [{ chamber, ids }] : null)
  const analysis = useMethod('analysis', [chamber, (people.data ?? []).map((m) => m.id), from, parisDay()])
  const cols = [
    ...groups[chamber].filter((g) => g.shortName !== 'NI'),
    { id: 'GOUV', shortName: 'Gouv.', name: 'Gouvernement', color: '#eef1ff' },
    { id: 'COM', shortName: 'Com.', name: 'Commission', color: '#8089c4' }
  ]
  const lensGroup = groups.byAcronym(chamber, chamber === 'an' ? lens.an : lens.se)
  const own = chamber === 'an' ? mine.find((m) => m.chamber === 'an') : undefined
  const ownAnalysis = analysis.data?.members.find((a) => a.member === own?.id)
  const cell = (t: { for: number; n: number } | undefined, label: string, lensRow?: boolean) => {
    if (!t || t.n < 2)
      return (
        <td className="na" title="moins de 2 votes">
          ·
        </td>
      )
    const share = Math.round((t.for / t.n) * 100)
    return (
      <td className={`${share > 62 ? 'ink' : ''}${lensRow ? ' lens' : ''}`} style={{ ['--p' as string]: `${share}%` }} title={label}>
        {share}
      </td>
    )
  }
  return (
    <>
      <div className="parlement-toolbar">
        <span className="parlement-title">comment votent vos élus selon la couleur des amendements</span>
        <span className="parlement-grow" />
        {nav.chambers === 'both' && (
          <span className="parlement-seg">
            {(['an', 'se'] as Chamber[]).map((c) => (
              <button key={c} className={chamber === c ? 'on' : ''} onClick={() => setPicked(c)}>
                {c === 'an' ? 'Assemblée' : 'Sénat'}
              </button>
            ))}
          </span>
        )}
        <span className="chips">
          {PERIODS.map((p) => (
            <button key={p.id} className={`chip${period === p.id ? ' on' : ''}`} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </span>
      </div>
      <p className="dim parlement-narrow">
        Chaque case : la part de <span className="parlement-pos for">pour</span> d’un élu sur les amendements déposés par un groupe (la couleur de l’auteur).
        Plus c’est vert, plus il soutient ce camp. Survol : le détail.{chamber === 'se' && ' Au Sénat, un groupe vote souvent pour tous ses membres.'}
      </p>
      {analysis.error ? (
        <Failure error={analysis.error} retry={analysis.reload} />
      ) : !analysis.data ? (
        <Loading>l’analyse des votes…</Loading>
      ) : (
        <>
          <div className="parlement-matrix-wrap">
            <table className="parlement-matrix">
              <thead>
                <tr>
                  <th className="rowh">amendements de →</th>
                  {cols.map((g) => (
                    <th key={g.id} title={g.name}>
                      <span className="parlement-colh">
                        <i style={{ background: g.color }} />
                        {g.shortName}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lensGroup && (
                  <tr className="lensrow">
                    <th className="rowh">
                      <LensChip group={lensGroup.shortName} />
                    </th>
                    {cols.map((g) =>
                      cell(analysis.data!.groups[lensGroup.id]?.[g.id], `le groupe ${lensGroup.shortName} sur les amendements ${g.shortName}`, true)
                    )}
                  </tr>
                )}
                {analysis.data.members.map((a) => {
                  const m = people.data?.find((p) => p.id === a.member)
                  if (!m) return null
                  return (
                    <tr key={a.member}>
                      <th className="rowh">
                        <button className="parlement-row" onClick={() => nav.open({ kind: 'member', chamber, id: m.id })}>
                          <Face member={m} size={18} />
                          <span>{m.name}</span>
                          <GroupChip short={m.groupShort} color={m.groupColor} small />
                        </button>
                      </th>
                      {cols.map((g) => {
                        const t = a.byAuthor[g.id]
                        return cell(
                          t,
                          `${m.name} sur les amendements ${g.shortName} : ${t ? `${t.for} pour · ${t.against} contre · ${t.abstention} abst. (${t.n} votes)` : 'aucun vote'}`
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!analysis.data.members.length && <p className="small dim">Suivez des élus (☆) pour les comparer ici.</p>}
          <div className="parlement-keyrow">
            <span>0 % pour</span>
            <span className="parlement-ramp green" />
            <span>100 % pour</span>
            <span>
              <i className="hollow" />
              moins de 2 votes
            </span>
            <span>· {formatNumber(analysis.data.ballots)} scrutins sur la période</span>
          </div>
          {own && ownAnalysis && (
            <div className="parlement-two">
              <div>
                <div className="parlement-h">
                  <span className="label">à quel groupe ressemble {yourTitle(own)} ?</span>
                </div>
                <Closeness analysis={ownAnalysis} groups={groups[chamber]} own={own.groupId} lens={lensGroup?.id} />
              </div>
              <div>
                <div className="parlement-h">
                  <span className="label">ce qui ressort</span>
                </div>
                <Highlights member={own} analysis={ownAnalysis} groups={groups[chamber]} lens={lensGroup} />
              </div>
            </div>
          )}
          <p className="small dim">
            L’auteur d’un amendement vient de l’objet du scrutin (le nom du député ou du sénateur, puis son groupe). Des amendements identiques prennent la
            couleur du premier.
          </p>
        </>
      )}
    </>
  )
}

/** Like each group: the share of ballots where a member voted as most of the group did. */
export function Closeness({
  analysis,
  groups,
  own,
  lens
}: {
  analysis: { likeGroup: Record<string, [number, number]> }
  groups: GroupInfo[]
  own: string
  lens?: string
}) {
  return (
    <div className="parlement-prox">
      {groups
        .filter((g) => g.shortName !== 'NI')
        .map((g) => {
          const [same, n] = analysis.likeGroup[g.id] ?? [0, 0]
          const share = n ? same / n : 0
          return (
            <div key={g.id} className="parlement-pr">
              <span>
                <GroupChip short={g.shortName} color={g.color} small />
                {lens === g.id && <LensIcon />}
              </span>
              <span className="parlement-track" title={`vote comme la majorité du groupe ${g.shortName} dans ${percent(share)} des scrutins`}>
                <i style={{ width: `${share * 100}%` }} />
              </span>
              <span className={`small${g.id === own ? ' accent' : ''}`}>{n ? percent(share) : '—'}</span>
            </div>
          )
        })}
    </div>
  )
}

function Highlights({
  member,
  analysis,
  groups,
  lens
}: {
  member: MemberCard
  analysis: {
    voted: number
    ballots: number
    proxies: number
    loyal: number
    likeGroup: Record<string, [number, number]>
    byAuthor: Record<string, { for: number; n: number }>
  }
  groups: GroupInfo[]
  lens?: GroupInfo
}) {
  const share = (id: string) => {
    const [s, n] = analysis.likeGroup[id] ?? [0, 0]
    return n ? s / n : 0
  }
  const others = groups.filter((g) => g.id !== member.groupId && g.shortName !== 'NI').sort((a, b) => share(b.id) - share(a.id))
  const supported = Object.entries(analysis.byAuthor)
    .filter(([, t]) => t.n >= 3)
    .map(([id, t]) => ({ id, share: t.for / t.n }))
    .sort((a, b) => b.share - a.share)
  const name = (id: string) => groups.find((g) => g.id === id)?.shortName ?? (id === 'GOUV' ? 'du Gouvernement' : id === 'COM' ? 'des commissions' : id)
  const lines = [
    `${member.name} vote comme son groupe (${member.groupShort}) dans ${analysis.voted ? percent(analysis.loyal / analysis.voted) : '—'} des cas${others[0] ? ` ; ensuite, c’est avec ${others[0].shortName} qu’${member.female ? 'elle' : 'il'} vote le plus souvent (${percent(share(others[0].id))})` : ''}.`,
    ...(lens ? [`Avec vos idées (${lens.shortName}) : même vote dans ${percent(share(lens.id))} des scrutins.`] : []),
    ...(supported.length >= 2
      ? [
          `Soutient ${percent(supported[0].share)} des amendements ${name(supported[0].id)} et ${percent(supported.at(-1)!.share)} de ceux ${name(supported.at(-1)!.id)}.`
        ]
      : []),
    `A voté dans ${analysis.voted} scrutins sur ${analysis.ballots} (${analysis.ballots ? percent(analysis.voted / analysis.ballots) : '—'})${member.chamber === 'an' ? `, dont ${analysis.voted ? percent(analysis.proxies / analysis.voted) : '—'} par délégation` : ''}.`
  ]
  return (
    <div className="parlement-lines">
      {lines.map((l, i) => (
        <div key={i} className="parlement-line parlement-highlight">
          <span className="accent">{i === 1 && lens ? <LensIcon /> : '▸'}</span>
          <span>{l}</span>
        </div>
      ))}
    </div>
  )
}

const KINDS: Array<{ id: BallotKind | undefined; label: string }> = [
  { id: undefined, label: 'tout' },
  { id: 'text', label: 'textes entiers' },
  { id: 'article', label: 'articles' },
  { id: 'amendment', label: 'amendements' },
  { id: 'motion', label: 'motions' }
]

/** Every ballot, searched: by subject, member, author's group, kind and result. */
function SearchView() {
  const nav = useNav()
  const groups = useGroups()
  const { ids } = useFollowed()
  const people = useMethod('members', ids.length ? [{ ids }] : null)
  const [text, setText] = useState('')
  const [member, setMember] = useState('')
  const [author, setAuthor] = useState('')
  const [kind, setKind] = useState<BallotKind | undefined>()
  const [result, setResult] = useState<'adopted' | 'rejected' | undefined>()
  const [selected, setSelected] = useState<BallotLine | null>(null)
  const search = useDebounced(text.trim())
  const who = people.data?.find((p) => p.id === member)
  const chamber = who?.chamber ?? (nav.chambers === 'both' ? undefined : nav.chambers)
  const ballots = useMethod('ballots', [{ text: search, chamber, member: member || undefined, authorGroup: author || undefined, kind, result, limit: 80 }])
  return (
    <>
      <div className="parlement-fields">
        <label className="field">
          <span>sujet</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="retraites, loi de finances, logement…" />
        </label>
        <label className="field">
          <span>vote de</span>
          <select value={member} onChange={(e) => setMember(e.target.value)} disabled={!people.data?.length}>
            <option value="">personne</option>
            {(people.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.groupShort})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>amendements de</span>
          <select value={author} onChange={(e) => setAuthor(e.target.value)}>
            <option value="">tous les groupes</option>
            {(['an', 'se'] as Chamber[])
              .filter((c) => nav.shows(c))
              .flatMap((c) => groups[c])
              .map((g) => (
                <option key={`${g.chamber}:${g.id}`} value={g.id}>
                  {g.shortName} · {g.chamber === 'an' ? 'Assemblée' : 'Sénat'}
                </option>
              ))}
            <option value="GOUV">Gouvernement</option>
            <option value="COM">une commission</option>
          </select>
        </label>
      </div>
      <div className="parlement-toolbar">
        <span className="chips">
          {KINDS.map((k) => (
            <button key={k.label} className={`chip${kind === k.id ? ' on' : ''}`} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
        </span>
        <span className="chips">
          <button className={`chip${result === 'adopted' ? ' on' : ''}`} onClick={() => setResult(result === 'adopted' ? undefined : 'adopted')}>
            adoptés
          </button>
          <button className={`chip${result === 'rejected' ? ' on' : ''}`} onClick={() => setResult(result === 'rejected' ? undefined : 'rejected')}>
            rejetés
          </button>
        </span>
      </div>
      {ballots.error ? (
        <Failure error={ballots.error} retry={ballots.reload} />
      ) : !ballots.data ? (
        <Loading>recherche des scrutins…</Loading>
      ) : ballots.data.length ? (
        <div className={`parlement-bt-wrap${nav.wide ? '' : ' alone'}`}>
          <div className="parlement-btable">
            {ballots.data.map((line) => (
              <BallotRow
                key={line.id}
                line={line}
                selected={nav.wide && line.id === selected?.id}
                onSelect={() => (nav.wide ? setSelected(line) : nav.open({ kind: 'ballot', chamber: line.chamber, id: line.id }))}
                mineVote={line.vote}
              />
            ))}
          </div>
          {nav.wide && (
            <StickyPanel className="parlement-bt-detail">
              {selected ? (
                <BallotCard key={selected.id} chamber={selected.chamber} id={selected.id} />
              ) : (
                <p className="small dim">Choisissez un scrutin pour le détail.</p>
              )}
            </StickyPanel>
          )}
        </div>
      ) : (
        <p className="dim">Aucun scrutin public trouvé.</p>
      )}
      <p className="small dim parlement-foot">Seuls les scrutins publics sont nominatifs : beaucoup de votes se font à main levée.</p>
    </>
  )
}
