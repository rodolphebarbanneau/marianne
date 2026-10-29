import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { formatNumber, readManifest } from '@marianne/sdk'
import { execute, type SyncJob, type SyncMessage } from '@marianne/sdk/sync'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pkg from '../package.json'
import { DUMPS } from '../src/indexer'
import { syncJob, summary } from '../src/job'
import { counts } from '../src/queries'
import { DB_FILE, type Dump } from '../src/store'
import { BALLOTS, dumps, MEETINGS } from './fixtures'

let dir: string
let job: SyncJob
/** What the stubbed server holds: each dump's zip and its ETag. */
let served: Record<Dump, { body: Uint8Array; etag: string }>

const URLS = Object.entries(DUMPS) as Array<[Dump, string]>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'marianne-parlement-sync-'))
  job = { dataDir: join(dir, 'data'), tmpDir: join(dir, 'tmp'), hosts: readManifest(pkg).hosts, userAgent: 'Marianne/test', etags: {} }
  const zips = dumps()
  served = { deputies: { body: zips.deputies, etag: '"d1"' }, ballots: { body: zips.ballots, etag: '"b1"' }, meetings: { body: zips.meetings, etag: '"m1"' } }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const dump = URLS.find(([, u]) => u === url)?.[0]
      if (!dump) return new Response('not found', { status: 404 })
      const { body, etag } = served[dump]
      if ((init?.headers as Record<string, string> | undefined)?.['If-None-Match'] === etag) return new Response(null, { status: 304 })
      return new Response(new Blob([body as BlobPart]), { status: 200, headers: { etag, 'content-length': String(body.length) } })
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(dir, { recursive: true, force: true })
})

/** One run, as Marianne plays it: the ETags of the last run go to the next. */
async function run(): Promise<SyncMessage[]> {
  const messages: SyncMessage[] = []
  await execute(job, syncJob, (m) => messages.push(m))
  const last = messages.at(-1)
  if (last?.type === 'done') job = { ...job, etags: last.etags }
  return messages
}

const indexed = () => {
  const db = new DatabaseSync(join(job.dataDir, DB_FILE), { readOnly: true })
  try {
    return counts(db)
  } finally {
    db.close()
  }
}

const fetched = () =>
  (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([url, init]) => [url, (init as RequestInit).headers as Record<string, string>])

describe('the sync job', () => {
  it('downloads the three dumps, indexes them and says what it holds', async () => {
    const messages = await run()
    expect(messages.at(-1)).toEqual({
      type: 'done',
      summary: '3 députés, 2 scrutins, 6 réunions',
      etags: { [DUMPS.deputies]: '"d1"', [DUMPS.ballots]: '"b1"', [DUMPS.meetings]: '"m1"' }
    })
    expect(messages.some((m) => m.type === 'progress' && m.progress.phase === 'download')).toBe(true)
    expect(messages.filter((m) => m.type === 'progress' && m.progress.phase === 'index').at(-1)).toMatchObject({ progress: { done: 18, total: 18 } })
    expect(indexed()).toEqual({ deputies: 3, ballots: 2, meetings: 6 })
  })

  it('asks conditionally, and changes nothing when no dump changed', async () => {
    await run()
    vi.mocked(fetch).mockClear()
    const messages = await run()
    expect(messages.at(-1)).toMatchObject({ type: 'done', summary: null })
    expect(fetched().map(([, headers]) => headers['If-None-Match'])).toEqual(['"d1"', '"b1"', '"m1"'])
  })

  it('rebuilds only the dumps that changed', async () => {
    await run()
    served.meetings = { body: dumps(BALLOTS, MEETINGS.slice(0, 1)).meetings, etag: '"m2"' }
    const messages = await run()
    expect(messages.at(-1)).toMatchObject({ type: 'done', summary: '3 députés, 2 scrutins, 1 réunion' })
    expect(indexed()).toEqual({ deputies: 3, ballots: 2, meetings: 1 })
  })

  it('asks for every dump again when the index is missing, whatever the ETags say', async () => {
    await run()
    rmSync(job.dataDir, { recursive: true, force: true })
    vi.mocked(fetch).mockClear()
    const messages = await run()
    expect(fetched().every(([, headers]) => !headers['If-None-Match'])).toBe(true)
    expect(messages.at(-1)).toMatchObject({ type: 'done', summary: '3 députés, 2 scrutins, 6 réunions' })
  })

  it('fails without touching the index when a download fails', async () => {
    await run()
    served.ballots = { body: dumps().ballots, etag: '"b2"' }
    vi.mocked(fetch).mockImplementationOnce(async () => new Response('busy', { status: 503 }))
    const messages = await run()
    expect(messages.at(-1)).toMatchObject({ type: 'error', message: expect.stringMatching(/HTTP 503/) })
    expect(indexed()).toEqual({ deputies: 3, ballots: 2, meetings: 6 })
  })

  it('writes the summary the French way', () => {
    expect(summary({ deputies: 577, ballots: 5210, meetings: 1 })).toBe(`577 députés, ${formatNumber(5210)} scrutins, 1 réunion`)
  })
})
