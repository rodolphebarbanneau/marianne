import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { NewsHeadline } from '@marianne/sdk'
import { writeFileAtomic } from '../files'
import { log } from '../log'
import type { MediaRef } from './article'
import { nextDay, parisDay } from './time'

/**
 * The headlines of the last 7 days, on this computer (~/.marianne/news, a file a day, Paris time):
 * a feed keeps its last 20 to 50 items only, so the history is what keeps a morning's titles in
 * the evening, the days before, and the counts of Réglages. Public data only, read from the whole
 * catalogue: nothing in it says which sources the user reads, so it lives outside the archive.
 * Nor which articles they opened: those are kept in memory only (news.ts), never with the titles.
 */

export const HISTORY_DAYS = 7
/** A title dated a little ahead (a clock off) still counts; further ahead, it is an event's date, not news. */
export const AHEAD_MS = 15 * 60_000
const DAY_MS = 86_400_000
const FILE = /^(\d{4}-\d{2}-\d{2})\.json$/

/** A headline as the history keeps it: what services see, and what Marianne keeps for its article. */
export interface StoredItem extends NewsHeadline {
  /** Every section whose feed has it (a title is often on the front page and in its section). */
  sections?: string[]
  /** The media the feed points to. */
  media?: MediaRef
  /** The start of the article the feed's own text gives (content:encoded). */
  start?: string
}

/** Whether a title belongs in the 7 days that end now (a little ahead allowed). */
const within = (item: StoredItem, now: Date) => {
  const t = Date.parse(item.published)
  return t >= now.getTime() - HISTORY_DAYS * DAY_MS && t <= now.getTime() + AHEAD_MS
}

const dayOf = (item: StoredItem) => parisDay(new Date(item.published))

export class NewsHistory {
  private items: Map<string, StoredItem> | null = null
  /** The days whose file is to be written again. */
  private dirty = new Set<string>()
  private prunedOn = ''
  private sorted: { version: number; list: StoredItem[] } | null = null
  /** Grows with each change: what was computed from the history (subjects, stats) is kept until it does. */
  version = 0

  constructor(private readonly dir: () => string) {}

  private load(now: Date): Map<string, StoredItem> {
    if (this.items) return this.items
    this.items = new Map()
    let files: string[] = []
    try {
      files = readdirSync(this.dir())
    } catch {
      // No history yet.
    }
    for (const file of files) {
      if (!FILE.test(file)) continue
      try {
        const list = JSON.parse(readFileSync(join(this.dir(), file), 'utf8')) as StoredItem[]
        for (const item of Array.isArray(list) ? list : []) {
          if (!item || typeof item.id !== 'string' || Number.isNaN(Date.parse(item.published))) continue
          // An article an earlier version kept with its title: it isn't read, and goes at the next write of its day.
          if ('article' in item) {
            delete (item as { article?: unknown }).article
            this.dirty.add(file.slice(0, 10))
          }
          if (Date.parse(item.published) > now.getTime() + AHEAD_MS) this.dirty.add(file.slice(0, 10))
          else this.items.set(item.id, item)
        }
      } catch (err) {
        log.warn(`News history ${file} unreadable, dropped:`, (err as Error).message)
      }
    }
    this.prune(now)
    this.flush()
    return this.items
  }

  /** Titles older than 7 days go, and their files with them: once a day. */
  private prune(now: Date): void {
    const today = parisDay(now)
    if (this.prunedOn === today || !this.items) return
    this.prunedOn = today
    const cutoff = now.getTime() - HISTORY_DAYS * DAY_MS
    let dropped = 0
    for (const [id, item] of this.items)
      if (Date.parse(item.published) < cutoff) {
        this.items.delete(id)
        dropped++
      }
    const oldest = nextDay(today, -HISTORY_DAYS)
    try {
      for (const file of readdirSync(this.dir())) {
        const day = FILE.exec(file)?.[1]
        if (day && day < oldest) rmSync(join(this.dir(), file), { force: true })
        // The day at the edge keeps only what is still within 7 days.
        else if (day === oldest && dropped) this.dirty.add(day)
      }
    } catch {
      // No folder yet: nothing to remove.
    }
    if (dropped) this.version++
  }

  /**
   * Fresh titles in: a new one is kept, one already kept keeps its time (an undated title is dated
   * when first seen) and takes what the feed says now. Titles over 7 days old stay out, and those
   * dated ahead (an event's date, a clock far off): they would lead the reading until their day.
   */
  merge(fresh: StoredItem[], now = new Date()): void {
    const items = this.load(now)
    this.prune(now)
    for (const item of fresh) {
      if (!within(item, now)) continue
      const kept = items.get(item.id)
      if (!kept) {
        items.set(item.id, item)
        this.dirty.add(dayOf(item))
        continue
      }
      const sections = [...new Set([...(kept.sections ?? []), ...(item.sections ?? [])])]
      const next: StoredItem = {
        ...item,
        published: kept.published,
        ...(sections.length ? { sections } : {}),
        ...((item.section ?? kept.section) ? { section: kept.section ?? item.section } : {})
      }
      if (JSON.stringify(next) !== JSON.stringify(kept)) {
        items.set(item.id, next)
        this.dirty.add(dayOf(next))
      }
    }
    this.flush()
  }

  /** Every title kept, newest first (the same list until the history changes: not to be changed). */
  all(now = new Date()): StoredItem[] {
    const items = this.load(now)
    this.prune(now)
    if (this.sorted?.version !== this.version)
      this.sorted = { version: this.version, list: [...items.values()].sort((a, b) => Date.parse(b.published) - Date.parse(a.published)) }
    return this.sorted.list
  }

  get(id: string, now = new Date()): StoredItem | undefined {
    return this.load(now).get(id)
  }

  /** The days whose titles changed, written again (an emptied day's file goes). The version grows: titles came, changed or went. */
  private flush(): void {
    if (!this.dirty.size || !this.items) return
    this.version++
    const byDay = new Map<string, StoredItem[]>()
    for (const item of this.items.values()) {
      const day = dayOf(item)
      if (this.dirty.has(day)) (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(item)
    }
    try {
      mkdirSync(this.dir(), { recursive: true })
      for (const day of this.dirty) {
        const file = join(this.dir(), `${day}.json`)
        const list = byDay.get(day)
        if (list) writeFileAtomic(file, JSON.stringify(list))
        else rmSync(file, { force: true })
      }
    } catch (err) {
      // The titles stay in memory for this run: the history is a cache.
      log.warn('News history not written:', (err as Error).message)
    }
    this.dirty.clear()
  }
}
