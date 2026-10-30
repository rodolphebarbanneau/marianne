import { foldText, SERVICE_CATEGORIES, type PixelArt, type ProfileField, type ServiceCategory, type ServiceState, type ServiceTrust } from '@marianne/sdk'
import type { CatalogueEntry } from '@shared/catalogue'

/**
 * What the Services page lists, whatever it comes from: a service of the user's (built-in or from
 * the community), a built-in service not added yet, a service of the community catalogue. The
 * search ranks them by trust, then by relevance; the tables sort them.
 */

export interface Listing {
  code: string
  name: string
  description: string
  category: ServiceCategory
  keywords: string[]
  author: string
  version: string
  icon: PixelArt | null
  hosts: string[]
  /** What it reads of the profile. */
  reads: ProfileField[]
  /** Shipped with Marianne. */
  official: boolean
  /** A community service's standing (see ServiceTrust). */
  trust?: ServiceTrust
  /** Among the user's services. */
  added: boolean
  pinned: boolean
  /** Marianne recommends it, on top of « découvrir ». */
  recommended: boolean
  /** A service Marianne knows (the user's, or a built-in one). */
  state?: ServiceState
  /** A service of the catalogue, not added. */
  entry?: CatalogueEntry
}

export const categoryLabel = (id: ServiceCategory) => SERVICE_CATEGORIES.find((c) => c.id === id)?.label ?? id

/** The services Marianne knows, and the catalogue's that are not among them. */
export function listings(services: ServiceState[], catalogue: CatalogueEntry[]): Listing[] {
  const known = services.map((s): Listing => ({
    code: s.manifest.id,
    name: s.manifest.name,
    description: s.manifest.description,
    category: s.manifest.category,
    keywords: s.manifest.keywords,
    author: s.manifest.author,
    version: s.manifest.version,
    icon: s.manifest.icon,
    hosts: s.manifest.hosts,
    reads: s.manifest.permissions.profile,
    official: s.builtIn,
    ...(s.trust ? { trust: s.trust } : {}),
    added: s.added,
    pinned: s.pinned,
    // A built-in service not added yet is always worth showing on top of « découvrir ».
    recommended: s.builtIn && !s.added,
    state: s
  }))
  const codes = new Set(known.map((l) => l.code))
  const others = catalogue
    .filter((e) => !codes.has(e.code))
    .map((e): Listing => ({
      code: e.code,
      name: e.name,
      description: e.description,
      category: e.category,
      keywords: e.keywords,
      author: e.author,
      version: e.version,
      icon: e.icon,
      hosts: e.hosts,
      reads: e.reads,
      official: false,
      trust: e.status,
      added: false,
      pinned: false,
      recommended: e.recommended && e.status === 'validated',
      entry: e
    }))
  return [...known, ...others]
}

/** Official first, then the community's by trust: validated, not validated, outside the catalogue, withdrawn. */
export function trustRank(l: Pick<Listing, 'official' | 'trust'>): number {
  if (l.official) return 0
  return { validated: 1, unvalidated: 2, outside: 3, withdrawn: 4 }[l.trust ?? 'outside']
}

// ---------------------------------------------------------------- the search

/** Lowercase, accents aside, one character for one: positions stay those of the text (to highlight it). */
const foldEach = (text: string) => [...text].map((ch) => foldText(ch)[0] ?? ch).join('')

export const searchTerms = (query: string) => foldText(query).split(/\s+/).filter(Boolean)

