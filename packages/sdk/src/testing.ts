import {
  readManifest,
  readTile,
  serviceCode,
  titleWords,
  type Lean,
  type NewsArticle,
  type NewsReading,
  type NewsSourceInfo,
  type ServiceTile,
  type SyncStatus
} from './index'
import type { Commune, HomeCommune, Leaning, ProfileField, ServiceContext, ServiceNews, Vehicle } from './main'

/**
 * @marianne/sdk/testing: Marianne's part in a service's tests. `fakeContext` builds the context
 * `activate` receives from the service's package.json: a network that answers what the test says
 * and records the URLs asked, a storage in memory, and the communes and profile fields the test
 * gives. No host is reached, nothing is written to disk. `checkTile` says what Marianne would cut
 * of a tile.
 */

export interface FakeContextOptions {
  /** The answer to each `http.json` request, from its URL. Without it, the service reaches no host. */
  answer?: (url: URL) => unknown
  /** The answer to each `http.text` and `http.page` request (a page, a feed), from its URL. */
  answerText?: (url: URL) => string
  /** The service's data folder (a temporary folder its test made, with what its sync job would have written). */
  dataDir?: string
  /** What `ctx.sync.status()` says (its last run, a run in progress). */
  sync?: SyncStatus
  /** The communes Marianne's geo connection knows. */
  communes?: Commune[]
  /** The commune of the user's address (none by default). */
  home?: HomeCommune | null
  /** The profile fields the user granted, their vehicles, leaning, themes and news sources (given only when granted, as Marianne does). */
  profile?: {
    granted?: ProfileField[]
    vehicles?: Vehicle[]
    leaning?: Leaning
    themes?: string[]
    sources?: { accepted: string[]; sections?: Record<string, string[]>; leanings?: Record<string, Lean> }
  }
  /**
   * What ctx.news gives a service that declares `"news": true`: the reading (by its options: `all`,
   * a `day`), the catalogue, and the articles by headline id. `search` looks in the reading's items
   * as Marianne does in its 7 days: each word one of a title's words (title and summary) or the start of one.
   */
  news?: {
    read?: NewsReading | ((opts: { day?: string; all?: boolean }) => NewsReading)
    sources?: NewsSourceInfo[]
    articles?: Record<string, NewsArticle>
    filtered?: boolean
  }
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
  const { answer, answerText, communes = [], home = null, profile = {}, dataDir = '', sync = {} } = options
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
      text: answerText ? async (url: string) => (urls.push(new URL(url)), answerText(new URL(url))) : offline,
      page: answerText ? async (url: string) => (urls.push(new URL(url)), answerText(new URL(url))) : offline
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    storage: {
      // As the archive does: what is read back is a copy of what was written.
      get: <T>(key: string) => (stored.has(key) ? (structuredClone(stored.get(key)) as T) : null),
      set: (key, value) => void stored.set(key, structuredClone(value)),
      remove: (key) => void stored.delete(key)
    },
    dataDir,
    geo: {
      findCommunes: async (text, limit = 5) =>
        communes.filter((c) => c.code === text || c.postalCodes.includes(text) || c.name.toLowerCase().startsWith(text.toLowerCase())).slice(0, limit),
      getCommune: async (code) => communes.find((c) => c.code === code) ?? null
    },
    home: () => home,
    profile: {
      granted: () => profile.granted ?? [],
      vehicles: () => profile.vehicles ?? [],
      leaning: () => ((profile.granted ?? []).includes('opinions.leaning') ? (profile.leaning ?? null) : null),
      themes: () => ((profile.granted ?? []).includes('opinions.themes') ? (profile.themes ?? []) : []),
      sources: () =>
        (profile.granted ?? []).includes('opinions.sources') && profile.sources
          ? { accepted: [...profile.sources.accepted], sections: { ...(profile.sources.sections ?? {}) }, leanings: { ...(profile.sources.leanings ?? {}) } }
          : null
    },
    sync: { status: () => sync, run: async () => {} }
  }
  if (manifest.news) ctx.news = fakeNews(options.news ?? {}, (profile.granted ?? []).includes('opinions.sources'))
  return { ctx, urls, stored }
}

/**
 * A tile as Marianne would show it, checked: throws, listing them, when Marianne would cut a text
 * or leave a part out. In a service's tests, `expect(checkTile(await runtime.tile())).toEqual(…)`
 * keeps its tile within its limits. Null: the default tile.
 */
export function checkTile(tile: unknown): ServiceTile | null {
  const read = readTile(tile)
  if (read.problems.length) throw new Error(`Marianne would change this tile:\n- ${read.problems.join('\n- ')}`)
  return read.tile
}

const EMPTY_READING: NewsReading = { items: [], subjects: [], failed: [], readAt: '1970-01-01T00:00:00.000Z' }

function fakeNews(news: NonNullable<FakeContextOptions['news']>, granted: boolean): ServiceNews {
  const read = async (opts: { day?: string; all?: boolean } = {}) =>
    structuredClone(typeof news.read === 'function' ? news.read(opts) : (news.read ?? EMPTY_READING))
  return {
    filtered: () => news.filtered ?? granted,
    read,
    search: async (words, opts = {}) => {
      const wanted = [...titleWords(String(words ?? ''))]
      if (!wanted.length) return []
      const items = (await read({ all: opts.all })).items.filter((i) => {
        const has = [...titleWords(`${i.title} ${i.summary ?? ''}`)]
        return wanted.every((w) => has.some((h) => h === w || h.startsWith(w)))
      })
      const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 200)
      return items.filter((i) => !opts.since || Date.parse(i.published) >= Date.parse(opts.since)).slice(0, limit)
    },
    article: async (id) => structuredClone(news.articles?.[id] ?? null),
    sources: async () => structuredClone(news.sources ?? [])
  }
}
