import type { MediaChapter, MediaSpan } from './types'

/**
 * A video's table of contents, read at a moment. The chapters come in their order (the agenda's):
 * a line is inside the last one before it of a smaller depth, and lasts until the next one of its
 * depth or less.
 */

/** The deepest line at ms (the last one started), its index; −1 before the first. */
export function chapterIndexAt(chapters: readonly MediaChapter[], ms: number): number {
  for (let i = chapters.length - 1; i >= 0; i--) if (chapters[i].at <= ms) return i
  return -1
}

/** The line a line is inside of; −1 for a top one. */
export function parentIndex(chapters: readonly MediaChapter[], i: number): number {
  const depth = chapters[i]?.depth ?? 0
  for (let j = i - 1; j >= 0; j--) if (chapters[j].depth < depth) return j
  return -1
}

/** Where a line ends: the next one of its depth or less, or the end of the video. */
export function chapterEnd(chapters: readonly MediaChapter[], i: number, total: number): number {
  const depth = chapters[i].depth
  for (let j = i + 1; j < chapters.length; j++) if (chapters[j].depth <= depth) return Math.min(chapters[j].at, total)
  return total
}

export interface Said {
  /** The deepest line. */
  chapter: MediaChapter | null
  /** What is talked about: the line itself, or for someone speaking, the line they speak in. */
  subject: MediaChapter | null
  /** Who speaks, when the line says. */
  speaker: string
}

/** What is said at ms: the subject, and who speaks. */
export function saidAt(chapters: readonly MediaChapter[], ms: number): Said {
  const i = chapterIndexAt(chapters, ms)
  if (i < 0) return { chapter: null, subject: null, speaker: '' }
  const chapter = chapters[i]
  if (!chapter.speaker) return { chapter, subject: chapter, speaker: '' }
  const p = parentIndex(chapters, i)
  return { chapter, subject: p < 0 ? null : chapters[p], speaker: chapter.speaker }
}

/** The span of the deepest line at ms (an intervention, a point of the agenda); null before the first. */
export function spanAt(chapters: readonly MediaChapter[], ms: number, total: number): MediaSpan | null {
  const i = chapterIndexAt(chapters, ms)
  if (i < 0) return null
  return { from: chapters[i].at, to: chapterEnd(chapters, i, total) }
}

/** A clip's default title: the subject and the speaker where it starts ("Prix des carburants · M. Carbonnel"). */
export function clipTitleAt(chapters: readonly MediaChapter[], ms: number): string {
  const { subject, speaker } = saidAt(chapters, ms)
  return [subject?.title, speaker].filter(Boolean).join(' · ')
}
