import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LONGEST_WAIT_MS, QUIET_MS, Waits } from '../src/wait'

describe('what a screen waits for', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  /** Paints come when the test says: a slow render holds the check back. */
  const started = () => {
    const paints: Array<() => void> = []
    const said: string[] = []
    const waits = new Waits(
      (what) => said.push(what),
      (then) => paints.push(then)
    )
    const done = vi.fn()
    const paint = () => paints.splice(0).forEach((then) => then())
    return { waits, done, paint, said }
  }

  it('is over at once when nothing is waited for', () => {
    const { waits, done } = started()
    waits.watch(done)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('waits for all of it', () => {
    const { waits, done, paint } = started()
    const a = waits.hold()
    const b = waits.hold()
    waits.watch(done)
    a()
    vi.advanceTimersByTime(QUIET_MS * 10)
    paint()
    expect(done).not.toHaveBeenCalled()
    b()
    vi.advanceTimersByTime(QUIET_MS)
    paint()
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('counts what comes after: an answer whose content loads more', () => {
    const { waits, done, paint } = started()
    const first = waits.hold()
    waits.watch(done)
    first()
    vi.advanceTimersByTime(QUIET_MS - 1)
    const second = waits.hold()
    vi.advanceTimersByTime(QUIET_MS * 10)
    paint()
    expect(done).not.toHaveBeenCalled()
    second()
    vi.advanceTimersByTime(QUIET_MS)
    paint()
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('isn’t over until what was just rendered has run, however long that takes', () => {
    const { waits, done, paint } = started()
    const first = waits.hold()
    waits.watch(done)
    first()
    vi.advanceTimersByTime(QUIET_MS)
    expect(done).not.toHaveBeenCalled()
    // The render was long; its effects start more just before the paint.
    const second = waits.hold()
    paint()
    expect(done).not.toHaveBeenCalled()
    second()
    vi.advanceTimersByTime(QUIET_MS)
    paint()
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('stops waiting at the longest, once', () => {
    const { waits, done, paint } = started()
    const stuck = waits.hold()
    waits.watch(done)
    vi.advanceTimersByTime(LONGEST_WAIT_MS - 1)
    expect(done).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(done).toHaveBeenCalledTimes(1)
    stuck()
    vi.advanceTimersByTime(QUIET_MS)
    paint()
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('counts a thing that came only once, and one that went away as come', () => {
    const { waits, done, paint } = started()
    const a = waits.hold()
    const b = waits.hold()
    waits.watch(done)
    a()
    a()
    vi.advanceTimersByTime(QUIET_MS)
    paint()
    expect(done).not.toHaveBeenCalled()
    b()
    vi.advanceTimersByTime(QUIET_MS)
    paint()
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('does nothing once stopped: the tab it watched was left', () => {
    const { waits, done, paint } = started()
    const a = waits.hold()
    const stop = waits.watch(done)
    a()
    vi.advanceTimersByTime(QUIET_MS)
    stop()
    paint()
    vi.advanceTimersByTime(LONGEST_WAIT_MS)
    expect(done).not.toHaveBeenCalled()
  })

  it('watches again for the next tab, what is still open counting', () => {
    const { waits, done, paint } = started()
    const first = vi.fn()
    waits.watch(first)
    expect(first).toHaveBeenCalledTimes(1)
    const b = waits.hold()
    waits.watch(done)
    expect(done).not.toHaveBeenCalled()
    b()
    vi.advanceTimersByTime(QUIET_MS)
    paint()
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('says what is coming, from what says so', () => {
    const { waits, said } = started()
    waits.hold()
    waits.hold('votre journée')
    expect(said).toEqual(['votre journée'])
  })
})
