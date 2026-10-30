import { describe, expect, it } from 'vitest'
import { pollDelay } from '../src/ui/common'

// When the screen's pollers (the lives, a live's video, the agenda) ask the main side again.

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
