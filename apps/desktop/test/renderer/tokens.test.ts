import { describe, expect, it } from 'vitest'
import type { TokenValue } from '../../src/shared/api'
import type { AccountInfo, SessionState } from '../../src/shared/types'
import { TokenStore, type TokenSource } from '../../src/renderer/src/lib/token-store'

/** Two accounts of one computer, with invented names. */
const VALUES: Record<string, TokenValue[]> = {
  a1: [{ token: 'nom', label: 'nom', value: 'Camille Exemple' }],
  b2: [{ token: 'nom', label: 'nom', value: 'Dominique Essai' }]
}

const account = (id: string) => ({ id }) as AccountInfo
const unlocked = (id: string): SessionState => ({ unlocked: true, account: account(id), pinAvailable: false })
const locked: SessionState = { unlocked: false, account: null, pinAvailable: false }

/** window.marianne's session, profile and values, answered by hand as the main process would. */
function fakeApi(start: SessionState) {
  let session = start
  const sessionListeners = new Set<(s: SessionState) => void>()
  const profileListeners = new Set<() => void>()
  /** The loads asked for, answered when the test says so. */
  const pending: Array<{ account: string | null; resolve: (v: TokenValue[]) => void; reject: (e: Error) => void }> = []
  const source: TokenSource = {
    getSession: async () => session,
    onSession: (cb) => (sessionListeners.add(cb), () => void sessionListeners.delete(cb)),
    onProfile: (cb) => (profileListeners.add(cb as () => void), () => void profileListeners.delete(cb as () => void)),
    tokenValues: () => new Promise((resolve, reject) => pending.push({ account: session.unlocked ? (session.account?.id ?? null) : null, resolve, reject }))
  }
  return {
    source,
    /** The account locks, or another opens: the main process's 'session' event. */
    session: (next: SessionState) => {
      session = next
      for (const cb of sessionListeners) cb(next)
    },
    profileChanged: () => {
      for (const cb of profileListeners) cb()
    },
    /** Answer the oldest load with the values of the account it was asked for. */
    answer: async () => {
      const load = pending.shift()
      if (!load) throw new Error('no load pending')
      load.resolve(load.account ? VALUES[load.account] : [])
      await Promise.resolve()
    },
    pending: () => pending.length
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('the token values', () => {
  it('load the open account’s values for the first screen that shows a token', async () => {
    const main = fakeApi(unlocked('a1'))
    const store = new TokenStore(main.source)
    let told = 0
    store.subscribe(() => told++)
    await settle()
    await main.answer()
    expect(store.get()).toEqual(VALUES.a1)
    expect(told).toBe(1)
  })

  it('are forgotten as soon as the account locks, and the next account shows its own', async () => {
    const main = fakeApi(unlocked('a1'))
    const store = new TokenStore(main.source)
    store.subscribe(() => undefined)
    await settle()
    await main.answer()
    main.session(locked)
    expect(store.get()).toEqual([])
    expect(main.pending()).toBe(0)
    main.session(unlocked('b2'))
    expect(store.get()).toEqual([])
    await main.answer()
    expect(store.get()).toEqual(VALUES.b2)
  })

  it('drop a load asked for the previous account that answers after the change', async () => {
    const main = fakeApi(unlocked('a1'))
    const store = new TokenStore(main.source)
    store.subscribe(() => undefined)
    await settle()
    // A's values are still on their way when A locks and B opens.
    main.session(locked)
    main.session(unlocked('b2'))
    await main.answer()
    expect(store.get()).toEqual([])
    await main.answer()
    expect(store.get()).toEqual(VALUES.b2)
  })

  it('load again when the profile changes, and keep their values through an event of the same account', async () => {
    const main = fakeApi(unlocked('a1'))
    const store = new TokenStore(main.source)
    store.subscribe(() => undefined)
    await settle()
    await main.answer()
    main.session(unlocked('a1'))
    expect(store.get()).toEqual(VALUES.a1)
    expect(main.pending()).toBe(0)
    main.profileChanged()
    expect(main.pending()).toBe(1)
  })

  it('ask nothing while locked', async () => {
    const main = fakeApi(locked)
    const store = new TokenStore(main.source)
    store.subscribe(() => undefined)
    await settle()
    main.profileChanged()
    expect(main.pending()).toBe(0)
    expect(store.get()).toEqual([])
  })
})
