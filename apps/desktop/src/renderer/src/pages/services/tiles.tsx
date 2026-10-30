import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { paletteValue, type ServiceState, type ServiceTile, type TileVisual } from '@marianne/sdk'
import { Pixels, ServiceIcon } from '@marianne/sdk/view'
import type { TileState } from '@shared/types'
import { freshness } from '../../lib/format'
import { Code, Community } from './parts'

/**
 * The pinned services, as tiles: one size, laid out by Marianne. The head (icon, code, name, the
 * grip) and the foot (« communauté », how fresh the tile is, its button) are Marianne's; the body
 * is what the service's `tile()` returned, or its description. A tile moves by its grip only: over
 * the grip it turns ghost, dragged the others make room, dropped the order is kept. The grip also
 * moves it with the arrow keys.
 */

type Params = Record<string, string | number>

/** A tile's picture. */
function Visual({ visual }: { visual: TileVisual }) {
  if (visual.kind === 'bars') {
    const values = visual.bars.map((b) => b.value)
    const [low, high] = visual.range ?? [Math.min(0, ...values), Math.max(...values)]
    const span = high - low || 1
    return (
      <div className="v-bars" aria-hidden>
        {visual.bars.map((b, i) => (
          <span key={i}>
            <i
              style={{
                height: `${Math.max(2, Math.round(((Math.min(high, Math.max(low, b.value)) - low) / span) * 18))}px`,
                background: paletteValue(b.color ?? 'gris-clair')
              }}
            />
            {b.label}
            {b.text && (
              <>
                <br />
                <span className="hi">{b.text}</span>
              </>
            )}
          </span>
        ))}
      </div>
    )
  }
  if (visual.kind === 'blocks')
    return (
      <div className="v-blocks" aria-hidden>
        {visual.blocks.map((b, i) => (
          <span key={i}>
            <i className={b.color ? undefined : 'none'} style={b.color ? { background: paletteValue(b.color) } : undefined} />
            {b.label}
          </span>
        ))}
      </div>
    )
  if (visual.kind === 'gauge')
    return (
      <div className="v-gauge">
        <span className="track" aria-hidden>
          <i style={{ width: `${Math.round(visual.value * 100)}%`, background: paletteValue(visual.color ?? 'jaune') }} />
        </span>
        {visual.label && <span className="ell">{visual.label}</span>}
      </div>
    )
  return (
    <div>
      <Pixels art={visual} cell={4} gap={1} />
    </div>
  )
}

/** What the service says, or its description when it says nothing (no tile(), or none yet). */
function Body({ state, tile }: { state: ServiceState; tile: ServiceTile | null }) {
  if (!state.on)
    return (
      <div className="tb">
        <span className="title">{state.available ? 'désactivé' : 'indisponible'}</span>
        <span className="ln clamp2 tone-dim">{state.manifest.description}</span>
      </div>
    )
  if (!tile)
    return (
      <div className="tb">
        <span className="ln clamp2 tone-dim">{state.manifest.description}</span>
      </div>
    )
  return (
    <div className="tb">
      {tile.value ? (
        <span className="value">
          <b>{tile.value.text}</b>
          {tile.value.unit && <span className="ell">{tile.value.unit}</span>}
        </span>
      ) : (
        tile.title && <span className="title ell">{tile.title}</span>
      )}
      {tile.visual && <Visual visual={tile.visual} />}
      {(tile.lines ?? []).map((l, i) => (
        <span key={i} className={`ln ell tone-${l.tone ?? 'normal'}`}>
          {l.tone === 'live' && <span className="dotlive" aria-label="en ce moment" />}
          {l.text}
        </span>
      ))}
    </div>
  )
}

/** "il y a 12 min"; a failed ask says so on hover (the tile shown is the last one). */
function Freshness({ state, now }: { state?: TileState; now: Date }) {
  if (!state?.at) return <span className="ell fresh">{state?.loading ? '…' : ''}</span>
  return (
    <span className={`ell fresh${state.error ? ' failed' : ''}`} title={state.error ? `la dernière mise à jour a échoué : ${state.error}` : undefined}>
      {freshness(state.at, now)}
    </span>
  )
}

