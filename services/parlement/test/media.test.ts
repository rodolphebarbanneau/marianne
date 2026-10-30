import { describe, expect, it } from 'vitest'
import { clipOf, keptOf, mediaChapters, shareLine, shareLink, snapAt, streamOf, suspensions } from '../src/ui/media'
import type { Clip, LiveStream, VideoChapter } from '../src/types'

const chapter = (id: string, depth: number, timecode: number | null, title: string, speaker?: string): VideoChapter => ({
  id,
  depth,
  timecode,
  title,
  ...(speaker ? { speaker } : {})
})

// A sitting as the portal tells it: a text, its articles, who speaks, a suspension.
const CHAPTERS: VideoChapter[] = [
  chapter('1', 0, 0, 'Projet de loi de finances pour 2027'),
  chapter('2', 1, 60_000, 'Article 17'),
  chapter('3', 2, 90_000, 'M. Daniel Labaronne', 'Daniel Labaronne'),
  chapter('4', 2, null, 'M. Jean Untimed', 'Jean Untimed'),
  chapter('5', 2, 200_000, 'Suspension'),
  chapter('6', 2, 500_000, 'M. Jean-Philippe Tanguy', 'Jean-Philippe Tanguy'),
  chapter('7', 1, 700_000, 'Article 18')
]

describe('a video in the player', () => {
  it('times the chapters at the player’s time, the untimed ones left out', () => {
    const lines = mediaChapters({ chapters: CHAPTERS, offsetMs: 30_000 })
    expect(lines.map((c) => c.id)).toEqual(['1', '2', '3', '5', '6', '7'])
    expect(lines[0]).toEqual({ id: '1', at: 0, title: 'Projet de loi de finances pour 2027', depth: 0 })
    expect(lines[2]).toEqual({ id: '3', at: 60_000, title: 'M. Daniel Labaronne', depth: 2, speaker: 'Daniel Labaronne' })
  })

  it('darkens the suspensions until the sitting resumes; a live’s last one up to the edge', () => {
    const lines = mediaChapters({ chapters: CHAPTERS, offsetMs: 0 })
    expect(suspensions(lines, 900_000)).toEqual([{ from: 200_000, to: 500_000 }])
    const live = lines.slice(0, 4)
    expect(suspensions(live, 260_000)).toEqual([{ from: 200_000, to: 260_000 }])
    expect(suspensions(live, 0)).toEqual([])
  })

  it('snaps a clip on the intervention said at a moment, never on a suspension', () => {
    const lines = mediaChapters({ chapters: CHAPTERS, offsetMs: 0 })
    expect(snapAt(lines, 120_000, 900_000)).toEqual({ from: 90_000, to: 200_000 })
    expect(snapAt(lines, 600_000, 900_000)).toEqual({ from: 500_000, to: 700_000 })
    expect(snapAt(lines, 300_000, 900_000)).toBeNull()
    expect(snapAt(lines, 800_000, 900_000)).toEqual({ from: 700_000, to: 900_000 })
  })

  it('keeps clips at the portal’s time, and shows this video’s at the player’s', () => {
    const v = { id: 'V1', chamber: 'se' as const, offsetMs: 30_000, title: 'Séance publique', date: '2026-10-28T14:30:00+01:00', thumbnail: 't.jpg' }
    const clip = clipOf(v, { from: 60_000.4, to: 120_000, title: '  ' }, 'c1', new Date('2026-10-30T10:00:00Z'))
    expect(clip).toEqual({
      id: 'c1',
      video: 'V1',
      chamber: 'se',
      title: 'Séance publique',
      videoTitle: 'Séance publique',
      date: v.date,
      start: 90_000,
      end: 150_000,
      thumbnail: 't.jpg',
      createdAt: '2026-10-30T10:00:00.000Z'
    })
    const other: Clip = { ...clip, id: 'c2', video: 'V2' }
    const assembly: Clip = { ...clip, id: 'c3', chamber: 'an' }
    expect(keptOf([clip, other, assembly], v)).toEqual([{ from: 60_000, to: 120_000 }])
  })

  it('links to the portal’s page, at a moment or where a clip starts', () => {
    expect(shareLink({ id: '19655971_6ae44b8fc51ef', chamber: 'an', offsetMs: 0 }, null)).toBe(
      'https://videos.assemblee-nationale.fr/video.19655971_6ae44b8fc51ef'
    )
    expect(shareLink({ id: '19655971_6ae44b8fc51ef', chamber: 'an', offsetMs: 0 }, 61_000)).toBe(
      'https://videos.assemblee-nationale.fr/video.19655971_6ae44b8fc51ef?timecode=61000'
    )
    expect(shareLink({ id: '5979506_6ae25732cc856', chamber: 'se', offsetMs: 30_000 }, 0, { from: 60_000, to: 90_000 })).toBe(
      'https://videos.senat.fr/video.5979506_6ae25732cc856?timecode=90000'
    )
  })

  it('writes the line to share: subject, speaker, chamber, day, and when', () => {
    const lines = mediaChapters({ chapters: CHAPTERS, offsetMs: 0 })
    const v = { chamber: 'an' as const, title: '1re séance du vendredi 30 octobre 2026', date: '2026-10-30T09:00:00+01:00' }
    const when = (ms: number) => `${ms / 1000}s`
    expect(shareLine(v, lines, 'U', 100_000, undefined, when)).toBe('Article 17, Daniel Labaronne, Assemblée nationale, 30 octobre 2026, à 100s : U')
    expect(shareLine(v, lines, 'U', null, undefined, when)).toBe('1re séance du vendredi 30 octobre 2026, Assemblée nationale, 30 octobre 2026 : U')
    expect(shareLine(v, lines, 'U', 90_000, { from: 90_000, to: 120_000, title: 'Article 17 · Daniel Labaronne' }, when)).toBe(
      'Article 17, Daniel Labaronne, Assemblée nationale, 30 octobre 2026, de 90s à 120s : U'
    )
    expect(shareLine(v, lines, 'U', 70_000, { from: 70_000, to: 80_000, title: '' }, when)).toBe(
      'Article 17, Assemblée nationale, 30 octobre 2026, de 70s à 80s : U'
    )
  })

  it('finds a video’s live by its video or its channel, never by its kind', () => {
    const stream = (s: Partial<LiveStream>): LiveStream => ({
      id: 'S',
      chamber: 'an',
      organ: 'Séance publique',
      start: '',
      startAt: '',
      title: '',
      subject: '',
      place: '',
      live: true,
      hls: '',
      mirrors: [],
      poster: '',
      url: '',
      ...s
    })
    const committee = stream({ id: 'C', organ: 'Commission des finances', channel: '4' })
    const sitting = stream({ id: 'H', channel: '36', video: 'V2' })
    const v = { id: 'V1', chamber: 'an' as const, channel: '36' }
    expect(streamOf([committee, sitting], v)?.id).toBe('H')
    expect(streamOf([committee, sitting], { ...v, id: 'V2', channel: '' })?.id).toBe('H')
    expect(streamOf([committee], { ...v, channel: '' })).toBeNull()
    expect(streamOf([{ ...sitting, live: false }], v)).toBeNull()
  })
})
