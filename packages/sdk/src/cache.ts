/**
 * A service's main side keeping what an expensive call answered, a while: a page that asks again
 * (a tab picked again, a screen opened again) is answered at once.
 *
 * - Fresh (`ttlMs`): answered from the cache, nothing asked.
 * - Stale (`staleMs` more): answered from the cache at once, and asked again behind it; the next
 *   call has the new answer. A failure then keeps the old one.
 * - Past both: asked, and waited for. Calls with the same key while one is asked share it.
 * - Each answer is let go when it is past both, so nothing of the user's stays in memory longer;
 *   and every one, of every cache, when the account locks (the next account isn't this user).
 *
 * The answers are given as they are, not copied: don't change them.
 */
export interface CachedOptions<A extends unknown[]> {
  /** Answered from the cache this long, ms. */
  ttlMs: number
  /** Then answered from the cache this much longer while it is asked again, ms. Default 0. */
  staleMs?: number
  /** A call's key; by default its arguments as JSON. */
  key?: (...args: A) => string
  /** At most this many answers kept, the last asked first. Default 64. */
  max?: number
}

export interface Cached<A extends unknown[], R> {
  (...args: A): Promise<R>
  /** Forget a call's answer (its arguments), or every answer (none given). */
  clear(...args: A | []): void
}

/** Every cache made: the lock empties them all. */
const made = new Set<() => void>()

/** Lets go of every answer `cached` keeps, and of those still being asked: Marianne calls it when the account locks. */
export function forgetCached(): void {
  for (const clear of made) clear()
}

interface Entry<R> {
  value: R
  at: number
  timer: ReturnType<typeof setTimeout>
}

export function cached<A extends unknown[], R>(fn: (...args: A) => R | Promise<R>, opts: CachedOptions<A>): Cached<A, R> {
  const ttl = Math.max(0, opts.ttlMs)
  const stale = Math.max(0, opts.staleMs ?? 0)
  const max = Math.max(1, opts.max ?? 64)
  const keyOf = opts.key ?? ((...args: A) => JSON.stringify(args))
  const entries = new Map<string, Entry<R>>()
  const asked = new Map<string, Promise<R>>()
  // Bumped by each clear: an answer asked before it isn't kept (it may be the account's that just locked).
  let era = 0

  const forget = (k: string) => {
    const e = entries.get(k)
    if (e) clearTimeout(e.timer)
    entries.delete(k)
  }
  const keep = (k: string, value: R) => {
    forget(k)
    while (entries.size >= max) forget(entries.keys().next().value!)
    const timer = setTimeout(() => entries.get(k) === entry && entries.delete(k), ttl + stale)
    ;(timer as { unref?: () => void }).unref?.()
    const entry = { value, at: Date.now(), timer }
    entries.set(k, entry)
  }
  const ask = (k: string, args: A): Promise<R> => {
    const going = asked.get(k)
    if (going) return going
    const from = era
    const p: Promise<R> = Promise.resolve()
      .then(() => fn(...args))
      .then((value) => {
        if (from === era) keep(k, value)
        return value
      })
      .finally(() => asked.get(k) === p && asked.delete(k))
    asked.set(k, p)
    return p
  }

  const call = ((...args: A) => {
    const k = keyOf(...args)
    const e = entries.get(k)
    const age = e ? Date.now() - e.at : Infinity
    if (e && age < ttl + stale) {
      // The last asked goes to the end: the first ones are those let go.
      entries.delete(k)
      entries.set(k, e)
    }
    if (e && age < ttl) return Promise.resolve(e.value)
    if (e && age < ttl + stale) {
      // Asked again behind the answer it gives: its failure keeps the old one.
      ask(k, args).catch(() => undefined)
      return Promise.resolve(e.value)
    }
    return ask(k, args)
  }) as Cached<A, R>
  call.clear = (...args: A | []) => {
    era++
    if (!args.length) {
      for (const k of [...entries.keys()]) forget(k)
      asked.clear()
    } else {
      const k = keyOf(...(args as A))
      forget(k)
      asked.delete(k)
    }
  }
  made.add(() => call.clear())
  return call
}
