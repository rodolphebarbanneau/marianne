import type { PinnedMedia } from '@marianne/sdk/media'
import { describe, expect, it } from 'vitest'
import { AUTO_PIN_MS, backTo, PinnedDesk, roomBeside } from '../../src/renderer/src/app/pinned'

/** Timers run by hand. */
function clock() {
  let next = 1
  const due = new Map<number, () => void>()
  return {
    timers: {
      set: (fn: () => void, ms: number) => {
        expect(ms).toBe(AUTO_PIN_MS)
        due.set(next, fn)
        return next++
      },
      clear: (h: unknown) => void due.delete(h as number)
    },
    run: () => {
      for (const [h, fn] of [...due]) {
        due.delete(h)
        fn()
      }
    },
    waiting: () => due.size
  }
}

const video = (src = 'https://videos.example.fr/a.m3u8', at = 60_000): PinnedMedia => ({
  src,
  title: 'Séance',
  at,
  route: 'service:parlement',
  params: { video: 'a' }
})

function deskOf() {
  const c = clock()
  const seen: Array<PinnedMedia | null> = []
  const desk = new PinnedDesk((item) => seen.push(item), c.timers)
  return { desk, seen, ...c }
}

describe('the mini-player', () => {
  it('shows a video pinned with its key at once, and hands it back where it is', () => {
    const { desk, seen } = deskOf()
    desk.pin(video())
    expect(desk.item?.src).toBe('https://videos.example.fr/a.m3u8')
    expect(desk.position).toBe(60_000)
    desk.time(75_500)
    expect(desk.take('https://videos.example.fr/other.m3u8')).toBeNull()
    expect(desk.take('https://videos.example.fr/a.m3u8')).toBe(75_500)
    expect(desk.item).toBeNull()
    expect(seen).toEqual([video(), null])
    expect(desk.take('https://videos.example.fr/a.m3u8')).toBeNull()
  })

  it('waits a moment before showing a video whose page left: the same page back at once takes it, and nothing shows', () => {
    const { desk, seen, run, waiting } = deskOf()
    desk.pin(video(), { auto: true })
    expect(desk.item).toBeNull()
    expect(desk.take('https://videos.example.fr/a.m3u8')).toBe(60_000)
    expect(waiting()).toBe(0)
    run()
    expect(seen).toEqual([])
    // Not taken back: it shows.
    desk.pin(video(), { auto: true })
    run()
    expect(desk.item).toEqual(video())
  })

  it('shows the last one pinned; closed, it is gone', () => {
    const { desk, run } = deskOf()
    desk.pin(video('https://videos.example.fr/a.m3u8'))
    desk.pin(video('https://videos.example.fr/b.m3u8'), { auto: true })
    // The key pins at once and the one waiting is forgotten.
    desk.pin(video('https://videos.example.fr/c.m3u8'))
    run()
    expect(desk.item?.src).toBe('https://videos.example.fr/c.m3u8')
    desk.close()
    expect(desk.item).toBeNull()
    desk.time(5)
    expect(desk.position).toBe(60_000)
  })

  it('hands a video back only to whom it is, when that is asked: another service’s take leaves it be', () => {
    const { desk, run } = deskOf()
    const theirs = (it: PinnedMedia) => it.route === 'service:autre'
    desk.pin(video(), { auto: true })
    expect(desk.take('https://videos.example.fr/a.m3u8', theirs)).toBeNull()
    run()
    expect(desk.item?.src).toBe('https://videos.example.fr/a.m3u8')
    expect(desk.take('https://videos.example.fr/a.m3u8', theirs)).toBeNull()
    expect(desk.item?.src).toBe('https://videos.example.fr/a.m3u8')
    expect(desk.take('https://videos.example.fr/a.m3u8', (it) => it.route === 'service:parlement')).toBe(60_000)
    expect(desk.item).toBeNull()
  })

  it('goes back to the video’s page with its params and where it was', () => {
    expect(backTo(video(), 90_123.6)).toEqual({ route: 'service:parlement', params: { video: 'a', t: 90_124 } })
    expect(backTo({ ...video(), params: undefined }, -4)).toEqual({ route: 'service:parlement', params: { t: 0 } })
  })
})

describe('a view drawn over the window, beside the mini-player', () => {
  const box = { x: 200, y: 100, width: 1000, height: 700 }
  it('stops above it when it is low, below it when it is high, and is whole when it is elsewhere', () => {
    expect(roomBeside(box, null)).toEqual(box)
    expect(roomBeside(box, { x: 826, y: 560, width: 360, height: 226 })).toEqual({ ...box, height: 446 })
    expect(roomBeside(box, { x: 214, y: 60, width: 360, height: 226 })).toEqual({ ...box, y: 300, height: 500 })
    expect(roomBeside(box, { x: 10, y: 560, width: 150, height: 100 })).toEqual(box)
  })
})
