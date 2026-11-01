import { describe, expect, it } from 'vitest'
import { LiveStore } from '../../src/renderer/src/lib/live-store'

/** A list of the main process's, its event and the session's, answered by hand as the main process would. */
function fake() {
  const listeners = new Set<(v: string[]) => void>()
  const sessionListeners = new Set<() => void>()
  const pending: Array<(v: string[]) => void> = []
  return {
    load: () => new Promise<string[]>((resolve) => pending.push(resolve)),
    listen: (cb: (v: string[]) => void) => (listeners.add(cb), () => void listeners.delete(cb)),
    onSession: (cb: () => void) => (sessionListeners.add(cb), () => void sessionListeners.delete(cb)),
    listeners,
    pending,
    event: (v: string[]) => listeners.forEach((cb) => cb(v)),
    session: () => sessionListeners.forEach((cb) => cb())
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('a value of the main process’s, one copy for the window', () => {
  it('hears its event once, however many components show it, and tells them all', async () => {
    const api = fake()
    const store = new LiveStore(api.load, api.listen)
    let told = 0
    // A conversation's tool lines: twenty of them.
    const offs = Array.from({ length: 20 }, () => store.subscribe(() => told++))
    expect(api.listeners.size).toBe(1)
    expect(api.pending).toHaveLength(1)
    expect(store.get()).toBeNull()
    api.pending[0](['meteo'])
    await tick()
    expect(store.get()).toEqual(['meteo'])
    expect(told).toBe(20)
    // The same value until it changes, as useSyncExternalStore needs.
    expect(store.get()).toBe(store.get())
    api.event(['meteo', 'peage'])
    expect(store.get()).toEqual(['meteo', 'peage'])
    offs.forEach((off) => off())
    // Shown again later: no second subscription.
    store.subscribe(() => undefined)
    expect(api.listeners.size).toBe(1)
  })

  it('drops an answer asked for before the last event', async () => {
    const api = fake()
    const store = new LiveStore(api.load, api.listen)
    store.subscribe(() => undefined)
    api.event(['peage'])
    api.pending[0](['meteo'])
    await tick()
    expect(store.get()).toEqual(['peage'])
  })

  it('loads again when the session changes: the window outlives its accounts', async () => {
    const api = fake()
    const store = new LiveStore(api.load, api.listen, [api.onSession])
    store.subscribe(() => undefined)
    api.pending[0](['meteo'])
    await tick()
    api.session()
    expect(api.pending).toHaveLength(2)
    api.pending[1](['carte'])
    await tick()
    expect(store.get()).toEqual(['carte'])
  })
})
