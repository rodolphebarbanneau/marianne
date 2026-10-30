import { createHash } from 'node:crypto'
import type { NewsSource } from '@marianne/content'
import type { NewsChoice } from '@marianne/profile'
import {
  groupSubjects,
  subjectWords,
  titleWords,
  type NewsArticle,
  type NewsHeadline,
  type NewsReading,
  type NewsSourceInfo,
  type NewsSubject
} from '@marianne/sdk'
import type { ServiceNews } from '@marianne/sdk/main'
import { XMLParser } from 'fast-xml-parser'
import { accepted, keptSections, leanOf, refusedSources, type NewsStats } from '../../shared/news'
import { content } from '../content'
import { fetchAsBrowser } from '../http'
import { log } from '../log'
import { paths } from '../paths'
import { session } from '../session'
import { durationLabel, kindOf, publicUrl, readArticle, readerStart, type MediaRef } from './article'
import { decodeEntities, plainText } from './html'
import { AHEAD_MS, NewsHistory, type StoredItem } from './news-history'
import { parisDay, parisIso } from './time'

export { decodeEntities, plainText }

/**
 * The headlines Marianne reads for the services that declare `"news": true` (ctx.news): the
 * RSS 2.0 or Atom feeds of the whole catalogue (news-sources.json), every source and its sections,
 * whatever the user accepts, so that outlets can't tell from Marianne's requests which ones they
 * read, and so that « toutes » and the counts of set-aside sources work. Only what a feed shows is
 * kept (title, time, link, a short summary, its picture), never the article. Feeds are fetched like
 * a browser would (some CDNs refuse anything else), kept five minutes each, and a failing feed
 * doesn't hold up the others; the 7-day history (news-history) keeps what they no longer list.
 *
 * Titles are grouped into subjects over everything read, then filtered by what the asking service
 * may read: with opinions.sources, the user's accepted sources and sections (and, on demand, the
 * set-aside ones, marked); without it, every source, unmarked. Reading happens only when a service
 * asks: there is no polling of its own.
 */

const FEED_TTL = 5 * 60_000
const DAY_MS = 86_400_000
/** Feeds read at once: the catalogue has dozens. */
const AT_ONCE = 8
/** A feed is a few hundred kilobytes; one far larger isn't read. */
const FEED_BYTES = 3 * 1024 * 1024
/** The articles kept in memory, the last ones asked. */
const ARTICLES_KEPT = 200

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ['item', 'entry', 'link', 'category', 'media:content', 'media:thumbnail', 'enclosure'].includes(name)
})

type Node = Record<string, unknown>

/** The text of an element, whatever shape the parser gave it (string, {#text}, list). */
function text(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return text(v[0])
  if (typeof v === 'object') return text((v as Node)['#text'])
  return String(v).trim()
}

const list = (v: unknown): Node[] => (Array.isArray(v) ? v : v ? [v] : []).filter((x): x is Node => typeof x === 'object' && x !== null)

