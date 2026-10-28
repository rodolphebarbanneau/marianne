import { configStore } from '../config'
import { vault } from '../vault'
import { annuaireTools } from './annuaire'
import { appTools } from './app'
import { assembleeTools } from './assemblee'
import { datagouvTools } from './datagouv'
import { delaiTools } from './delais'
import { dossierTools } from './dossier'
import { formTools } from './formulaire'
import { geoTools } from './geo'
import { legifranceTools } from './legifrance'
import { openfiscaTools } from './openfisca'
import { servicePublicTools } from './service-public'
import type { Tool } from './tool'

export const ALL_TOOLS: Tool[] = [
  ...dossierTools,
  ...formTools,
  ...servicePublicTools,
  ...annuaireTools,
  ...legifranceTools,
  ...delaiTools,
  ...openfiscaTools,
  ...geoTools,
  ...datagouvTools,
  ...assembleeTools,
  ...appTools
]

/** Légifrance is on and its API credentials are in the keychain. */
export const legifranceReady = () => configStore.get().sources.legifrance.enabled && vault.hasApi('piste')

/**
 * The tools offered to the agent: those of the enabled sources, and the app's own. Without
 * credentials, the Légifrance tools could only fail: the prompt says how to do without them.
 */
export function activeTools(): Tool[] {
  const sources = configStore.get().sources
  return ALL_TOOLS.filter((t) => !t.source || (sources[t.source].enabled && (t.source !== 'legifrance' || legifranceReady())))
}
