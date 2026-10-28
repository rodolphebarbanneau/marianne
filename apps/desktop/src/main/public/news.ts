import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import type { NewsDigest, NewsItem, NewsStory } from '../../shared/public'
import { content } from '../content'
import { fetchAsBrowser } from '../http'
import { log } from '../log'

/**
 * Actualités: the headlines of the sources the user picked, from their RSS 2.0 or Atom feeds.
 * Only what a feed shows is kept (title, time, link, a short summary), never the article. Feeds
 * are fetched like a browser would (some CDNs refuse anything else), cached a few minutes each,
 * and a failing feed doesn't hold up the others. Headlines from several sources about the same
 * story are grouped, so the screen can say "aussi chez …".
 */

const FEED_TTL = 5 * 60_000
/** Older items are not news any more (a fact-checker's feed can be a week old). */
const MAX_AGE = 7 * 86_400_000
const SUMMARY_MAX = 200

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ['item', 'entry', 'link', 'category'].includes(name)
})

type Node = Record<string, unknown>

/** The text of an element, whatever shape the parser gave it (string, {#text}, list). */
function text(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return text(v[0])
  if (typeof v === 'object') return text((v as Node)['#text'])
  return String(v).trim()
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Entities left over by double-encoding feeds ("&amp;#039;"). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** Plain text from a feed's HTML, cut on a word to `max` characters. */
export function plainText(html: string, max = SUMMARY_MAX): string {
  const t = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&lt;[\s\S]*?&gt;/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  return `${cut.slice(0, cut.lastIndexOf(' ') > max / 2 ? cut.lastIndexOf(' ') : cut.length).replace(/[\s,;:.–-]+$/, '')}…`
}

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

/** When Marianne first saw an undated item (Le Parisien's feeds have no dates). */
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

function date(...values: unknown[]): string {
  for (const v of values) {
    const t = Date.parse(text(v))
    if (!Number.isNaN(t)) return new Date(t).toISOString()
  }
  return ''
}

/** An Atom entry's page: the alternate link (or the first without rel). */
function atomLink(links: unknown): string {
  const list = (Array.isArray(links) ? links : [links]).filter(Boolean) as Node[]
  const page = list.find((l) => typeof l === 'object' && (!l['@rel'] || l['@rel'] === 'alternate')) ?? list[0]
  return typeof page === 'object' ? text(page['@href']) : text(page)
}

function category(values: unknown): string | undefined {
  for (const c of (Array.isArray(values) ? values : [values]) as unknown[]) {
    const t = typeof c === 'object' && c ? text((c as Node)['@label'] ?? (c as Node)['@term'] ?? c) : text(c)
    if (t) return decodeEntities(t)
  }
  return undefined
}

/** The items of an RSS 2.0, RSS 1.0 (RDF) or Atom feed, in the feed's order. */
export function parseFeed(xml: string, source: string, now = new Date()): NewsItem[] {
  const doc = parser.parse(xml) as Node
  const channel = (doc.rss as Node | undefined)?.channel as Node | undefined
  const atom = doc.feed as Node | undefined
  const rdf = doc['rdf:RDF'] as Node | undefined
  const raw = ((channel?.item ?? atom?.entry ?? rdf?.item ?? []) as Node[]).filter((n) => typeof n === 'object')
  if (!channel && !atom && !rdf) throw new Error('Ce n’est pas un flux RSS ou Atom')
  const out: NewsItem[] = []
  for (const n of raw) {
    const title = plainText(text(n.title), 300)
    const guid = text(n.guid ?? n.id)
    const permalink = /^https?:/.test(guid) && (n.guid as Node | undefined)?.['@isPermaLink'] !== 'false' ? guid : ''
    const url = cleanUrl((atom ? atomLink(n.link) : text(n.link)) || permalink)
    if (!title || !url) continue
    const id = itemId(source, guid || url)
    const summary = plainText(text(n.description ?? n.summary ?? n['media:description'] ?? n.content))
    const cat = category(n.category ?? n['dc:subject'])
    out.push({
      id,
      source,
      title,
      url,
      published: date(n.pubDate, n['dc:date'], n.published, n.updated) || seen(id, now),
      ...(cat ? { category: cat } : {}),
      ...(summary && summary !== title ? { summary } : {})
    })
  }
  return out
}

// ---------------------------------------------------------------- grouping

const STOP_WORDS = new Set(
  `le la les un une des du de d l au aux et ou en a est sont ete etre que qui quoi dont dans pour par sur sous avec sans ce cet cette ces
  son sa ses leur leurs il elle ils elles on nous vous se ne pas plus moins tres apres avant pendant depuis selon contre entre chez vers
  comme mais car donc ni si tout tous toute toutes y ont fait faire peut doit va vont the of and to in`.split(/\s+/)
)
/** Labels feeds put before titles. */
const NOISE = new Set(
  'direct live video videos replay podcast info infos reportage entretien interview tribune analyse recit chronique edito photos'.split(' ')
)

/** The words of a title that say what it is about: lowercase, no accents, no small words, crude plural folding. */
export function titleWords(title: string): Set<string> {
  const words = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => (w.length > 2 || /^\d+$/.test(w)) && !STOP_WORDS.has(w) && !NOISE.has(w))
    .map((w) => (w.length > 4 ? w.replace(/[sx]$/, '') : w))
  return new Set(words)
}