/** How well a service matches the words typed (each must be found); why, when the code or name doesn't say it. */
export function scoreOf(l: Listing, terms: string[]): { score: number; why: string | null } | null {
  let score = 0
  let why: string | null = null
  const code = foldText(l.code)
  const name = foldEach(l.name)
  const description = foldEach(l.description)
  const theme = categoryLabel(l.category)
  for (const t of terms) {
    const keyword = l.keywords.find((k) =>
      foldText(k)
        .split(/\s+/)
        .some((w) => w.startsWith(t))
    )
    let best = 0
    if (code === t) best = 100
    else if (code.startsWith(t)) best = 80
    else if (code.includes(t)) best = 60
    else if (name.split(/[\s’'-]+/).some((w) => w.startsWith(t))) best = 50
    else if (name.includes(t)) best = 40
    else if (keyword) {
      best = 35
      why = `mot-clé « ${keyword} »`
    } else if (description.includes(t)) best = 20
    else if (foldText(theme).includes(t)) {
      best = 10
      why = `thème « ${theme} »`
    } else if (l.author && foldText(l.author).includes(t)) {
      best = 10
      why = `auteur ${l.author}`
    }
    if (!best) return null
    score += best
  }
  return { score, why }
}

export interface SearchGroup {
  id: 'pinned' | 'installed' | 'official' | 'validated' | 'unvalidated'
  label: string
  rows: Array<{ listing: Listing; why: string | null }>
}

/** The groups of the search view, in the order of trust; empty ones left out. */
const GROUPS: Array<{ id: SearchGroup['id']; label: string; test: (l: Listing) => boolean }> = [
  { id: 'pinned', label: '★ épinglés', test: (l) => l.added && l.pinned },
  { id: 'installed', label: 'installés', test: (l) => l.added && !l.pinned },
  { id: 'official', label: 'officiels · à ajouter', test: (l) => !l.added && l.official },
  { id: 'validated', label: 'catalogue · ✓ validés', test: (l) => !l.added && !l.official && l.trust === 'validated' },
  { id: 'unvalidated', label: 'catalogue · non validés', test: (l) => !l.added && !l.official && l.trust === 'unvalidated' }
]

/** What the 3615 bar finds: ranked by trust in groups, then by relevance; ties by code. */
export function search(all: Listing[], query: string): SearchGroup[] {
  const terms = searchTerms(query)
  if (!terms.length) return []
  const found = all.flatMap((listing) => {
    const m = scoreOf(listing, terms)
    return m ? [{ listing, ...m }] : []
  })
  return GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    rows: found
      .filter((r) => g.test(r.listing))
      .sort((a, b) => trustRank(a.listing) - trustRank(b.listing) || b.score - a.score || a.listing.code.localeCompare(b.listing.code))
      .map(({ listing, why }) => ({ listing, why }))
  })).filter((g) => g.rows.length)
}

/** A text cut where the words typed are, to highlight them (accents and case aside). */
export function highlight(text: string, terms: string[]): Array<{ text: string; mark: boolean }> {
  const folded = foldEach(text)
  const marks = Array<boolean>(folded.length).fill(false)
  for (const t of terms) {
    for (let i = folded.indexOf(t); i >= 0; i = folded.indexOf(t, i + t.length)) for (let k = i; k < i + t.length; k++) marks[k] = true
  }
  const chars = [...text]
  const parts: Array<{ text: string; mark: boolean }> = []
  chars.forEach((ch, i) => {
    const last = parts[parts.length - 1]
    if (last && last.mark === marks[i]) last.text += ch
    else parts.push({ text: ch, mark: marks[i] })
  })
  return parts
}

// ---------------------------------------------------------------- sorting the tables

export interface Sort<K extends string> {
  key: K
  /** 1: ascending, -1: descending. */
  dir: 1 | -1
}

/** The same column again turns the order around; another one sorts by it, ascending. */
export const nextSort = <K extends string>(sort: Sort<K>, key: K): Sort<K> => (sort.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: 1 })

const compare = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0)

export type MineKey = 'pinned' | 'service' | 'origin' | 'theme'

export function sortMine(list: Listing[], sort: Sort<MineKey>): Listing[] {
  const by: Record<MineKey, (l: Listing) => string | number> = {
    pinned: (l) => (l.pinned ? 0 : 1),
    service: (l) => l.code,
    origin: trustRank,
    theme: (l) => foldText(categoryLabel(l.category))
  }
  return [...list].sort((a, b) => compare(by[sort.key](a), by[sort.key](b)) * sort.dir || compare(a.code, b.code))
}

export type CatalogueKey = 'service' | 'validation' | 'theme' | 'author' | 'updated'

/** The catalogue's table: validated first by default; the most recent first by date. */
export function sortCatalogue(list: Listing[], sort: Sort<CatalogueKey>): Listing[] {
  const by: Record<CatalogueKey, (l: Listing) => string | number> = {
    service: (l) => l.code,
    validation: trustRank,
    theme: (l) => foldText(categoryLabel(l.category)),
    author: (l) => foldText(l.author),
    // Ascending reads as « the most recent first ».
    updated: (l) => -(Date.parse(l.entry?.published ?? '') || 0)
  }
  return [...list].sort((a, b) => compare(by[sort.key](a), by[sort.key](b)) * sort.dir || compare(a.code, b.code))
}
