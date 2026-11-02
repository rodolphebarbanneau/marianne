import { PROFILE_FIELD_SHORT, PROFILE_FIELDS, type ProfileField, type ServiceState } from '@marianne/sdk'
import { listing } from './lists'

/** The opinions a service may ask to read: the leaning, the themes, the news sources. */
export const OPINION_FIELDS: ProfileField[] = ['opinions.leaning', 'opinions.themes', 'opinions.sources']

/** What the gear's checkboxes say of each field: the opinions in a few words, the others as the SDK says them. */
export const ASK_LABELS: Record<ProfileField, string> = {
  ...PROFILE_FIELDS,
  'opinions.leaning': 'votre sensibilité politique',
  'opinions.themes': 'vos thèmes',
  'opinions.sources': 'vos sources'
}

/**
 * What a service reads of what it asked for, in a few words: « sensibilité, thèmes et sources » when it
 * has all of it, « sources seulement » or « thèmes et sources seulement » when it has a part.
 */
export function readSummary(asked: ProfileField[], granted: ProfileField[] | null): { text: string; on: boolean } {
  if (granted === null) return { text: 'pas encore demandé', on: false }
  const items = asked.filter((f) => granted.includes(f))
  if (!items.length) return { text: 'refusé', on: false }
  const words = listing(items.map((f) => PROFILE_FIELD_SHORT[f]))
  return { text: items.length < asked.length ? `${words} seulement` : words, on: true }
}

/**
 * Réglages › Accès des services: the user's services (added ones) that ask to read part of the profile,
 * and the others, which only know the commune of the address. A service not added (a removed 3615 INFOS)
 * reads nothing: there is nothing to accept or refuse for it.
 */
export function accessReaders(services: ServiceState[]): { asking: ServiceState[]; others: ServiceState[] } {
  const mine = services.filter((s) => s.added)
  return { asking: mine.filter((s) => s.access.asked.length > 0), others: mine.filter((s) => !s.access.asked.length) }
}
