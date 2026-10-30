import type { MediaChapter, MediaSpan } from './types'

/**
 * The track's arithmetic: what stretch of the video it spans (the whole of it, or in clip mode a
 * magnifier around the clip), where a moment falls on it, and the cuts of its mosaic.
 */

export interface TrackRange {
  lo: number
  hi: number
}

/** Cutting a clip, the track shows this much on each side of it. */
export const CLIP_MARGIN = 180_000

/** The stretch the track spans, ms: 0 to the end (or the live edge); around the clip when one is cut. */
export function trackRange(total: number, clip?: MediaSpan | null): TrackRange {
  const end = Math.max(1, total)
  if (!clip) return { lo: 0, hi: end }
  const lo = Math.max(0, Math.min(clip.from, clip.to) - CLIP_MARGIN)
  const hi = Math.min(end, Math.max(clip.from, clip.to) + CLIP_MARGIN)
  return hi > lo ? { lo, hi } : { lo: 0, hi: end }
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** Where ms falls on the track, 0 to 1 (outside it: at its ends). */
export function share(range: TrackRange, ms: number): number {
  return Math.min(1, Math.max(0, (ms - range.lo) / (range.hi - range.lo)))
}

/** The moment at a share of the track (a pointer's x over its width). */
export function msAt(range: TrackRange, fraction: number): number {
  return Math.round(range.lo + Math.min(1, Math.max(0, fraction)) * (range.hi - range.lo))
}

/** A position on the track as a CSS percentage. */
export const at = (range: TrackRange, ms: number) => `${round(share(range, ms) * 100)}%`

/** A stretch on the track, in percent of it; null when none of it is in view. */
export function segment(range: TrackRange, from: number, to: number): { left: number; width: number } | null {
  if (to <= range.lo || from >= range.hi || to <= from) return null
  const left = share(range, from) * 100
  return { left: round(left), width: round(share(range, to) * 100 - left) }
}

/**
 * Where the agenda cuts the track, in percent: its top lines, or in the magnifier every line (the
 * interventions around the clip). Only the cuts inside: none at the very start.
 */
export function cutsIn(chapters: readonly MediaChapter[], range: TrackRange, every = false): number[] {
  return chapters.filter((c) => (every || c.depth === 0) && c.at > range.lo && c.at < range.hi).map((c) => round(share(range, c.at) * 100))
}

/**
 * The mask that cuts the mosaic: opaque, with a 5px gap at each cut (2px before it, 3px after),
 * through which the picture shows.
 */
export function separatorMask(cuts: readonly number[]): string {
  if (!cuts.length) return 'linear-gradient(#000, #000)'
  const stops: string[] = []
  let from = '0%'
  for (const p of cuts) {
    stops.push(`#000 ${from} calc(${p}% - 2px)`, `transparent calc(${p}% - 2px) calc(${p}% + 3px)`)
    from = `calc(${p}% + 3px)`
  }
  stops.push(`#000 ${from} 100%`)
  return `linear-gradient(90deg, ${stops.join(', ')})`
}
