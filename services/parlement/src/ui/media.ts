import { chapterIndexAt, saidAt, spanAt, type MediaChapter, type MediaClip, type MediaSpan } from '@marianne/sdk/media'
import { videoKey, videoPage } from '../links'
import type { Chamber, Clip, LiveStream, VideoDetail } from '../types'
import { CHAMBER_NAMES } from '../types'
import type { Target } from './common'

/**
 * A video of the portals as the player sees it: its chapters, suspensions and clips in the
 * player's time (the stream's: the Sénat's start offsetMs into the recording, where the portal's
 * timecodes count from), its links and the line to share.
 */

/** A line of the agenda beside the player, with the portal's chapter id. */
export interface AgendaLine extends MediaChapter {
  id: string
}

type Timed = Pick<VideoDetail, 'chapters' | 'offsetMs'>

/** The chapters that have a time, in the agenda's order, at the player's time. */
export function mediaChapters(v: Timed): AgendaLine[] {
  return v.chapters.flatMap((c) =>
    c.timecode === null
      ? []
      : [{ id: c.id, at: Math.max(0, c.timecode - v.offsetMs), title: c.title, depth: c.depth, ...(c.speaker ? { speaker: c.speaker } : {}) }]
  )
}

const SUSPENSION = /^suspension\b/i

/** The suspensions of the sitting: from their line to the next one (the sitting resumes); the last one of a live, to `total`. */
export function suspensions(chapters: readonly MediaChapter[], total: number): MediaSpan[] {
  const spans: MediaSpan[] = []
  chapters.forEach((c, i) => {
    if (!SUSPENSION.test(c.title)) return
    const next = chapters.slice(i + 1).find((n) => n.at > c.at)
    const to = next ? next.at : total
    if (to > c.at) spans.push({ from: c.at, to })
  })
  return spans
}

/** "caler sur l'intervention": what is said at ms, from its line to the next of its depth or less; nothing in a suspension. */
export function snapAt(chapters: readonly MediaChapter[], ms: number, total: number): MediaSpan | null {
  const i = chapterIndexAt(chapters, ms)
  if (i < 0 || SUSPENSION.test(chapters[i].title)) return null
  const span = spanAt(chapters, ms, total)
  return span && span.to > span.from ? span : null
}

type Ref = Pick<VideoDetail, 'id' | 'chamber' | 'offsetMs'>

/** The user's clips of this video, at the player's time: the yellow line over the track. */
export function keptOf(clips: readonly Clip[], v: Ref): MediaSpan[] {
  return clips.filter((c) => c.video === v.id && (c.chamber ?? 'an') === v.chamber).map((c) => ({ from: c.start - v.offsetMs, to: c.end - v.offsetMs }))
}

/** A clip cut in the player, as kept in « extraits » (at the portal's time, as its links). */
export function clipOf(v: Pick<VideoDetail, 'id' | 'chamber' | 'offsetMs' | 'title' | 'date' | 'thumbnail'>, clip: MediaClip, id: string, now: Date): Clip {
  return {
    id,
    video: v.id,
    chamber: v.chamber,
    title: clip.title.trim() || v.title,
    videoTitle: v.title,
    date: v.date,
    start: Math.round(clip.from + v.offsetMs),
    end: Math.round(clip.to + v.offsetMs),
    thumbnail: v.thumbnail,
    createdAt: now.toISOString()
  }
}

/** The portal's public page of the video: at a moment, or where a clip starts (the portal knows no end). */
export function shareLink(v: Ref, at: number | null, clip?: MediaSpan): string {
  const from = clip ? clip.from : at
  return videoPage(v.chamber, v.id, from === null ? undefined : from + v.offsetMs)
}

/** "30 octobre 2026", in Paris. */
const longDate = (iso: string) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : ''

/**
 * « copier avec le titre »: "Article 17, M. Tanguy, Assemblée nationale, 30 octobre 2026, de 1:02:03
 * à 1:04:10 : <url>". The subject and the speaker are the clip's title, or what is said at the moment.
 */
export function shareLine(
  v: Pick<VideoDetail, 'chamber' | 'title' | 'date'>,
  chapters: readonly MediaChapter[],
  url: string,
  at: number | null,
  clip: MediaClip | undefined,
  when: (ms: number) => string
): string {
  const said = (ms: number) => {
    const s = saidAt(chapters, ms)
    return s.subject || s.speaker ? [s.subject?.title ?? '', s.speaker] : [v.title]
  }
  const what = clip ? (clip.title.trim() ? clip.title.split(' · ') : said(clip.from)) : at !== null ? said(at) : [v.title]
  const moment = clip ? `de ${when(clip.from)} à ${when(clip.to)}` : at !== null ? `à ${when(at)}` : ''
  const parts = [...what, CHAMBER_NAMES[v.chamber], longDate(v.date), moment].map((p) => p.trim()).filter(Boolean)
  return `${parts.join(', ')} : ${url}`
}

/** Where a broadcast opens: its video on the portal (the whole sitting so far), or else the broadcast alone (its last seconds). */
export function streamTarget(s: LiveStream): Target {
  return s.video ? { kind: 'video', ref: videoKey(s.chamber, s.video) } : { kind: 'live', chamber: s.chamber, id: s.id }
}

/** The live stream of this video, or broadcast now on its channel: by its video or its channel, never by its kind. */
export function streamOf(streams: readonly LiveStream[], v: Pick<VideoDetail, 'id' | 'chamber' | 'channel'>): LiveStream | null {
  const on = streams.filter((s) => s.live && s.chamber === v.chamber)
  return on.find((s) => s.video === v.id) ?? on.find((s) => !!v.channel && s.channel === v.channel) ?? null
}

/**
 * What the page of a broadcast opened without its video shows, from the latest answer of the lives:
 * its video once the portal has it, and from then on the one it showed (`seen`) whatever later
 * answers say. One without it (a portal request failed, the sitting is over) would take the whole
 * sitting away, and the video's page tells itself when it is over. Else the broadcast as the answer
 * has it; null once it is no longer on air.
 */
export function livePage(streams: readonly LiveStream[], chamber: Chamber, id: string, seen: string | null): { video: string } | { stream: LiveStream } | null {
  if (seen) return { video: seen }
  const stream = streams.find((s) => s.chamber === chamber && (s.id === id || s.video === id))
  if (stream?.video) return { video: stream.video }
  return stream ? { stream } : null
}
