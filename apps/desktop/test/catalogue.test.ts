import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { format } from 'node:util'
import { ICON_SIZE, pictureProblems } from '@marianne/sdk'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { CatalogueStore, DEV_CATALOGUE_ENV, INDEX_FILE, readIndex, SIGNATURE_FILE, verdictOf, type CatalogueOptions } from '../src/main/community/catalogue'
import { CATALOGUE_FORMAT, type CatalogueEntry, type CatalogueIndex } from '../src/shared/catalogue'

const INDEX_URL = 'https://community.example.test/index.json'
const FIXTURE = join(__dirname, 'fixtures', 'catalogue.json')
const RESERVED = new Set(['meteo', 'parlement'])
const root = mkdtempSync(join(tmpdir(), 'marianne-catalogue-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const pem = (key: KeyObject) => key.export({ type: 'spki', format: 'pem' }).toString()
const project = generateKeyPairSync('ed25519')
const stranger = generateKeyPairSync('ed25519')

const ICON = { palette: { v: 'vert', w: 'blanc' }, pixels: ['..vvvv..', '..vwwv..', 'vvvwwvvv', 'vwwwwwwv', 'vvvwwvvv', '..vwwv..', '..vvvv..', '........'] }

/** A right entry of the index, changed by `patch`. */
function entry(patch: Record<string, unknown> = {}): CatalogueEntry {
  return {
    code: 'pharmagarde',
    version: '1.3.0',
    name: 'Pharmacies de garde',
    description: 'la pharmacie de garde la plus proche',
    category: 'health',
    keywords: ['pharmacie'],
    author: 'Collectif Santé libre',
    hosts: ['www.data.gouv.fr'],
    links: [],
    connections: ['geo'],
    reads: [],
    tools: ['trouver la pharmacie de garde'],
    sync: false,
    icon: ICON,
    status: 'validated',
    recommended: true,
    published: '2026-10-12',
    file: { url: 'https://services.example.test/pharmagarde.3615', size: 48_000, sha256: 'a'.repeat(64) },
    ...patch
  } as CatalogueEntry
}

function index(services: unknown[], patch: Partial<CatalogueIndex> = {}): CatalogueIndex {
  return {
    format: CATALOGUE_FORMAT,
    published: '2026-10-29T06:00:00.000Z',
    expires: '2026-12-31T00:00:00.000Z',
    services: services as CatalogueEntry[],
    withdrawn: [],
    ...patch
  }
}

interface Published {
  data: Buffer
  signature: Buffer | null
  etag: string
}

const publish = (value: unknown, key: KeyObject | null = project.privateKey, etag = '"1"'): Published => {
  const data = Buffer.from(JSON.stringify(value))
  return { data, signature: key ? sign(null, data, key) : null, etag }
}

/** A store on its own folder (or `dir`), a fake network serving `remote()` and a log to read. */
function store(options: { remote?: () => Published | 'fail' | null; dir?: string; now?: () => number } & Partial<CatalogueOptions> = {}) {
  const lines: string[] = []
  const requests: Array<{ url: string; headers: Record<string, string> }> = []
  const dir = options.dir ?? mkdtempSync(join(root, 'store-'))
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    requests.push({ url: String(url), headers })
    const published = options.remote?.()
    if (published === 'fail') return new Response('oops', { status: 500 })
    if (!published) return new Response('Not Found', { status: 404 })
    if (String(url).endsWith('.sig'))
      return published.signature ? new Response(new Uint8Array(published.signature)) : new Response('Not Found', { status: 404 })
    if (headers['If-None-Match'] === published.etag) return new Response(null, { status: 304 })
    return new Response(new Uint8Array(published.data), { headers: { ETag: published.etag } })
  })
  const log =
    (level: string) =>
    (...args: unknown[]) =>
      void lines.push(`${level} ${format(...args)}`)
  const s = new CatalogueStore({
    url: INDEX_URL,
    signingKey: pem(project.publicKey),
    dir,
    reserved: RESERVED,
    userAgent: () => 'Marianne/test',
    isPackaged: true,
    env: {},
    fetch: fetch as unknown as typeof globalThis.fetch,
    log: { info: log('info'), warn: log('warn'), error: log('error') },
    ...options
  })
  const changes: string[] = []
  s.on('change', (state) => changes.push(state.status))
  vi.useFakeTimers()
  s.start()
  vi.useRealTimers()
  return { s, dir, lines, requests, fetch, changes }
}

