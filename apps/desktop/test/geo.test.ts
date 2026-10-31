import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The commune lookup the services share (ctx.geo.getCommune), against geo.api.gouv.fr as the test has it. */

const asked = vi.hoisted(() => [] as URL[])

vi.mock('../src/main/public/sources', () => ({ ensureEnabled: () => undefined, sourceUrl: () => 'https://geo.api.gouv.fr' }))
vi.mock('../src/main/http', async (original) => ({
  ...(await original<typeof import('../src/main/http')>()),
  fetchJson: async (url: string) => {
    const u = new URL(url)
    asked.push(u)
    const code = u.searchParams.get('code')
    // The communes' list doesn't hold the arrondissements: asked as one, Lyon 3e answers.
    if (code === '33063' && !u.searchParams.get('type'))
      return [{ nom: 'Bordeaux', code: '33063', codesPostaux: ['33000'], centre: { coordinates: [-0.5874, 44.8572] } }]
    if (code === '69383' && u.searchParams.get('type') === 'arrondissement-municipal')
      return [{ nom: 'Lyon 3e Arrondissement', code: '69383', codesPostaux: ['69003'], codeDepartement: '69', centre: { coordinates: [4.8685, 45.7514] } }]
    return []
  }
}))
vi.mock('electron', () => ({ app: { getVersion: () => '0', isPackaged: false }, net: {}, session: {} }))

import { getCommune } from '../src/main/public/geo'

beforeEach(() => void asked.splice(0))

describe('getCommune', () => {
  it('finds a commune by its INSEE code, asking once', async () => {
    expect(await getCommune('33063')).toMatchObject({ code: '33063', name: 'Bordeaux', latitude: 44.8572 })
    expect(asked).toHaveLength(1)
  })

  it('finds an arrondissement of Paris, Lyon or Marseille as itself: an address there has its code', async () => {
    expect(await getCommune('69383')).toMatchObject({ code: '69383', name: 'Lyon 3e Arrondissement', department: '69', latitude: 45.7514, longitude: 4.8685 })
    expect(asked.map((u) => u.searchParams.get('type'))).toEqual([null, 'arrondissement-municipal'])
  })

  it('says null for a code that is no commune, asking once', async () => {
    expect(await getCommune('99999')).toBeNull()
    expect(asked).toHaveLength(1)
  })
})
