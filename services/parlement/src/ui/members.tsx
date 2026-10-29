import { useState } from 'react'
import { useHost } from '@marianne/sdk/view'
import { clock } from '../time'
import type { Chamber, DayBallots, GroupInfo, MemberCard, MemberProfile, MemberVote } from '../types'
import { Closeness, dayMosaic, useDayVotes, useGroups } from './ballots'
import {
  ChamberCode,
  constituency,
  Face,
  Failure,
  FollowButton,
  GroupChip,
  LensIcon,
  Loading,
  longDay,
  Mosaic,
  percent,
  plural,
  shortDay,
  useBallotDay,
  useDebounced,
  useFollowed,
  useLens,
  useMethod,
  useNav,
  useStore,
  yourTitle
} from './common'
import { NeedsData } from './data'
import { Suggestions, Thumb } from './home'

/** The members of both chambers: the user's own, those they follow, suggestions, a search, the groups; a member's page, a group's. */

export function MembersTab() {
  return (
    <NeedsData>
      <Members />
    </NeedsData>
  )
}

function Members() {
  const host = useHost()
  const nav = useNav()
  const { mine, favorites } = useStore()
  const day = useBallotDay()
  const result = useMethod('day', day ? [day] : null)
  const own = mine ? [...mine.deputies.filter(() => mine.exact || mine.deputies.length < 2), ...mine.senators] : []
  const ownIds = new Set(own.map((m) => m.id))
  const ids = favorites.members.filter((id) => !ownIds.has(id))
  const followed = useMethod('members', ids.length ? [{ ids }] : null)
  const people = [...own, ...(followed.data ?? [])].filter((m) => nav.shows(m.chamber))
  const votes = useDayVotes(result.data, people)
  return (
    <>
      <div className="parlement-blk">
        <div className="parlement-h">
          <span className="label">vos élus</span>
          {mine?.commune && (
            <span className="small dim">
              {mine.commune.name} ({mine.commune.department}) · d’après votre adresse
            </span>
          )}
          <button className="parlement-more link" onClick={() => host.openRoute('settings/identity')}>
            {mine?.commune ? 'modifier mon adresse' : 'renseigner mon adresse'}
          </button>
        </div>
        {!mine ? (
          <Loading />
        ) : !mine.commune ? (
          <p className="small dim">Votre adresse n’est pas renseignée : vos députés et sénateurs se trouvent d’après elle, sur cet ordinateur.</p>
        ) : (
          <>
            <div className="parlement-cards">
              {own
                .filter((m) => nav.shows(m.chamber))
                .map((m) => (
                  <PersonCard key={m.id} member={m} own day={result.data} votes={votes} />
                ))}
            </div>
            {!mine.exact && mine.deputies.length > 1 && (
              <p className="small dim">
                {mine.commune.name} compte {mine.deputies.length} circonscriptions : complétez votre adresse (rue et numéro) pour savoir laquelle est la vôtre.
              </p>
            )}
            <p className="small dim">
              Circonscription exacte : les coordonnées de votre adresse, comparées aux contours officiels, sur votre ordinateur. Sénateurs : ceux de votre
              département.
            </p>
          </>
        )}
      </div>
      <div className="parlement-blk">
        <div className="parlement-h">
          <span className="label">vos suivis ★</span>
          <span className="small dim">privés, dans votre archive</span>
        </div>
        {!ids.length ? (
          <p className="small dim">Personne pour l’instant : ☆ suivre, sur une fiche ou dans « à suivre ? ».</p>
        ) : followed.error ? (
          <Failure error={followed.error} retry={followed.reload} />
        ) : !followed.data ? (
          <Loading />
        ) : (
          <div className="parlement-cards">
            {followed.data
              .filter((m) => nav.shows(m.chamber))
              .map((m) => (
                <PersonCard key={`${m.chamber}:${m.id}`} member={m} day={result.data} votes={votes} />
              ))}
          </div>
        )}
      </div>
      <Suggestions wide />
      <Search />
      <div className={nav.chambers === 'both' ? 'parlement-two' : ''}>
        {(['an', 'se'] as Chamber[])
          .filter((c) => nav.shows(c))
          .map((c) => (
            <GroupList key={c} chamber={c} />
          ))}
      </div>
    </>
  )
}

