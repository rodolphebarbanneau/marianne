import type { ParliamentGroup } from '@shared/api'
import type { NewsSource } from '@shared/news'
import type { Site } from '@shared/sites'
import { api, useLive } from './api'

/** Content can change while the window is open (a signed bundle taken): asked again then. */
const onContent =
  <T>(load: () => Promise<T>) =>
  (cb: (value: T) => void) =>
    api.onContent(() => void load().then(cb))

/** The catalog of public-service websites. */
export const useSites = (): Site[] => useLive(api.listSites, onContent(api.listSites)) ?? []

/** The news sources Marianne reads (Réglages › Identité › sources d’information). */
export const useNewsSources = (): NewsSource[] => useLive(api.newsSources, onContent(api.newsSources)) ?? []

/** The parliamentary groups of both chambers, for the leaning. */
export const useParliamentGroups = (): ParliamentGroup[] => useLive(api.parliamentGroups, onContent(api.parliamentGroups)) ?? []
