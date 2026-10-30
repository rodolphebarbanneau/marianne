import { rmSync } from 'node:fs'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeviceConfig, PublicSourceId } from '../src/shared/types'

/** The settings forms' lookups ask a public source only while it is on: what the user types stays here otherwise. */

// ~/.marianne points at a temporary folder, before paths.ts reads it.
const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-lookup-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

vi.mock('electron', () => ({}))
vi.mock('../src/main/http', () => ({
  fetchJson: vi.fn(async (...args: unknown[]) => (String(args[0]).includes('/communes') ? [] : { features: [], results: [] })),
  query: (params: Record<string, string | number>) => `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`
}))

import { configStore } from '../src/main/config'
import { fetchJson } from '../src/main/http'
import { lookupSiren, searchAddress, searchCommunes } from '../src/main/lookup'

const off = (id: PublicSourceId) => {
  const config = structuredClone(configStore.get())
  config.sources[id].enabled = false
  vi.spyOn(configStore, 'get').mockReturnValue(config as DeviceConfig)
}

beforeEach(() => vi.mocked(fetchJson).mockClear())
afterEach(() => vi.restoreAllMocks())

describe('the lookups of Réglages', () => {
  it('ask the sources that are on', async () => {
    await searchAddress('12 rue des Lilas')
    await searchCommunes('Rennes')
    await lookupSiren('123 456 789')
    expect(vi.mocked(fetchJson).mock.calls.map(([url]) => new URL(url as string).hostname)).toEqual([
      'data.geopf.fr',
      'geo.api.gouv.fr',
      'recherche-entreprises.api.gouv.fr'
    ])
  })

  it('ask nothing of a source turned off, and say so', async () => {
    off('adresse')
    await expect(searchAddress('12 rue des Lilas')).rejects.toThrow(/désactivée/)
    vi.restoreAllMocks()
    off('geo')
    await expect(searchCommunes('Rennes')).rejects.toThrow(/désactivée/)
    vi.restoreAllMocks()
    off('entreprises')
    await expect(lookupSiren('123456789')).rejects.toThrow(/désactivée/)
    expect(fetchJson).not.toHaveBeenCalled()
  })
})
