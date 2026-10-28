import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { formatNumber } from '@marianne/sdk'
import type { SyncContext, SyncResult } from '@marianne/sdk/sync'
import { DUMP_NAMES, DUMPS, indexDumps } from './indexer'
import { counts, hasRows } from './queries'
import { DB_FILE, openWriter, type Dump } from './store'

/**
 * The sync job: download the three dumps when they changed, and rebuild the tables of those that
 * did. A new index (or a new schema) asks for every dump again, whatever their ETags say.
 */
export async function syncJob(ctx: SyncContext): Promise<SyncResult> {
  await mkdir(ctx.dataDir, { recursive: true })
  const { db, current } = openWriter(join(ctx.dataDir, DB_FILE))
  try {
    const zips: Partial<Record<Dump, Uint8Array>> = {}
    for (const dump of DUMP_NAMES) {
      // Each dump has a table of its name: empty, it was never indexed (or the file was lost).
      const force = !current || !hasRows(db, dump)
      const file = await ctx.download(DUMPS[dump], { force })
      if (file) zips[dump] = await readFile(file)
    }
    const changed = DUMP_NAMES.filter((d) => zips[d])
    if (!changed.length) return null
    ctx.log(`indexing ${changed.join(', ')}`)
    indexDumps(db, zips, { reset: !current, progress: (done, total) => ctx.progress({ phase: 'index', done, total }) })
    return { summary: summary(counts(db)) }
  } finally {
    db.close()
  }
}

const count = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`

/** "577 députés, 5 210 scrutins, 1 234 réunions" */
export const summary = (c: { deputies: number; ballots: number; meetings: number }) =>
  [count(c.deputies, 'député', 'députés'), count(c.ballots, 'scrutin', 'scrutins'), count(c.meetings, 'réunion', 'réunions')].join(', ')
