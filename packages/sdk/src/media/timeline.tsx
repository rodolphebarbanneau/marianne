import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { chapterEnd, chapterIndexAt, saidAt } from './chapters'
import { at, cutsIn, msAt, segment, separatorMask, type TrackRange } from './track'
import type { MediaChapter, MediaSpan } from './types'

/**
 * The track: Videotex mosaic cells in two rows — played, loaded, to come — cut by the agenda's top
 * lines, dark over the suspensions, the kept clips as a yellow line above it, the Minitel's block
 * for the cursor. Hovered, the moment, its subject and its speaker; in clip mode, a magnifier
 * around the clip with its two handles.
 */

/** A fill of the mosaic over a stretch, if any of it is in view. */
function Fill({ range, from, to, kind }: { range: TrackRange; from: number; to: number; kind: string }) {
  const s = segment(range, from, to)
  return s ? <i className={kind} style={{ left: `${s.left}%`, width: `${s.width}%` }} /> : null
}

export interface TrackProps {
  range: TrackRange
  /** Where the video is (or where the pointer drags it to). */
  at: number
  buffered: number
  /** The end of what can be played: the video's length, the live edge. */
  total: number
  live?: boolean
  chapters: readonly MediaChapter[]
  gaps: readonly MediaSpan[]
  kept: readonly MediaSpan[]
  /** The clip being cut: the magnifier's handles. */
  clip?: MediaSpan | null
  /** How a moment reads (the time's mode). */
  when(ms: number): string
  /** No tip: a menu is open over the track. */
  quiet?: boolean
  onSeek(ms: number): void
  /** Dragged to ms; null when let go. */
  onScrub(ms: number | null): void
  onClip?(span: MediaSpan): void
  /** A handle is held: the magnifier keeps still meanwhile. */
  onHold?(held: boolean): void
}

export function Track({ range, at: pos, buffered, total, live, chapters, gaps, kept, clip, when, quiet, onSeek, onScrub, onClip, onHold }: TrackProps) {
  const track = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const dragging = useRef<'head' | 'from' | 'to' | null>(null)
  const msOf = (clientX: number) => {
    const r = track.current?.getBoundingClientRect()
    return r && r.width > 0 ? Math.min(total, msAt(range, (clientX - r.left) / r.width)) : pos
  }

  const down = (e: ReactPointerEvent, what: 'head' | 'from' | 'to') => {
    if (e.button !== 0) return
    // Captured, the drag goes on outside the track; a handle's moves bubble up to it.
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragging.current = what
    if (what === 'head') onScrub(msOf(e.clientX))
    else onHold?.(true)
  }
  const move = (e: ReactPointerEvent) => {
    const ms = msOf(e.clientX)
    if (!dragging.current) return setHover(ms)
    if (dragging.current === 'head') return onScrub(ms)
    if (!clip || !onClip) return
    // A handle doesn't pass the other one: a clip lasts at least a second.
    if (dragging.current === 'from') onClip({ from: Math.min(ms, clip.to - 1000), to: clip.to })
    else onClip({ from: clip.from, to: Math.max(ms, clip.from + 1000) })
  }
  const up = (e: ReactPointerEvent) => {
    const what = dragging.current
    dragging.current = null
    if (what === 'head') {
      onSeek(msOf(e.clientX))
      onScrub(null)
    } else if (what) onHold?.(false)
  }

  const cutting = !!clip
  const lit = hover !== null && !cutting ? chapterIndexAt(chapters, hover) : -1
  const said = hover !== null && !cutting && !quiet ? saidAt(chapters, hover) : null
  const mask = separatorMask(cutsIn(chapters, range, cutting))
  return (
    <div
      className="mp-track-wrap"
      role="slider"
      tabIndex={-1}
      aria-label="position dans la vidéo"
      aria-valuemin={Math.round(range.lo / 1000)}
      aria-valuemax={Math.round(range.hi / 1000)}
      aria-valuenow={Math.round(pos / 1000)}
      aria-valuetext={when(pos)}
      onPointerDown={(e) => down(e, 'head')}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={() => setHover(null)}
    >
      <div className="mp-track" ref={track}>
        <span className="mp-cells" style={{ '--sep': mask } as CSSProperties}>
          <i className="base" />
          <Fill range={range} from={0} to={Math.max(buffered, pos)} kind="buf" />
          <Fill range={range} from={0} to={pos} kind="played" />
          {gaps.map((g) => (
            <Fill key={`${g.from}-${g.to}`} range={range} from={g.from} to={g.to} kind="susp" />
          ))}
          {clip && (
            <>
              <Fill range={range} from={range.lo} to={clip.from} kind="shade" />
              <Fill range={range} from={clip.to} to={range.hi} kind="shade" />
              <Fill range={range} from={clip.from} to={clip.to} kind="clip" />
            </>
          )}
          {lit >= 0 && <Fill range={range} from={chapters[lit].at} to={chapterEnd(chapters, lit, range.hi)} kind="hov" />}
          {live && !cutting && <i className="live" style={{ left: 'calc(100% - 10px)', right: 0 }} />}
        </span>
        {!cutting &&
          kept.map((k) => {
            const s = segment(range, k.from, k.to)
            return s && <span key={`${k.from}-${k.to}`} className="mp-kept" style={{ left: `${s.left}%`, width: `${s.width}%` }} title="extrait gardé" />
          })}
        {hover !== null && !cutting && !quiet && (
          <>
            <span className="mp-tip" style={{ left: `clamp(120px, ${at(range, hover)}, calc(100% - 120px))` }}>
              <span className="t">{when(hover)}</span>
              {(said?.subject || said?.speaker) && (
                <span className="c">
                  {said.subject && <b>{said.subject.title}</b>}
                  {said.speaker}
                </span>
              )}
            </span>
            <span className="mp-hover" style={{ left: at(range, hover) }} />
          </>
        )}
        {clip && (
          <>
            <span className="mp-handle" style={{ left: at(range, clip.from) }} title="début de l’extrait (I)" onPointerDown={(e) => down(e, 'from')} />
            <span className="mp-handle" style={{ left: at(range, clip.to) }} title="fin de l’extrait (O)" onPointerDown={(e) => down(e, 'to')} />
          </>
        )}
        <span className="mp-head" style={{ left: at(range, pos) }} />
      </div>
      {cutting && (
        <div className="mp-scale">
          <span>{when(range.lo)}</span>
          <span>{when(range.hi)}</span>
        </div>
      )}
    </div>
  )
}

/** The mini-player's track: one row of cells, played and to come, the live edge in red. */
export function MiniTrack({ at: pos, total, live }: { at: number; total: number; live?: boolean }) {
  const range = { lo: 0, hi: Math.max(1, total) }
  return (
    <div className="mini-track">
      <span className="mp-cells">
        <i className="base" />
        <Fill range={range} from={0} to={pos} kind="played" />
        {live && <i className="live" style={{ left: 'calc(100% - 6px)', right: 0 }} />}
      </span>
    </div>
  )
}