function PersonCard({
  member: m,
  own,
  day,
  votes
}: {
  member: MemberCard
  own?: boolean
  day: DayBallots | null
  votes: Record<string, Record<string, MemberVote>>
}) {
  const nav = useNav()
  const mosaic = dayMosaic(day, m, votes)
  const open = () => nav.open({ kind: 'member', chamber: m.chamber, id: m.id })
  return (
    <div className={`parlement-person${own ? ' me' : ''}`}>
      <Face member={m} size={44} />
      <span className="parlement-stack">
        <span className="parlement-row">
          <ChamberCode chamber={m.chamber} />
          {own && <span className="small accent">{yourTitle(m)}</span>}
        </span>
        <button className="hi parlement-left" onClick={open}>
          {m.name}
        </button>
        <span className="small">
          <GroupChip short={m.groupShort} color={m.groupColor} name={m.group} small />{' '}
          <span className="dim">
            {m.department}
            {m.constituency ? ` · ${constituency(m.constituency)}` : ''}
          </span>
        </span>
        {mosaic.total > 0 && (
          <span className="parlement-row small">
            <Mosaic votes={mosaic.blocks} />
            <span className="dim">
              {mosaic.voted}/{mosaic.total} {day ? shortDay(day.day) : ''}
            </span>
          </span>
        )}
        <span className="parlement-row parlement-acts">
          <FollowButton id={m.id} />
          <button className="btn small" onClick={open}>
            fiche
          </button>
        </span>
      </span>
    </div>
  )
}

/** One search: a name, a département (its number or name), a group. */
function Search() {
  const nav = useNav()
  const [text, setText] = useState('')
  const search = useDebounced(text.trim())
  const chamber = nav.chambers === 'both' ? undefined : nav.chambers
  const query = /^(\d{1,3}|2[ab])$/i.test(search) ? { department: search, chamber } : { text: search, chamber, limit: 40 }
  const byName = useMethod('members', search.length > 1 ? [query] : null)
  const byGroup = useMethod('members', search.length > 1 && !query.department ? [{ group: search, chamber, limit: 40 }] : null)
  const found = [...new Map([...(byName.data ?? []), ...(byGroup.data ?? [])].map((m): [string, MemberCard] => [`${m.chamber}:${m.id}`, m])).values()]
  return (
    <div className="parlement-blk">
      <div className="parlement-h">
        <span className="label">chercher</span>
      </div>
      <span className="parlement-row">
        <label className="search-field parlement-search">
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M6.8 2a4.8 4.8 0 1 1 0 9.6a4.8 4.8 0 1 1 0-9.6z M10.3 10.3l4 4" />
          </svg>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="un nom, un département, un groupe" />
        </label>
        <span className="small dim">ou cliquez un siège dans l’hémicycle</span>
      </span>
      {search.length > 1 &&
        (byName.error ? (
          <Failure error={byName.error} retry={byName.reload} />
        ) : !byName.data ? (
          <Loading />
        ) : found.length ? (
          <MemberLines members={found} />
        ) : (
          <p className="small dim">Aucun élu en exercice ne correspond.</p>
        ))}
    </div>
  )
}

/** Members as lines: portrait, name, group, where from, follow. */
function MemberLines({ members }: { members: MemberCard[] }) {
  const nav = useNav()
  return (
    <div className="parlement-lines">
      {members.map((m) => (
        <div key={`${m.chamber}:${m.id}`} className="parlement-line parlement-mline">
          <Face member={m} size={22} />
          <button className="parlement-stack parlement-left" onClick={() => nav.open({ kind: 'member', chamber: m.chamber, id: m.id })}>
            <span className="hi parlement-ell">{m.name}</span>
            <span className="small dim parlement-ell">
              {m.department}
              {m.constituency ? ` · ${constituency(m.constituency)}` : ''}
            </span>
          </button>
          <GroupChip short={m.groupShort} color={m.groupColor} name={m.group} small />
          <ChamberCode chamber={m.chamber} />
          <FollowButton id={m.id} />
        </div>
      ))}
    </div>
  )
}

