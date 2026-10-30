import { PROFILE_FIELD_SHORT, type ProfileField } from '@marianne/sdk'

/** The opinions a service may ask to read: the leaning, the themes, the news sources. */
export const OPINION_FIELDS: ProfileField[] = ['opinions.leaning', 'opinions.themes', 'opinions.sources']

/** What the gear's checkboxes say of each. */
export const ASK_LABELS: Partial<Record<ProfileField, string>> = {
  'opinions.leaning': 'votre sensibilité politique',
  'opinions.themes': 'vos thèmes',
  'opinions.sources': 'vos sources'
}

/** « a », « a et b », « a, b et c ». */
const list = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} et ${words[words.length - 1]}` : words.join(''))

/**
 * What a service reads of the opinions, in a few words: « sensibilité, thèmes et sources » when it
 * has all it asked for, « sources seulement » or « thèmes et sources seulement » when it has a part.
 */
export function readSummary(asked: ProfileField[], granted: ProfileField[] | null): { text: string; on: boolean } {
  if (granted === null) return { text: 'pas encore demandé', on: false }
  const items = OPINION_FIELDS.filter((f) => asked.includes(f) && granted.includes(f))
  if (!items.length) return { text: 'refusé', on: false }
  const words = list(items.map((f) => PROFILE_FIELD_SHORT[f]))
  return { text: items.length < asked.length ? `${words} seulement` : words, on: true }
}
