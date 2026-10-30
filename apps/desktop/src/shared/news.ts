import type { NewsGroup, NewsSource } from '@marianne/content'
import type { NewsChoice } from '@marianne/profile'
import type { Lean } from '@marianne/sdk'

/**
 * The French news sources Marianne reads for 3615 INFOS are content (@marianne/content,
 * news-sources.json): the main process has them from the content store, the window asks for them
 * (newsSources). Marianne shows only what a feed shows (title, time, source, link) and the start of
 * one article on screen, never the whole of it. Which of them the user accepts is a profile field
 * (opinions.sources); the helpers here read it the same way in the window and in the main process.
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

/** The départements of each region (INSEE codes, the regions of 2016): a regional source's area is given in regions. */
const REGION_DEPARTMENTS: Record<string, string[]> = {
  '01': ['971'],
  '02': ['972'],
  '03': ['973'],
  '04': ['974'],
  '06': ['976'],
  '11': ['75', '77', '78', '91', '92', '93', '94', '95'],
  '24': ['18', '28', '36', '37', '41', '45'],
  '27': ['21', '25', '39', '58', '70', '71', '89', '90'],
  '28': ['14', '27', '50', '61', '76'],
  '32': ['02', '59', '60', '62', '80'],
  '44': ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
  '52': ['44', '49', '53', '72', '85'],
  '53': ['22', '29', '35', '56'],
  '75': ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
  '76': ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
  '84': ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
  '93': ['04', '05', '06', '13', '83', '84'],
  '94': ['2A', '2B']
}

const REGION_OF = new Map(Object.entries(REGION_DEPARTMENTS).flatMap(([region, departments]) => departments.map((d) => [d, region] as const)))

/**
 * The INSEE region of a commune, from its INSEE code (its département): known on this computer, so
 * the defaults need no network. Null for an empty or unknown code.
 */
export function regionOf(inseeCode: string): string | null {
  const code = inseeCode.trim().toUpperCase()
  return REGION_OF.get(/^97/.test(code) ? code.slice(0, 3) : code.slice(0, 2)) ?? null
}

/**
 * The sources set aside: the user's own choice, or the defaults (`choice` null): every source
 * accepted but the regional ones whose regions don't include `region` (the address's); without an
 * address, every one. Ids the catalogue no longer has stay in a choice (it may have them again).
 */
export function refusedSources(catalogue: NewsSource[], choice: NewsChoice | null, region: string | null): Set<string> {
  if (choice) return new Set(choice.refused)
  if (!region) return new Set()
  return new Set(catalogue.filter((s) => s.group === 'regional' && s.regions?.length && !s.regions.includes(region)).map((s) => s.id))
}

/** A source's editorial line: the user's own when they gave it one, else Marianne's. */
export const leanOf = (source: NewsSource, choice: NewsChoice | null): Lean => choice?.leanings[source.id] ?? source.lean ?? 'aucune'

/**
 * The sections a source keeps: those the user ticked, or all of them; a source without sections
 * has its front page only (no section ids). Unticking every section sets the source aside (Réglages
 * says so by setting it aside): when none of the ticked ones is in the list any more (the list renamed
 * its sections), the source keeps them all rather than going silent.
 */
export function keptSections(source: NewsSource, choice: NewsChoice | null): string[] {
  const all = (source.sections ?? []).map((s) => s.id)
  const kept = choice?.sections[source.id]
  if (!kept) return all
  const still = all.filter((id) => kept.includes(id))
  // An empty list is the user's (every section unticked); one whose ids are all gone is the list's.
  return still.length || !kept.length ? still : all
}

/** Whether a source is accepted: not set aside, and, with sections, at least one kept. */
export function accepted(source: NewsSource, choice: NewsChoice | null, refused: Set<string>): boolean {
  return !refused.has(source.id) && (!source.sections?.length || keptSections(source, choice).length > 0)
}
