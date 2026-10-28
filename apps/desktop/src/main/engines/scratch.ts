import { randomBytes } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { log } from '../log'
import { paths } from '../paths'

/**
 * Each folder's engine works in an empty scratch folder of its own under ~/.marianne/work, with
 * a random name: nothing personal in the path, none of the user's files around it. They are
 * wiped when the session locks and at start; the next turn draws a new name.
 */

const dirs = new Map<string, string>()

/** 16 hex characters. */
export const scratchName = () => randomBytes(8).toString('hex')

/** The folder's scratch folder, created on demand. */
export function scratchDir(folderId: string): string {
  let dir = dirs.get(folderId)
  if (!dir) {
    dir = join(paths.work, scratchName())
    dirs.set(folderId, dir)
  }
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Remove everything under the work folder. */
export function clearScratch(): void {
  dirs.clear()
  let names: string[] = []
  try {
    names = readdirSync(paths.work)
  } catch {
    // not created yet
  }
  for (const name of names) {
    try {
      rmSync(join(paths.work, name), { recursive: true, force: true, maxRetries: 3 })
    } catch (err) {
      log.warn('Could not remove a scratch folder', name, err)
    }
  }
  mkdirSync(paths.work, { recursive: true })
}
