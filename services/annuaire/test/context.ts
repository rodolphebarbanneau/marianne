import { readManifest, type Commune, type ServiceContext } from '@marianne/sdk/main'
import pkg from '../package.json'

/** Marianne's part in the tests: a context whose network and communes are given, and which records the URLs asked. */
export function fakeContext(answer: (url: URL) => unknown, communes: Commune[] = []) {
  const urls: URL[] = []
  const unused = async (): Promise<never> => {
    throw new Error('not used by this service')
  }
  const ctx: ServiceContext = {
    manifest: readManifest(pkg),
    http: {
      json: async <T>(url: string) => {
        const u = new URL(url)
        urls.push(u)
        return answer(u) as T
      },
      text: unused,
      page: unused
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    storage: { get: () => null, set: () => {}, remove: () => {} },
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

/** The `where` of a directory request. */
export const whereOf = (url: URL) => url.searchParams.get('where') ?? ''
