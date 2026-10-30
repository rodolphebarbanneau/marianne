import { describe, expect, it } from 'vitest'
import { confirms, pollDelay } from '../src/ui/common'

// The screen's own rules: when its pollers (the lives, a live's video, the agenda) ask the main side again, which key confirms a field.

describe('asking again', () => {
  const at = { on: true, shown: true, loading: false, everyMs: 30_000 }

  it('asks again its period after the last answer, never while one is awaited', () => {
    expect(pollDelay({ ...at, sinceAnswer: 0 })).toBe(30_000)
    expect(pollDelay({ ...at, sinceAnswer: 12_000 })).toBe(18_000)
    // A slow portal: no second request on top of the first.
    expect(pollDelay({ ...at, loading: true, sinceAnswer: 45_000 })).toBeNull()
    expect(pollDelay({ ...at, on: false, sinceAnswer: 45_000 })).toBeNull()
  })

  it('rests out of sight, and asks at once back in sight when it is due', () => {
    expect(pollDelay({ ...at, shown: false, sinceAnswer: 300_000 })).toBeNull()
    expect(pollDelay({ ...at, sinceAnswer: 300_000 })).toBe(0)
    // Away a moment: the rest of its period.
    expect(pollDelay({ ...at, sinceAnswer: 20_000 })).toBe(10_000)
  })
})

describe('a field', () => {
  const key = (over: Partial<KeyboardEvent> = {}) => ({
    key: 'Enter',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    ...over
  })

  it('is confirmed by Enter alone, and leaves Marianne her shortcuts', () => {
    expect(confirms(key())).toBe(true)
    // Ctrl+Entrée: a new folder.
    expect([key({ ctrlKey: true }), key({ metaKey: true }), key({ altKey: true }), key({ shiftKey: true })].map(confirms)).toEqual([false, false, false, false])
    expect(confirms(key({ isComposing: true }))).toBe(false)
    expect(confirms(key({ key: 'a' }))).toBe(false)
  })
})
