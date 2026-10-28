import { readManifest, type Commune, type ServiceContext } from '@marianne/sdk/main'
import pkg from '../package.json'

/** Marianne's part in the tests: a context whose network and communes are given, and which records the URLs asked. */
export function fakeContext(answer: (url: string) => unknown, communes: Commune[] = []) {
  const urls: string[] = []
  const stored = new Map<string, unknown>()
  const ctx: ServiceContext = {
    manifest: readManifest(pkg),
    http: {
      json: async <T>(url: string) => {
        urls.push(url)
        return answer(url) as T
      },
      text: async () => {
        throw new Error('no text in tests')
      },
      page: async () => {
        throw new Error('no pages in tests')
      }
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    storage: {
      get: <T>(key: string) => (stored.get(key) as T) ?? null,
      set: (key, value) => void stored.set(key, value),
      remove: (key) => void stored.delete(key)
    },
    dataDir: '',
    geo: {
      findCommunes: async (text, limit = 5) =>
        communes.filter((c) => c.code === text || c.postalCodes.includes(text) || c.name.toLowerCase().startsWith(text.toLowerCase())).slice(0, limit),
      getCommune: async (code) => communes.find((c) => c.code === code) ?? null
    },
    home: () => null,
    profile: { granted: () => [], vehicles: () => [] },
    sync: { status: () => ({}), run: async () => {} }
  }
  return { ctx, urls }
}
