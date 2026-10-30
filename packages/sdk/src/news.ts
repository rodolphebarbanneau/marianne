/**
 * @marianne/sdk/news: the headlines Marianne reads for the services that declare `"news": true`
 * (ctx.news), and the pure helpers that name a subject from its titles. Marianne's grouping
 * imports the same helpers, so the app and a service read a subject the same way.
 *
 * A subject is what the grouping makes: titles of different sources that share their words.
 * Nobody chooses one; everything a screen says of it is read from its titles.
 */

/**
 * A source's editorial line, from the left to the right, or « sans classement ». Marianne gives a
 * default for each source (indicative, its basis in the list); the user may give their own.
 */
export const LEANS = ['gauche', 'centre-gauche', 'centre', 'centre-droit', 'droite', 'aucune'] as const
export type Lean = (typeof LEANS)[number]

export const LEAN_LABELS: Record<Lean, string> = {
  gauche: 'gauche',
  'centre-gauche': 'centre gauche',
  centre: 'centre',
  'centre-droit': 'centre droit',
  droite: 'droite',
  aucune: 'sans classement'
}

/** The four sides a subject is told from: the six positions folded. */
export const SIDES = ['left', 'centre', 'right', 'none'] as const
export type Side = (typeof SIDES)[number]

export const SIDE_LABELS: Record<Side, string> = { left: 'à gauche', centre: 'au centre', right: 'à droite', none: 'sans classement' }

export const sideOf = (lean: Lean): Side =>
  lean === 'gauche' || lean === 'centre-gauche' ? 'left' : lean === 'centre' ? 'centre' : lean === 'aucune' ? 'none' : 'right'

export type NewsGroup = 'national' | 'regional' | 'broadcast' | 'factcheck'

/** A headline as a feed gives it: never the article. */
export interface NewsHeadline {
  id: string
  /** Its source's id in the catalogue. */
  source: string
  /** Its section's id, when the source has several feeds. */
  section?: string
  title: string
  url: string
  /** ISO. */
  published: string
  /** Plain text, 200 characters at most. */
  summary?: string
  /** From a source the user set aside: only with `all`, and only for a service that may read opinions.sources. */
  setAside?: boolean
}

/** What Marianne could read of one headline's article, on demand: never the whole of it. */
export interface NewsArticle {
  /** The image (or a video's frame) the feed or the page points to, as a data: URL Marianne resized. */
  media?: { kind: 'photo' | 'vidéo' | 'carte' | 'infographie'; src: string; alt: string; credit?: string; duration?: string }
  /** The article's first paragraphs after its summary, plain text, cut at a sentence, 600 characters at most. */
  start?: string
  /** The page is behind a paywall: no start. */
  paid?: boolean
}

/** Titles of different sources that tell the same thing. */
export interface NewsSubject {
  /** Its first title's id: it stays the same as the subject grows. */
  id: string
  /** Most recent first; one per source. */
  items: NewsHeadline[]
}

/** A source of the catalogue, as a service sees it. */
export interface NewsSourceInfo {
  id: string
  name: string
  group: NewsGroup
  /** Its site's host ("lemonde.fr"). */
  site: string
  /** The user's own colour when the service may read opinions.sources, else Marianne's. */
  lean: Lean
  sections?: Array<{ id: string; label: string }>
  /** Set aside by the user: only for a service that may read opinions.sources. */
  setAside?: boolean
  /** A regional source of the region of the user's address. */
  home?: boolean
  /** Titles a day, over the history Marianne keeps (absent until she has read it). */
  perDay?: number
}

/** A reading of the feeds, for the last 24 hours (or a day of the 7-day history). */
export interface NewsReading {
  /** Every title of the window, newest first, the single ones included. */
  items: NewsHeadline[]
  /** Titles of at least two sources, grouped; most told first, then the most recent. */
  subjects: NewsSubject[]
  /** Sources whose feed didn't answer (their last titles are still in `items`). */
  failed: string[]
  /** When the feeds were read (ISO). */
  readAt: string
  /** No feed answered: what is shown comes from the history. */
  offline?: boolean
}

// ---------------------------------------------------------------- words

const STOP_WORDS = new Set(
  `le la les un une des du de d l au aux et ou en a est sont ete etre que qui quoi dont dans pour par sur sous avec sans ce cet cette ces
  son sa ses leur leurs il elle ils elles on nous vous se ne pas plus moins tres apres avant pendant depuis selon contre entre chez vers
  comme mais car donc ni si tout tous toute toutes y ont fait faire peut doit va vont the of and to in`.split(/\s+/)
)
/** Labels feeds put before titles. */
const NOISE = new Set(
  'direct live video videos replay podcast info infos reportage entretien interview tribune analyse recit chronique edito photos'.split(' ')
)
/** Headline small talk: never what a title alone says. */
const SMALL_TALK = new Set(
  'faut retenir savoir pourquoi comment change premier premiere nouveau nouvelle apres voici avoir etait aussi encore deja toujours plusieurs'.split(' ')
)

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** A light stemmer: « adopte », « adoptées » and « adopté » are one word. */
export function stem(word: string): string {
  return word.length > 5 ? word.replace(/(ees|ee|es|e|s|x)$/, '') : word.length > 4 ? word.replace(/[sx]$/, '') : word
}

/** The words of a title as they read, each with its key (lowercase, no accents, stemmed). */
function tokens(title: string): Array<{ key: string; surface: string }> {
  const out: Array<{ key: string; surface: string }> = []
  for (const surface of title.split(/[^\p{L}\p{N}]+/u)) {
    if (!surface) continue
    const w = fold(surface)
    if (!/^[a-z0-9]+$/.test(w)) continue
    if ((w.length <= 2 && !/^\d+$/.test(w)) || STOP_WORDS.has(w) || NOISE.has(w)) continue
    out.push({ key: stem(w), surface })
  }
  return out
}

