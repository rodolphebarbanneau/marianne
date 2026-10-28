import { runSync } from '@marianne/sdk/sync'
import { syncJob } from './job'

/** 3615 ASSEMBLEE's sync job, run by Marianne in a process of its own (see job.ts). */
runSync(syncJob)
