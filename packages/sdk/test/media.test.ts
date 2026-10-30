import { describe, expect, it } from 'vitest'
import { chapterEnd, chapterIndexAt, clipTitleAt, parentIndex, saidAt, spanAt } from '../src/media/chapters'
import { keyAction, ownsKeys, SKIP_MS } from '../src/media/keys'
import { DEFAULT_PREFS, parsePrefs } from '../src/media/prefs'
import { clockTime, delay, duration, nextSpeed, readTime, speedLabel, timeWriter, videoTime } from '../src/media/time'
import { at, CLIP_MARGIN, cutsIn, msAt, segment, separatorMask, share, trackRange } from '../src/media/track'
import type { MediaChapter } from '../src/media/types'

/** The 1st sitting of 28 October 2026 opened at 13:46:28, Paris time (UTC+1 that day). */
const OPEN = Date.UTC(2026, 9, 28, 12, 46, 28)
const H = 3_600_000
const M = 60_000
const S = 1000

describe('the time of a video', () => {
  it('writes a long video’s positions with their hours, a short one’s without', () => {
    expect(videoTime(31 * M + 2 * S, 6 * H)).toBe('0:31:02')
    expect(videoTime(6 * H + 43 * M + 49 * S, 6 * H + 43 * M + 49 * S)).toBe('6:43:49')
    expect(videoTime(2 * M + 3 * S, 20 * M)).toBe('2:03')
    expect(videoTime(65 * M, 20 * M)).toBe('1:05:00')
    expect(videoTime(-5000, H)).toBe('0:00:00')
    expect(videoTime(999)).toBe('0:00')
  })

  it('writes a length and a delay behind the live edge short', () => {
    expect(duration(99 * S)).toBe('1:39')
    expect(duration(2 * H + 14 * M + 10 * S)).toBe('2:14:10')
    expect(delay(2 * H + 14 * M + 10 * S)).toBe('−2:14:10')
    expect(delay(12 * S)).toBe('−0:12')
  })

  it('reads the room’s clock in Paris, wherever the user is', () => {
    expect(clockTime(OPEN)).toBe('13:46:28')
    expect(clockTime(OPEN + 31 * M + 2 * S)).toBe('14:17:30')
    expect(clockTime(OPEN + 31 * M + 2 * S, false)).toBe('14:17')
    // Summer time: UTC+2.
    expect(clockTime(Date.UTC(2026, 6, 1, 7, 0, 0))).toBe('09:00:00')
  })

  it('writes moments in the mode chosen, the clock only when the video says when it began', () => {
    expect(timeWriter('heure', OPEN, 6 * H)(31 * M + 2 * S)).toBe('14:17:30')
    expect(timeWriter('heure', undefined, 6 * H)(31 * M + 2 * S)).toBe('0:31:02')
    expect(timeWriter('video', OPEN, 6 * H)(31 * M + 2 * S)).toBe('0:31:02')
  })

  it('reads a typed moment back, in the video’s time or on the clock', () => {
    expect(readTime('0:31:02')).toBe(31 * M + 2 * S)
    expect(readTime('31:02')).toBe(31 * M + 2 * S)
    expect(readTime(' 45 ')).toBe(45 * S)
    expect(readTime('125')).toBe(125 * S)
    expect(readTime('1:02,5')).toBe(62_500)
    expect(readTime('1:75')).toBeNull()
    expect(readTime('demain')).toBeNull()
    expect(readTime('14:17:30', OPEN)).toBe(31 * M + 2 * S)
    expect(readTime('14:17', OPEN)).toBe(30 * M + 32 * S)
    // A little before the start reads as the start; past midnight, the next day.
    expect(readTime('13:30', OPEN)).toBe(0)
    expect(readTime('00:15', OPEN)).toBe(10 * H + 28 * M + 32 * S)
    expect(readTime('45', OPEN)).toBeNull()
    expect(readTime('25:00', OPEN)).toBeNull()
  })

  it('steps through the speeds, and writes them the French way', () => {
    expect(nextSpeed(1, 1)).toBe(1.25)
    expect(nextSpeed(1, -1)).toBe(0.75)
    expect(nextSpeed(2, 1)).toBe(2)
    expect(nextSpeed(0.5, -1)).toBe(0.5)
    expect(nextSpeed(1.1, 1)).toBe(1.25)
    expect(nextSpeed(1.1, -1)).toBe(1)
    expect(speedLabel(1.5)).toBe('1,5×')
    expect(speedLabel(2)).toBe('2×')
  })
})

