import {
  foldText,
  isLive,
  LEANS,
  SAME_SUBJECT,
  similarity,
  subjectWords,
  THEMES,
  themesOf,
  titleWords,
  type NewsGroup,
  type NewsHeadline,
  type NewsReading,
  type NewsSourceInfo,
  type NewsSubject
} from '@marianne/sdk'
import { hour } from './time'
import type { InfosSource, Kiosk, Reading, Subject } from './types'

/**
 * 3615 INFOS's model, pure: one reading of the feeds, ranked, under every tab. A subject is what
 * Marianne's grouping makes (titles of different sources sharing their words); nobody chooses one.
 * They are ranked by how many sources shown tell them, then by their latest title, and their rank
 * is their number in every tab. Everything a subject says (its words, DIRECT, NOUVEAU, ✓ vérifié,
 * ◆) is read from its titles.
 */

/** A subject is NOUVEAU while its first title is younger than this. */
export const FRESH_MS = 2 * 60 * 60 * 1000

export const GROUP_LABELS: Record<NewsGroup, string> = {
  national: 'presse nationale',
  regional: 'presse régionale',
  broadcast: 'télévision et radio',
  factcheck: 'vérification'
}
export const GROUPS = Object.keys(GROUP_LABELS) as NewsGroup[]

const themeLabels: Record<string, string> = Object.fromEntries(THEMES.map((t) => [t.id, t.label]))
/** « écologie », from a theme's id. */
export const themeLabel = (id: string) => themeLabels[id] ?? id

const newestFirst = (a: NewsHeadline, b: NewsHeadline) => Date.parse(b.published) - Date.parse(a.published) || a.id.localeCompare(b.id)

/** What the reading needs to know of the user beyond the feeds. */
export interface RankOptions {
  /** « toutes »: the set-aside sources are shown, and count. */
  all: boolean
  /** The user's sources apply (opinions.sources granted). */
  filtered: boolean
  /** The user's themes (opinions.themes granted), else []. */
  themes: string[]
  /** The sections the user keeps, by source (absent: all); null without opinions.sources. */
  sections: Record<string, string[]> | null
}

/** A source as INFOS draws it. */
export function sourceOf(s: NewsSourceInfo, sections: Record<string, string[]> | null): InfosSource {
  const total = s.sections?.length ?? 0
  const kept = sections?.[s.id]
  return {
    id: s.id,
    name: s.name,
    group: s.group,
    site: s.site,
    lean: s.lean,
    setAside: !!s.setAside,
    sections: total,
    kept: kept && total > 1 && kept.length < total ? kept.length : null,
    home: !!s.home,
    perDay: s.perDay ?? null
  }
}

/** Sources from the left to the right, then by name: the order of every bar, cell and track. */
export function byLean<T extends Pick<InfosSource, 'lean' | 'name'>>(sources: T[]): T[] {
  return [...sources].sort((a, b) => LEANS.indexOf(a.lean) - LEANS.indexOf(b.lean) || a.name.localeCompare(b.name, 'fr'))
}

/**
 * The reading, ranked for the user: the titles shown (the accepted sources', or all with « toutes »),
 * the subjects of at least two sources shown, by how many tell them, then by their latest title; the
 * titles left alone; what each subject's titles say of it.
 */
export function rank(raw: NewsReading, catalogue: NewsSourceInfo[], opts: RankOptions): Reading {
  const sources = catalogue.map((s) => sourceOf(s, opts.sections))
  const group = new Map(sources.map((s) => [s.id, s.group]))
  const shows = (h: NewsHeadline) => opts.all || !h.setAside
  const items = raw.items.filter(shows).sort(newestFirst)
  const readAt = Date.parse(raw.readAt)
  const themesOfText = (list: NewsHeadline[]) => (opts.themes.length ? themesOf(list.map((h) => `${h.title} ${h.summary ?? ''}`).join(' '), opts.themes) : [])

  const told = raw.subjects
    .map((s: NewsSubject) => ({ id: s.id, shown: s.items.filter(shows).sort(newestFirst), hidden: opts.all ? [] : s.items.filter((h) => h.setAside) }))
    .filter((s) => new Set(s.shown.map((h) => h.source)).size >= 2)
    .sort(
      (a, b) =>
        new Set(b.shown.map((h) => h.source)).size - new Set(a.shown.map((h) => h.source)).size ||
        Date.parse(b.shown[0].published) - Date.parse(a.shown[0].published) ||
        a.id.localeCompare(b.id)
    )

  const subjects: Subject[] = told.map(({ id, shown, hidden }, i) => {
    const oldest = shown[shown.length - 1]
    return {
      id,
      number: i + 1,
      items: shown,
      hidden,
      told: shown.filter((h) => !h.setAside).length,
      aside: shown.filter((h) => h.setAside).length,
      words: subjectWords([...shown].reverse().map((h) => h.title)).label,
      live: shown.some((h) => isLive(h.title)),
      fresh: Date.parse(oldest.published) > readAt - FRESH_MS,
      checks: shown.filter((h) => group.get(h.source) === 'factcheck'),
      themes: themesOfText(shown),
      first: oldest.published,
      summary: shown.find((h) => h.summary)?.summary ?? null
    }
  })

  const numbers: Record<string, number> = {}
  const themed: Record<string, string[]> = {}
  for (const s of subjects)
    for (const h of s.items) {
      numbers[h.id] = s.number
      if (s.themes.length) themed[h.id] = s.themes
    }
  const single = items.filter((h) => !numbers[h.id])
  for (const h of single) {
    const themes = themesOfText([h])
    if (themes.length) themed[h.id] = themes
  }

  const names = new Map(sources.map((s) => [s.id, s.name]))
  return {
    readAt: raw.readAt,
    offline: !!raw.offline,
    failed: raw.failed.map((id) => names.get(id) ?? id),
    filtered: opts.filtered,
    all: opts.all,
    sources,
    accepted: sources.filter((s) => !s.setAside).length,
    items,
    subjects,
    single,
    numbers,
    themed,
    themes: opts.themes,
    live: items.filter((h) => isLive(h.title)).map((item) => ({ item, number: numbers[item.id] ?? null }))
  }
}

