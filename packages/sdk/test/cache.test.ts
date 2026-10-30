import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cached, forgetCached } from '../src/cache'
import { CallCache, callKey } from '../src/calls'

describe('cached, a service’s expensive call kept a while', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  /** A call that answers its argument and how many times it was asked. */
  const counted = () => {
    let n = 0
    const fn = vi.fn(async (what: string) => `${what} ${++n}`)
    return fn
  }

  it('answers from the cache while it is fresh, without asking', async () => {
    const fn = counted()
    const days = cached(fn, { ttlMs: 60_000 })
    expect(await days('climat')).toBe('climat 1')
    vi.advanceTimersByTime(59_000)
    expect(await days('climat')).toBe('climat 1')
    expect(fn).toHaveBeenCalledTimes(1)
    // Another argument is another call.
    expect(await days('budget')).toBe('budget 2')
  })

  it('gives the old answer at once once stale, and the new one to the next call', async () => {
    const fn = counted()
    const days = cached(fn, { ttlMs: 1000, staleMs: 10_000 })
    await days('climat')
    vi.advanceTimersByTime(2000)
    expect(await days('climat')).toBe('climat 1')
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(await days('climat')).toBe('climat 2')
  })

  it('keeps the old answer when asking again behind it fails', async () => {
    let fail = false
    const days = cached(
      async () => {
        if (fail) throw new Error('hors ligne')
        return 'les titres'
      },
      { ttlMs: 1000, staleMs: 10_000 }
    )
    await days()
    fail = true
    vi.advanceTimersByTime(2000)
    expect(await days()).toBe('les titres')
    await vi.advanceTimersByTimeAsync(0)
    expect(await days()).toBe('les titres')
  })

  it('asks again, and waits, once past both; a failure then is the caller’s', async () => {
    let fail = false
    const fn = vi.fn(async () => {
      if (fail) throw new Error('hors ligne')
      return 'les titres'
    })
    const days = cached(fn, { ttlMs: 1000, staleMs: 1000 })
    await days()
    fail = true
    vi.advanceTimersByTime(2500)
    await expect(days()).rejects.toThrow('hors ligne')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('shares one asking between the calls that come while it is asked', async () => {
    let answer: (v: string) => void = () => undefined
    const fn = vi.fn(() => new Promise<string>((done) => (answer = done)))
    const days = cached(fn, { ttlMs: 1000 })
    const a = days()
    const b = days()
    await vi.advanceTimersByTimeAsync(0)
    answer('les titres')
    expect(await Promise.all([a, b])).toEqual(['les titres', 'les titres'])
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('doesn’t keep a failure', async () => {
    let fail = true
    const fn = vi.fn(async () => {
      if (fail) throw new Error('hors ligne')
      return 'les titres'
    })
    const days = cached(fn, { ttlMs: 60_000 })
    await expect(days()).rejects.toThrow('hors ligne')
    fail = false
    expect(await days()).toBe('les titres')
  })

  it('lets each answer go once past both, and the oldest first past its most', async () => {
    const fn = counted()
    const days = cached(fn, { ttlMs: 1000, staleMs: 1000, max: 2 })
    await days('a')
    await days('b')
    await days('a')
    // Three answers for two places: b, the least lately asked, is let go.
    await days('c')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(await days('a')).toBe('a 1')
    expect(await days('b')).toBe('b 4')
    // Past both, nothing is kept: the timers let it go.
    vi.advanceTimersByTime(2001)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keys by what the service says, and forgets one call or all of them', async () => {
    const fn = vi.fn(async (id: string, all: boolean) => `${id} ${all}`)
    const days = cached(fn, { ttlMs: 60_000, key: (id) => id })
    await days('climat', false)
    // The same key: the answer kept, though the arguments differ.
    expect(await days('climat', true)).toBe('climat false')
    days.clear('climat', true)
    expect(await days('climat', true)).toBe('climat true')
    await days('budget', true)
    days.clear()
    expect(vi.getTimerCount()).toBe(0)
    await days('budget', true)
    expect(fn).toHaveBeenCalledTimes(4)
  })
})

describe('cached, at the lock', () => {
  it('lets go of every cache’s answers, and keeps none of those still being asked', async () => {
    let answer: (v: string) => void = () => undefined
    const slow = vi.fn(() => new Promise<string>((done) => (answer = done)))
    const fast = vi.fn(async () => 'les sources de l’utilisateur')
    const a = cached(slow, { ttlMs: 60_000 })
    const b = cached(fast, { ttlMs: 60_000 })
    await b()
    const asked = a()
    await Promise.resolve()
    forgetCached()
    // Asked before the lock: the caller has it, the cache doesn't keep it.
    answer('le compte d’avant')
    expect(await asked).toBe('le compte d’avant')
    await b()
    expect(fast).toHaveBeenCalledTimes(2)
    void a()
    await Promise.resolve()
    expect(slow).toHaveBeenCalledTimes(2)
  })
})

describe('what a screen’s calls answered', () => {
  it('gives the last answer to a call, and none to a call not made', () => {
    const calls = new CallCache()
    expect(calls.get(callKey('days', '["climat"]'))).toBeNull()
    calls.set(callKey('days', '["climat"]'), ['lundi'])
    calls.set(callKey('days', '["climat"]'), ['mardi'])
    expect(calls.get(callKey('days', '["climat"]'))).toEqual({ value: ['mardi'] })
    // An answer that is nothing is still an answer.
    calls.set(callKey('subject', '["x"]'), null)
    expect(calls.get(callKey('subject', '["x"]'))).toEqual({ value: null })
  })

  it('keeps the last asked, letting the oldest go', () => {
    const calls = new CallCache(2)
    calls.set('a', 1)
    calls.set('b', 2)
    calls.get('a')
    calls.set('c', 3)
    expect(calls.size).toBe(2)
    expect(calls.get('b')).toBeNull()
    expect(calls.get('a')).toEqual({ value: 1 })
    expect(calls.get('c')).toEqual({ value: 3 })
  })
})
