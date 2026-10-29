import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { formatNumber } from '@marianne/sdk'
import type { SyncContext, SyncResult } from '@marianne/sdk/sync'
import { CONTOURS, parsePollingStations, POLLING_STATIONS } from './constituency'
import {
  addSenateBallots,
  counts,
  DUMPS,
  filled,
  indexBallots,
  indexBills,
  indexConstituencies,
  indexDeputies,
  indexFormer,
  indexMeetings,
  indexSenators,
  senateBallotNumbers
} from './indexer'
import {
  parseSenateBallotPage,
  parseSenateColors,
  parseSenateSessionPage,
  parseSenateVotes,
  parseSenators,
  senateBallotUrl,
  senateSession,
  senateSessionPage,
  SENATE_HOME,
  SENATORS_URL,
  type SenateBallotHead
} from './senate'
import { DB_FILE, openWriter, resetSchema, transaction } from './store'
import { parisDay } from './time'
import type { Position } from './types'

/**
 * The sync job: download each source when it changed, and refill its rows. A new index (or a new
 * schema) asks for every source again, whatever their ETags say. The Sénat's ballots are added as
 * they come: the current session's and the previous one's, never downloaded twice.
 */

/** How many sessions of the Sénat's ballots the index keeps: the current one and the previous. */
const SENATE_SESSIONS = 2

/** Downloads of the Sénat's ballots at once. */
const PARALLEL = 4

export async function syncJob(ctx: SyncContext): Promise<SyncResult> {
  await mkdir(ctx.dataDir, { recursive: true })
  const { db, current } = openWriter(join(ctx.dataDir, DB_FILE))
  try {
    if (!current) transaction(db, () => resetSchema(db))
    const changed: string[] = []
    const indexing = (label: string) => (done: number, total: number) => ctx.progress({ phase: 'index', done, total, label })
    const zip = async (url: string, force: boolean, label: string) => {
      const file = await ctx.download(url, { force, label })
      return file ? readFile(file) : null
    }

    const deputies = await zip(DUMPS.deputies, !filled(db, 'deputies'), 'les députés')
    if (deputies) {
      indexDeputies(db, deputies, indexing('les députés'))
      changed.push('deputies')
    }

    const senators = await ctx.download(SENATORS_URL, { force: !filled(db, 'senators'), label: 'les sénateurs' })
    if (senators) {
      const list = JSON.parse(await readFile(senators, 'utf8')) as unknown
      // The groups' colours are on the home page, which has no ETag: read again with the list.
      const home = await ctx.download(SENATE_HOME, { force: true, optional: true }).catch(() => null)
      const colors = home ? parseSenateColors(await readFile(home, 'utf8')) : {}
      const ranks = Object.fromEntries(
        (Array.isArray(list) ? (list as Array<{ groupe?: { code?: string; ordre?: number } }>) : []).map((s) => [s.groupe?.code ?? '', s.groupe?.ordre ?? 99])
      )
      indexSenators(db, parseSenators(list), colors, ranks)
      changed.push('senators')
    }

    // The deputies of the legislature who left office: their amendments keep their author. The
    // history (14 MB) is read again only when the deputies changed: someone may have left.
    const formerDue = !filled(db, 'former') || changed.includes('deputies')
    const former = formerDue ? await zip(DUMPS.former, !filled(db, 'former'), 'les députés de la législature') : null
    if (former) {
      indexFormer(db, former, indexing('les députés de la législature'))
      changed.push('former')
    }

    // Amendments' authors are matched with the deputies: new deputies, ballots read again.
    const ballots = await zip(
      DUMPS.ballots,
      !filled(db, 'ballots') || changed.includes('deputies') || changed.includes('former'),
      'les scrutins de l’Assemblée'
    )
    if (ballots) {
      indexBallots(db, ballots, indexing('les scrutins de l’Assemblée'))
      changed.push('ballots')
    }

    if ((await senateBallots(ctx, db)) > 0) changed.push('senate ballots')

    const meetings = await zip(DUMPS.meetings, !filled(db, 'meetings'), 'l’agenda')
    if (meetings) {
      indexMeetings(db, meetings, indexing('l’agenda'))
      changed.push('meetings')
    }

    const bills = await zip(DUMPS.bills, !filled(db, 'bills'), 'les dossiers législatifs')
    if (bills) {
      indexBills(db, bills, indexing('les dossiers législatifs'))
      changed.push('bills')
    }

    const force = !filled(db, 'constituencies')
    const stations = await ctx.download(POLLING_STATIONS, { force, label: 'les circonscriptions' })
    const contours = stations || force ? await ctx.download(CONTOURS, { force: true, label: 'les contours des circonscriptions' }) : null
    if (stations && contours) {
      indexConstituencies(db, parsePollingStations(await readFile(stations, 'utf8')), JSON.parse(await readFile(contours, 'utf8')))
      changed.push('constituencies')
    }

    if (!changed.length) return null
    ctx.log(`indexed ${changed.join(', ')}`)
    return { summary: summary(counts(db)) }
  } finally {
    db.close()
  }
}

