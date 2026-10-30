import type { NewsGroup } from '@marianne/content'

/**
 * The French news sources of "Actualités" are content (@marianne/content, news-sources.json): the
 * main process has them from the content store, the window asks for them (newsSources). Marianne
 * shows only what a feed shows (title, time, source, link), never the article.
 */
export type { NewsGroup, NewsLean, NewsSource } from '@marianne/content'

/**
 * What the history says of the sources, for Réglages: titles a day by source id (averaged over the
 * history's days), and today's first ten subjects (their words, the source ids telling each), so
 * the settings can say what a choice leaves out. Public data only: nothing of the user's choice.
 */
export interface NewsStats {
  perDay: Record<string, number>
  today: Array<{ words: string[]; sources: string[] }>
  /** Titles of this morning (since 5 h, Paris time) told only by each source, by source id. */
  aloneThisMorning: Record<string, number>
}

export const NEWS_GROUP_LABELS: Record<NewsGroup, string> = {
  national: 'Presse nationale',
  regional: 'Presse régionale',
  broadcast: 'Télévision et radio',
  factcheck: 'Vérification'
}
