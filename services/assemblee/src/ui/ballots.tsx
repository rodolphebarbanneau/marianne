import { useState } from 'react'
import { Field, formatNumber, useHost } from '@marianne/sdk/view'
import { POSITION_LABELS, type BallotSummary, type Position } from '../types'
import { Failure, GroupMark, Loading, shortDate, useDebounced, useMethod, useNav, useStore } from './common'
import { NeedsData } from './data'

/** The public ballots: a search, with the votes of the deputies the user follows, and a ballot's page. */

const positionText = (position: Position | null | undefined, proxy?: boolean) =>
  // Not in the ballot's lists: not voting, without saying why (a committee may have been sitting).
  position ? `${POSITION_LABELS[position]}${proxy ? ' (délégation)' : ''}` : 'n’a pas pris part'

const positionClass = (position: Position | null | undefined) => (position === 'for' ? 'ok' : position === 'against' ? 'bad' : position ? 'accent' : 'dim')

const resultClass = (result: string) => (/^adopt/i.test(result) ? 'ok' : /^rejet/i.test(result) ? 'bad' : 'dim')

export function BallotLines({ ballots, showPosition }: { ballots: BallotSummary[]; showPosition?: boolean }) {
  const nav = useNav()
  return (
    <div className="assemblee-ballots">
      {ballots.map((b) => (
        <button key={b.id} className="assemblee-ballot" onClick={() => nav.open({ kind: 'ballot', id: b.id })}>
          <span className="small dim">
            {shortDate(b.date)} · n° {b.number}
          </span>
          <span className="assemblee-ballot-title">{b.title}</span>
          <span className={`small ${resultClass(b.result)}`}>{b.result}</span>
          {showPosition && <span className={`small ${positionClass(b.position)}`}>{positionText(b.position, b.proxy)}</span>}
        </button>
      ))}
    </div>
  )
}

export function BallotsTab() {
  return (
    <NeedsData>
      <Ballots />
    </NeedsData>
  )
}

function Ballots() {
  const { followed } = useStore()
  const [text, setText] = useState('')
  const [final, setFinal] = useState(false)
  const [deputy, setDeputy] = useState('')
  const search = useDebounced(text.trim())
  const ballots = useMethod('ballots', [{ text: search, finalOnly: final, ...(deputy ? { deputy } : {}), limit: 60 }])

  return (
    <>
      <div className="assemblee-fields">
        <Field label="sujet" hint="mots du titre : retraites, loi de finances…">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="loi de finances 2027" />
        </Field>
        <Field label="vote de" hint={followed.length ? undefined : 'vos députés et vos favoris apparaissent ici'}>
          <select value={deputy} onChange={(e) => setDeputy(e.target.value)} disabled={!followed.length}>
            <option value="">personne</option>
            {followed.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.groupShort})
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="small">
        <input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} />
        seulement les votes sur l’ensemble d’un texte
      </label>
      {ballots.error ? (
        <Failure error={ballots.error} retry={ballots.reload} />
      ) : !ballots.data ? (
        <Loading>recherche des scrutins…</Loading>
      ) : ballots.data.length ? (
        <BallotLines ballots={ballots.data} showPosition={!!deputy} />
      ) : (
        <p className="dim">Aucun scrutin public trouvé.</p>
      )}
      <p className="small dim assemblee-foot">Seuls les scrutins publics sont nominatifs : beaucoup de votes se font à main levée.</p>
    </>
  )
}

export function BallotPane({ id }: { id: string }) {
  const host = useHost()
  const { followed } = useStore()
  const ballot = useMethod('ballot', [id, followed.map((d) => d.id)])
  if (ballot.loading && !ballot.data) return <Loading />
  if (ballot.error) return <Failure error={ballot.error} retry={ballot.reload} />
  const b = ballot.data
  if (!b) return null
  const counted = b.for + b.against + b.abstentions
  const share = (n: number) => `${counted ? (n / counted) * 100 : 0}%`
  return (
    <>
      <p className="small dim">
        scrutin n° {b.number} · {shortDate(b.date)} · {b.type}
      </p>
      <h3 className="hi assemblee-title">{b.title}</h3>
      {b.billTitle && <p className="dim">{b.billTitle}</p>}
      <p>
        <span className={resultClass(b.result)}>{b.result}</span> · {formatNumber(b.voters)} votants : {formatNumber(b.for)} pour, {formatNumber(b.against)}{' '}
        contre, {formatNumber(b.abstentions)} abstentions
      </p>
      <div className="assemblee-count" title="pour · contre · abstentions">
        <i className="for" style={{ width: share(b.for) }} />
        <i className="against" style={{ width: share(b.against) }} />
        <i className="abstention" style={{ width: share(b.abstentions) }} />
      </div>
      {b.votes.length > 0 && (
        <>
          <span className="label">vos députés et vos favoris</span>
          <div className="rows">
            {b.votes.map((v) => (
              <div key={v.deputy.id} className="row">
                <span className="hi">{v.deputy.name}</span>
                <span className="dim">{v.deputy.groupShort}</span>
                <span className={positionClass(v.position)}>{positionText(v.position, v.proxy)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {b.groups.length > 0 && (
        <>
          <span className="label">les groupes</span>
          <table className="assemblee-table">
            <thead>
              <tr>
                <th>groupe</th>
                <th>position</th>
                <th>pour</th>
                <th>contre</th>
                <th>abst.</th>
                <th>non-votants</th>
              </tr>
            </thead>
            <tbody>
              {b.groups.map((g) => (
                <tr key={g.organId}>
                  <td>
                    <GroupMark color={g.color} /> {g.shortName || g.name}
                  </td>
                  <td className={positionClass(g.position || null)}>{g.position ? POSITION_LABELS[g.position] : ''}</td>
                  <td>{g.for}</td>
                  <td>{g.against}</td>
                  <td>{g.abstentions}</td>
                  <td>{g.nonVoting}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="assemblee-actions">
        <button
          className="btn small"
          onClick={() =>
            host.ask(`Explique-moi le scrutin n° ${b.number} de l’Assemblée nationale (${b.title}) : de quoi s’agissait-il, et qui a voté quoi. ${b.url}`)
          }
        >
          demander à Marianne
        </button>
        <button className="btn small" onClick={() => host.openUrl(b.url)}>
          page officielle
        </button>
      </p>
    </>
  )
}