/**
 * The Sénat's new ballots: a session's page lists them (once the session has one), else each
 * ballot's page tells its head; its JSON, each senator's vote. Numbers go up one by one: the
 * first missing one is the end of the session so far.
 */
async function senateBallots(ctx: SyncContext, db: Parameters<typeof senateBallotNumbers>[0]): Promise<number> {
  const latest = senateSession(parisDay())
  let added = 0
  for (let session = latest; session > latest - SENATE_SESSIONS; session--) {
    const known = senateBallotNumbers(db, session)
    const page = await ctx.download(senateSessionPage(session), { force: true, optional: true, label: 'les scrutins du Sénat' })
    const listed = new Map<number, SenateBallotHead>()
    if (page) for (const head of parseSenateSessionPage(await readFile(page, 'utf8'))) listed.set(head.number, head)
    const fetched: Array<{ session: number; head: SenateBallotHead; votes: Array<{ senator: string; position: Position }> }> = []
    let next = 1
    let ended = false
    const one = async (number: number) => {
      // Never downloaded before: forced, whatever an ETag of a past attempt says.
      const json = await ctx.download(senateBallotUrl(session, number, 'json'), { force: true, optional: true })
      if (!json) return false
      let head = listed.get(number)
      if (!head) {
        const html = await ctx.download(senateBallotUrl(session, number, 'html'), { force: true, optional: true })
        head = html ? (parseSenateBallotPage(await readFile(html, 'utf8')) ?? undefined) : undefined
      }
      if (!head) return false
      fetched.push({ session, head, votes: parseSenateVotes(JSON.parse(await readFile(json, 'utf8'))) })
      return true
    }
    if (listed.size) {
      // The session's page lists its ballots: those not indexed yet, and no others.
      const missing = [...listed.keys()].filter((n) => !known.has(n)).sort((a, b) => a - b)
      for (let i = 0; i < missing.length; i += PARALLEL) {
        await Promise.all(missing.slice(i, i + PARALLEL).map(one))
        ctx.progress({ phase: 'index', done: fetched.length, total: missing.length, label: 'les scrutins du Sénat' })
      }
      ended = true
    }
    let highest = Math.max(0, ...known)
    const expected = Math.max(1, highest - known.size)
    while (!ended) {
      const batch: number[] = []
      while (batch.length < PARALLEL) {
        const n = next++
        if (!known.has(n)) batch.push(n)
      }
      const found = await Promise.all(batch.map(one))
      batch.forEach((n, i) => found[i] && (highest = Math.max(highest, n)))
      ctx.progress({ phase: 'index', done: fetched.length, total: Math.max(expected, fetched.length), label: 'les scrutins du Sénat' })
      // Past the highest number known, a missing ballot is the end of the session so far.
      ended = batch.some((n, i) => !found[i] && n > highest)
    }
    added += addSenateBallots(db, fetched)
  }
  return added
}

const count = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`

/** "577 députés, 348 sénateurs, 9 640 scrutins, 8 160 réunions" */
export const summary = (c: { deputies: number; senators: number; ballots: number; meetings: number }) =>
  [
    count(c.deputies, 'député', 'députés'),
    count(c.senators, 'sénateur', 'sénateurs'),
    count(c.ballots, 'scrutin', 'scrutins'),
    count(c.meetings, 'réunion', 'réunions')
  ].join(', ')
