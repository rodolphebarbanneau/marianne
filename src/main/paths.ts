import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Root of all user data: ~/.marianne (override with MARIANNE_HOME). */
export const home = process.env.MARIANNE_HOME || join(homedir(), '.marianne')

export const paths = {
  home,
  config: join(home, 'config.json'),
  vault: join(home, 'vault.json'),
  /** The vault's data key, wrapped by the OS keystore. */
  keys: join(home, 'keys.json'),
  /** The personal file, encrypted. */
  dossier: join(home, 'dossier.enc'),
  /** Documents of the personal file, encrypted. */
  documents: join(home, 'documents'),
  /** The official calendar, refreshed from the repository. */
  calendar: join(home, 'calendrier.json'),
  /** Deadline reminders already shown (keys only). */
  reminders: join(home, 'reminders.json'),
  index: join(home, 'index.db'),
  conversations: join(home, 'conversations'),
  /** The agents' working directory: attached files live in files/. */
  workspace: join(home, 'workspace'),
  files: join(home, 'workspace', 'files'),
  /** The user's own skills, next to the built-in ones. */
  skills: join(home, 'skills'),
  logs: join(home, 'logs'),
  tmp: join(home, 'tmp')
}

export function ensureDirs(): void {
  for (const dir of [paths.home, paths.conversations, paths.documents, paths.workspace, paths.files, paths.skills, paths.logs, paths.tmp]) {
    mkdirSync(dir, { recursive: true })
  }
}

/** Static app resources (icons, built-in skills). Inside the asar when packaged. */
export function resource(...parts: string[]): string {
  // Lazy: the index worker and tests import this module without Electron.
  const { app } = require('electron') as typeof import('electron')
  return join(app.getAppPath(), 'resources', ...parts)
}
