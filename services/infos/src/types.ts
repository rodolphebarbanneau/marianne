import type { Lean, NewsArticle, NewsGroup, NewsHeadline } from '@marianne/sdk'

/** A source of Marianne's list, as INFOS draws it: its colour is its editorial line (the user's, else Marianne's). */
export interface InfosSource {
  id: string
  name: string
  group: NewsGroup
  site: string
  lean: Lean
  /** Set aside by the user: shown only with « toutes », hollow. */
  setAside: boolean
  /** Its sections: how many it has, how many the user keeps (null: all of them, or a single feed). */
  sections: number
  kept: number | null
  /** A regional source of the user's region (« votre région »). */
  home: boolean
  /** Titles a day, over Marianne's history; null until she has some. */
  perDay: number | null
}

/** Titles of different sources that tell the same thing, as the user sees them, with what its titles say of it. */
export interface Subject {
  /** Its first title's id: it stays as the subject grows. */
  id: string
  /** Its rank, the same in every tab. */
  number: number
  /** Its titles shown, most recent first. */
  items: NewsHeadline[]
  /** Titles of set-aside sources that tell it too, not shown (without « toutes »). */
  hidden: NewsHeadline[]
  /** The user's accepted sources telling it. */
  told: number
  /** Set-aside sources telling it, shown with « toutes ». */
  aside: number
  /** The three words its titles share. */
  words: string[]
  /** A live coverage among its titles. */
  live: boolean
  /** Its first title is less than two hours old. */
  fresh: boolean
  /** Its fact-checkers' titles. */
  checks: NewsHeadline[]
  /** The user's themes it is about (THEMES ids). */
  themes: string[]
  /** Its first title's time (ISO). */
  first: string
  /** The first feed summary of its titles, most recent first. */
  summary: string | null
}

/** A live title of the band, with its subject's number when it belongs to one. */
export interface LiveTitle {
  item: NewsHeadline
  number: number | null
}

/** One reading of the feeds, ranked: what every tab arranges, by subject, by time or by source. */
export interface Reading {
  /** When the feeds were read (ISO). */
  readAt: string
  /** No feed answered: the titles come from Marianne's history. */
  offline: boolean
  /** The sources whose feed didn't answer, by name. */
  failed: string[]
  /** The user's sources apply (opinions.sources granted); false: all of Marianne's, unmarked. */
  filtered: boolean
  /** « toutes »: the set-aside sources are shown too. */
  all: boolean
  /** Every source of the list, in Marianne's order. */
  sources: InfosSource[]
  /** The sources the user accepts (all of them, not granted). */
  accepted: number
  /** Every title shown, newest first. */
  items: NewsHeadline[]
  /** Subjects of at least two sources shown, ranked. */
  subjects: Subject[]
  /** The titles that no other source shown tells, newest first. */
  single: NewsHeadline[]
  /** A title's subject number, by title id (titles of a subject only). */
  numbers: Record<string, number>
  /** A title's themes, by title id (only titles about one of the user's themes). */
  themed: Record<string, string[]>
  /** The user's themes, when INFOS may read them: [] hides « vos thèmes ». */
  themes: string[]
  /** Live titles, most recent first. */
  live: LiveTitle[]
}

/** A day before: the same subject, its latest title then, and how many sources told it. */
export interface DayBefore {
  /** YYYY-MM-DD, Paris time. */
  day: string
  title: string
  sources: number
}

/** The kiosk as the user arranged it: the sources' order and the large cards (`host.save('kiosk', …)`). */
export interface Kiosk {
  order: string[]
  large: string[]
}

/** What the view calls. */
export type InfosMethods = {
  /** The last 24 hours, ranked; `all`: with the set-aside sources. */
  reading(opts: { all: boolean }): Reading
  /** Titles matching words over the last 7 days, most recent first. */
  search(words: string, opts: { all: boolean }): NewsHeadline[]
  /** For the title on screen: its media and the start of its article; null: nothing to read. */
  article(id: string): NewsArticle | null
  /** The same subject on the 6 days before today, oldest first. */
  days(id: string, opts: { all: boolean }): DayBefore[]
  /** When the user last opened INFOS (ISO, null the first time), and now kept as the last visit. */
  visit(): string | null
  /** A word Marianne left once, at the move to INFOS; then it goes. */
  notice(): string | null
}
