import { join } from 'node:path'
import { signingKey } from '@marianne/content/files'
import { readManifest } from '@marianne/sdk'
import { app } from 'electron'
import { BUILTIN_SERVICES } from '../host/registry'
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

/** The codes of the services built into Marianne: no community service may take one. */
const BUILTIN_CODES: ReadonlySet<string> = new Set(BUILTIN_SERVICES.map((s) => readManifest(s.pkg).id))

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
  catalogue: () => catalogue.state(),
  userAgent
})
