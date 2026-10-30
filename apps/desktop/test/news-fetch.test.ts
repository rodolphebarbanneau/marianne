import type { LookupAddress } from 'node:dns'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCapped, fetchText, lasting, type Hop, type HopTransport } from '../src/main/http'

/**
 * The article reader's fetch (fetchCapped): only the open web, each redirect checked again, each
 * name resolved and refused when it leads to this computer or its network. And the data sources'
 * cache (fetchText). The network and the resolver are the test's.
 */

vi.mock('electron', () => ({ app: { getVersion: () => '0.0.0' }, net: {}, session: {} }))

const DNS: Record<string, string[]> = {
  'journal.fr': ['93.184.216.34'],
  'cdn.journal.fr': ['93.184.216.35', '2606:2800:220:1::1'],
  'piege.fr': ['127.0.0.1'],
  'box.piege.fr': ['192.168.1.1'],
  'moitie.piege.fr': ['93.184.216.36', '10.0.0.2'],
  'cgnat.piege.fr': ['100.64.0.1'],
  'ula.piege.fr': ['fd00::1'],
  localhost: ['127.0.0.1', '::1']
}

const resolve = (hostname: string, _o: { all: true }, callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => {
  const addresses = DNS[hostname] ?? (/^[\d.]+$|:/.test(hostname) ? [hostname] : null)
  if (!addresses) return callback(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }), [])
  callback(
    null,
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  )
}

/** Answers by URL: a page, or a redirect to `location`. */
function web(answers: Record<string, Partial<Hop>>) {
  const asked: string[] = []
  const transport: HopTransport = async (url) => {
    asked.push(url)
    const a = answers[url]
    if (!a) return { status: 404, type: '', bytes: Buffer.alloc(0), whole: true }
    return { status: 200, type: 'text/html', bytes: Buffer.from('<p>page</p>'), whole: true, ...a }
  }
  return { asked, transport }
}

const OPTS = { timeoutMs: 5000, maxBytes: 1000, accept: 'text/html' }

describe('the reader’s fetch', () => {
  it('reads a public page, its redirects followed by hand', async () => {
    const { asked, transport } = web({
      'https://journal.fr/a': { status: 301, location: '/b' },
      'https://journal.fr/b': { status: 302, location: 'https://cdn.journal.fr/b' },
      'https://cdn.journal.fr/b': {}
    })
    const got = await fetchCapped('https://journal.fr/a', OPTS, { transport, resolve })
    expect(got.bytes.toString()).toBe('<p>page</p>')
    expect(asked).toEqual(['https://journal.fr/a', 'https://journal.fr/b', 'https://cdn.journal.fr/b'])
  })

  it('refuses a redirect to this computer or its network, before asking it', async () => {
    for (const location of [
      'http://127.0.0.1:8080/admin',
      'http://[::1]/',
      'http://192.168.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost/'
    ]) {
      const { asked, transport } = web({ 'https://journal.fr/a': { status: 302, location } })
      const err = await fetchCapped('https://journal.fr/a', OPTS, { transport, resolve }).catch((e: Error) => e)
      expect(err).toBeInstanceOf(Error)
      expect(lasting(err)).toBe(true)
      expect(asked).toEqual(['https://journal.fr/a'])
    }
  })

  it('refuses a name that resolves to a private address, any of them', async () => {
    for (const host of ['piege.fr', 'box.piege.fr', 'moitie.piege.fr', 'cgnat.piege.fr', 'ula.piege.fr']) {
      const { asked, transport } = web({ [`https://${host}/`]: {} })
      await expect(fetchCapped(`https://${host}/`, OPTS, { transport, resolve })).rejects.toThrow(/mène à une adresse de cet ordinateur/)
      expect(asked).toEqual([])
    }
    // Through a redirect too.
    const { asked, transport } = web({ 'https://journal.fr/a': { status: 307, location: 'https://box.piege.fr/' } })
    await expect(fetchCapped('https://journal.fr/a', OPTS, { transport, resolve })).rejects.toThrow(/box\.piege\.fr/)
    expect(asked).toEqual(['https://journal.fr/a'])
  })

  it('refuses another scheme and too many redirects', async () => {
    const file = web({ 'https://journal.fr/a': { status: 302, location: 'file:///etc/passwd' } })
    await expect(fetchCapped('https://journal.fr/a', OPTS, { transport: file.transport, resolve })).rejects.toThrow(/pas du web/)
    const loop = web(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`https://journal.fr/${i}`, { status: 302, location: `/${i + 1}` }])))
    await expect(fetchCapped('https://journal.fr/0', OPTS, { transport: loop.transport, resolve })).rejects.toThrow(/trop de redirections/)
    expect(loop.asked).toHaveLength(6)
  })

  it('says which failures would be the same again', async () => {
    const { transport } = web({ 'https://journal.fr/503': { status: 503 } })
    expect(lasting(await fetchCapped('https://journal.fr/404', OPTS, { transport, resolve }).catch((e) => e))).toBe(true)
    expect(lasting(await fetchCapped('https://journal.fr/503', OPTS, { transport, resolve }).catch((e) => e))).toBe(false)
    const slow: HopTransport = async () => {
      throw Object.assign(new Error('délai'), { name: 'TimeoutError' })
    }
    const timedOut = await fetchCapped('https://journal.fr/a', OPTS, { transport: slow, resolve }).catch((e: Error) => e)
    expect((timedOut as Error).message).toMatch(/délai dépassé/)
    expect(lasting(timedOut)).toBe(false)
  })
})

describe('the data sources’ cache', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('gives each read an answer as recent as it asks, whoever asked first', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.parse('2026-10-30T15:00:00+01:00')
    vi.setSystemTime(start)
    let answers = 0
    vi.stubGlobal('fetch', async () => new Response(`answer ${++answers}`))
    const url = 'https://videos.example.fr/php/eventsearch.php?Date=30%2F10%2F2026'
    // The day's videos, kept 2 minutes by the recordings of a meeting.
    expect(await fetchText(url, { cacheMs: 120_000 })).toBe('answer 1')
    // 30 seconds later the lives, which take 20 seconds at most: asked again, not held to the 2 minutes.
    vi.setSystemTime(start + 30_000)
    expect(await fetchText(url, { cacheMs: 20_000 })).toBe('answer 2')
    expect(await fetchText(url, { cacheMs: 120_000 })).toBe('answer 2')
    vi.setSystemTime(start + 45_000)
    expect(await fetchText(url, { cacheMs: 20_000 })).toBe('answer 2')
    // An answer the 20-second reader left serves the 2-minute one as long as it is recent enough for it.
    vi.setSystemTime(start + 130_000)
    expect(await fetchText(url, { cacheMs: 120_000 })).toBe('answer 2')
    expect(await fetchText(url, { cacheMs: 20_000 })).toBe('answer 3')
    expect(await fetchText(url, { cacheMs: 0 })).toBe('answer 4')
    expect(answers).toBe(4)
  })
})
