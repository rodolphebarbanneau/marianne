import { readManifest } from '@marianne/sdk'
import { describe, expect, it, vi } from 'vitest'
import { STORAGE_QUOTA, logLine, RateLimit } from '../src/main/community/runtime/limits'
import {
  blockedAddress,
  communityHttp,
  guardedLookup,
  IN_FLIGHT,
  serviceFetch,
  serviceHeaders,
  WAITING,
  type Exchange,
  type Transport
} from '../src/main/community/runtime/net'
import { quotaStorage, type RecordStore } from '../src/main/host/storage'

/** A community service's network, held to its declared hosts at every redirect and every address; its storage, to its quota. */

const manifest = readManifest({
  name: '@marianne/service-bonjour',
  version: '1.0.0',
  marianne: { code: 'bonjour', name: 'Bonjour', description: 'un salut', category: 'culture', hosts: ['api.example.fr', 'cdn.example.fr'], tools: [] }
})

/** A transport that answers by URL, recording what it was asked. */
function transport(answers: Record<string, Partial<Exchange>>, wait = 0) {
  const asked: Array<{ url: string; method: string; body?: string; headers: Record<string, string>; timeoutMs: number }> = []
  const t: Transport = async (url, init) => {
    asked.push({ url: url.href, method: init.method, body: init.body, headers: init.headers, timeoutMs: init.timeoutMs })
    if (wait) await new Promise((r) => setTimeout(r, wait))
    const a = answers[url.href]
    if (!a) throw new Error('unexpected request')
    return { status: 200, headers: {}, body: Buffer.alloc(0), ...a }
  }
  return { t, asked }
}

describe('a community service’s addresses', () => {
  it('never this computer, its network, nor the reserved ranges', () => {
    for (const a of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.10',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fe80::1',
      'fd12:3456::1',
      '::ffff:127.0.0.1',
      '224.0.0.1'
    ])
      expect(blockedAddress(a), a).toBe(true)
    for (const a of ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946', '8.8.8.8']) expect(blockedAddress(a), a).toBe(false)
    expect(blockedAddress('not an address')).toBe(true)
  })

  it('refuses a name that resolves to one of them, after resolution', async () => {
    const lookup = guardedLookup((host, _o, cb) =>
      cb(
        null,
        host === 'rebind.example.fr'
          ? [
              { address: '93.184.216.34', family: 4 },
              { address: '127.0.0.1', family: 4 }
            ]
          : [{ address: '93.184.216.34', family: 4 }]
      )
    )
    const ask = (host: string) =>
      new Promise<unknown>((resolve) => lookup(host, {}, (err: unknown, address: unknown) => resolve(err ? (err as Error & { code: string }).code : address)))
    expect(await ask('api.example.fr')).toBe('93.184.216.34')
    expect(await ask('rebind.example.fr')).toBe('EADDRBLOCKED')
  })
})

