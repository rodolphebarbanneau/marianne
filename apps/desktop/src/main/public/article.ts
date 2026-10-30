import { isIP } from 'node:net'
import type { NewsSource } from '@marianne/content'
import type { NewsArticle } from '@marianne/sdk'
import { nativeImage } from 'electron'
import { blockedAddress } from '../community/runtime/net'
import { fetchCapped, lasting } from '../http'
import { cutAtSentence, decodeEntities, htmlText } from './html'

/**
 * The start of one article and its picture, for the headline a service shows (ctx.news.article):
 * what a reader view would show above the fold, never the whole of it. The feed's own media and
 * text come first; else the page is read once, without cookies, a few seconds at most. A page
 * behind a paywall gives nothing past its summary, and a source that asked gives no start at all.
 */

/** The start shown: four lines on screen. */
export const START_MAX = 600
/** The picture's width: a small one beside the text. */
export const PHOTO_WIDTH = 400
const WAIT_MS = 5000
/** A page's head and first paragraphs are well within this; the rest isn't read. */
const PAGE_BYTES = 1_500_000
const PHOTO_BYTES = 6_000_000

export type MediaKind = NonNullable<NewsArticle['media']>['kind']

/** The media a feed or a page points to, before Marianne fetched it. */
export interface MediaRef {
  url: string
  kind: MediaKind
  alt: string
  credit?: string
  duration?: string
}

/**
 * Only the open web, as the address reads: no file:, no address of this computer or its network.
 * The names are checked when fetched (fetchCapped resolves them, and checks each redirect).
 */
export function publicUrl(raw: string, base?: string): string | null {
  try {
    const url = new URL(decodeEntities(raw.trim()), base)
    if (!/^https?:$/.test(url.protocol)) return null
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null
    if (isIP(host) && blockedAddress(host)) return null
    return url.toString()
  } catch {
    return null
  }
}

