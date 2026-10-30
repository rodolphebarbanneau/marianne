import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useFullscreen, useMediaPrefs, useMediaStyles, usePlayback, useVolume } from './hooks'
import { Icon, SkipIcon } from './icons'
import { SKIP_MS } from './keys'
import { useStream } from './stream'
import { videoTime } from './time'
import { MiniTrack } from './timeline'
import type { MiniCorner, PinnedMedia } from './types'

export interface MiniPlayerProps {
  media: PinnedMedia
  corner: MiniCorner
  onCorner(c: MiniCorner): void
  /** Back to the video's page, from `at` (ms). */
  onExpand(at: number): void
  /** Closed: where it was. */
  onClose(at: number): void
  /** Where it is, ms, as it plays: what the app hands back to a page that takes it. */
  onTime?(ms: number): void
  /** Room kept free under the bottom corners, px (a folder's reply box). */
  bottom?: number
}

const CORNERS: MiniCorner[] = ['tl', 'tr', 'bl', 'br']
/** A press that moves less than this is not a drag. */
const DRAG_PX = 4

/**
 * The mini-player: the video goes on in a corner of the window, over any page. Hovered, its keys
 * (back to the page, fullscreen, close; −10 s, play/pause, +10 s); always, its track at its foot,
 * which a click or a drag along it moves through the video, and a caption under it (a click on it
 * goes back to the page). Dragged by its grip, top left, and by nothing else, it snaps to the
 * nearest of the four corners. Place it in the area it floats over (position: relative).
 */
export function MiniPlayer({ media, corner, onCorner, onExpand, onClose, onTime, bottom }: MiniPlayerProps) {
  useMediaStyles()
  const root = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const stream = useStream(video, media.src, { start: media.at, autoPlay: true, live: media.live })
  const pb = usePlayback(video)
  const [prefs] = useMediaPrefs()
  useVolume(video, prefs)
  const [full, toggleFull] = useFullscreen(root)
  const [hover, setHover] = useState(false)
  const [drag, setDrag] = useState<{ dx: number; dy: number; target: MiniCorner; height: number } | null>(null)
  const press = useRef<{ x: number; y: number; id: number } | null>(null)

  // The same video pinned again from elsewhere in it: there.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (video.current) video.current.currentTime = media.at / 1000
  }, [media.at])

  const told = useRef(onTime)
  told.current = onTime
  // Not the 0 it has before the stream is there: the app keeps `media.at` until it plays.
  useEffect(() => {
    if (pb.time > 0 || !pb.paused) told.current?.(pb.time)
  }, [pb.time, pb.paused])

  const live = stream.live
  const total = live ? pb.edge : pb.total
  const at = () => (video.current?.currentTime ?? 0) * 1000
  const toggle = () => {
    const v = video.current
    if (!v) return
    if (v.paused || v.ended) void v.play().catch(() => undefined)
    else v.pause()
  }
  const skip = (ms: number) => {
    const v = video.current
    if (v) v.currentTime = Math.max(0, Math.min(total / 1000 || Infinity, v.currentTime + ms / 1000))
  }
  const seek = (ms: number) => {
    const v = video.current
    if (v && total > 0) v.currentTime = Math.max(0, Math.min(total, ms)) / 1000
  }

  // Dragging: it follows the pointer, the corner nearest its middle lit; let go, it goes there.
  const nearest = (dx: number, dy: number): MiniCorner => {
    const el = root.current
    const area = el?.offsetParent?.getBoundingClientRect()
    const r = el?.getBoundingClientRect()
    if (!area || !r) return corner
    const x = r.left + r.width / 2 + dx - (drag?.dx ?? 0)
    const y = r.top + r.height / 2 + dy - (drag?.dy ?? 0)
    return `${y < area.top + area.height / 2 ? 't' : 'b'}${x < area.left + area.width / 2 ? 'l' : 'r'}` as MiniCorner
  }
  // Only the grip takes the card: the rest of it is the video's (its keys, its track, its caption).
  const down = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || full) return
    e.preventDefault()
    press.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const p = press.current
    if (!p) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (!drag && Math.hypot(dx, dy) < DRAG_PX) return
    setDrag({ dx, dy, target: nearest(dx, dy), height: root.current?.offsetHeight ?? 0 })
  }
  const up = () => {
    press.current = null
    if (!drag) return
    setDrag(null)
    if (drag.target !== corner) onCorner(drag.target)
  }

  const lift = { '--mp-mini-bottom': `${14 + (bottom ?? 0)}px` } as CSSProperties
  const style = drag ? { ...lift, transform: `translate(${drag.dx}px, ${drag.dy}px)` } : lift
  const idle = !hover && !drag
  return (
    <>
      {drag &&
        CORNERS.map((c) => (
          <span key={c} className={`mp-mini-ghost mp-${c}${c === drag.target ? ' mp-target' : ''}`} style={{ ...lift, height: drag.height }} />
        ))}
      <div
        ref={root}
        className={`mp-mini mp-${corner}${drag ? ' mp-dragging' : ''}${idle ? ' mp-idle' : ''}${full ? ' mp-full' : ''}`}
        style={style}
        role="region"
        aria-label={`mini-lecteur : ${media.title}`}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
        <div className="mp-stage">
          <div className="mp-screen">
            <video ref={video} poster={media.poster || undefined} playsInline />
          </div>
          <div className="mp-mini-over">
            <div className="mp-mini-row">
              <span
                className="mp-mini-grip"
                title="glisser vers un coin"
                aria-label="déplacer le mini-lecteur"
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
              >
                <Icon name="grip" size={16} />
              </span>
              <span className="mp-mini-keys">
                <button className="mp-btn" onClick={() => onExpand(at())} title="revenir à la page de la vidéo">
                  <Icon name="expand" />
                </button>
                <button className="mp-btn" onClick={toggleFull} title={full ? 'quitter le plein écran (échap)' : 'plein écran'}>
                  <Icon name={full ? 'unfull' : 'full'} size={14} />
                </button>
                <button
                  className="mp-btn"
                  onClick={() => {
                    video.current?.pause()
                    onClose(at())
                  }}
                  title="fermer"
                >
                  <Icon name="close" size={16} />
                </button>
              </span>
            </div>
            <div className="mp-mini-mid">
              <button className="mp-btn" onClick={() => skip(-SKIP_MS)} title="reculer de 10 s">
                <SkipIcon dir={-1} />
              </button>
              <button className="mp-btn" onClick={toggle} title={pb.paused ? 'lecture' : 'pause'}>
                <Icon name={pb.paused ? 'play' : 'pause'} size={20} />
              </button>
              <button className="mp-btn" onClick={() => skip(SKIP_MS)} title="avancer de 10 s">
                <SkipIcon dir={1} />
              </button>
            </div>
            <span className="mp-mini-foot" />
          </div>
          <MiniTrack at={pb.time} total={total} live={live} onSeek={seek} />
          {stream.error && <p className="mp-note bad">✗ {stream.error}</p>}
        </div>
        <button className="mp-mini-cap" onClick={() => onExpand(at())} title="revenir à la page de la vidéo">
          {media.badge && (
            <span className="mp-badge" data-badge={media.badge}>
              {media.badge}
            </span>
          )}
          {live && <span className="mp-onair">● direct</span>}
          <span className="mp-mini-title">{media.title}</span>
          <span className="mp-mini-time">{videoTime(pb.time, total)}</span>
        </button>
      </div>
    </>
  )
}
