import type { NewsGroup } from '@marianne/content'

/**
 * The French news sources of "Actualités" are content (@marianne/content, news-sources.json): the
 * main process has them from the content store, the window asks for them (newsSources). Marianne
 * shows only what a feed shows (title, time, source, link), never the article.
 */
export type { NewsGroup, NewsSource } from '@marianne/content'

export const NEWS_GROUP_LABELS: Record<NewsGroup, string> = {
  national: 'Presse nationale',
  regional: 'Presse régionale',
  broadcast: 'Télévision et radio',
  factcheck: 'Vérification'
}
