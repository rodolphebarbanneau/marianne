import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, BrowserWindow: {}, webContents: {} }))
vi.mock('../src/main/chat', () => ({ chat: {} }))
vi.mock('../src/main/session', () => ({ session: {} }))

const { isUse, presence } = await import('../src/main/presence')

/** A presence on a clock the test moves, counting the postponements of the lock. */
function watched(state: { inFront: boolean; answering: boolean }) {
  const clock = { now: 0, touches: 0 }
  const p = presence({ now: () => clock.now, touch: () => clock.touches++, inFront: () => state.inFront, answering: () => state.answering })
  return { p, clock }
}

describe('the automatic lock', () => {
  it('counts any input to Marianne in front, but not the pointer only passing over her behind another window', () => {
    for (const type of ['mouseDown', 'mouseMove', 'mouseWheel', 'rawKeyDown', 'gestureScrollUpdate', 'touchStart']) expect(isUse(type, true)).toBe(true)
    expect(isUse('mouseMove', false)).toBe(false)
    expect(isUse('mouseEnter', false)).toBe(false)
    // A click or a scroll in her window behind another one is using it.
    expect(isUse('mouseDown', false)).toBe(true)
    expect(isUse('mouseWheel', false)).toBe(true)
    expect(isUse(undefined, true)).toBe(false)
  })

  it('is postponed by the user’s input, at most once every few seconds', () => {
    const state = { inFront: true, answering: false }
    const { p, clock } = watched(state)
    p.input('mouseMove')
    clock.now = 1_000
    p.input('mouseMove')
    p.input('rawKeyDown')
    expect(clock.touches).toBe(1)
    clock.now = 6_000
    p.input('mouseWheel')
    expect(clock.touches).toBe(2)
    // Behind another window, the pointer passing by does not keep the archive open.
    state.inFront = false
    clock.now = 20_000
    p.input('mouseMove')
    expect(clock.touches).toBe(2)
  })

  it('waits while Marianne answers, and not otherwise', () => {
    const state = { inFront: false, answering: true }
    const { p, clock } = watched(state)
    p.hold()
    state.answering = false
    p.hold()
    expect(clock.touches).toBe(1)
  })
})
