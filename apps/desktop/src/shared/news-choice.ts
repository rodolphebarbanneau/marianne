import { LEANS, sideOf, type Lean, type Side } from '@marianne/sdk'
import type { NewsChoice } from '@marianne/profile'
import { keptSections, leanOf, refusedSources, regionOf, type NewsSource } from './news'

/**
 * What Réglages › Identité › sources d'information makes of the user's choice (opinions.sources):
 * the defaults made a choice of their own at the first change, the edits (accepted or set aside,
 * the sections, the colour) and the kiosk's summary. Reading a choice is news.ts's, shared with the
 * main process, so both agree on what the defaults are.
 */

/** The regions of France by their INSEE code, as news-sources.json's `regions` names them. */
export const REGIONS: Record<string, string> = {
  '01': 'Guadeloupe',
  '02': 'Martinique',
  '03': 'Guyane',
  '04': 'La Réunion',
  '06': 'Mayotte',
  '11': 'Île-de-France',
  '24': 'Centre-Val de Loire',
  '27': 'Bourgogne-Franche-Comté',
  '28': 'Normandie',
  '32': 'Hauts-de-France',
  '44': 'Grand Est',
  '52': 'Pays de la Loire',
  '53': 'Bretagne',
  '75': 'Nouvelle-Aquitaine',
  '76': 'Occitanie',
  '84': 'Auvergne-Rhône-Alpes',
  '93': 'Provence-Alpes-Côte d’Azur',
  '94': 'Corse'
}

/** The choice in force as one to change: the user's, or the defaults for the address's commune. */
export function choiceOf(stored: NewsChoice | null, sources: NewsSource[], inseeCode: string): NewsChoice {
  return stored ?? { refused: [...refusedSources(sources, null, regionOf(inseeCode))], sections: {}, leanings: {} }
}

export const isAccepted = (choice: NewsChoice, id: string): boolean => !choice.refused.includes(id)

/** Marianne's editorial line for a source; « sans classement » when the list gives none. */
export const defaultLean = (source: NewsSource): Lean => source.lean ?? 'aucune'

/** Sources accepted or set aside. A source accepted again keeps the sections it had. */
export function acceptSources(choice: NewsChoice, ids: string[], accept: boolean): NewsChoice {
  const refused = accept ? choice.refused.filter((id) => !ids.includes(id)) : [...new Set([...choice.refused, ...ids])]
  return { ...choice, refused }
}

/**
 * The sections kept of a source. All of them is the default, so it isn't stored; none sets the
 * source aside, and it comes back with all of them when accepted again.
 */
export function keepSections(choice: NewsChoice, source: NewsSource, ids: string[]): NewsChoice {
  const all = keptSections(source, null)
  const kept = all.filter((id) => ids.includes(id))
  const sections = { ...choice.sections }
  delete sections[source.id]
  if (!kept.length) return { ...acceptSources(choice, [source.id], false), sections }
  if (kept.length < all.length) sections[source.id] = kept
  return { ...choice, sections }
}

/** A source's colour given by the user; Marianne's own (or null) takes theirs back, so only the changed ones are kept. */
export function giveLean(choice: NewsChoice, source: NewsSource, lean: Lean | null): NewsChoice {
  const leanings = { ...choice.leanings }
  if (lean === null || lean === defaultLean(source)) delete leanings[source.id]
  else leanings[source.id] = lean
  return { ...choice, leanings }
}

/** Sources from the left to the right by their colour, by name within one. */
export const byLean = (sources: NewsSource[], choice: NewsChoice): NewsSource[] =>
  [...sources].sort((a, b) => LEANS.indexOf(leanOf(a, choice)) - LEANS.indexOf(leanOf(b, choice)) || a.name.localeCompare(b.name, 'fr'))

/**
 * The accepted sources by side (à gauche, au centre, à droite, sans classement). A side none of
 * the sources belongs to is left out: it would say 0 of nothing.
 */
export function sidesOf(sources: NewsSource[], choice: NewsChoice): Partial<Record<Side, number>> {
  const count: Partial<Record<Side, number>> = {}
  for (const s of sources) {
    const side = sideOf(leanOf(s, choice))
    count[side] = (count[side] ?? 0) + (isAccepted(choice, s.id) ? 1 : 0)
  }
  return count
}