/** Without the trackers publishers add to their feed links. */
export function cleanUrl(raw: string): string {
  try {
    const url = new URL(decodeEntities(raw.trim()))
    if (!/^https?:$/.test(url.protocol)) return ''
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|at_|xtor$|xts$|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key)
    if (/^#xtor/i.test(url.hash)) url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

const itemId = (source: string, key: string) => createHash('sha1').update(`${source}|${key}`).digest('hex').slice(0, 16)

/** When Marianne first saw an undated item (Le Parisien's feeds have no dates); the history keeps it after. */
const firstSeen = new Map<string, string>()

function seen(id: string, now: Date): string {
  let at = firstSeen.get(id)
  if (!at) {
    if (firstSeen.size > 5000) firstSeen.delete(firstSeen.keys().next().value!)
    at = now.toISOString()
    firstSeen.set(id, at)
  }
  return at
}

/** The day an article's address carries (« …-30-10-2026-….php », « /2026/10/30/ »), YYYY-MM-DD; '' without one. */
export function urlDay(url: string): string {
  const dmy = /[-_/](\d{2})-(\d{2})-(20\d{2})(?=[-_/.]|$)/.exec(url)
  const ymd = /\/(20\d{2})\/(\d{2})\/(\d{2})\//.exec(url)
  const [y, m, d] = dmy ? [dmy[3], dmy[2], dmy[1]] : ymd ? [ymd[1], ymd[2], ymd[3]] : []
  if (!y || Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return ''
  return `${y}-${m}-${d}`
}

/**
 * An undated item's time: an earlier day its address says, at noon (not this morning's news); else
 * when Marianne first saw it. Without this, a first reading of an undated feed would put its whole
 * week in the hour of the reading.
 */
function undated(id: string, url: string, now: Date): string {
  const day = urlDay(url)
  return day && day < parisDay(now) ? new Date(parisIso(`${day} 12:00:00`)).toISOString() : seen(id, now)
}

function date(...values: unknown[]): string {
  for (const v of values) {
    const t = Date.parse(text(v))
    if (!Number.isNaN(t)) return new Date(t).toISOString()
  }
  return ''
}

/** An Atom entry's page: the alternate link (or the first without rel). */
function atomLink(links: unknown): string {
  const all = (Array.isArray(links) ? links : [links]).filter(Boolean) as Node[]
  const page = all.find((l) => typeof l === 'object' && (!l['@rel'] || l['@rel'] === 'alternate')) ?? all[0]
  return typeof page === 'object' ? text(page['@href']) : text(page)
}

function category(values: unknown): string | undefined {
  for (const c of (Array.isArray(values) ? values : [values]) as unknown[]) {
    const t = typeof c === 'object' && c ? text((c as Node)['@label'] ?? (c as Node)['@term'] ?? c) : text(c)
    if (t) return decodeEntities(t)
  }
  return undefined
}

/** A headline as a feed gives it, with what its article will need. */
export interface FeedItem {
  id: string
  source: string
  title: string
  url: string
  /** ISO. When the feed gives none: when Marianne first saw it. */
  published: string
  category?: string
  /** Plain text, 200 characters at most. */
  summary?: string
  /** The picture the feed points to (or a video's frame). */
  media?: MediaRef
  /** The start of the article, when the feed gives its text (content:encoded). */
  start?: string
}

const IMAGE_FILE = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i

/**
 * The picture a feed gives an item: media:content (the size closest above PHOTO_WIDTH, a video's
 * thumbnail), media:thumbnail, an image enclosure (RSS) or enclosure link (Atom).
 */
function feedMedia(n: Node, title: string): MediaRef | undefined {
  const group = list(n['media:group'])[0]
  const caption = (c?: Node) => plainText(text(c?.['media:description'] ?? n['media:description'] ?? c?.['media:title'] ?? ''), 300)
  const credit = (c?: Node) => plainText(text(c?.['media:credit'] ?? n['media:credit'] ?? group?.['media:credit'] ?? ''), 120)
  const thumbOf = (c?: Node) => text(list(c?.['media:thumbnail'])[0]?.['@url']) || text(list(n['media:thumbnail'])[0]?.['@url'])
  const ref = (url: string, alt: string, by: string, video: boolean, seconds?: unknown): MediaRef | undefined => {
    const safe = publicUrl(url)
    if (!safe) return undefined
    const duration = video ? durationLabel(seconds) : undefined
    return { url: safe, kind: kindOf(alt, video), alt: alt === title ? '' : alt, ...(by ? { credit: by } : {}), ...(duration ? { duration } : {}) }
  }
  const contents = [...list(n['media:content']), ...list(group?.['media:content'])]
  const images = contents.filter((c) => {
    const medium = text(c['@medium'])
    const type = text(c['@type'])
    return medium === 'image' || /^image\//.test(type) || (!medium && !type && IMAGE_FILE.test(text(c['@url'])))
  })
  const width = (c: Node) => Number(text(c['@width'])) || 0
  const best = [...images].sort((a, b) => {
    const [wa, wb] = [width(a), width(b)]
    // The smallest at least as wide as the picture shown, else the widest.
    if (wa >= 400 !== wb >= 400) return wa >= 400 ? -1 : 1
    return wa >= 400 ? wa - wb : wb - wa
  })[0]
  if (best) return ref(text(best['@url']), caption(best), credit(best), false)
  const video = contents.find((c) => text(c['@medium']) === 'video' || /^video\//.test(text(c['@type'])))
  if (video && thumbOf(video)) return ref(thumbOf(video), caption(video), credit(video), true, video['@duration'])
  if (thumbOf()) return ref(thumbOf(), caption(), credit(), false)
  const enclosures = [...list(n.enclosure), ...list(n.link).filter((l) => text(l['@rel']) === 'enclosure')].map((e) => ({
    url: text(e['@url'] ?? e['@href']),
    type: text(e['@type'])
  }))
  const image = enclosures.find((e) => /^image\//.test(e.type) || (!e.type && IMAGE_FILE.test(e.url)))
  if (image) return ref(image.url, caption(), credit(), false)
  return undefined
}

/** What a news sitemap says of an article: when it was published, and its picture. */
export interface SitemapEntry {
  published: string
  image?: string
  caption?: string
}

/**
 * A news sitemap (sitemaps.org, with Google News' publication dates and image entries), by the
 * article's address as a feed links it (trackers aside). Entries without a date are left out.
 */
export function parseSitemap(xml: string): Map<string, SitemapEntry> {
  const doc = parser.parse(xml) as Node
  const urls = ((doc.urlset as Node | undefined)?.url ?? []) as unknown
  const out = new Map<string, SitemapEntry>()
  for (const u of (Array.isArray(urls) ? urls : [urls]) as Node[]) {
    if (!u || typeof u !== 'object') continue
    const loc = cleanUrl(text(u.loc))
    const news = u['news:news'] as Node | undefined
    const published = date(news?.['news:publication_date'], u.lastmod)
    if (!loc || !published) continue
    const image = (Array.isArray(u['image:image']) ? u['image:image'][0] : u['image:image']) as Node | undefined
    const src = cleanUrl(text(image?.['image:loc']))
    const caption = plainText(text(image?.['image:caption']), 200)
    out.set(loc, { published, ...(src ? { image: src } : {}), ...(caption ? { caption } : {}) })
  }
  return out
}

/**
 * The items of an RSS 2.0, RSS 1.0 (RDF) or Atom feed, in the feed's order. `dates`: the source's
 * news sitemap, for the items the feed leaves undated (their time, their picture).
 */
export function parseFeed(xml: string, source: string, now = new Date(), dates?: Map<string, SitemapEntry>): FeedItem[] {
  const doc = parser.parse(xml) as Node
  const channel = (doc.rss as Node | undefined)?.channel as Node | undefined
  const atom = doc.feed as Node | undefined
  const rdf = doc['rdf:RDF'] as Node | undefined
  const raw = ((channel?.item ?? atom?.entry ?? rdf?.item ?? []) as Node[]).filter((n) => typeof n === 'object')
  if (!channel && !atom && !rdf) throw new Error('Ce n’est pas un flux RSS ou Atom')
  const out: FeedItem[] = []
  for (const n of raw) {
    const title = plainText(text(n.title), 300)
    const guid = text(n.guid ?? n.id)
    const permalink = /^https?:/.test(guid) && (n.guid as Node | undefined)?.['@isPermaLink'] !== 'false' ? guid : ''
    const url = cleanUrl((atom ? atomLink(n.link) : text(n.link)) || permalink)
    if (!title || !url) continue
    const id = itemId(source, guid || url)
    const summary = plainText(text(n.description ?? n.summary ?? n['media:description'] ?? n.content))
    const cat = category(n.category ?? n['dc:subject'])
    const listed = dates?.get(url)
    const media = feedMedia(n, title) ?? (listed?.image ? { url: listed.image, kind: 'photo' as const, alt: listed.caption ?? title } : undefined)
    // The article's own text, when the feed gives it: the start is read from it, not from the page.
    const encoded = text(n['content:encoded'])
    const start = encoded ? readerStart(/<p[\s>]/i.test(encoded) ? encoded : `<p>${encoded}</p>`, summary) : ''
    out.push({
      id,
      source,
      title,
      url,
      published: date(n.pubDate, n['dc:date'], n.published, n.updated) || listed?.published || undated(id, url, now),
      ...(cat ? { category: cat } : {}),
      ...(summary && summary !== title ? { summary } : {}),
      ...(media ? { media } : {}),
      ...(start ? { start } : {})
    })
  }
  return out
}

// ---------------------------------------------------------------- fetching

/** One feed of the catalogue: a source's section, or its front page when it lists none. */
interface Feed {
  source: string
  section?: string
  url: string
  /** The source's news sitemap, when its feeds give no dates. */
  dates?: string
}

export const catalogueFeeds = (catalogue: NewsSource[]): Feed[] =>
  catalogue.flatMap((s) =>
    (s.sections?.length ? s.sections.map((x) => ({ source: s.id, section: x.id, url: x.feed })) : [{ source: s.id, url: s.feed }]).map((f) =>
      s.dates ? { ...f, dates: s.dates } : f
    )
  )

const sitemaps = new Map<string, { at: number; entries: Map<string, SitemapEntry> }>()
const pendingSitemaps = new Map<string, Promise<Map<string, SitemapEntry>>>()

/** A source's news sitemap, from the cache when fresh; one request for all of its feeds. */
function sitemapEntries(url: string): Promise<Map<string, SitemapEntry>> {
  const hit = sitemaps.get(url)
  if (hit && Date.now() - hit.at < FEED_TTL) return Promise.resolve(hit.entries)
  let job = pendingSitemaps.get(url)
  if (!job) {
    job = fetchAsBrowser(url, { accept: 'application/xml, text/xml;q=0.9, */*;q=0.5', maxBytes: FEED_BYTES })
      .then((xml) => {
        const entries = parseSitemap(xml)
        sitemaps.set(url, { at: Date.now(), entries })
        return entries
      })
      .finally(() => pendingSitemaps.delete(url))
    pendingSitemaps.set(url, job)
  }
  return job
}

const feeds = new Map<string, { at: number; items: FeedItem[] }>()
const pending = new Map<string, Promise<FeedItem[]>>()

/** A feed's items, from the cache when fresh. */
async function feedItems(feed: Feed): Promise<FeedItem[]> {
  const key = `${feed.source} ${feed.url}`
  const hit = feeds.get(key)
  if (hit && Date.now() - hit.at < FEED_TTL) return hit.items
  let job = pending.get(key)
  if (!job) {
    // An undated feed is read with its sitemap; without the sitemap (it failed), its items are dated as before.
    const dates = feed.dates
      ? sitemapEntries(feed.dates).catch((err: unknown) => {
          log.warn(`News sitemap ${feed.source} failed:`, (err as Error).message)
          return undefined
        })
      : Promise.resolve(undefined)
    job = Promise.all([
      fetchAsBrowser(feed.url, {
        accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
        maxBytes: FEED_BYTES
      }),
      dates
    ])
      .then(([xml, entries]) => {
        const items = parseFeed(xml, feed.source, new Date(), entries)
        feeds.set(key, { at: Date.now(), items })
        return items
      })
      .finally(() => pending.delete(key))
    pending.set(key, job)
  }
  return job
}

/** `run` over `items`, `limit` at a time. */
async function pool<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await run(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * Every feed of the catalogue, read: their titles (one per id, with every section that lists it),
 * the sources none of whose feeds answered, and whether any did.
 */
export async function readCatalogue(catalogue: NewsSource[]): Promise<{ items: StoredItem[]; failed: string[]; answered: boolean }> {
  const all = catalogueFeeds(catalogue)
  const results = await pool(all, AT_ONCE, async (feed) => {
    try {
      return { feed, items: await feedItems(feed) }
    } catch (err) {
      log.warn(`News feed ${feed.source}${feed.section ? `/${feed.section}` : ''} failed:`, (err as Error).message)
      return { feed, items: null }
    }
  })
  const byId = new Map<string, StoredItem>()
  const answering = new Set<string>()
  for (const { feed, items } of results) {
    if (!items) continue
    answering.add(feed.source)
    for (const item of items) {
      const kept = byId.get(item.id)
      if (kept) {
        if (feed.section && !kept.sections?.includes(feed.section)) kept.sections = [...(kept.sections ?? []), feed.section]
        continue
      }
      const { category: _category, ...headline } = item
      byId.set(item.id, { ...headline, ...(feed.section ? { section: feed.section, sections: [feed.section] } : {}) })
    }
  }
  const failed = [...new Set(all.map((f) => f.source))].filter((s) => !answering.has(s))
  return { items: [...byId.values()], failed, answered: answering.size > 0 }
}

// ---------------------------------------------------------------- the reading

/** What a service may see: whether it may read opinions.sources, the user's choice, the region of their address. */
export interface NewsView {
  granted: boolean
  choice: NewsChoice | null
  region: string | null
  /** The set-aside sources too, marked (only when granted). */
  all?: boolean
}

/** A reading of everything, before any filter: the subjects are grouped over every source. */
export interface WholeReading {
  items: StoredItem[]
  subjects: Array<{ id: string; items: StoredItem[] }>
  failed: string[]
  readAt: string
  offline?: boolean
}

/** What services see of a title: never what Marianne keeps for its article. */
const headline = (i: StoredItem): NewsHeadline => ({
  id: i.id,
  source: i.source,
  ...(i.section ? { section: i.section } : {}),
  title: i.title,
  url: i.url,
  published: i.published,
  ...(i.summary ? { summary: i.summary } : {})
})

/**
 * How a view sees each title: shown, set aside (shown, marked, only with `all`), or not at all.
 * A title of a source the catalogue no longer has is never shown.
 */
function sorter(catalogue: NewsSource[], view: NewsView): (item: StoredItem) => NewsHeadline | null {
  const byId = new Map(catalogue.map((s) => [s.id, s]))
  if (!view.granted) return (i) => (byId.has(i.source) ? headline(i) : null)
  const refused = refusedSources(catalogue, view.choice, view.region)
  const kept = new Map(catalogue.map((s) => [s.id, accepted(s, view.choice, refused) ? keptSections(s, view.choice) : null]))
  return (i) => {
    const source = byId.get(i.source)
    if (!source) return null
    const sections = kept.get(i.source)
    const shown =
      sections !== null && sections !== undefined && (!source.sections?.length || !i.sections?.length || i.sections.some((s) => sections.includes(s)))
    if (shown) return headline(i)
    return view.all ? { ...headline(i), setAside: true } : null
  }
}

/**
 * A whole reading as a service sees it. The subjects were grouped over everything: here each keeps
 * the titles the view shows, and stays a subject with two of them at least, its id unchanged.
 */
export function filterReading(whole: WholeReading, catalogue: NewsSource[], view: NewsView): NewsReading {
  const see = sorter(catalogue, view)
  const items = whole.items.flatMap((i) => see(i) ?? [])
  const subjects: NewsSubject[] = whole.subjects
    .map((s) => ({ id: s.id, items: s.items.flatMap((i) => see(i) ?? []) }))
    .filter((s) => s.items.length > 1)
    .sort((a, b) => b.items.length - a.items.length || Date.parse(b.items[0].published) - Date.parse(a.items[0].published))
  const shownSources = new Set(catalogue.filter((s) => see({ id: '', source: s.id, title: '', url: '', published: '' })).map((s) => s.id))
  return {
    items,
    subjects,
    failed: whole.failed.filter((s) => shownSources.has(s)),
    readAt: whole.readAt,
    ...(whole.offline ? { offline: true } : {})
  }
}

/** The catalogue as a view names and colours it: the user's colours and set-aside sources only when granted. */
export function sourcesFor(catalogue: NewsSource[], view: NewsView, perDay: Record<string, number> = {}): NewsSourceInfo[] {
  const refused = view.granted ? refusedSources(catalogue, view.choice, view.region) : new Set<string>()
  return catalogue.flatMap((s): NewsSourceInfo[] => {
    const setAside = view.granted && !accepted(s, view.choice, refused)
    if (setAside && !view.all) return []
    let site = s.homepage
    try {
      site = new URL(s.homepage).hostname.replace(/^www\./, '')
    } catch {
      // A homepage that isn't a URL is shown as it is.
    }
    return [
      {
        id: s.id,
        name: s.name,
        group: s.group,
        site,
        lean: view.granted ? leanOf(s, view.choice) : (s.lean ?? 'aucune'),
        ...(s.sections?.length ? { sections: s.sections.map((x) => ({ id: x.id, label: x.label })) } : {}),
        ...(setAside ? { setAside: true } : {}),
        ...(view.region && s.regions?.includes(view.region) ? { home: true } : {}),
        ...(perDay[s.id] ? { perDay: perDay[s.id] } : {})
      }
    ]
  })
}

/** Whether a title answers words: each of them is one of its words (title and summary), or starts one. */
function matcher(words: string): ((i: StoredItem) => boolean) | null {
  const wanted = [...titleWords(words)]
  if (!wanted.length) return null
  return (i) => {
    const has = [...titleWords(`${i.title} ${i.summary ?? ''}`)]
    return wanted.every((w) => has.some((h) => h === w || h.startsWith(w)))
  }
}

/**
 * The end of the 24-hour window: now, rounded up to the five minutes, so that readings close in
 * time share one grouping (the subjects aren't grouped again at each call).
 */
const windowEnd = () => Math.ceil(Date.now() / FEED_TTL) * FEED_TTL

const oldestFirst = (items: StoredItem[]) => [...items].sort((a, b) => Date.parse(a.published) - Date.parse(b.published))

export class NewsReader {
  readonly history: NewsHistory
  /** The last reading of the feeds: when, which sources failed, whether none answered. */
  private last: { at: number; readAt: string; failed: string[]; offline: boolean } | null = null
  private reading: Promise<void> | null = null
  /** Subjects grouped from the history, kept until its titles change (a title in, changed or gone). */
  private grouped = new Map<string, { version: number; subjects: Array<{ id: string; items: StoredItem[] }>; single: StoredItem[] }>()
  /** The stats of Réglages, kept until the history changes or the 24-hour window moves on. */
  private counted: { key: string; stats: NewsStats } | null = null
  /** Articles being read. */
  private inFlight = new Map<string, Promise<NewsArticle | null>>()
  /**
   * Articles read, in memory only and the last ARTICLES_KEPT asked first: which ones the user opened
   * is theirs, and the history is written in the clear. One that couldn't be read whole (a page or
   * a picture that didn't answer) is kept five minutes, then asked again.
   */
  private articles = new Map<string, { article: NewsArticle | null; until: number }>()

  constructor(dir: () => string = () => paths.news) {
    this.history = new NewsHistory(dir)
  }

  /** The feeds read again, unless they were less than five minutes ago; one reading at a time. */
  refresh(): Promise<void> {
    if (this.last && Date.now() - this.last.at < FEED_TTL) return Promise.resolve()
    this.reading ??= (async () => {
      try {
        const { items, failed, answered } = await readCatalogue(content.get().newsSources)
        this.history.merge(items)
        this.last = { at: Date.now(), readAt: answered ? new Date().toISOString() : (this.last?.readAt ?? ''), failed, offline: !answered }
      } finally {
        this.reading = null
      }
    })()
    return this.reading
  }

  private group(key: string, items: StoredItem[]) {
    const hit = this.grouped.get(key)
    if (hit && hit.version === this.history.version) return hit
    // groupSubjects takes headlines and gives the same objects back: the stored items keep their media.
    const { subjects, single } = groupSubjects(items) as unknown as { subjects: Array<{ id: string; items: StoredItem[] }>; single: StoredItem[] }
    const result = { version: this.history.version, subjects, single }
    if (this.grouped.size > 16) this.grouped.clear()
    this.grouped.set(key, result)
    return result
  }

  /**
   * The last 24 hours (read now, the history filling what the feeds no longer list), or a day of the
   * history: every title and the subjects, over the whole catalogue. When no feed answers, the
   * history's last 24 hours of titles, said offline.
   */
  async whole(day?: string): Promise<WholeReading> {
    if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) day = undefined
    if (!day || day === parisDay()) await this.refresh()
    const all = this.history.all()
    if (day) {
      const items = all.filter((i) => parisDay(new Date(i.published)) === day)
      return { items, subjects: this.group(day, items).subjects, failed: [], readAt: this.last?.readAt || new Date().toISOString() }
    }
    const offline = this.last?.offline ?? true
    // Offline, the window ends with the newest title kept (« hors ligne · titres de 9 h 12 »), never past now.
    const now = Date.now()
    const end = offline ? Math.min(now, Math.max(Date.parse(this.last?.readAt ?? '') || 0, all.length ? Date.parse(all[0].published) : 0) || now) : windowEnd()
    const { items, subjects } = this.window(all, end)
    return {
      items,
      subjects,
      failed: this.last?.failed ?? [],
      readAt: offline ? new Date(end).toISOString() : this.last!.readAt,
      ...(offline ? { offline: true } : {})
    }
  }

  /** The 24 hours before `end`, and their subjects. */
  private window(all: StoredItem[], end: number) {
    const items = all.filter((i) => {
      const t = Date.parse(i.published)
      return t >= end - DAY_MS && t <= end + AHEAD_MS
    })
    return { items, ...this.group(`window ${end}`, items) }
  }

  /** Titles over the last 7 days answering words, newest first, as a view sees them. */
  async search(words: string, opts: { since?: string; limit?: number }, see: (i: StoredItem) => NewsHeadline | null): Promise<NewsHeadline[]> {
    const match = matcher(words)
    if (!match) return []
    await this.refresh()
    const since = opts.since ? Date.parse(opts.since) : NaN
    const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 200)
    const out: NewsHeadline[] = []
    for (const i of this.history.all()) {
      if (out.length >= limit) break
      if (!Number.isNaN(since) && Date.parse(i.published) < since) break
      if (!match(i)) continue
      const shown = see(i)
      if (shown) out.push(shown)
    }
    return out
  }

  /** One title's article, read once and kept in memory; null when nothing could be read. */
  article(id: string): Promise<NewsArticle | null> {
    const item = this.history.get(id)
    if (!item) return Promise.resolve(null)
    const hit = this.articles.get(id)
    if (hit && Date.now() < hit.until) {
      // The last asked goes to the end: the first ones are those let go.
      this.articles.delete(id)
      this.articles.set(id, hit)
      return Promise.resolve(structuredClone(hit.article))
    }
    let job = this.inFlight.get(id)
    if (!job) {
      const source = content.get().newsSources.find((s) => s.id === item.source)
      job = readArticle(item, source)
        .then(({ article, settled }) => {
          this.articles.delete(id)
          while (this.articles.size >= ARTICLES_KEPT) this.articles.delete(this.articles.keys().next().value!)
          this.articles.set(id, { article, until: settled ? Infinity : Date.now() + FEED_TTL })
          return article
        })
        .finally(() => this.inFlight.delete(id))
      this.inFlight.set(id, job)
    }
    return job.then((a) => structuredClone(a))
  }

  /** The articles read let go (the account locked: what the user opened isn't kept past it). */
  forgetArticles(): void {
    this.articles.clear()
  }

  /** What the history says of each source, for Réglages: from what was read, without reading. */
  stats(): NewsStats {
    const now = new Date()
    const all = this.history.all(now)
    // The same until a title comes or goes, or the window moves (five minutes; the morning's count with it).
    const key = `${this.history.version} ${windowEnd()} ${parisDay(now)}`
    if (this.counted?.key === key) return this.counted.stats
    this.counted = { key, stats: this.count(all, now) }
    return this.counted.stats
  }

  private count(all: StoredItem[], now: Date): NewsStats {
    const perDay: Record<string, number> = {}
    if (all.length) {
      // Over the days the history covers (seven at most, one at least): a fresh history isn't a slow day.
      const days = Math.min(7, Math.max(1, (now.getTime() - Date.parse(all[all.length - 1].published)) / DAY_MS))
      const counts = new Map<string, number>()
      for (const i of all) counts.set(i.source, (counts.get(i.source) ?? 0) + 1)
      for (const [source, n] of counts) perDay[source] = Math.round(n / days)
    }
    const { subjects, single } = this.window(all, windowEnd())
    const today = subjects.slice(0, 10).map((s) => ({
      words: subjectWords(oldestFirst(s.items).map((i) => i.title)).label,
      sources: [...new Set(s.items.map((i) => i.source))]
    }))
    const morning = Date.parse(parisIso(`${parisDay(now)} 05:00:00`))
    const aloneThisMorning: Record<string, number> = {}
    for (const i of single) if (Date.parse(i.published) >= morning) aloneThisMorning[i.source] = (aloneThisMorning[i.source] ?? 0) + 1
    return { perDay, today, aloneThisMorning }
  }
}

export const news = new NewsReader()
session.on('locked', () => news.forgetArticles())

/** What ctx.news needs of the host: the service's grant, the user's choice, the region of their address, a note of the read. */
export interface NewsAccess {
  granted(): boolean
  choice(): NewsChoice | null
  region(): string | null
  /** The service read the user's opinions.sources (Réglages › Identité says when). */
  noteRead(): void
}

/** ctx.news for one service: the reader's titles, as that service may see them. */
export function serviceNews(access: NewsAccess, reader: NewsReader = news): ServiceNews {
  const view = (all?: boolean): NewsView => {
    const granted = access.granted()
    // The region of the address is no secret of the service (ctx.home gives the commune): it says « votre région ».
    if (!granted) return { granted, choice: null, region: access.region() }
    access.noteRead()
    return { granted, choice: access.choice(), region: access.region(), all: all === true }
  }
  const catalogue = () => content.get().newsSources
  return {
    filtered: () => access.granted(),
    read: async (opts = {}) => {
      const whole = await reader.whole(opts.day)
      return filterReading(whole, catalogue(), view(opts.all))
    },
    search: (words, opts = {}) => reader.search(String(words ?? ''), opts, sorter(catalogue(), view(opts.all))),
    article: (id) => reader.article(String(id)),
    sources: async (opts = {}) => sourcesFor(catalogue(), view(opts.all), reader.stats().perDay)
  }
}
