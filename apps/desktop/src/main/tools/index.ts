import { keychain } from '../keychain'
import { isEnabled } from '../public/sources'
import { serviceTools } from '../host'
import { session } from '../session'
import { browserTools } from './browser'
import { calendarTools } from './calendar'
import { datagouvTools } from './datagouv'
import { folderTools } from './folder'
import { geoTools } from './geo'
import { labourTools } from './labour'
import { legifranceTools } from './legifrance'
import { openfiscaTools } from './openfisca'
import { profileTools } from './profile'
import { servicePublicTools } from './service-public'
import type { Tool } from './tool'

/** Marianne's own tools; the services add theirs (serviceTools). */
export const ALL_TOOLS: Tool[] = [
  ...profileTools,
  ...folderTools,
  ...browserTools,
  ...servicePublicTools,
  ...labourTools,
  ...legifranceTools,
  ...calendarTools,
  ...openfiscaTools,
  ...geoTools,
  ...datagouvTools
]

/** Légifrance is on and the user's PISTE credentials are in the keychain of the open account. */
export const legifranceReady = () => isEnabled('legifrance') && session.unlocked && keychain.hasApi('piste')

/**
 * The tools offered to the engines: those of the enabled sources and the app's own, then those
 * of the services that are on. Without credentials, the Légifrance tools could only fail: the
 * prompt says how to do without them.
 */
export function activeTools(): Tool[] {
  const own = ALL_TOOLS.filter((t) => !t.source || (isEnabled(t.source) && (t.source !== 'legifrance' || legifranceReady())))
  return [...own, ...serviceTools()]
}
