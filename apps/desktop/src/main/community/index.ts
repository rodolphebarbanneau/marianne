import { join } from 'node:path'
import { signingKey } from '@marianne/content/files'
import { readManifest } from '@marianne/sdk'
import { app } from 'electron'
import { PUBLIC_SOURCES } from '../../shared/public'
import { publicHosts } from '../../shared/sites'
import { content } from '../content'
import { BUILTIN_SERVICES, RENAMED_SERVICES } from '../host/registry'
import { userAgent } from '../http'
import { paths } from '../paths'
import { CATALOGUE_URL, CatalogueStore } from './catalogue'
import { CommunityPackages } from './install'

/**
 * Community services, for this run of the app: the catalogue (signed with the project's key, the
 * content bundles' key) and the packages added on this computer. Shared by the accounts, like
 * the content: nothing personal. The community runtime loads what `communityPackages.installed()`
 * lists, and hears of each one added ('installed') or removed ('removed').
 */

export type { InstalledPackage } from './install'
export { verdictOf } from './catalogue'
export { SERVICE_FILE_EXT } from './package'

const BUILTIN_MANIFESTS = BUILTIN_SERVICES.map((s) => readManifest(s.pkg))

/** The codes of the services built into Marianne, and the ones they had: no community service may take one. */
export const BUILTIN_CODES: ReadonlySet<string> = new Set([...BUILTIN_MANIFESTS.map((m) => m.id), ...Object.keys(RENAMED_SERVICES)])

/** The hosts built-in services reach or open. */
const BUILTIN_HOSTS: ReadonlySet<string> = new Set(BUILTIN_MANIFESTS.flatMap((m) => [...m.hosts, ...m.links.map((l) => new URL(l).hostname)]))

/**
 * The hosts whose links are Marianne's: the built-in services', the public sites of the content
 * (they may change with a signed bundle: read each time), the public sources'. No community
 * service's link may be on one: it would take her answers' links away.
 */
export function protectedHosts(): ReadonlySet<string> {
  return new Set([...BUILTIN_HOSTS, ...publicHosts(content.get().sites), ...PUBLIC_SOURCES.map((s) => new URL(s.defaultUrl).hostname)])
}

export const catalogue = new CatalogueStore({
  url: CATALOGUE_URL,
  signingKey,
  dir: join(paths.community, 'catalogue'),
  reserved: BUILTIN_CODES,
  userAgent,
  isPackaged: app.isPackaged,
  env: process.env
})

export const communityPackages = new CommunityPackages({
  dir: paths.community,
  reserved: BUILTIN_CODES,
  protectedHosts,
  catalogue: () => catalogue.state(),
  userAgent
})
