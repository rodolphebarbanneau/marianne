import type { ServiceState } from '@marianne/sdk'
import type { PinnedMedia } from '@marianne/sdk/media'
import { routeTarget } from './routes'

/** A pin from a page that is leaving waits this long: the same video taken back by then, it never shows. */
export const AUTO_PIN_MS = 300

interface Timers {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }

/**
 * The app's mini-player, without React: the video it shows, where it is, and a pin waiting (a page
 * that left while its video played: a page that comes back at once, the same video with it, takes
 * it back before it shows). `changed` hears of every change of what shows.
 */
export class PinnedDesk {
  private shown: PinnedMedia | null = null
  private waiting: { item: PinnedMedia; handle: unknown } | null = null
  private at = 0

  constructor(
    private readonly changed: (item: PinnedMedia | null) => void,
    private readonly timers: Timers = realTimers
  ) {}

  /** What the mini-player shows. */
  get item(): PinnedMedia | null {
    return this.shown
  }

  /** Where the video shown is, ms; `item.at` until it plays. */
  get position(): number {
    return this.at
  }

  pin(item: PinnedMedia, opts?: { auto?: boolean }): void {
    this.cancel()
    if (!opts?.auto) return this.show(item)
    const handle = this.timers.set(() => {
      this.waiting = null
      this.show(item)
    }, AUTO_PIN_MS)
    this.waiting = { item, handle }
  }

  /**
   * The video back to a page: where it was, ms, when it shows or waits to; null when it isn't this
   * one, or not `mine` (a community screen takes back only what it pinned).
   */
  take(src: string, mine: (item: PinnedMedia) => boolean = () => true): number | null {
    if (this.waiting?.item.src === src && mine(this.waiting.item)) {
      const at = this.waiting.item.at
      this.cancel()
      return at
    }
    if (this.shown?.src !== src || !mine(this.shown)) return null
    const at = this.at
    this.close()
    return at
  }

  /** The mini-player's time, as it plays. */
  time(ms: number): void {
    if (this.shown && Number.isFinite(ms)) this.at = ms
  }

  close(): void {
    this.cancel()
    if (!this.shown) return
    this.shown = null
    this.changed(null)
  }

  private show(item: PinnedMedia): void {
    this.shown = item
    this.at = item.at
    this.changed(item)
  }

  private cancel(): void {
    if (!this.waiting) return
    this.timers.clear(this.waiting.handle)
    this.waiting = null
  }
}

/** Back to a pinned video's page: its route, its params and `t`, where it was (ms). */
export function backTo(item: PinnedMedia, at: number): { route: string; params: Record<string, string | number> } {
  return { route: item.route, params: { ...item.params, t: Math.max(0, Math.round(at)) } }
}

/**
 * Whether the service a pinned video brings the user back to is no longer among theirs (removed,
 * or turned off): the video stops with it, as its ⤢ would open a screen that is off. A route to
 * another screen keeps it, and so does an empty list (not loaded yet: it holds every built-in
 * service, the ones not added included).
 */
export function serviceGone(item: PinnedMedia, services: ReadonlyArray<Pick<ServiceState, 'manifest' | 'added' | 'on'>>): boolean {
  const target = routeTarget(item.route)
  if (target?.kind !== 'view' || target.view.kind !== 'service' || !services.length) return false
  const code = target.view.id
  return !services.some((s) => s.manifest.id === code && s.added && s.on)
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * What is left of a box beside the mini-player: a view drawn over the window (a community
 * screen) would hide it, so it stops short of it, above it when it is in the box's lower half,
 * below it otherwise, `gap` away.
 */
export function roomBeside(box: Rect, mini: Rect | null, gap = 14): Rect {
  if (!mini) return box
  const apart = mini.x >= box.x + box.width || mini.x + mini.width <= box.x || mini.y >= box.y + box.height || mini.y + mini.height <= box.y
  if (apart) return box
  const low = mini.y + mini.height / 2 > box.y + box.height / 2
  if (low) return { ...box, height: Math.max(0, Math.min(box.height, mini.y - gap - box.y)) }
  const top = Math.min(box.y + box.height, mini.y + mini.height + gap)
  return { ...box, y: top, height: Math.max(0, box.y + box.height - top) }
}