describe('a community service’s requests', () => {
  it('follow a redirect only to a declared host, over https, five at most', async () => {
    const { t, asked } = transport({
      'https://api.example.fr/a': { status: 302, headers: { location: 'https://cdn.example.fr/b' } },
      'https://cdn.example.fr/b': { status: 200, body: Buffer.from('{"ok":1}') },
      'https://api.example.fr/out': { status: 301, headers: { location: 'http://192.168.1.1/admin' } },
      'https://api.example.fr/away': { status: 302, headers: { location: 'https://evil.example.com/' } },
      'https://api.example.fr/loop': { status: 302, headers: { location: '/loop' } }
    })
    const got = await serviceFetch(manifest, 'https://api.example.fr/a', { method: 'GET', headers: {} }, t)
    expect(got).toMatchObject({ status: 200, url: 'https://cdn.example.fr/b' })
    await expect(serviceFetch(manifest, 'https://api.example.fr/out', { method: 'GET', headers: {} }, t)).rejects.toThrow('une redirection mène à 192.168.1.1')
    await expect(serviceFetch(manifest, 'https://api.example.fr/away', { method: 'GET', headers: {} }, t)).rejects.toThrow(
      'une redirection mène à evil.example.com, qu’il n’a pas déclaré.'
    )
    await expect(serviceFetch(manifest, 'https://api.example.fr/loop', { method: 'GET', headers: {} }, t)).rejects.toThrow('trop de redirections')
    expect(asked.filter((a) => a.url === 'https://api.example.fr/loop')).toHaveLength(6)
    expect(asked.some((a) => !a.url.startsWith('https://api.example.fr') && !a.url.startsWith('https://cdn.example.fr'))).toBe(false)
  })

  it('are done within one deadline, their redirects included', async () => {
    const { t, asked } = transport({ 'https://api.example.fr/loop': { status: 302, headers: { location: '/loop' } } }, 30)
    await expect(serviceFetch(manifest, 'https://api.example.fr/loop', { method: 'GET', headers: {}, timeoutMs: 70 }, t)).rejects.toThrow('délai dépassé')
    // Each hop gets what is left of it, never the whole again; none once it is spent.
    expect(asked.length).toBeLessThan(4)
    expect(asked[1].timeoutMs).toBeLessThan(asked[0].timeoutMs)
    // And never more than a minute, whatever it asks.
    const slow = transport({ 'https://api.example.fr/a': { status: 200 } })
    await serviceFetch(manifest, 'https://api.example.fr/a', { method: 'GET', headers: {}, timeoutMs: 3_600_000 }, slow.t)
    expect(slow.asked[0].timeoutMs).toBeLessThanOrEqual(60_000)
  })

  it('never send a body again: a 303 goes on as a GET, a 307 with a body is refused', async () => {
    const { t, asked } = transport({
      'https://api.example.fr/post': { status: 303, headers: { location: 'https://api.example.fr/done' } },
      'https://api.example.fr/done': { status: 200 },
      'https://api.example.fr/keep': { status: 307, headers: { location: 'https://cdn.example.fr/keep' } }
    })
    await serviceFetch(manifest, 'https://api.example.fr/post', { method: 'POST', headers: {}, body: 'secret=1' }, t)
    expect(asked.at(-1)).toMatchObject({ url: 'https://api.example.fr/done', method: 'GET', body: undefined })
    await expect(serviceFetch(manifest, 'https://api.example.fr/keep', { method: 'POST', headers: {}, body: 'secret=1' }, t)).rejects.toThrow(
      'envoyer à nouveau sa requête'
    )
  })

  it('say which address was refused, and refuse an undeclared one before any request', async () => {
    const { t, asked } = transport({})
    await expect(serviceFetch(manifest, 'https://evil.example.com/', { method: 'GET', headers: {} }, t)).rejects.toThrow(
      '3615 BONJOUR n’a pas déclaré evil.example.com'
    )
    const blocked: Transport = async () => {
      throw Object.assign(new Error('api.example.fr mène à une adresse de cet ordinateur ou de son réseau'), { code: 'EADDRBLOCKED' })
    }
    await expect(serviceFetch(manifest, 'https://api.example.fr/', { method: 'GET', headers: {} }, blocked)).rejects.toThrow('Marianne ne l’y laisse pas aller')
    expect(asked).toEqual([])
  })

  it('carry neither its own Host nor hop-by-hop headers, and keep their cache to themselves', async () => {
    expect(
      serviceHeaders({ Host: 'localhost', Connection: 'upgrade', 'Transfer-Encoding': 'chunked', 'Proxy-Authorization': 'x', 'X-Api-Key': 'k', Accept: 'a' })
    ).toEqual({ 'X-Api-Key': 'k', Accept: 'a' })
    const { t, asked } = transport({ 'https://api.example.fr/data': { status: 200, body: Buffer.from('{"n":1}') } })
    const other = readManifest({
      name: '@marianne/service-autre',
      version: '1.0.0',
      marianne: { code: 'autre', name: 'Autre', description: 'x', category: 'culture', hosts: ['api.example.fr'], tools: [] }
    })
    const ua = () => 'Marianne/test'
    expect(await communityHttp(manifest, ua, t).json('https://api.example.fr/data')).toEqual({ n: 1 })
    expect(await communityHttp(manifest, ua, t).json('https://api.example.fr/data')).toEqual({ n: 1 })
    expect(asked).toHaveLength(1)
    // Another service's request is its own, not the first one's cached answer.
    await communityHttp(other, ua, t).json('https://api.example.fr/data')
    expect(asked).toHaveLength(2)
  })
})

