import { readManifest, serviceCode } from './index'
import type { Commune, Leaning, ProfileField, ServiceContext, Vehicle } from './main'

/**
 * @marianne/sdk/testing: Marianne's part in a service's tests. `fakeContext` builds the context
 * `activate` receives from the service's package.json: a network that answers what the test says
 * and records the URLs asked, a storage in memory, and the communes and profile fields the test
 * gives. No host is reached, nothing is written to disk.
 */

export interface FakeContextOptions {
  /** The answer to each `http.json` request, from its URL. Without it, the service reaches no host. */
  answer?: (url: URL) => unknown
  /** The communes Marianne's geo connection knows. */
  communes?: Commune[]
  /** The profile fields the user granted, their vehicles, leaning and themes (given only when granted, as Marianne does). */
  profile?: { granted?: ProfileField[]; vehicles?: Vehicle[]; leaning?: Leaning; themes?: string[] }
}

export interface FakeContext {
  ctx: ServiceContext
  /** The URLs the service asked for, in order. */
  urls: URL[]
  /** The service's storage, by key. */
  stored: Map<string, unknown>
}

export function fakeContext(pkg: unknown, options: FakeContextOptions = {}): FakeContext {
  const manifest = readManifest(pkg)
  const { answer, communes = [], profile = {} } = options
  const urls: URL[] = []
  const stored = new Map<string, unknown>()
  const offline = async (): Promise<never> => {
    throw new Error(`3615 ${serviceCode(manifest)} reaches no host in tests`)
  }
  const ctx: ServiceContext = {
    manifest,
    http: {
      json: answer
        ? async <T>(url: string) => {
            const u = new URL(url)
            urls.push(u)
            return answer(u) as T
          }
        : offline,
      text: offline,
      page: offline
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    storage: {
      // As the archive does: what is read back is a copy of what was written.
      get: <T>(key: string) => (stored.has(key) ? (structuredClone(stored.get(key)) as T) : null),
      set: (key, value) => void stored.set(key, structuredClone(value)),
      remove: (key) => void stored.delete(key)
    },
    dataDir: '',
    geo: {
      findCommunes: async (text, limit = 5) =>
        communes.filter((c) => c.code === text || c.postalCodes.includes(text) || c.name.toLowerCase().startsWith(text.toLowerCase())).slice(0, limit),
      getCommune: async (code) => communes.find((c) => c.code === code) ?? null
    },
    home: () => null,
    profile: {
      granted: () => profile.granted ?? [],
      vehicles: () => profile.vehicles ?? [],
      leaning: () => ((profile.granted ?? []).includes('opinions.leaning') ? (profile.leaning ?? null) : null),
      themes: () => ((profile.granted ?? []).includes('opinions.themes') ? (profile.themes ?? []) : [])
    },
    sync: { status: () => ({}), run: async () => {} }
  }
  return { ctx, urls, stored }
}