/** The sources shown: the accepted ones, or all of them with « toutes ». */
export const shownSources = (r: Pick<Reading, 'sources' | 'all'>) => r.sources.filter((s) => r.all || !s.setAside)

/** The words of a subject's titles together: what the days before are compared with. */
export function wordsOf(items: Array<Pick<NewsHeadline, 'title'>>): Set<string> {
  const words = new Set<string>()
  for (const h of items) for (const w of titleWords(h.title)) words.add(w)
  return words
}

/** The subject of another day that tells the same thing (the closest, at least SAME_SUBJECT), or null. */
export function sameSubject(words: Set<string>, subjects: NewsSubject[]): NewsSubject | null {
  let best: NewsSubject | null = null
  let score = 0
  for (const s of subjects) {
    const n = similarity(words, wordsOf(s.items))
    if (n > score) [best, score] = [s, n]
  }
  return score >= SAME_SUBJECT ? best : null
}

/** How many days in a row the subject was told, today included: the days before, back from yesterday, until one misses. */
export function daysInRow(days: Array<{ day: string }>, today: string, addDays: (day: string, n: number) => string): number {
  const had = new Set(days.map((d) => d.day))
  let n = 1
  while (had.has(addDays(today, -n))) n++
  return n
}

/** A text matches the search: its words searched, accents and case aside. */
export const matches = (text: string, query: string) => !query || foldText(text).includes(foldText(query.trim()))

/** Titles published since the last visit: NOUVEAU in the fil, « 3 neufs » beside its tab. */
export const newSince = (items: NewsHeadline[], since: string | null) => (since ? items.filter((h) => Date.parse(h.published) > Date.parse(since)) : [])

/** The kiosk's order: the user's, the sources they never placed (new in the list) at the end, in Marianne's order. */
export function kioskOrder(ids: string[], kiosk: Kiosk): string[] {
  const known = new Set(ids)
  const placed = [...new Set(kiosk.order.filter((id) => known.has(id)))]
  return [...placed, ...ids.filter((id) => !placed.includes(id))]
}

/** A card moved to another's place: before it when it came from after, else after it. */
export function moveTo(order: string[], id: string, target: string): string[] {
  const from = order.indexOf(id)
  const to = order.indexOf(target)
  if (from < 0 || to < 0 || from === to) return order
  const next = order.filter((x) => x !== id)
  next.splice(next.indexOf(target) + (from < to ? 1 : 0), 0, id)
  return next
}

/** A card one place earlier or later (the grip's arrow keys). */
export function moveBy(order: string[], id: string, step: -1 | 1): string[] {
  const at = order.indexOf(id)
  const target = order[at + step]
  return at < 0 || !target ? order : moveTo(order, id, target)
}

/** The kiosk was arranged: « rétablir l’ordre et les tailles » shows. */
export const arranged = (kiosk: Kiosk) => kiosk.order.length > 0 || kiosk.large.length > 0

/**
 * What « demander à Marianne » hands her: the question, the titles shown and their links. Nothing
 * else: neither the user's list of sources nor their themes.
 */
export function askText(question: string, items: NewsHeadline[], names: Map<string, string>): string {
  const lines = items.map((h) => `- ${names.get(h.source) ?? h.source}, ${hour(h.published)} : ${h.title}\n  ${h.url}`)
  return `${question}\n\nLes titres (3615 INFOS) :\n${lines.join('\n')}`
}
