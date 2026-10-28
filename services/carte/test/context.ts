import { readManifest, type ServiceContext } from '@marianne/sdk/main'
import pkg from '../package.json'

/** Marianne's part in the tests: a context whose network answers are given, and which records the URLs asked. */
export function fakeContext(answer: (url: URL) => unknown) {
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
    geo: { findCommunes: unused, getCommune: unused },
    home: () => null,
    profile: { granted: () => [], vehicles: () => [] },
    sync: { status: () => ({}), run: async () => {} }
  }
  return { ctx, urls }
}