/** Shared words over the shorter title's words; 0 below three shared words. */
export function similarity(a: Set<string>, b: Set<string>): number {
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  return shared < 3 ? 0 : shared / Math.min(a.size, b.size)
}

const SAME_STORY = 0.5

/**
 * Items about the same story, from different sources, in one story each. Stories covered by
 * more sources come first, then the most recent.
 */
export function groupStories(items: NewsItem[]): NewsStory[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
  const groups: Array<{ story: NewsStory; words: Array<Set<string>>; sources: Set<string> }> = []
  for (const item of sorted) {
    const words = titleWords(item.title)
    let best: (typeof groups)[number] | undefined
    let bestScore = 0
    for (const g of groups) {
      if (g.sources.has(item.source)) continue
      const score = Math.max(...g.words.map((w) => similarity(words, w)))
      if (score > bestScore) [best, bestScore] = [g, score]
    }
    if (best && bestScore >= SAME_STORY) {
      best.story.others.push(item)
      best.words.push(words)
      best.sources.add(item.source)
    } else groups.push({ story: { id: item.id, item, others: [] }, words: [words], sources: new Set([item.source]) })
  }
  return groups.map((g) => g.story).sort((a, b) => b.others.length - a.others.length || Date.parse(b.item.published) - Date.parse(a.item.published))
}

// ---------------------------------------------------------------- fetching

const feeds = new Map<string, { at: number; items: NewsItem[] }>()
const pending = new Map<string, Promise<NewsItem[]>>()

/** A feed's items, from the cache when fresh; a failure falls back on the last items, if any. */
async function feedItems(source: string, url: string): Promise<NewsItem[]> {
  const key = `${source} ${url}`
  const hit = feeds.get(key)
  if (hit && Date.now() - hit.at < FEED_TTL) return hit.items
  let job = pending.get(key)
  if (!job) {
    job = fetchAsBrowser(url, { accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5' })
      .then((xml) => {
        const items = parseFeed(xml, source)
        feeds.set(key, { at: Date.now(), items })
        return items
      })
      .finally(() => pending.delete(key))
    pending.set(key, job)
  }
  return job
}

export interface NewsOptions {
  /** Ids of catalog sources (the content's news-sources.json) and of the user's own feeds. */
  sources: string[]
  /** Headlines kept from each feed, in its own order (default 5). */
  perSource?: number
  /** Group the same story told by several sources (default true). */
  group?: boolean
  /** The user's own feeds: shown when their id is in `sources`. */
  custom?: Array<{ id: string; name: string; url: string }>
}

/** The headlines of the chosen sources: a story per item, or grouped. */
export async function fetchNews(opts: NewsOptions): Promise<NewsDigest> {
  const perSource = opts.perSource ?? 5
  const wanted = opts.sources.flatMap((id) => {
    const url = content.get().newsSources.find((s) => s.id === id)?.feed ?? opts.custom?.find((c) => c.id === id)?.url
    return url ? [{ id, url }] : []
  })
  const failed: NewsDigest['failed'] = []
  const cutoff = Date.now() - MAX_AGE
  const lists = await Promise.all(
    wanted.map(async ({ id, url }) => {
      try {
        return (await feedItems(id, url)).filter((i) => Date.parse(i.published) >= cutoff).slice(0, perSource)
      } catch (err) {
        const message = (err as Error).message
        log.warn(`News feed ${id} failed:`, message)
        failed.push({ source: id, message })
        return (feeds.get(`${id} ${url}`)?.items ?? []).slice(0, perSource)
      }
    })
  )
  const items = lists.flat()
  const stories =
    opts.group === false
      ? items.sort((a, b) => Date.parse(b.published) - Date.parse(a.published)).map((item) => ({ id: item.id, item, others: [] }))
      : groupStories(items)
  return { stories, failed, fetchedAt: new Date().toISOString() }
}