function Tile({
  state,
  tileState,
  now,
  dragging,
  onOpen,
  grip,
  drag
}: {
  state: ServiceState
  tileState?: TileState
  now: Date
  dragging: boolean
  onOpen: (params: Params) => void
  grip: {
    onPointerDown: () => void
    onKeyDown: (e: ReactKeyboardEvent) => void
  }
  drag: {
    onDragStart: (e: DragEvent) => void
    onDragOver: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
    onDragEnd: (e: DragEvent) => void
  }
}) {
  const m = state.manifest
  const tile = state.on ? (tileState?.tile ?? null) : null
  return (
    <div
      className={`tile${tile?.urgency === 'urgent' ? ' urgent' : ''}${state.on ? '' : ' off'}${dragging ? ' dragging' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`3615 ${m.id.toUpperCase()} · ${m.name}`}
      data-tile={m.id}
      draggable
      {...drag}
      onClick={() => onOpen(tile?.params ?? {})}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        onOpen(tile?.params ?? {})
      }}
    >
      <button
        className="grip"
        title="glisser pour ranger (ou ← →)"
        aria-label={`ranger 3615 ${m.id.toUpperCase()} : flèches gauche et droite`}
        onPointerDown={grip.onPointerDown}
        onKeyDown={grip.onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <i aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <b key={i} />
          ))}
        </i>
      </button>
      <span className="th">
        <ServiceIcon icon={m.icon} size="small" />
        <span className="stack">
          <Code code={m.id} />
          <span className="name ell">{m.name}</span>
        </span>
      </span>
      <Body state={state} tile={tile} />
      <span className="tf">
        {!state.builtIn && <Community />}
        {state.on && <Freshness state={tileState} now={now} />}
        {tile?.action && (
          <button
            className="btn small primary"
            onClick={(e) => {
              e.stopPropagation()
              onOpen(tile.action?.params ?? tile.params ?? {})
            }}
          >
            {tile.action.label}
          </button>
        )}
      </span>
    </div>
  )
}

/** The tiles in the user's order; `onOrder` keeps a new one. */
export function Tiles({
  services,
  tiles,
  onOpen,
  onOrder
}: {
  services: ServiceState[]
  tiles: Record<string, TileState>
  onOpen: (id: string, params: Params) => void
  onOrder: (order: string[]) => void
}) {
  const ids = services.map((s) => s.manifest.id)
  const key = ids.join()
  // While a tile is dragged, the order shown moves with it; dropped, it becomes the user's.
  const [order, setOrder] = useState(ids)
  const [dragged, setDragged] = useState<string | null>(null)
  const fromGrip = useRef(false)
  const grid = useRef<HTMLDivElement>(null)
  useEffect(() => void setOrder(key ? key.split(',') : []), [key])
  // The ages move on while the page shows.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const up = () => (fromGrip.current = false)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  const byId = new Map(services.map((s) => [s.manifest.id, s]))
  const shown = order.filter((id) => byId.has(id))
  const move = (id: string, to: number) => {
    const next = shown.filter((x) => x !== id)
    next.splice(Math.max(0, Math.min(next.length, to)), 0, id)
    return next
  }
  /** Arrow keys on a grip: one place earlier or later (up and down by a row of the grid). */
  const keyMove = (id: string, e: ReactKeyboardEvent) => {
    const columns = grid.current ? getComputedStyle(grid.current).gridTemplateColumns.split(' ').length : 4
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[e.key]
    if (!step) return
    e.preventDefault()
    e.stopPropagation()
    const next = move(id, shown.indexOf(id) + step)
    setOrder(next)
    onOrder(next)
    // The grip keeps the focus, at its tile's new place.
    requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-tile="${id}"] .grip`)?.focus())
  }

  return (
    <div className="tiles" ref={grid}>
      {shown.map((id) => {
        const s = byId.get(id)!
        return (
          <Tile
            key={id}
            state={s}
            tileState={tiles[id]}
            now={now}
            dragging={dragged === id}
            onOpen={(params) => onOpen(id, params)}
            grip={{ onPointerDown: () => (fromGrip.current = true), onKeyDown: (e) => keyMove(id, e) }}
            drag={{
              onDragStart: (e) => {
                // A tile moves by its grip only: elsewhere, a press opens it.
                if (!fromGrip.current) return e.preventDefault()
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', id)
                setTimeout(() => setDragged(id), 0)
              },
              onDragOver: (e) => {
                if (!dragged) return
                e.preventDefault()
                // The others make room as it passes: it takes the place of the tile under it.
                if (dragged !== id) setOrder(move(dragged, shown.indexOf(id)))
              },
              onDrop: (e) => void (dragged && e.preventDefault()),
              onDragEnd: (e) => {
                fromGrip.current = false
                // Dropped on the grid, the new order is kept; cancelled (échap) or dropped elsewhere, the tiles go back.
                if (dragged) {
                  if (e.dataTransfer.dropEffect === 'none') setOrder(ids)
                  else onOrder(shown)
                }
                setDragged(null)
              }
            }}
          />
        )
      })}
    </div>
  )
}