function GroupList({ chamber }: { chamber: Chamber }) {
  const nav = useNav()
  const groups = useMethod('groups', [chamber])
  const total = (groups.data ?? []).reduce((s, g) => s + g.members, 0)
  return (
    <div>
      <div className="parlement-h">
        <ChamberCode chamber={chamber} />
        <span className="label">
          les groupes · {total} {chamber === 'an' ? 'députés' : 'sénateurs'}
        </span>
      </div>
      {groups.error ? (
        <Failure error={groups.error} retry={groups.reload} />
      ) : !groups.data ? (
        <Loading />
      ) : (
        <div className="parlement-lines">
          {groups.data.map((g) => (
            <div key={g.id} className="parlement-line parlement-gline">
              <button className="parlement-row parlement-left" onClick={() => nav.open({ kind: 'group', chamber, id: g.id })}>
                <GroupChip short={g.shortName} color={g.color} />
              </button>
              <button className="small dim parlement-ell parlement-left" onClick={() => nav.open({ kind: 'group', chamber, id: g.id })}>
                {g.name}
              </button>
              <span className="small hi parlement-num">{g.members}</span>
              <FollowButton id={g.id} kind="groups" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- a member's page

export function MemberPane({ chamber, id }: { chamber: Chamber; id: string }) {
  return (
    <NeedsData>
      <Member chamber={chamber} id={id} />
    </NeedsData>
  )
}

function Member({ chamber, id }: { chamber: Chamber; id: string }) {
  const host = useHost()
  const nav = useNav()
  const lens = useLens()
  const groups = useGroups()
  const { mine } = useFollowed()
  const profile = useMethod('member', [chamber, id])
  const passages = useMethod('passages', [[id], 30])
  const [contact, setContact] = useState(false)
  if (profile.error) return <Failure error={profile.error} retry={profile.reload} />
  const p = profile.data
  if (!p) return <Loading />
  const own = mine.some((m) => m.id === p.id)
  const a = p.analysis
  const lensGroup = groups.byAcronym(chamber, chamber === 'an' ? lens.an : lens.se)
  const [same, both] = lensGroup ? (a.likeGroup[lensGroup.id] ?? [0, 0]) : [0, 0]
  const spoken = passages.data ?? []
  const title = chamber === 'an' ? (p.female ? 'députée' : 'député') : p.female ? 'sénatrice' : 'sénateur'
  return (
    <>
      <div className="parlement-profile">
        <Face member={p} size={96} />
        <div className="parlement-stack">
          <span className="parlement-row">
            <ChamberCode chamber={chamber} />
            {own && <span className="small accent">{yourTitle(p)}</span>}
          </span>
          <span className="parlement-title parlement-name">{p.name}</span>
          <span>
            <button className="link" onClick={() => p.groupId && nav.open({ kind: 'group', chamber, id: p.groupId })}>
              <GroupChip short={p.groupShort} color={p.groupColor} />
            </button>{' '}
            <span className="dim">{p.group || 'non inscrit'}</span>
          </span>
          <span className="dim">
            {[
              `${title} ${chamber === 'an' ? `de la ${constituency(p.constituency)} · ${p.department} (${p.departmentNumber})` : `de ${p.department}`}`,
              p.profession,
              p.mandateStart ? `en fonction depuis le ${longDay(p.mandateStart).replace(/^\S+ /, '')}` : ''
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className="parlement-row parlement-actions">
            {(p.emails.length > 0 || p.office) && (
              <button className="btn small" onClick={() => setContact(!contact)}>
                {contact ? 'masquer le contact' : 'écrire · sa permanence'}
              </button>
            )}
            {p.hatvp && (
              <button className="btn small" onClick={() => host.openUrl(p.hatvp)}>
                déclaration d’intérêts (HATVP)
              </button>
            )}
            <button className="btn small" onClick={() => host.openUrl(p.url)}>
              page officielle
            </button>
            <button
              className="btn small"
              onClick={() =>
                host.ask(
                  `Que fait ${p.name}, ${title} (${p.department}${p.constituency ? `, ${constituency(p.constituency)}` : ''}) ? Ses fonctions, ses votes récents et ses prises de position. ${p.url}`
                )
              }
            >
              demander à Marianne
            </button>
          </span>
        </div>
        <div>
          <FollowButton id={p.id} />
        </div>
      </div>
      {contact && <Contact profile={p} />}
      <div className={`parlement-tiles n${lensGroup ? 5 : 4}`}>
        <div className="parlement-tile">
          <span className="n">
            {a.ballots ? Math.round((a.voted / a.ballots) * 100) : 0}
            <small> %</small>
          </span>
          <span className="u">
            participation aux scrutins · 30 jours ({a.voted}/{a.ballots})
          </span>
        </div>
        <div className="parlement-tile">
          <span className="n">
            {a.voted ? Math.round((a.loyal / a.voted) * 100) : 0}
            <small> %</small>
          </span>
          <span className="u">vote comme son groupe ({p.groupShort || 'NI'})</span>
        </div>
        {chamber === 'an' ? (
          <div className="parlement-tile">
            <span className="n">
              {a.voted ? Math.round((a.proxies / a.voted) * 100) : 0}
              <small> %</small>
            </span>
            <span className="u">de ses votes par délégation</span>
          </div>
        ) : (
          <div className="parlement-tile">
            <span className="n">{p.roles.length}</span>
            <span className="u">commissions et délégations</span>
          </div>
        )}
        <div className="parlement-tile">
          <span className="n">{passages.data ? spoken.length : '…'}</span>
          <span className="u">prises de parole filmées · 30 jours</span>
        </div>
        {lensGroup && (
          <div className="parlement-tile lens">
            <span className="n">
              {both ? Math.round((same / both) * 100) : '—'}
              <small> %</small>
            </span>
            <span className="u">
              <LensIcon /> vote comme vos idées ({lensGroup.shortName})
            </span>
          </div>
        )}
      </div>
      {chamber === 'se' && (
        <p className="small dim">
          Au Sénat, un groupe vote souvent pour tous ses membres (scrutin public ordinaire) : la participation dit surtout la discipline du groupe.
        </p>
      )}
      <div className="parlement-blk">
        <div className="parlement-h">
          <span className="label">ses votes · 30 jours</span>
          <span className="small dim">un bloc par scrutin, du plus ancien au plus récent</span>
          <button className="parlement-more link" onClick={() => nav.tab('ballots')}>
            tous ses scrutins ›
          </button>
        </div>
        {p.recent.length ? (
          <div className="parlement-narrow">
            <Mosaic big votes={p.recent.map((r) => ({ title: `${shortDay(r.ballot.date)} · n° ${r.ballot.number} · ${r.ballot.title}`, vote: r.vote }))} />
          </div>
        ) : (
          <p className="small dim">Aucun scrutin public ces 30 derniers jours.</p>
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
            abstention
          </span>
          {chamber === 'an' && (
            <span>
              <i className="half" />
              par délégation
            </span>
          )}
          <span>
            <i className="hollow" />
            pas de vote
          </span>
        </div>
      </div>
      <div className="parlement-two">
        <div>
          <div className="parlement-h">
            <span className="label">proximité avec les groupes</span>
          </div>
          <Closeness analysis={a} groups={groups[chamber]} own={p.groupId} lens={lensGroup?.id} />
        </div>
        <div>
          <div className="parlement-h">
            <span className="label">sur les amendements, par couleur</span>
            <span className="small dim">part de « pour »</span>
          </div>
          <ByColour analysis={a} groups={groups[chamber]} />
        </div>
      </div>
      <div className="parlement-blk">
        <div className="parlement-h">
          <span className="label">en vidéo</span>
          <button
            className="parlement-more link"
            onClick={() =>
              nav.searchVideos({ speaker: chamber === 'an' ? `${p.lastName} ${p.firstName}` : `${p.lastName.toUpperCase()} ${p.firstName}`, chamber })
            }
          >
            toutes ses interventions ›
          </button>
        </div>
        {passages.error ? (
          <Failure error={passages.error} retry={passages.reload} />
        ) : !passages.data ? (
          <Loading>ses prises de parole…</Loading>
        ) : spoken.length ? (
          <div className="parlement-lines">
            {spoken.slice(0, 8).map((s) => (
              <button
                key={`${s.video.id}:${s.timecode}`}
                className="parlement-vrow small-thumb"
                onClick={() => nav.open({ kind: 'video', ref: videoRef(s.video), start: s.timecode })}
              >
                <Thumb chamber={s.video.chamber} src={s.video.thumbnail} />
                <span className="parlement-stack">
                  <span className="parlement-vmeta">
                    <ChamberCode chamber={s.video.chamber} />
                    <span>
                      {shortDay(s.video.date.slice(0, 10))} · {s.video.type}
                      {s.video.commission ? ` · ${s.video.commission}` : ''}
                    </span>
                  </span>
                  <span className="hi parlement-ell">{s.video.title}</span>
                  <span className="small parlement-tc">▶ {clock(s.timecode)}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="dim">Aucune intervention filmée ces 30 derniers jours.</p>
        )}
      </div>
      {p.roles.length > 0 && (
        <div className="parlement-blk">
          <div className="parlement-h">
            <span className="label">fonctions</span>
          </div>
          <ul className="parlement-roles">
            {p.roles.map((r, i) => (
              <li key={i}>
                <span className="accent">{r.role}</span> · {r.organ}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

/** A video's reference for the pane: the Sénat's carry their chamber. */
export const videoRef = (v: { chamber: Chamber; id: string }) => (v.chamber === 'se' ? `se:${v.id}` : v.id)

function Contact({ profile: p }: { profile: MemberProfile }) {
  const host = useHost()
  return (
    <div className="rows parlement-facts">
      {p.emails.map((email) => (
        <div key={email} className="row">
          <span className="dim">courriel</span>
          <span>{email}</span>
          <button className="btn small" onClick={() => host.copy(email, 'adresse copiée')}>
            copier
          </button>
        </div>
      ))}
      {p.office && (
        <div className="row">
          <span className="dim">permanence</span>
          <span>{p.office}</span>
          <button className="btn small" onClick={() => host.copy(p.office, 'adresse copiée')}>
            copier
          </button>
        </div>
      )}
      {p.websites.map((site) => (
        <div key={site} className="row">
          <span className="dim">site</span>
          <span>{site}</span>
          <button className="btn small" onClick={() => host.openUrl(/^https?:/.test(site) ? site : `https://${site}`)}>
            ouvrir
          </button>
        </div>
      ))}
    </div>
  )
}

function ByColour({ analysis, groups }: { analysis: MemberProfile['analysis']; groups: GroupInfo[] }) {
  const cols = [
    ...groups.filter((g) => g.shortName !== 'NI').map((g) => ({ id: g.id, short: g.shortName, color: g.color, name: g.name })),
    { id: 'GOUV', short: 'Gouv.', color: '#eef1ff', name: 'Gouvernement' }
  ]
  return (
    <div className="parlement-prox">
      {cols.map((g) => {
        const t = analysis.byAuthor[g.id]
        const share = t && t.n >= 2 ? t.for / t.n : null
        return (
          <div key={g.id} className="parlement-pr">
            <span>
              <GroupChip short={g.short} color={g.color} name={g.name} small />
            </span>
            <span
              className="parlement-track green"
              title={t ? `${t.for} pour · ${t.against} contre · ${t.abstention} abst. sur ${t.n} amendements` : 'aucun vote'}
            >
              <i style={{ width: `${(share ?? 0) * 100}%` }} />
            </span>
            <span className="small">{share === null ? <span className="muted">—</span> : percent(share)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- a group's page

export function GroupPane({ chamber, id }: { chamber: Chamber; id: string }) {
  return (
    <NeedsData>
      <Group chamber={chamber} id={id} />
    </NeedsData>
  )
}

function Group({ chamber, id }: { chamber: Chamber; id: string }) {
  const groups = useGroups()
  const members = useMethod('members', [{ chamber, group: id }])
  const g = groups[chamber].find((x) => x.id === id)
  return (
    <>
      <div className="parlement-row">
        <ChamberCode chamber={chamber} />
        {g && <GroupChip short={g.shortName} color={g.color} />}
        <span className="parlement-title parlement-name">{g?.name ?? id}</span>
        <span className="parlement-grow" />
        <FollowButton id={id} kind="groups" />
      </div>
      {members.error ? (
        <Failure error={members.error} retry={members.reload} />
      ) : !members.data ? (
        <Loading />
      ) : (
        <>
          <p className="dim">{plural(members.data.length, chamber === 'an' ? 'député' : 'sénateur')}</p>
          <MemberLines members={members.data} />
        </>
      )}
    </>
  )
}
