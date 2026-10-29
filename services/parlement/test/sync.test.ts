import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { formatNumber, readManifest } from '@marianne/sdk'
import { execute, type SyncJob, type SyncMessage } from '@marianne/sdk/sync'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pkg from '../package.json'
import { CONTOURS as CONTOURS_URL, POLLING_STATIONS as STATIONS_URL } from '../src/constituency'
import { counts, DUMPS } from '../src/indexer'
import { syncJob, summary } from '../src/job'
import { senateBallotUrl, senateSessionPage, SENATE_HOME as HOME_URL, SENATORS_URL } from '../src/senate'
import { DB_FILE } from '../src/store'
import { CENON, CONTOURS, dumps, SENATE_BALLOT_PAGE, SENATE_HOME, SENATE_SESSION_PAGE, SENATE_VOTES, SENATORS } from './fixtures'

let dir: string
let job: SyncJob
/** What the stubbed servers hold: each URL's body and ETag. */
let served: Map<string, { body: string | Uint8Array; etag: string }>
let asked: string[]
/** What the stubbed servers answered each URL, last time. */
let answered: Map<string, number>

/** A ballot's page of the session 2026, as senat.fr serves it. */
const ballotPage = (n: number) => SENATE_BALLOT_PAGE.replace('n&deg;44', `n&deg;${n}`)

function serve(): void {
  const zips = dumps()
  served = new Map<string, { body: string | Uint8Array; etag: string }>([
    [DUMPS.deputies, { body: zips.deputies, etag: '"d1"' }],
    [DUMPS.ballots, { body: zips.ballots, etag: '"b1"' }],
    [DUMPS.meetings, { body: zips.meetings, etag: '"m1"' }],
    [DUMPS.bills, { body: zips.bills, etag: '"l1"' }],
    [SENATORS_URL, { body: JSON.stringify(SENATORS), etag: '"s1"' }],
    [HOME_URL, { body: SENATE_HOME, etag: '' }],
    // The session 2026 has no page yet: senat.fr answers its "page introuvable", in a 200.
    [senateSessionPage(2026), { body: '<h1 class="page-title">Page introuvable</h1>', etag: '' }],
    [senateSessionPage(2025), { body: SENATE_SESSION_PAGE, etag: '' }],
    [STATIONS_URL, { body: CENON, etag: '"c1"' }],
    [CONTOURS_URL, { body: JSON.stringify(CONTOURS), etag: '"g1"' }]
  ])
  for (const n of [1, 2]) {
    served.set(senateBallotUrl(2026, n, 'json'), { body: JSON.stringify(SENATE_VOTES[n]), etag: '' })
    served.set(senateBallotUrl(2026, n, 'html'), { body: ballotPage(n), etag: '' })
  }
  for (const n of [335, 340]) served.set(senateBallotUrl(2025, n, 'json'), { body: JSON.stringify(SENATE_VOTES[1]), etag: '' })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'marianne-parlement-sync-'))
  job = { dataDir: join(dir, 'data'), tmpDir: join(dir, 'tmp'), hosts: readManifest(pkg).hosts, userAgent: 'Marianne/test', etags: {} }
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-29T15:00:00Z') })
  asked = []
  answered = new Map()
  serve()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      asked.push(url)
      const file = served.get(url)
      const status = !file ? 404 : file.etag && (init?.headers as Record<string, string> | undefined)?.['If-None-Match'] === file.etag ? 304 : 200
      answered.set(url, status)
      if (!file) return new Response('not found', { status: 404 })
      if (status === 304) return new Response(null, { status: 304 })
      const body = typeof file.body === 'string' ? new TextEncoder().encode(file.body) : file.body
      return new Response(new Blob([body as BlobPart]), {
        status: 200,
        headers: { ...(file.etag ? { etag: file.etag } : {}), 'content-length': String(body.length) }
      })
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