describe('the index', () => {
  it('of the development fixture reads whole: every entry and its icon are right', () => {
    const { index: read, notes } = readIndex(JSON.parse(readFileSync(FIXTURE, 'utf8')), RESERVED)
    expect(notes).toEqual([])
    expect(read.services.length).toBe(72)
    expect(read.withdrawn.length).toBe(2)
    for (const e of read.services) expect(pictureProblems(e.icon, { width: ICON_SIZE, height: ICON_SIZE, exact: true }), e.code).toEqual([])
    expect(read.services.filter((e) => e.recommended).map((e) => e.code)).toEqual(['pharmagarde', 'air', 'velo', 'covoit'])
    expect(read.services.find((e) => e.code === 'budget')).toBeUndefined()
  })

  it('drops each entry that is not right, saying why, and keeps the others', () => {
    const wrong = [
      entry({ code: 'Pharma' }),
      entry({ code: 'a', version: 'v1' }),
      entry({ code: 'b', category: 'sport' }),
      entry({ code: 'c', name: ' ' }),
      entry({ code: 'd', hosts: ['https://www.data.gouv.fr'] }),
      entry({ code: 'e', reads: ['person.birthName'] }),
      entry({ code: 'f', icon: { ...ICON, pixels: ICON.pixels.slice(1) } }),
      entry({ code: 'g', status: 'trusted' }),
      entry({ code: 'h', published: '2026-02-30' }),
      entry({ code: 'i', file: { url: 'http://services.example.test/i.3615', size: 1, sha256: 'a'.repeat(64) } }),
      entry({ code: 'j', file: { url: 'https://services.example.test/j.3615', size: 6 * 1024 * 1024, sha256: 'a'.repeat(64) } }),
      entry({ code: 'k', file: { url: 'https://services.example.test/k.3615', size: 10, sha256: 'A'.repeat(64) } }),
      entry({ code: 'l', sync: 'yes' }),
      entry({ code: 'm', tools: [42] }),
      'not an entry'
    ]
    const { index: read, notes } = readIndex(index([...wrong, entry({ code: 'ok', extra: 'dropped' })]), RESERVED)
    expect(read.services.map((e) => e.code)).toEqual(['ok'])
    expect(read.services[0]).not.toHaveProperty('extra')
    expect(notes.length).toBe(wrong.length)
    expect(notes.join('\n')).toMatch(/"h" dropped: "published" must be a day/)
    expect(notes.join('\n')).toMatch(/"i" dropped: "file.url" must be an https:\/\/ URL/)
  })

  it('refuses a code listed twice, the code of a built-in service, and a file it withdraws', () => {
    const { index: read, notes } = readIndex(
      index(
        [
          entry({ code: 'velo' }),
          entry({ code: 'velo', version: '1.2.0' }),
          entry({ code: 'meteo' }),
          entry({ code: 'air', file: { url: 'https://x.example.test/air.3615', size: 9, sha256: 'b'.repeat(64) } }),
          entry()
        ],
        {
          withdrawn: [{ code: 'air', version: '1.3.0', sha256: 'b'.repeat(64), reason: 'Cette version envoyait l’adresse.' }]
        }
      ),
      RESERVED
    )
    expect(read.services.map((e) => e.code)).toEqual(['pharmagarde'])
    expect(read.withdrawn.map((w) => w.code)).toEqual(['air'])
    expect(notes.filter((n) => n.includes('"velo" dropped')).length).toBe(2)
    expect(notes.join('\n')).toMatch(/"meteo" dropped: it is the code of a service built into Marianne/)
    expect(notes.join('\n')).toMatch(/"air" dropped: the index withdraws its file/)
  })

  it('recommends validated services only', () => {
    const { index: read, notes } = readIndex(index([entry({ status: 'unvalidated', recommended: true })]), RESERVED)
    expect(read.services[0].recommended).toBe(false)
    expect(notes[0]).toMatch(/"recommended" ignored/)
  })

  it('is refused whole when it is of another format or not an index', () => {
    expect(() => readIndex(index([entry()], { format: 2 }), RESERVED)).toThrow(expect.objectContaining({ reason: 'format' }))
    expect(() => readIndex({ ...index([]), format: '1' }, RESERVED)).toThrow(expect.objectContaining({ reason: 'invalid' }))
    expect(() => readIndex([], RESERVED)).toThrow(/not a JSON object/)
    expect(() => readIndex({ format: 1, published: '2026-10-29', expires: '2026-12-31', services: [] }, RESERVED)).toThrow(/must be lists/)
    expect(() => readIndex({ ...index([]), expires: undefined }, RESERVED)).toThrow(/"expires" must be an ISO date/)
    expect(() => readIndex({ ...index([]), expires: '2026-10-01T00:00:00.000Z' }, RESERVED)).toThrow(/after "published"/)
  })

  it('gives a file its verdict by its code and its SHA-256', () => {
    const catalogue = {
      entries: [entry(), entry({ code: 'velo', status: 'unvalidated', file: { url: 'https://x.example.test/v.3615', size: 1, sha256: 'c'.repeat(64) } })],
      withdrawn: [{ code: 'pharmagarde', version: '1.2.0', sha256: 'd'.repeat(64), reason: 'Retirée.' }]
    }
    expect(verdictOf(catalogue, 'pharmagarde', 'a'.repeat(64))).toMatchObject({ verdict: 'validated', entry: { code: 'pharmagarde' } })
    expect(verdictOf(catalogue, 'velo', 'c'.repeat(64)).verdict).toBe('unvalidated')
    expect(verdictOf(catalogue, 'velo', 'a'.repeat(64))).toEqual({ verdict: 'outside' })
    expect(verdictOf(catalogue, 'pharmagarde', 'd'.repeat(64))).toEqual({ verdict: 'withdrawn', reason: 'Retirée.' })
    expect(verdictOf({ entries: [], withdrawn: [] }, 'pharmagarde', 'a'.repeat(64))).toEqual({ verdict: 'outside' })
  })
})