/** The words of a title that say what it is about: lowercase, no accents, no small words, stemmed. */
export function titleWords(title: string): Set<string> {
  return new Set(tokens(title).map((t) => t.key))
}

/** Shared words over the shorter title's words; 0 below three shared words. */
export function similarity(a: Set<string>, b: Set<string>): number {
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  return shared < 3 ? 0 : shared / Math.min(a.size, b.size)
}

/** Two titles tell the same thing from this similarity on. */
export const SAME_SUBJECT = 0.5

export interface SubjectWords {
  /** The three words that come in the most titles (at least half of them, at least two), as the first title wrote them. */
  label: string[]
  /** In how many titles each word comes. */
  count: Map<string, number>
  /** How each word reads, as the first title that has it wrote it (lowercase but for acronyms and names). */
  surface: Map<string, string>
}

/** How a word reads in a label: lowercase, unless it is an acronym (SNCF, PTZ) or a number. */
const readAs = (surface: string) => (surface.length > 1 && surface === surface.toUpperCase() ? surface : surface.toLowerCase())

/**
 * The words of a subject's titles: in how many titles each comes, how each reads, and the three
 * that name it. `titles`: the first is the subject's first (oldest) title, whose spelling wins.
 */
export function subjectWords(titles: string[]): SubjectWords {
  const count = new Map<string, number>()
  const surface = new Map<string, string>()
  const first = new Map<string, number>()
  titles.forEach((title, i) => {
    const seen = new Set<string>()
    for (const t of tokens(title)) {
      if (!surface.has(t.key)) surface.set(t.key, readAs(t.surface))
      if (!first.has(t.key)) first.set(t.key, i * 100 + first.size)
      if (seen.has(t.key)) continue
      seen.add(t.key)
      count.set(t.key, (count.get(t.key) ?? 0) + 1)
    }
  })
  const need = Math.max(2, Math.ceil(titles.length / 2))
  const label = [...count.entries()]
    .filter(([, n]) => n >= need)
    .sort((a, b) => b[1] - a[1] || first.get(a[0])! - first.get(b[0])!)
    .slice(0, 3)
    .map(([k]) => surface.get(k)!)
  return { label, count, surface }
}

/**
 * What a title alone says in its subject: its words no other title has, at most `max` (the longest
 * first), of at least 5 letters or numbers, never headline small talk. As the title writes them.
 */
export function ownWords(title: string, words: SubjectWords, max = 2): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of tokens(title)) {
    if (seen.has(t.key)) continue
    seen.add(t.key)
    const plain = fold(t.surface)
    if ((words.count.get(t.key) ?? 0) !== 1) continue
    if (SMALL_TALK.has(plain) || SMALL_TALK.has(t.key)) continue
    if (!/^\d+$/.test(plain) && plain.length < 5) continue
    out.push(t.surface)
  }
  return out.sort((a, b) => b.length - a.length).slice(0, max)
}

/** A live coverage: a title the feed starts with « DIRECT » or « EN DIRECT ». */
export const isLive = (title: string) => /^(EN )?DIRECT\b/i.test(title.trim())

/** A live title without its label: « DIRECT. Budget… » → « Budget… ». */
export const withoutLive = (title: string) => title.trim().replace(/^(EN )?DIRECT[\s.,:–-]*/i, '')

/**
 * Titles about the same thing, from different sources, in one subject each: a title joins the
 * subject whose titles it resembles most (at least SAME_SUBJECT over three shared words), never one
 * that already has its source. Subjects of at least two sources, most told first, then the most
 * recent; a subject's id is its first title's. The single titles are what is left.
 */
export function groupSubjects(items: NewsHeadline[]): { subjects: NewsSubject[]; single: NewsHeadline[] } {
  const oldest = [...items].sort((a, b) => Date.parse(a.published) - Date.parse(b.published) || a.id.localeCompare(b.id))
  const groups: Array<{ items: NewsHeadline[]; words: Array<Set<string>>; sources: Set<string> }> = []
  // The groups each word is in: a title is only compared with the groups it shares a word with
  // (the others score 0), so a whole catalogue's day groups in a moment.
  const having = new Map<string, number[]>()
  for (const item of oldest) {
    const words = titleWords(item.title)
    const near = new Set<number>()
    for (const w of words) for (const i of having.get(w) ?? []) near.add(i)
    let best: number | undefined
    let bestScore = 0
    // In the order the groups were made: of two as close, the older one takes the title.
    for (const i of [...near].sort((a, b) => a - b)) {
      const g = groups[i]
      if (g.sources.has(item.source)) continue
      const score = Math.max(...g.words.map((w) => similarity(words, w)))
      if (score > bestScore) [best, bestScore] = [i, score]
    }
    const at = best !== undefined && bestScore >= SAME_SUBJECT ? best : groups.length
    if (at === groups.length) groups.push({ items: [item], words: [words], sources: new Set([item.source]) })
    else {
      groups[at].items.push(item)
      groups[at].words.push(words)
      groups[at].sources.add(item.source)
    }
    for (const w of words) {
      const list = having.get(w) ?? having.set(w, []).get(w)!
      if (list[list.length - 1] !== at) list.push(at)
    }
  }
  const newestFirst = (list: NewsHeadline[]) => [...list].sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
  const subjects = groups
    .filter((g) => g.items.length > 1)
    .map((g) => ({ id: g.items[0].id, items: newestFirst(g.items) }))
    .sort((a, b) => b.items.length - a.items.length || Date.parse(b.items[0].published) - Date.parse(a.items[0].published))
  const single = newestFirst(groups.filter((g) => g.items.length === 1).map((g) => g.items[0]))
  return { subjects, single }
}
