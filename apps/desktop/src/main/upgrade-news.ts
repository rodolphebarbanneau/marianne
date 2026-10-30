import type { NewsChoice, Profile } from '@marianne/profile'
import { accountSettings } from './config'
import { storageKind, type RecordStore } from './host/storage'
import { normalize } from './profile/store'

/**
 * The Actualités page's settings, carried over once to 3615 INFOS, as the account opens. They
 * were an opt-in pick of sources (seven outlets by default), the user's own feeds, a number of
 * titles per source and the grouping; the sources are now a profile field (opinions.sources) over
 * Marianne's list, and INFOS shows them. This reads the settings as stored, before they are
 * merged with today's defaults (which no longer have `news`, so the first save would drop it).
 */

const SETTINGS = 'settings'
const PROFILE = 'profile'
export const INFOS = 'infos'

/** Actualités' pick when the user never changed it. */
const OLD_DEFAULT = ['le-monde', 'le-figaro', 'liberation', 'les-echos', 'franceinfo', 'bfmtv', 'cnews']

/** What INFOS shows once at its opening (its storage's `notice`), then removes. */
export interface InfosNotice {
  customFeedsDropped?: true
}

/**
 * `catalogue`: the ids of Marianne's news sources. The pick left untouched gives the defaults
 * (opinions.sources null); a pick changed sets aside what it left out. The user's own feeds are no
 * longer read, and INFOS says so once. INFOS is added, on and pinned, so that the news stays one
 * click away. Settings without `news` were carried over already: nothing happens.
 */
export function upgradeNews(store: RecordStore, catalogue: string[]): boolean {
  const raw = store.get<Record<string, unknown>>(SETTINGS, 'account')
  if (!raw || typeof raw !== 'object' || !('news' in raw)) return false
  const { news, ...rest } = raw as { news?: { sources?: unknown; custom?: unknown } }
  const picked = Array.isArray(news?.sources) ? news.sources.filter((x): x is string => typeof x === 'string') : OLD_DEFAULT
  const untouched = picked.length === OLD_DEFAULT.length && OLD_DEFAULT.every((id) => picked.includes(id))
  if (!untouched) {
    const profile = normalize(store.get<Partial<Profile>>(PROFILE, 'main') ?? {})
    const choice: NewsChoice = { refused: catalogue.filter((id) => !picked.includes(id)), sections: {}, leanings: {} }
    store.put(PROFILE, 'main', { ...profile, opinions: { ...profile.opinions, sources: choice } })
  }
  if (Array.isArray(news?.custom) && news.custom.length) store.put(storageKind(INFOS), 'notice', { customFeedsDropped: true } satisfies InfosNotice)
  const settings = accountSettings(rest)
  const { pinned, added, offered, disabled } = settings.services
  store.put(
    SETTINGS,
    'account',
    accountSettings(rest, {
      services: {
        pinned: [INFOS, ...pinned.filter((id) => id !== INFOS)],
        added: [...new Set([...added, INFOS])],
        offered: [...new Set([...offered, INFOS])],
        disabled: disabled.filter((id) => id !== INFOS)
      }
    })
  )
  return true
}