describe('the track', () => {
  it('spans the whole video, or the clip with three minutes on each side, within the video', () => {
    expect(trackRange(6 * H)).toEqual({ lo: 0, hi: 6 * H })
    expect(trackRange(0)).toEqual({ lo: 0, hi: 1 })
    expect(trackRange(6 * H, { from: 30 * M, to: 32 * M })).toEqual({ lo: 30 * M - CLIP_MARGIN, hi: 32 * M + CLIP_MARGIN })
    expect(trackRange(10 * M, { from: M, to: 9 * M })).toEqual({ lo: 0, hi: 10 * M })
  })

  it('places a moment, and finds the moment under the pointer, in the magnifier too', () => {
    const whole = trackRange(6 * H)
    expect(share(whole, 3 * H)).toBe(0.5)
    expect(share(whole, 7 * H)).toBe(1)
    expect(at(whole, 2 * H)).toBe('33.333%')
    expect(msAt(whole, 0.25)).toBe(1.5 * H)
    expect(msAt(whole, -1)).toBe(0)
    const zoom = trackRange(6 * H, { from: 30 * M, to: 32 * M })
    expect(share(zoom, 31 * M)).toBe(0.5)
    expect(msAt(zoom, 0)).toBe(27 * M)
    expect(msAt(zoom, 1)).toBe(35 * M)
    expect(share(zoom, 10 * M)).toBe(0)
  })

  it('draws a stretch clipped to what is in view, none when it is out of it', () => {
    const zoom = { lo: 100, hi: 200 }
    expect(segment(zoom, 120, 150)).toEqual({ left: 20, width: 30 })
    expect(segment(zoom, 0, 150)).toEqual({ left: 0, width: 50 })
    expect(segment(zoom, 150, 900)).toEqual({ left: 50, width: 50 })
    expect(segment(zoom, 0, 100)).toBeNull()
    expect(segment(zoom, 200, 300)).toBeNull()
    expect(segment(zoom, 150, 150)).toBeNull()
  })

  it('is cut by the agenda’s top lines, by every line in the magnifier', () => {
    const chapters: MediaChapter[] = [
      { at: 0, title: 'Questions au Gouvernement', depth: 0 },
      { at: 25, title: 'Prix des carburants', depth: 1 },
      { at: 50, title: 'Projet de loi de finances', depth: 0 }
    ]
    expect(cutsIn(chapters, { lo: 0, hi: 100 })).toEqual([50])
    expect(cutsIn(chapters, { lo: 0, hi: 100 }, true)).toEqual([25, 50])
    expect(cutsIn(chapters, { lo: 30, hi: 70 }, true)).toEqual([50])
    expect(separatorMask([])).toBe('linear-gradient(#000, #000)')
    expect(separatorMask([50])).toBe('linear-gradient(90deg, #000 0% calc(50% - 2px), transparent calc(50% - 2px) calc(50% + 3px), #000 calc(50% + 3px) 100%)')
  })
})

describe('the chapters', () => {
  const chapters: MediaChapter[] = [
    { at: 0, title: 'Questions au Gouvernement', depth: 0 },
    { at: 10, title: 'Prix des carburants', depth: 1 },
    { at: 10, title: 'M. Pierre-Henri Carbonnel', speaker: 'M. Pierre-Henri Carbonnel', depth: 2 },
    { at: 20, title: 'Mme Maud Bregeon, ministre', speaker: 'Mme Maud Bregeon, ministre', depth: 2 },
    { at: 30, title: 'Dégâts des précipitations', depth: 1 },
    { at: 50, title: 'Suspension', depth: 0 }
  ]

  it('finds the deepest line at a moment, and what it is inside of', () => {
    expect(chapterIndexAt(chapters, -1)).toBe(-1)
    expect(chapterIndexAt(chapters, 5)).toBe(0)
    expect(chapterIndexAt(chapters, 10)).toBe(2)
    expect(chapterIndexAt(chapters, 29)).toBe(3)
    expect(parentIndex(chapters, 3)).toBe(1)
    expect(parentIndex(chapters, 1)).toBe(0)
    expect(parentIndex(chapters, 0)).toBe(-1)
  })

  it('ends a line at the next one of its depth or less', () => {
    expect(chapterEnd(chapters, 2, 100)).toBe(20)
    expect(chapterEnd(chapters, 3, 100)).toBe(30)
    expect(chapterEnd(chapters, 1, 100)).toBe(30)
    expect(chapterEnd(chapters, 0, 100)).toBe(50)
    expect(chapterEnd(chapters, 5, 100)).toBe(100)
  })

  it('says the subject and the speaker: an intervention speaks in its parent', () => {
    expect(saidAt(chapters, 25)).toEqual({ chapter: chapters[3], subject: chapters[1], speaker: 'Mme Maud Bregeon, ministre' })
    expect(saidAt(chapters, 35)).toEqual({ chapter: chapters[4], subject: chapters[4], speaker: '' })
    expect(saidAt(chapters, -1)).toEqual({ chapter: null, subject: null, speaker: '' })
    expect(saidAt([{ at: 0, title: 'M. X', speaker: 'M. X', depth: 0 }], 1).subject).toBeNull()
  })

  it('gives an intervention’s span, and a clip’s title from where it starts', () => {
    expect(spanAt(chapters, 12, 100)).toEqual({ from: 10, to: 20 })
    expect(spanAt(chapters, 55, 100)).toEqual({ from: 50, to: 100 })
    expect(spanAt(chapters, -1, 100)).toBeNull()
    expect(clipTitleAt(chapters, 12)).toBe('Prix des carburants · M. Pierre-Henri Carbonnel')
    expect(clipTitleAt(chapters, 31)).toBe('Dégâts des précipitations')
    expect(clipTitleAt([], 31)).toBe('')
  })
})

