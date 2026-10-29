import { renameSync, writeFileSync, type WriteFileOptions } from 'node:fs'

/**
 * The package's own copy of the app's atomic write (apps/desktop/src/main/files.ts, tested there):
 * the archive depends on nothing of the app.
 */

/** The errors of a file another program holds a moment, on Windows. */
const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY'])
const RETRIES = 8

const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Writes a file whole or not at all: to a temporary file beside it, then renamed over it. On Windows
 * the rename fails while another program holds the file for a moment (an antivirus, an indexer, a
 * backup tool): it is tried again for about a second before the error is given up.
 */
export function writeFileAtomic(file: string, data: string | NodeJS.ArrayBufferView, options?: WriteFileOptions): void {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, data, options)
  for (let attempt = 0; ; attempt++) {
    try {
      return renameSync(tmp, file)
    } catch (err) {
      if (attempt >= RETRIES || !BUSY.has((err as NodeJS.ErrnoException).code ?? '')) throw err
      pause(10 * 2 ** Math.min(attempt, 5))
    }
  }
}