describe('a community service’s requests in flight', () => {
  it('are a few at once, its pictures included, a few more in line, and the rest refused', async () => {
    const pending: Array<() => void> = []
    let inFlight = 0
    let most = 0
    const slow: Transport = async () => {
      inFlight++
      most = Math.max(most, inFlight)
      await new Promise<void>((resolve) => pending.push(resolve))
      inFlight--
      return { status: 200, headers: {}, body: Buffer.from('{}') }
    }
    const http = communityHttp(manifest, () => 'Marianne/test', slow)
    const asks = Array.from({ length: 40 }, (_, i) =>
      http.json(`https://api.example.fr/n/${i}`, { cacheMs: 0 }).then(
        () => 'ok',
        (e: Error) => e.message
      )
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(inFlight).toBe(IN_FLIGHT)
    while (pending.length) {
      pending.shift()!()
      await new Promise((r) => setTimeout(r, 1))
    }
    const results = await Promise.all(asks)
    expect(most).toBe(IN_FLIGHT)
    expect(results.filter((r) => r === 'ok')).toHaveLength(IN_FLIGHT + WAITING)
    expect(results.filter((r) => r !== 'ok')[0]).toBe('3615 BONJOUR a trop de requêtes en cours : Marianne en laisse passer moins.')
  })

  it('keep a cache within its size: the oldest answers go first', async () => {
    const big = 'x'.repeat(1.5 * 1024 * 1024)
    const { t, asked } = transport(
      Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`https://cdn.example.fr/${i}`, { status: 200, body: Buffer.from(JSON.stringify(big)) }]))
    )
    const http = communityHttp(manifest, () => 'Marianne/test', t)
    for (let i = 0; i < 8; i++) await http.json(`https://cdn.example.fr/${i}`)
    // 1.5 MB answers, 3 MB each as kept: five fit in 16 MB; the first ones were let go.
    await http.json('https://cdn.example.fr/7')
    await http.json('https://cdn.example.fr/0')
    expect(asked.filter((a) => a.url === 'https://cdn.example.fr/7')).toHaveLength(1)
    expect(asked.filter((a) => a.url === 'https://cdn.example.fr/0')).toHaveLength(2)
  })
})

describe('a community service’s bounds', () => {
  it('stores within its quota: its records, their size', () => {
    const records = new Map<string, unknown>()
    const store: RecordStore = {
      get: <T>(_kind: string, id: string) => (records.has(id) ? (records.get(id) as T) : null),
      put: (_kind, id, value) => void records.set(id, value),
      remove: (_kind, id) => void records.delete(id),
      ids: () => [...records.keys()]
    }
    const stored = vi.fn()
    const s = quotaStorage('bonjour', '3615 BONJOUR', () => store, stored, { records: 3, bytes: 100 })
    s.set('a', 'x'.repeat(40))
    s.set('b', 1)
    s.set('a', 'y'.repeat(40))
    expect(() => s.set('c', 'z'.repeat(60))).toThrow('3615 BONJOUR garde déjà 0 Mo de données : il n’en garde pas davantage.')
    s.set('c', 2)
    expect(() => s.set('d', 3)).toThrow('3615 BONJOUR garde déjà 3 données : il n’en garde pas davantage.')
    s.remove('c')
    s.set('d', 3)
    expect([...records.keys()].sort()).toEqual(['a', 'b', 'd'])
    expect(stored).toHaveBeenCalledTimes(6)
    expect(STORAGE_QUOTA).toEqual({ records: 1000, bytes: 16 * 1024 * 1024 })
  })

  it('asks so often, and logs one line at a time', () => {
    const limit = new RateLimit(10, 20)
    let allowed = 0
    for (let i = 0; i < 100; i++) if (limit.take(1000)) allowed++
    expect(allowed).toBe(20)
    expect(limit.take(2000)).toBe(true)
    expect(logLine(`un\ndeux\r\n[3615 AUTRE] faux\u0000`)).toBe('un deux [3615 AUTRE] faux ')
  })
})
