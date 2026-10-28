import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * This computer's data: ~/.marianne (MARIANNE_HOME overrides). Nothing personal lives here: the
 * accounts are archives in the folder the user chose (see archive/).
 */
export const home = process.env.MARIANNE_HOME || join(homedir(), '.marianne')

export const paths = {
  home,
  config: join(home, 'config.json'),
  /** PIN unlock of each account on this computer. */
  devices: join(home, 'devices'),
  /** The offline index of public data (Service-Public, Assemblée…). */
  publicDb: join(home, 'public.db'),
  /** The signed content bundle taken (content.json and its signature), newer than the built-in content. */
  content: join(home, 'content'),
  /** The engines' scratch folders, wiped on lock and at start. */
  work: join(home, 'work'),
  /** Each service's public data (services/<code>), written by its sync job. */
  services: join(home, 'services'),
  /** The user's own skills, next to the built-in ones. */
  skills: join(home, 'skills'),
  logs: join(home, 'logs'),
  tmp: join(home, 'tmp')
}

export function ensureDirs(): void {
  for (const dir of [paths.home, paths.devices, paths.services, paths.work, paths.skills, paths.logs, paths.tmp]) mkdirSync(dir, { recursive: true })
}

/** Static app resources (icons). Inside the asar when packaged. */
export function resource(...parts: string[]): string {
  // Lazy: workers and tests import this module without Electron.
  const { app } = require('electron') as typeof import('electron')
  return join(app.getAppPath(), 'resources', ...parts)
}
