import type { Profile } from '@marianne/profile'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ACCOUNT_SETTINGS } from '../src/shared/config'
import type { AccountSettings } from '../src/shared/types'
import type { RecordStore } from '../src/main/host/storage'
import { upgradeNews } from '../src/main/upgrade-news'

/** Actualités' settings carried over to 3615 INFOS and the profile's news sources, once, as the account opens. */

const CATALOGUE = ['le-monde', 'le-figaro', 'liberation', 'les-echos', 'franceinfo', 'bfmtv', 'cnews', 'la-croix', 'rfi']
const OLD = { sources: ['le-monde', 'le-figaro', 'liberation', 'les-echos', 'franceinfo', 'bfmtv', 'cnews'], perSource: 5, group: true, custom: [] }

function store(records: Record<string, unknown>): RecordStore & { records: Map<string, unknown> } {
  const map = new Map(Object.entries(records).map(([k, v]) => [k, structuredClone(v)]))
  return {
    records: map,
    get: <T>(kind: string, id: string) => (map.get(`${kind}/${id}`) as T) ?? null,
    put: (kind, id, value) => void map.set(`${kind}/${id}`, structuredClone(value)),
    remove: (kind, id) => void map.delete(`${kind}/${id}`)
  }
}

const account = (news: unknown, services: Partial<AccountSettings['services']> = {}) => ({
  ...structuredClone(DEFAULT_ACCOUNT_SETTINGS),
  news,
  services: { ...DEFAULT_ACCOUNT_SETTINGS.services, pinned: ['meteo'], added: ['meteo', 'parlement'], disabled: ['infos'], ...services }
})

describe('the upgrade from Actualités', () => {
  it('leaves an untouched pick to the defaults, and pins INFOS', () => {
    const s = store({ 'settings/account': account({ ...OLD, sources: [...OLD.sources].reverse() }) })
    expect(upgradeNews(s, CATALOGUE)).toBe(true)
    const settings = s.get<Record<string, unknown> & AccountSettings>('settings', 'account')!
    expect('news' in settings).toBe(false)
    expect(settings.services).toMatchObject({ pinned: ['infos', 'meteo'], added: ['meteo', 'parlement', 'infos'], disabled: [] })
    expect(settings.services.offered).toContain('infos')
    expect(s.get('profile', 'main')).toBeNull()
    expect(s.get('service:infos', 'notice')).toBeNull()
  })

  it('sets aside what a changed pick left out, and tells INFOS the own feeds are gone', () => {
    const profile = { person: { firstNames: 'Camille' }, opinions: { leaning: { assembly: ['EcoS'], senate: [] }, themes: ['housing'] } }
    const s = store({
      'settings/account': account({
        ...OLD,
        sources: ['le-monde', 'rfi', 'custom-1'],
        custom: [{ id: 'custom-1', name: 'Mon blog', url: 'https://blog.fr/rss' }]
      }),
      'profile/main': profile
    })
    upgradeNews(s, CATALOGUE)
    const p = s.get<Profile>('profile', 'main')!
    expect(p.opinions).toEqual({
      leaning: { assembly: ['EcoS'], senate: [] },
      themes: ['housing'],
      sources: { refused: ['le-figaro', 'liberation', 'les-echos', 'franceinfo', 'bfmtv', 'cnews', 'la-croix'], sections: {}, leanings: {} }
    })
    expect(p.person.firstNames).toBe('Camille')
    expect(s.get('service:infos', 'notice')).toEqual({ customFeedsDropped: true })
    const settings = s.get<Record<string, unknown>>('settings', 'account')!
    expect(JSON.stringify(settings)).not.toMatch(/perSource|blog\.fr|"group"/)
  })

  it('leaves to the defaults a pick of none of Marianne’s sources: only own feeds, or nothing', () => {
    for (const sources of [[], ['custom-1']]) {
      const s = store({
        'settings/account': account({ ...OLD, sources, custom: [{ id: 'custom-1', name: 'Mon blog', url: 'https://blog.fr/rss' }] }),
        'profile/main': { person: { firstNames: 'Camille' } }
      })
      expect(upgradeNews(s, CATALOGUE)).toBe(true)
      expect(s.get<Profile>('profile', 'main')?.opinions?.sources ?? null).toBeNull()
      expect(s.get('service:infos', 'notice')).toEqual({ customFeedsDropped: true })
    }
  })

  it('happens once', () => {
    const s = store({ 'settings/account': account({ ...OLD, sources: ['le-monde'] }) })
    expect(upgradeNews(s, CATALOGUE)).toBe(true)
    const after = structuredClone([...s.records])
    // The user unpins INFOS and changes their sources: the next opening leaves them be.
    const settings = s.get<AccountSettings>('settings', 'account')!
    s.put('settings', 'account', { ...settings, services: { ...settings.services, pinned: ['meteo'] } })
    expect(upgradeNews(s, CATALOGUE)).toBe(false)
    expect(s.get<AccountSettings>('settings', 'account')!.services.pinned).toEqual(['meteo'])
    expect(s.get('profile', 'main')).toEqual(after.find(([k]) => k === 'profile/main')![1])
    // A new account has nothing to carry over.
    expect(upgradeNews(store({ 'settings/account': DEFAULT_ACCOUNT_SETTINGS }), CATALOGUE)).toBe(false)
  })
})
