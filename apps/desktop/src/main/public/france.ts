import type { FranceDigest, FranceItem } from '../../shared/public'
import { fetchAsBrowser } from '../http'
import { log } from '../log'
import { parseFeed } from './news'
import { nextDay, parisDay, parseFrenchDate } from './time'

/**
 * "En France": what changes this month, and the news of public services. Service-Public has no
 * feed for its news: this reads the cards of two of its pages (their markup carries data-test
 * hooks): the agenda of changes and deadlines ("À partir du 1 nov. 2026"), and the news page
 * (with its monthly "Ce qui change en novembre"). The government's own news come from the RSS
 * feed of info.gouv.fr.
 */

const SP = 'https://www.service-public.gouv.fr/particuliers/actualites'
const GOVERNMENT_FEED = 'https://www.info.gouv.fr/rss.xml'
const TTL = 30 * 60_000

const pages = new Map<string, { at: number; text: string }>()

async function page(url: string): Promise<string> {
  const hit = pages.get(url)
  if (hit && Date.now() - hit.at < TTL) return hit.text
  const text = await fetchAsBrowser(url)
  pages.set(url, { at: Date.now(), text })
  return text
}

const clean = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#39;|&apos;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/** The dates a Service-Public badge speaks of: "Du 10 oct. au 3 nov. 2026", "Jusqu'au 31 déc. 2026"… */
export function parsePeriod(when: string): { from?: string; until?: string } {
  const matches = [...when.matchAll(/(\d{1,2})(?:er)?\s+(\p{L}+)\.?(?:\s+(\d{4}))?/gu)]
  if (!matches.length) return {}
  // "Du 10 oct. au 3 nov. 2026": the year is only given once, at the end.
  const year = Number(matches.findLast((m) => m[3])?.[3]) || new Date().getFullYear()
  const dates = matches.map((m) => parseFrenchDate(m[0], year)).filter(Boolean)
  if (dates.length > 1 && dates[0] > dates[1]) dates[0] = `${Number(dates[0].slice(0, 4)) - 1}${dates[0].slice(4)}`
  const [first, second] = dates
  if (!first) return {}
  if (/^du\b/i.test(when) && second) return { from: first, until: second }
  if (/^(jusqu|avant)/i.test(when)) return { until: first }
  if (/^le\b/i.test(when)) return { from: first, until: first }
  return { from: first }
}

/** The news cards of a Service-Public page. */
export function parseSpCards(html: string): FranceItem[] {
  return html
    .split(/data-test="carte"/)
    .slice(1)
    .flatMap((card) => {
      const link = card.match(/data-test="carte-titre"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
      if (!link) return []
      const url = new URL(link[1], SP).toString()
      const published = parseFrenchDate(clean(card.match(/data-test="carte-description"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''))
      const when = clean(card.match(/class="fr-badge[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '')
      const category = clean(card.match(/data-test="carte-badge"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '')
      return [
        {
          id: url.match(/\/(A\d+)/)?.[1] ?? url,
          source: 'service-public' as const,
          title: clean(link[2]),
          url,
          ...(published ? { published } : {}),
          ...(category ? { category } : {}),
          ...(when ? { when, ...parsePeriod(when) } : {})
        }
      ]
    })
}

/** A part that failed is left empty: the others still show. */
const nothing =
  (what: string) =>
  (err: Error): FranceItem[] => {
    log.warn(`${what}:`, err.message)
    return []
  }

const unique = (items: FranceItem[]) => [...new Map(items.map((i) => [i.url, i])).values()]

/**
 * Of the agenda, what concerns the coming weeks: changes starting this month or within a month,
 * periods in progress, and deadlines within a month. The "Ce qui change en …" articles first.
 */
export function selectChanges(agenda: FranceItem[], news: FranceItem[], today: string): FranceItem[] {
  const monthStart = `${today.slice(0, 8)}01`
  const horizon = nextDay(today, 31)
  const summaries = news.filter((n) => /^ce qui change/i.test(n.title))
  const dated = agenda.filter((i) => {
    if (i.from && i.from >= monthStart && i.from <= horizon) return true
    if (i.until && i.until >= today && i.until <= horizon) return true
    return !!(i.from && i.until && i.from <= today && i.until >= today)
  })
  const key = (i: FranceItem) => i.from ?? i.until ?? ''
  return unique([...summaries, ...dated.sort((a, b) => key(a).localeCompare(key(b)))])
}

/** What changes and the latest news; a page that doesn't answer leaves its part empty. */
export async function franceDigest(now = new Date()): Promise<FranceDigest> {
  const [agenda, news, government] = await Promise.all([
    page(`${SP}/agenda`).then(parseSpCards).catch(nothing('Service-Public agenda')),
    page(SP).then(parseSpCards).catch(nothing('Service-Public news')),
    page(GOVERNMENT_FEED)
      .then((xml) =>
        parseFeed(xml, 'gouvernement', now).map((n): FranceItem => ({
          id: n.id,
          source: 'gouvernement',
          title: n.title,
          url: n.url,
          published: n.published,
          ...(n.category ? { category: n.category } : {})
        }))
      )
      .catch(nothing('info.gouv.fr feed'))
  ])
  const changes = selectChanges(agenda, news, parisDay(now))
  const shown = new Set(changes.map((c) => c.url))
  const latest = unique([...news, ...government])
    .filter((n) => !shown.has(n.url))
    .sort((a, b) => (b.published ?? '').localeCompare(a.published ?? ''))
    .slice(0, 20)
  return { changes, news: latest }
}