describe('the catalogue', () => {
  it('reads nothing while there is no community repository', () => {
    const { s, fetch, lines } = store({ url: null })
    expect(s.state(true)).toEqual({ status: 'none', entries: [], withdrawn: [] })
    expect(fetch).not.toHaveBeenCalled()
    expect(lines.join('\n')).toMatch(/no community repository yet/)
  })

  it('takes no index without the project’s key', async () => {
    const { s, fetch } = store({ signingKey: null, remote: () => publish(index([entry()])) })
    await s.check()
    expect(s.state(true).status).toBe('none')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('takes an index signed with the project’s key, keeps it, and uses it at the next start', async () => {
    const remote = publish(index([entry()]))
    const first = store({ remote: () => remote })
    expect(first.s.state().status).toBe('loading')
    await first.s.check()
    const state = first.s.state()
    expect(state).toMatchObject({ status: 'ready', entries: [{ code: 'pharmagarde' }], withdrawn: [] })
    expect(state.readAt).toBeTruthy()
    expect(first.requests.map((r) => r.url)).toEqual([INDEX_URL, `${INDEX_URL}.sig`])
    expect(first.requests[0].headers['User-Agent']).toBe('Marianne/test')
    expect(readFileSync(join(first.dir, INDEX_FILE))).toEqual(remote.data)
    expect(first.changes).toEqual(['loading', 'ready'])

    const next = store({ dir: first.dir, remote: () => null })
    expect(next.s.state()).toMatchObject({ status: 'ready', entries: [{ code: 'pharmagarde' }], readAt: state.readAt })
    expect(next.fetch).not.toHaveBeenCalled()
  })

  it('refuses an index signed with another key, or not signed', async () => {
    for (const remote of [publish(index([entry()]), stranger.privateKey), publish(index([entry()]), null)]) {
      const { s, dir, lines } = store({ remote: () => remote })
      await s.check()
      expect(s.state()).toMatchObject({ status: 'failed', entries: [], error: 'Le catalogue reçu n’est pas signé par le projet : Marianne ne l’a pas pris.' })
      expect(existsSync(join(dir, INDEX_FILE))).toBe(false)
      expect(lines.join('\n')).toMatch(/signature/)
    }
  })

  it('refuses an index of a newer format, signed or not', async () => {
    const { s } = store({ remote: () => publish(index([entry()], { format: CATALOGUE_FORMAT + 1 })) })
    await s.check()
    expect(s.state()).toMatchObject({ status: 'failed', error: 'Le catalogue reçu est d’un format plus récent : mettez Marianne à jour pour le lire.' })
  })

  it('keeps the entries it has when a reading fails', async () => {
    let remote: Published | 'fail' = publish(index([entry()]))
    const { s, changes } = store({ remote: () => remote })
    await s.check()
    remote = 'fail'
    await s.check()
    expect(s.state()).toMatchObject({
      status: 'failed',
      entries: [{ code: 'pharmagarde' }],
      error: 'Le catalogue de la communauté est injoignable pour le moment.'
    })
    expect(changes).toEqual(['loading', 'ready', 'failed'])
  })

  it('asks again with what it saw, and an unchanged index is current', async () => {
    let now = Date.parse('2026-10-29T08:00:00Z')
    const remote = publish(index([entry()]), project.privateKey, '"v1"')
    const { s, requests } = store({ remote: () => remote, now: () => now })
    await s.check()
    now += 3600_000
    await s.check()
    expect(requests[2].headers['If-None-Match']).toBe('"v1"')
    expect(requests.length).toBe(3)
    expect(s.state()).toMatchObject({ status: 'ready', entries: [{ code: 'pharmagarde' }], readAt: new Date(now).toISOString() })
  })

  it('never takes an index older than the one in use', async () => {
    let remote = publish(index([entry()], { published: '2026-10-29T06:00:00.000Z' }), project.privateKey, '"new"')
    const { s, lines } = store({ remote: () => remote })
    await s.check()
    remote = publish(index([], { published: '2026-10-01T06:00:00.000Z' }), project.privateKey, '"old"')
    await s.check()
    expect(s.state()).toMatchObject({ status: 'ready', entries: [{ code: 'pharmagarde' }] })
    expect(lines.join('\n')).toMatch(/before the latest index taken/)
  })

  it('never takes an older index again, even once the one kept is gone', async () => {
    const dir = mkdtempSync(join(root, 'highest-'))
    let remote = publish(index([entry()], { published: '2026-10-29T06:00:00.000Z' }), project.privateKey, '"new"')
    const first = store({ dir, remote: () => remote, now: () => Date.parse('2026-10-29T08:00:00Z') })
    await first.s.check()
    // The index kept is lost (removed, damaged): an older one, signed, is offered.
    for (const name of [INDEX_FILE, SIGNATURE_FILE]) rmSync(join(dir, name), { force: true })
    remote = publish(index([], { published: '2026-10-01T06:00:00.000Z' }), project.privateKey, '"old"')
    const next = store({ dir, remote: () => remote, now: () => Date.parse('2026-10-29T09:00:00Z') })
    await next.s.check()
    expect(next.s.state().status).not.toBe('ready')
    expect(next.lines.join('\n')).toMatch(/before the latest index taken \(2026-10-29T06:00:00.000Z\)/)
  })

  it('stops counting an index’s validations once it expires, its withdrawals still counted', async () => {
    let now = Date.parse('2026-10-29T08:00:00Z')
    const withdrawn = [{ code: 'velo', version: '1.0.0', sha256: 'b'.repeat(64), reason: 'Retirée.' }]
    const remote = publish(index([entry()], { expires: '2026-11-01T00:00:00.000Z', withdrawn }))
    const { s } = store({ remote: () => remote, now: () => now })
    await s.check()
    expect(s.state()).toMatchObject({ status: 'ready', entries: [{ code: 'pharmagarde' }] })
    now = Date.parse('2026-11-02T00:00:00Z')
    expect(s.state()).toMatchObject({ status: 'failed', entries: [], withdrawn, error: expect.stringContaining('a expiré') })
  })

  it('expires on time, whoever asks, and says so: the host switches the services’ standing then', async () => {
    const remote = publish(index([entry()]))
    const { s, changes } = store({ remote: () => remote, now: () => Date.now() })
    // Two months ahead, past what one timer waits: it waits in steps.
    vi.useFakeTimers({ now: Date.parse('2026-10-29T08:00:00Z'), toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      await s.check()
      expect(s.state().status).toBe('ready')
      changes.length = 0
      await vi.advanceTimersByTimeAsync(Date.parse('2026-12-30T23:59:00Z') - Date.now())
      expect(changes).toEqual([])
      await vi.advanceTimersByTimeAsync(2 * 60_000)
      // Told without anyone asking for its state.
      expect(changes).toEqual(['failed'])
      expect(s.state()).toMatchObject({ status: 'failed', entries: [], error: expect.stringContaining('a expiré') })
    } finally {
      vi.useRealTimers()
    }
  })

  it('expires even after a reading failed (a failure keeps the entries it had)', async () => {
    let now = Date.parse('2026-10-29T08:00:00Z')
    let remote: Published | 'fail' = publish(index([entry()], { expires: '2026-11-01T00:00:00.000Z' }))
    const { s } = store({ remote: () => remote, now: () => now })
    await s.check()
    remote = 'fail'
    now = Date.parse('2026-10-31T00:00:00Z')
    await s.check()
    expect(s.state()).toMatchObject({ status: 'failed', entries: [{ code: 'pharmagarde' }] })
    now = Date.parse('2026-11-02T00:00:00Z')
    expect(s.state()).toMatchObject({ status: 'failed', entries: [], error: expect.stringContaining('a expiré') })
    await s.check()
    expect(s.state()).toMatchObject({ entries: [], error: expect.stringContaining('a expiré') })
  })

  it('keeps an index before its signature: cut short between the two, the index fails its check and is read again', async () => {
    const dir = mkdtempSync(join(root, 'order-'))
    const remote = publish(index([entry()]))
    const { s } = store({ dir, remote: () => remote })
    await s.check()
    expect(readFileSync(join(dir, INDEX_FILE))).toEqual(remote.data)
    // The new index written, not its signature yet: refused, removed.
    writeFileSync(join(dir, INDEX_FILE), publish(index([entry({ code: 'velo' })], { published: '2026-10-30T06:00:00.000Z' })).data)
    const next = store({ dir, remote: () => null })
    expect(next.s.state().status).toBe('loading')
    expect(existsSync(join(dir, INDEX_FILE))).toBe(false)
  })

  it('removes an index kept that no longer checks out', () => {
    const dir = mkdtempSync(join(root, 'kept-'))
    const remote = publish(index([entry()]), stranger.privateKey)
    writeFileSync(join(dir, INDEX_FILE), remote.data)
    writeFileSync(join(dir, SIGNATURE_FILE), remote.signature!)
    const { s } = store({ dir, remote: () => null })
    expect(s.state().status).toBe('loading')
    expect(existsSync(join(dir, INDEX_FILE))).toBe(false)
  })

  it('is read when the window asks and none was read yet, and not again within the day', async () => {
    let now = Date.parse('2026-10-29T08:00:00Z')
    const { s, fetch } = store({ remote: () => publish(index([entry()])), now: () => now })
    s.state(true)
    await s.check()
    expect(s.state().status).toBe('ready')
    const calls = fetch.mock.calls.length
    now += 3600_000
    s.state(true)
    expect(fetch.mock.calls.length).toBe(calls)
    now += 24 * 3600_000
    s.state(true)
    await s.check()
    expect(fetch.mock.calls.length).toBeGreaterThan(calls)
  })
})

describe('the development catalogue', () => {
  it('is read from MARIANNE_CATALOGUE, unsigned, when the app is not packaged', async () => {
    const { s, fetch, lines } = store({ url: null, isPackaged: false, env: { [DEV_CATALOGUE_ENV]: FIXTURE } })
    await s.check()
    expect(s.state()).toMatchObject({ status: 'ready' })
    expect(s.state().entries.length).toBe(72)
    expect(fetch).not.toHaveBeenCalled()
    expect(lines.join('\n')).toMatch(/development catalogue/)
  })

  it('is never read by a packaged app', async () => {
    const { s, fetch } = store({ url: null, isPackaged: true, env: { [DEV_CATALOGUE_ENV]: FIXTURE } })
    await s.check()
    expect(s.state()).toEqual({ status: 'none', entries: [], withdrawn: [] })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('is read again when it changes, and its errors show', async () => {
    const file = join(mkdtempSync(join(root, 'dev-')), 'catalogue.json')
    writeFileSync(file, JSON.stringify(index([entry()])))
    const { s } = store({ url: null, isPackaged: false, env: { [DEV_CATALOGUE_ENV]: file } })
    await s.check()
    expect(s.state().entries.map((e) => e.code)).toEqual(['pharmagarde'])
    writeFileSync(file, JSON.stringify(index([entry(), entry({ code: 'velo' })], { published: '2026-10-30T06:00:00.000Z' })))
    s.state(true)
    await s.check()
    expect(s.state().entries.map((e) => e.code)).toEqual(['pharmagarde', 'velo'])
    writeFileSync(file, '{ not json')
    s.state(true)
    await s.check()
    expect(s.state()).toMatchObject({
      status: 'failed',
      entries: [{ code: 'pharmagarde' }, { code: 'velo' }],
      error: 'Le catalogue reçu est illisible : Marianne ne l’a pas pris.'
    })
  })
})