/** One run, as Marianne plays it: the ETags of the last run go to the next. */
async function run(): Promise<SyncMessage[]> {
  asked = []
  const messages: SyncMessage[] = []
  await execute(job, syncJob, (m) => messages.push(m))
  const last = messages.at(-1)
  if (last?.type === 'done') job = { ...job, etags: last.etags }
  return messages
}

const indexed = () => {
  const db = new DatabaseSync(join(job.dataDir, DB_FILE), { readOnly: true })
  try {
    return {
      ...counts(db),
      senate: (db.prepare("select id from ballots where chamber = 'se' order by key").all() as Array<{ id: string }>).map((r) => r.id)
    }
  } finally {
    db.close()
  }
}

describe('the sync job', () => {
  it('downloads every source, indexes them and says what it holds', async () => {
    const messages = await run()
    expect(messages.at(-1)).toMatchObject({ type: 'done', summary: '5 députés, 3 sénateurs, 6 scrutins, 6 réunions' })
    // The session 2026 by its ballots' pages, the first missing one ending it; the session 2025 by its page's list.
    expect(indexed()).toMatchObject({ senators: 3, senate: ['SE2025-335', 'SE2025-340', 'SE2026-1', 'SE2026-2'] })
    expect(asked).not.toContain(senateBallotUrl(2025, 1, 'json'))
    expect(messages.some((m) => m.type === 'progress' && m.progress.label === 'les scrutins du Sénat')).toBe(true)
  })

  it('asks conditionally, and changes nothing when nothing changed', async () => {
    await run()
    const again = await run()
    expect(again.at(-1)).toMatchObject({ type: 'done', summary: null })
    // The ballots already indexed are never downloaded again: only the next one is looked for.
    expect(asked.filter((u) => u.includes('/scrutin-public/2026/'))).toEqual([
      senateBallotUrl(2026, 3, 'json'),
      senateBallotUrl(2026, 4, 'json'),
      senateBallotUrl(2026, 5, 'json'),
      senateBallotUrl(2026, 6, 'json')
    ])
  })

  it('adds the Sénat’s new ballots, and rebuilds only the dumps that changed', async () => {
    await run()
    served.set(senateBallotUrl(2026, 3, 'json'), { body: JSON.stringify(SENATE_VOTES[2]), etag: '' })
    served.set(senateBallotUrl(2026, 3, 'html'), { body: ballotPage(3), etag: '' })
    const zips = dumps(undefined, [])
    served.set(DUMPS.meetings, { body: zips.meetings, etag: '"m2"' })
    const messages = await run()
    expect(messages.at(-1)).toMatchObject({ type: 'done', summary: '5 députés, 3 sénateurs, 7 scrutins, 0 réunion' })
    expect(indexed().senate.at(-1)).toBe('SE2026-3')
    // The Assemblée's ballots hadn't changed: asked conditionally, not downloaded.
    expect(answered.get(DUMPS.ballots)).toBe(304)
    expect(answered.get(DUMPS.meetings)).toBe(200)
  })

  it('asks for every source again when the index is missing, whatever the ETags say', async () => {
    await run()
    rmSync(join(job.dataDir, DB_FILE))
    const messages = await run()
    expect(messages.at(-1)).toMatchObject({ type: 'done', summary: '5 députés, 3 sénateurs, 6 scrutins, 6 réunions' })
  })

  it('fails without touching the index when a download fails', async () => {
    await run()
    served.delete(DUMPS.deputies)
    served.set(DUMPS.ballots, { body: dumps().ballots, etag: '"b2"' })
    rmSync(join(job.dataDir, DB_FILE))
    const messages = await run()
    expect(messages.at(-1)).toMatchObject({ type: 'error', message: expect.stringMatching(/404/) })
  })

  it('writes the summary the French way', () => {
    expect(summary({ deputies: 577, senators: 348, ballots: 12_345, meetings: 1 })).toBe(
      `577 députés, 348 sénateurs, ${formatNumber(12_345)} scrutins, 1 réunion`
    )
  })
})
