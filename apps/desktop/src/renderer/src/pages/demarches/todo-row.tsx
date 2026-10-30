import { DOMAINS } from '@marianne/profile'
import type { DomainId } from '@shared/types'
import type { TodoItem } from '../../lib/demarches'

/** Pieces the Démarches pages share: a domain's block, where something comes from, a row of « à faire ». */

/** A domain's two letters, « ·· » for what no domain holds. */
export function DomainBadge({ domain }: { domain: DomainId | '' }) {
  return <span className="dm-badge">{DOMAINS.find((d) => d.id === domain)?.badge ?? '··'}</span>
}

/** Where something comes from: a service keeps its 3615, inverted as on the kiosk. */
export function SourceChip({ text }: { text: string }) {
  const service = text.startsWith('3615 ') ? text.slice(5) : ''
  return (
    <span className="dm-src">
      {service ? (
        <>
          <span className="inv">3615</span>
          {service}
        </>
      ) : (
        text
      )}
    </span>
  )
}

/**
 * A row of « à faire »: when, block, title and detail, where it comes from, one action. `first`: the
 * one to do first, lit, its action the primary one. `here`: on a domain's own page, where the block
 * would repeat on every row: it goes, and the source moves into the detail line.
 */
export function TodoRow({ item, first, here, onOpen }: { item: TodoItem; first?: boolean; here?: boolean; onOpen: (item: TodoItem) => void }) {
  return (
    <div
      className={`srow dm-t${here ? ' here' : ''}${first ? ' first' : ''}`}
      // Without an action, the row itself is what the keyboard reaches.
      tabIndex={item.act ? undefined : 0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => e.target === e.currentTarget && e.key === 'Enter' && onOpen(item)}
    >
      <span className={`dm-when ${item.when.tone}`}>{item.when.text}</span>
      {!here && <DomainBadge domain={item.domain} />}
      <span className="stack dm-2">
        <span className="hi ell">{item.title}</span>
        <span className="small dim ell">{[here && item.chip, item.detail].filter(Boolean).join(' · ')}</span>
      </span>
      {!here && <SourceChip text={item.chip} />}
      {/* Its click reaches the row, which opens the same thing: the button is there for the keyboard and the eye. */}
      <span className="act">{item.act && <button className={`btn small${first ? ' primary' : ''}`}>{item.act}</button>}</span>
    </div>
  )
}
