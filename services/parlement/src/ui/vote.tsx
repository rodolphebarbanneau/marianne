import { useState } from 'react'
import type { Chamber } from '../types'
import { BallotCard, BallotRow } from './ballots'
import { ChamberCode, Failure, Loading, plural, Result, shortDate, StickyPanel, useDebounced, useMethod, useNav } from './common'
import { NeedsData } from './data'
import { ChamberReading, SeatsKey } from './hemicycle'

/**
 * A ballot in its hemicycle: every seat's vote, and beside it the ballot's card (its groups, the
 * user's members, those who voted otherwise than their group). The hemicycle tab's "un scrutin"
 * shows it; a ballot's card opens it as a pane. A picker chooses the ballot: the latest ones, or a
 * search by the words of its subject or its number.
 */

export interface BallotRef {
  chamber: Chamber
  id: string
}

export function VoteView({ ballot, onPick }: { ballot: BallotRef | null; onPick: (ballot: BallotRef) => void }) {
  const nav = useNav()
  // None chosen yet: the latest of the chambers shown.
  const latest = useMethod('ballots', ballot ? null : [{ limit: 1, ...(nav.chambers === 'both' ? {} : { chamber: nav.chambers }) }])
  const shown = ballot ?? (latest.data?.[0] ? { chamber: latest.data[0].chamber, id: latest.data[0].id } : null)
  return (
    <>
      <BallotPicker current={shown} onPick={onPick} />
      {shown ? (
        <ChamberReading
          chamber={shown.chamber}
          reading="vote"
          ballot={shown.id}
          aside={
            <StickyPanel className="parlement-bt-detail">
              <BallotCard key={`${shown.chamber}:${shown.id}`} chamber={shown.chamber} id={shown.id} inHemicycle />
            </StickyPanel>
          }
        />
      ) : latest.error ? (
        <Failure error={latest.error} retry={latest.reload} />
      ) : latest.data ? (
        <p className="dim">Aucun scrutin public pour l’instant.</p>
      ) : (
        <Loading />
      )}
    </>
  )
}

/** A ballot opened from its card: its hemicycle, the picker to see another one, "retour" to where it was opened. */
export function VotePane({ chamber, id }: BallotRef) {
  const [ballot, setBallot] = useState<BallotRef>({ chamber, id })
  return (
    <NeedsData>
      <VoteView ballot={ballot} onPick={setBallot} />
      <SeatsKey />
    </NeedsData>
  )
}

/** The ballot shown, and the way to choose another: the latest ones, or those whose subject has some words, or a number. */
function BallotPicker({ current, onPick }: { current: BallotRef | null; onPick: (ballot: BallotRef) => void }) {
  const nav = useNav()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const search = useDebounced(text.trim())
  const number = search.match(/^(?:n[°o]?\s*)?(\d{1,5})$/i)?.[1]
  const chamber = nav.chambers === 'both' ? undefined : nav.chambers
  const found = useMethod(
    'ballots',
    open ? [{ ...(number ? { number: Number(number) } : search ? { text: search } : {}), ...(chamber ? { chamber } : {}), limit: 10 }] : null
  )
  const shown = useMethod('ballot', current ? [current.chamber, current.id, []] : null)
  const b = shown.data
  const pick = (ballot: BallotRef) => {
    onPick(ballot)
    setOpen(false)
  }
  return (
    <div className={`parlement-picker${open ? ' open' : ''}`}>
      <div className="parlement-picker-head">
        <span className="small dim">scrutin</span>
        {b ? (
          <>
            <ChamberCode chamber={b.chamber} />
            <span className="small dim parlement-nowrap">
              n° {b.number} · {shortDate(b.date)}
            </span>
            <span className="hi parlement-ell parlement-grow" title={b.title}>
              {b.title.replace(/^sur /, '')}
            </span>
            <Result line={b} />
          </>
        ) : (
          <span className="parlement-grow dim">{current ? 'chargement…' : 'aucun scrutin choisi'}</span>
        )}
        <button className={`btn small${open ? ' on' : ''}`} onClick={() => setOpen(!open)}>
          {open ? 'fermer' : 'changer de scrutin'}
        </button>
      </div>
      {open && (
        <div className="parlement-picker-body">
          <span className="parlement-row">
            <label className="search-field parlement-search">
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="M6.8 2a4.8 4.8 0 1 1 0 9.6a4.8 4.8 0 1 1 0-9.6z M10.3 10.3l4 4" />
              </svg>
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
                placeholder="des mots du sujet, ou son numéro"
              />
            </label>
            <span className="small dim">
              {!search
                ? `les derniers scrutins publics${chamber ? (chamber === 'an' ? ' de l’Assemblée' : ' du Sénat') : ''}`
                : found.data
                  ? plural(found.data.length, 'scrutin trouvé', 'scrutins trouvés') + (found.data.length === 10 ? ' (les plus récents)' : '')
                  : ''}
            </span>
          </span>
          {found.error ? (
            <Failure error={found.error} retry={found.reload} />
          ) : !found.data ? (
            <Loading />
          ) : found.data.length ? (
            <div className="parlement-btable">
              {found.data.map((line) => (
                <BallotRow
                  key={`${line.chamber}:${line.id}`}
                  line={line}
                  selected={line.chamber === current?.chamber && line.id === current?.id}
                  onSelect={() => pick({ chamber: line.chamber, id: line.id })}
                />
              ))}
            </div>
          ) : (
            <p className="small dim">Aucun scrutin public ne correspond{number ? ` au numéro ${number}` : ''}.</p>
          )}
        </div>
      )}
    </div>
  )
}