describe('the keyboard', () => {
  const k = (key: string, code?: string, more: object = {}) => ({ key, code, ...more })

  it('plays, moves, sets the sound and the speed', () => {
    expect(keyAction(k(' '))).toEqual({ type: 'toggle' })
    expect(keyAction(k('K'))).toEqual({ type: 'toggle' })
    expect(keyAction(k('ArrowLeft'))).toEqual({ type: 'skip', ms: -SKIP_MS })
    expect(keyAction(k('j'))).toEqual({ type: 'skip', ms: -SKIP_MS })
    expect(keyAction(k('l'))).toEqual({ type: 'skip', ms: SKIP_MS })
    expect(keyAction(k('ArrowUp'))).toEqual({ type: 'volume', step: 0.1 })
    expect(keyAction(k('ArrowDown'))).toEqual({ type: 'volume', step: -0.1 })
    expect(keyAction(k('m'))).toEqual({ type: 'mute' })
    expect(keyAction(k('f'))).toEqual({ type: 'fullscreen' })
    expect(keyAction(k('<'))).toEqual({ type: 'speed', step: -1 })
    expect(keyAction(k('>'))).toEqual({ type: 'speed', step: 1 })
  })

  it('goes to a tenth of the video by the digit keys, on a French keyboard too', () => {
    expect(keyAction(k('3', 'Digit3'))).toEqual({ type: 'seekShare', share: 0.3 })
    expect(keyAction(k('à', 'Digit0'))).toEqual({ type: 'seekShare', share: 0 })
    expect(keyAction(k('ç', 'Digit9'))).toEqual({ type: 'seekShare', share: 0.9 })
    expect(keyAction(k('5', 'Numpad5'))).toEqual({ type: 'seekShare', share: 0.5 })
  })

  it('has the keys of what the player offers only', () => {
    expect(keyAction(k('p'))).toBeNull()
    expect(keyAction(k('p'), { mini: true })).toEqual({ type: 'mini' })
    expect(keyAction(k('x'))).toBeNull()
    expect(keyAction(k('x'), { clips: true })).toEqual({ type: 'clip' })
    expect(keyAction(k('End'))).toBeNull()
    expect(keyAction(k('End'), { live: true })).toEqual({ type: 'live' })
    expect(keyAction(k('o'))).toBeNull()
    expect(keyAction(k('o'), { agenda: true })).toEqual({ type: 'agenda' })
  })

  it('sets the clip’s bounds by I and O while cutting, keeps it by Entrée, drops it by Échap', () => {
    const cutting = { clipping: true, clips: true, agenda: true }
    expect(keyAction(k('i'), cutting)).toEqual({ type: 'clipFrom' })
    expect(keyAction(k('O'), cutting)).toEqual({ type: 'clipTo' })
    expect(keyAction(k('Enter'), cutting)).toEqual({ type: 'clipKeep' })
    expect(keyAction(k('Escape'), cutting)).toEqual({ type: 'clipCancel' })
    expect(keyAction(k('i'))).toBeNull()
    expect(keyAction(k('Enter'))).toBeNull()
  })

  it('closes a menu by Échap, and leaves Échap to the page otherwise', () => {
    expect(keyAction(k('Escape'), { popup: true, clipping: true })).toEqual({ type: 'close' })
    expect(keyAction(k('Escape'))).toBeNull()
  })

  it('leaves the app’s shortcuts alone', () => {
    expect(keyAction(k('k', 'KeyK', { ctrlKey: true }))).toBeNull()
    expect(keyAction(k('ArrowDown', undefined, { ctrlKey: true }))).toBeNull()
    expect(keyAction(k('f', 'KeyF', { metaKey: true }))).toBeNull()
    expect(keyAction(k('F1'))).toBeNull()
    expect(keyAction(k('Tab'))).toBeNull()
  })

  it('leaves the keys typed in a field to it', () => {
    const field = { isContentEditable: false, closest: (sel: string) => (sel.includes('input') ? {} : null) }
    expect(ownsKeys(field as unknown as EventTarget)).toBe(true)
    expect(ownsKeys({ isContentEditable: false, closest: () => null } as unknown as EventTarget)).toBe(false)
    expect(ownsKeys(null)).toBe(false)
  })
})

describe('the preferences', () => {
  it('reads what is stored, each value checked, the defaults for the rest', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('not json')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('[1, 2]')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('{"time":"heure","volume":0.4,"muted":true,"corner":"tl"}')).toEqual({ time: 'heure', volume: 0.4, muted: true, corner: 'tl' })
    expect(parsePrefs('{"time":"clock","volume":3,"muted":"yes","corner":"middle"}')).toEqual({ ...DEFAULT_PREFS, volume: 1 })
    expect(parsePrefs('{"volume":-1}').volume).toBe(0)
    expect(parsePrefs('{"volume":null,"speed":2}')).toEqual(DEFAULT_PREFS)
  })
})