/** « 1 min 42 », « 35 s »: a duration in seconds as the article's card says it. */
export function durationLabel(seconds: unknown): string | undefined {
  const s = Math.round(Number(seconds))
  if (!Number.isFinite(s) || s <= 0) return undefined
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`
}

/** A map or an infographic says so in its caption; anything else is a photo. */
export function kindOf(caption: string, video: boolean): MediaKind {
  if (video) return 'vidéo'
  const c = caption.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/\binfographie\b/.test(c)) return 'infographie'
  if (/\bcartes?\b/.test(c)) return 'carte'
  return 'photo'
}

// ---------------------------------------------------------------- tags

/** A start tag's name and attributes (names lowercase, values decoded). */
interface Tag {
  name: string
  attrs: Map<string, string>
}

const START_TAG = /<([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi
const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g

function attributes(raw: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of raw.matchAll(ATTRIBUTE)) {
    const name = m[1].toLowerCase()
    if (!out.has(name)) out.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''))
  }
  return out
}

function* tags(html: string, only?: string): Generator<Tag> {
  for (const m of html.matchAll(START_TAG)) {
    const name = m[1].toLowerCase()
    if (!only || name === only) yield { name, attrs: attributes(m[2]) }
  }
}

/** One compound of a selector: « div.paywall », « #premium », « [data-premium="true"] ». */
interface Compound {
  tag?: string
  id?: string
  classes: string[]
  attrs: Array<{ name: string; op?: string; value?: string }>
}

/**
 * A selector as the news list writes a paywall's mark, read simply: alternatives split by commas,
 * of each only its last compound (the element itself, its ancestors aren't checked), with a tag,
 * an id, classes and attributes (=, ~=, ^=, $=, *=). Null when it can't be read.
 */
export function readSelector(selector: string): Compound[] | null {
  const out: Compound[] = []
  for (const alternative of selector.split(',')) {
    const last =
      alternative
        .trim()
        .split(/\s*[\s>+~]\s*(?![^[]*\])/)
        .pop() ?? ''
    if (!last) return null
    const c: Compound = { classes: [], attrs: [] }
    const re = /^([a-z][a-z0-9-]*|\*)|#([\w-]+)|\.([\w-]+)|\[\s*([\w:-]+)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/giy
    let at = 0
    for (let m = re.exec(last); m; m = re.exec(last)) {
      if (m[1] && m[1] !== '*') c.tag = m[1].toLowerCase()
      else if (m[2]) c.id = m[2]
      else if (m[3]) c.classes.push(m[3])
      else if (m[4]) c.attrs.push({ name: m[4].toLowerCase(), op: m[5], value: m[6] ?? m[7] ?? m[8] })
      at = re.lastIndex
    }
    if (at !== last.length) return null
    out.push(c)
  }
  return out
}

function matches(tag: Tag, c: Compound): boolean {
  if (c.tag && tag.name !== c.tag) return false
  if (c.id && tag.attrs.get('id') !== c.id) return false
  const classes = (tag.attrs.get('class') ?? '').split(/\s+/)
  if (c.classes.some((x) => !classes.includes(x))) return false
  return c.attrs.every(({ name, op, value = '' }) => {
    const v = tag.attrs.get(name)
    if (v === undefined) return false
    switch (op) {
      case undefined:
        return true
      case '=':
        return v === value
      case '~=':
        return v.split(/\s+/).includes(value)
      case '^=':
        return v.startsWith(value)
      case '$=':
        return v.endsWith(value)
      case '*=':
        return v.includes(value)
      default:
        return v === value || v.startsWith(`${value}-`)
    }
  })
}

// ---------------------------------------------------------------- the page

/** Whether a JSON-LD value says the article is not free (schema.org isAccessibleForFree: false). */
function lockedLd(v: unknown, depth = 0): boolean {
  if (depth > 8 || v === null || typeof v !== 'object') return false
  if (Array.isArray(v)) return v.some((x) => lockedLd(x, depth + 1))
  for (const [key, value] of Object.entries(v)) {
    if (key === 'isAccessibleForFree' && (value === false || (typeof value === 'string' && value.trim().toLowerCase() === 'false'))) return true
    if (typeof value === 'object' && lockedLd(value, depth + 1)) return true
  }
  return false
}

/**
 * Whether the page is behind a paywall: its structured data says it is not free (JSON-LD or
 * microdata), its content tier is locked, or it carries the source's own mark (`marker`, a
 * selector from the news list).
 */
export function paywalled(html: string, marker?: string): boolean {
  for (const m of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try {
      if (lockedLd(JSON.parse(m[1].trim()))) return true
    } catch {
      if (/"isAccessibleForFree"\s*:\s*"?false/i.test(m[1])) return true
    }
  }
  for (const t of tags(html, 'meta')) {
    const key = (t.attrs.get('itemprop') ?? t.attrs.get('property') ?? t.attrs.get('name') ?? '').toLowerCase()
    const value = (t.attrs.get('content') ?? '').trim().toLowerCase()
    if (key === 'isaccessibleforfree' && value === 'false') return true
    if (key === 'article:content_tier' && value === 'locked') return true
  }
  const selector = marker ? readSelector(marker) : null
  if (!selector) return false
  for (const t of tags(html)) if (selector.some((c) => matches(t, c))) return true
  return false
}

/** The page's own picture (og:image, else twitter:image), and whether it is a video's. */
export function pageMedia(html: string, pageUrl: string): MediaRef | undefined {
  const meta = new Map<string, string>()
  for (const t of tags(html.slice(0, PAGE_BYTES), 'meta')) {
    const key = (t.attrs.get('property') ?? t.attrs.get('name') ?? '').toLowerCase()
    const value = t.attrs.get('content')
    if (key && value && !meta.has(key)) meta.set(key, value)
  }
  const image = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'].map((k) => meta.get(k)).find(Boolean)
  const url = image ? publicUrl(image, pageUrl) : null
  if (!url) return undefined
  const video = ['og:video', 'og:video:url', 'og:video:secure_url'].some((k) => meta.has(k)) || /^video\b/.test(meta.get('og:type') ?? '')
  const alt = (meta.get('og:image:alt') ?? meta.get('twitter:image:alt') ?? '').trim()
  const duration = video ? durationLabel(meta.get('og:video:duration') ?? meta.get('video:duration')) : undefined
  return { url, kind: kindOf(alt, video), alt, ...(duration ? { duration } : {}) }
}

/** From `open` (a start tag's index) to its own closing tag, the same tags nested inside counted. */
function element(html: string, name: string, open: number): string {
  const re = new RegExp(`<(/?)${name}(?=[\\s>/])[^>]*>`, 'gi')
  re.lastIndex = open
  let depth = 0
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return html.slice(open, m.index + m[0].length)
  }
  return html.slice(open)
}

/** What a reader view leaves out: the page's furniture, its asides, captions and forms. */
const FURNITURE = /<(script|style|noscript|template|svg|iframe|form|button|select|figure|figcaption|aside|nav|footer)\b[\s\S]*?<\/\1\s*>/gi

/** A paragraph's classes saying it is not the article's text: its standfirst, a caption, a byline, a promotion. */
const NOT_TEXT =
  /chap[oô]|standfirst|lead|intro|desc|summary|kicker|caption|legend|credit|author|byline|signature|date|meta|share|social|newsletter|related|promo|subscri|abonn|paywall|teaser|ad-|advert|cookie/i

/** Paragraphs that are the page's furniture, whatever their markup. */
const BOILERPLATE =
  /^(lire aussi|à lire aussi|a lire aussi|lire la suite|voir aussi|écouter aussi|regarder aussi|publié le|mis à jour|abonnez-vous|inscrivez-vous|newsletter|cet article est réservé|réservé aux abonnés|vous avez lu|crédits?\b|©)|cookies?/i

const folded = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** The article's paragraphs, in order, as plain text: its largest <article> (else <main>, else the page). */
export function readerParagraphs(html: string): string[] {
  const page = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(FURNITURE, ' ')
  const paragraphs = (part: string) =>
    [...part.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p\s*>/gi)].flatMap((m) => {
      const classes = `${attributes(m[1]).get('class') ?? ''} ${attributes(m[1]).get('id') ?? ''}`
      if (NOT_TEXT.test(classes)) return []
      const text = htmlText(m[2])
      return text.length >= 60 && /\p{Ll}/u.test(text) && !BOILERPLATE.test(text) ? [text] : []
    })
  let best: string[] = []
  for (const name of ['article', 'main']) {
    for (const m of page.matchAll(new RegExp(`<${name}(?=[\\s>/])`, 'gi'))) {
      const found = paragraphs(element(page, name, m.index))
      if (found.join('').length > best.join('').length) best = found
    }
    if (best.length) return best
  }
  return paragraphs(page)
}

/**
 * The start of an article, from its HTML (a page, or a feed's content:encoded): its first
 * paragraphs after the summary (the one the feed gave is not said twice), cut at a sentence,
 * START_MAX characters at most; '' when there is nothing more than the summary.
 */
export function readerStart(html: string, summary = ''): string {
  const said = folded(summary.replace(/…$/, ''))
  const text: string[] = []
  for (const p of readerParagraphs(html)) {
    const f = folded(p)
    // The standfirst again, or the summary the feed cut from it.
    if (said && (said.startsWith(f.slice(0, 80)) || f.startsWith(said.slice(0, 80)))) continue
    text.push(p)
    if (text.join(' ').length > START_MAX) break
  }
  const start = cutAtSentence(text.join(' '), START_MAX)
  return start.length >= 80 ? start : ''
}

// ---------------------------------------------------------------- reading

/** The page of an article, its head and first paragraphs; null when it can't be read. */
async function readPage(url: string): Promise<string | null> {
  const safe = publicUrl(url)
  if (!safe) return null
  const { bytes, type } = await fetchCapped(safe, { timeoutMs: WAIT_MS, maxBytes: PAGE_BYTES, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' })
  if (type && !/html|xml|text/i.test(type)) return null
  return bytes.toString('utf8')
}

/** The picture fetched and made small (PHOTO_WIDTH wide), as a data: URL; null when it can't be shown. */
async function photo(ref: MediaRef): Promise<NonNullable<NewsArticle['media']> | null> {
  const safe = publicUrl(ref.url)
  if (!safe) return null
  const { bytes, whole } = await fetchCapped(safe, { timeoutMs: WAIT_MS, maxBytes: PHOTO_BYTES, accept: 'image/jpeg,image/png;q=0.9,image/*;q=0.5' })
  if (!whole) return null
  let image = nativeImage.createFromBuffer(bytes)
  if (image.isEmpty()) return null
  if (image.getSize().width > PHOTO_WIDTH) image = image.resize({ width: PHOTO_WIDTH, quality: 'good' })
  const src = `data:image/jpeg;base64,${image.toJPEG(80).toString('base64')}`
  return { kind: ref.kind, src, alt: ref.alt, ...(ref.credit ? { credit: ref.credit } : {}), ...(ref.duration ? { duration: ref.duration } : {}) }
}

/** What the feed gave of one headline, for its article. */
export interface ArticleSource {
  url: string
  summary?: string
  media?: MediaRef
  /** The start the feed's own text gave (content:encoded). */
  start?: string
}

/**
 * One headline's article: its media (the feed's, else the page's) and its start (the feed's text,
 * else the page's), nothing past a paywall, no start for a source that asked. `settled`: whether
 * every fetch tried gave its answer (a page, a picture, or one that won't change, a 404, a refused
 * address); a page or a picture that timed out or a server in trouble is worth asking again later.
 */
export async function readArticle(item: ArticleSource, source: NewsSource | undefined): Promise<{ article: NewsArticle | null; settled: boolean }> {
  const wantStart = source?.start !== false
  let start = wantStart ? item.start : undefined
  let media = item.media
  let paid = false
  let settled = true
  const failed = (err: unknown) => {
    if (!lasting(err)) settled = false
    return null
  }
  if (!media || (wantStart && !start)) {
    const page = await readPage(item.url).catch(failed)
    if (page !== null) {
      paid = paywalled(page, source?.paywall)
      media ??= pageMedia(page, item.url)
      if (paid) start = undefined
      else if (wantStart && !start) start = readerStart(page, item.summary) || undefined
    }
  }
  const shown = media ? await photo(media).catch(failed) : null
  const article: NewsArticle = { ...(shown ? { media: shown } : {}), ...(start ? { start } : {}), ...(paid ? { paid: true } : {}) }
  return { article: Object.keys(article).length ? article : null, settled }
}
