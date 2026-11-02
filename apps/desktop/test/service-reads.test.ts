import type { ServiceManifest } from '@marianne/sdk'
import { EMPTY_PROFILE, type Profile } from '@marianne/profile'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The day a service last read the profile, which Réglages › Accès des services shows: its vehicles count as
 * its opinions do, and only when there was something to read. The account and the profile are in memory.
 */

const state = vi.hoisted(() => ({
  settings: { services: { access: {} as Record<string, string[]>, reads: {} as Record<string, string> } },
  profile: null as unknown as Profile
}))

vi.mock('electron', () => ({ app: { getVersion: () => '0', isPackaged: false } }))
vi.mock('../src/main/session', () => ({ session: { unlocked: true, archive: null, on: () => undefined } }))
vi.mock('../src/main/profile/store', () => ({ profile: { get: () => state.profile } }))
vi.mock('../src/main/account', () => ({
  accounts: {
    settings: () => state.settings,
    updateSettings: (patch: { services: { reads: Record<string, string> } }) => void (state.settings.services.reads = patch.services.reads)
  }
}))

import { serviceContext } from '../src/main/host/context'

const manifest = { id: 'peage', name: 'Péage', hosts: [], permissions: { profile: ['vehicles.plate'] } } as unknown as ServiceManifest
const sync = { status: () => ({ state: 'idle' }), run: async () => undefined } as never

beforeEach(() => {
  state.profile = structuredClone(EMPTY_PROFILE)
  state.settings.services = { access: { peage: ['vehicles.plate'] }, reads: {} }
})

describe('the reads Accès des services shows', () => {
  it('note the day a service read the plates it was granted', () => {
    state.profile.vehicles = [{ id: 'v1', plate: 'AB-123-CD' } as Profile['vehicles'][number]]
    const ctx = serviceContext(manifest, sync, undefined, { dataDir: false })
    expect(ctx.profile.vehicles()).toEqual([{ id: 'v1', plate: 'AB-123-CD' }])
    expect(state.settings.services.reads.peage).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('note nothing when there was nothing to read, or nothing granted', () => {
    const ctx = serviceContext(manifest, sync, undefined, { dataDir: false })
    expect(ctx.profile.vehicles()).toEqual([])
    state.profile.vehicles = [{ id: 'v1', plate: 'AB-123-CD' } as Profile['vehicles'][number]]
    state.settings.services.access = {}
    expect(ctx.profile.vehicles()).toEqual([])
    expect(state.settings.services.reads).toEqual({})
  })
})
