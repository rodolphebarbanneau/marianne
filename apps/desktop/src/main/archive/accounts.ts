import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ARCHIVE_EXT, readHeader } from './archive'

/**
 * The accounts in a folder: every `<id>.marianne` file there, read from its plaintext header.
 * One archive is one account.
 */

export interface AccountFile {
  id: string
  display: string
  file: string
  size: number
  modified: string
}

export const accountFile = (folder: string, id: string) => join(folder, `${id}${ARCHIVE_EXT}`)

export function listAccounts(folder: string): AccountFile[] {
  if (!folder || !existsSync(folder)) return []
  const out: AccountFile[] = []
  for (const name of readdirSync(folder)) {
    if (!name.endsWith(ARCHIVE_EXT)) continue
    const file = join(folder, name)
    const header = readHeader(file)
    if (!header) continue
    const stat = statSync(file)
    out.push({ id: header.id, display: header.display, file, size: stat.size, modified: stat.mtime.toISOString() })
  }
  return out.sort((a, b) => b.modified.localeCompare(a.modified))
}

/** A random identifier that says nothing about the person: 8 hexadecimal digits. */
export function newAccountId(folder: string): string {
  for (;;) {
    const id = randomBytes(4).toString('hex')
    if (!existsSync(accountFile(folder, id))) return id
  }
}

/** What the default archive folder is chosen from (passed in, so the choice is testable). */
export interface Places {
  platform: NodeJS.Platform
  home: string
  documents: string
  env: Record<string, string | undefined>
  exists: (path: string) => boolean
}

/** Whether a folder is synced to a cloud: OneDrive (Windows), iCloud Drive's Desktop & Documents (macOS). */
export function cloudSynced(folder: string, places: Places): boolean {
  const inside = (root: string | undefined) => {
    if (!root) return false
    const [f, r] = [folder.toLowerCase(), root.toLowerCase()]
    return f === r || f.startsWith(`${r}\\`) || f.startsWith(`${r}/`)
  }
  if (places.platform === 'win32')
    return [places.env.OneDrive, places.env.OneDriveConsumer, places.env.OneDriveCommercial].some(inside) || /[\\/]OneDrive[^\\/]*[\\/]/i.test(folder)
  if (places.platform === 'darwin')
    return folder === places.documents && places.exists(join(places.home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Documents'))
  return false
}

/**
 * Where archives go until the user picks a place: Documents › Marianne, unless Documents is synced
 * to a cloud. An archive there would leave the computer, and sync tools handle an open database badly.
 */
export function defaultArchiveFolder(places: Places): string {
  return join(cloudSynced(places.documents, places) ? places.home : places.documents, 'Marianne')
}
