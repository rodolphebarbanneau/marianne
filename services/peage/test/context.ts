import { readManifest, type ProfileField, type ServiceContext, type Vehicle } from '@marianne/sdk/main'
import pkg from '../package.json'

/** Marianne's part in the tests: no network, a storage in memory, and the profile fields the user granted. */
export function fakeContext(profile: { granted?: ProfileField[]; vehicles?: Vehicle[] } = {}) {
  const stored = new Map<string, unknown>()
  const offline = async (): Promise<never> => {
    throw new Error('3615 PEAGE reaches no host')
  }
  const ctx: ServiceContext = {
    manifest: readManifest(pkg),
    http: { json: offline, text: offline, page: offline },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    storage: {
      // As the archive does: what is read back is a copy of what was written.
      get: <T>(key: string) => (stored.has(key) ? (structuredClone(stored.get(key)) as T) : null),
      set: (key, value) => void stored.set(key, structuredClone(value)),
      remove: (key) => void stored.delete(key)
    },
    dataDir: '',
    geo: { findCommunes: async () => [], getCommune: async () => null },
    home: () => null,
    profile: { granted: () => profile.granted ?? [], vehicles: () => profile.vehicles ?? [] },
    sync: { status: () => ({}), run: async () => {} }
  }
  return { ctx, stored }
}

export const CLIO: Vehicle = { id: 'v1', plate: 'AB-123-CD' }
export const KANGOO: Vehicle = { id: 'v2', plate: 'EF-456-GH' }
/** The user granted the plates and has two vehicles. */
export const GRANTED = { granted: ['vehicles.plate'] as ProfileField[], vehicles: [CLIO, KANGOO] }
