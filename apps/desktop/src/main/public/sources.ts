import { publicSource } from '../../shared/public'
import type { PublicSourceId } from '../../shared/types'
import { configStore } from '../config'

/** The configured URL of a source (its official one by default), without a trailing slash. */
export function sourceUrl(id: PublicSourceId): string {
  return (configStore.get().sources[id].url.trim() || publicSource(id).defaultUrl).replace(/\/+$/, '')
}

export const isEnabled = (id: PublicSourceId) => configStore.get().sources[id].enabled

/** Throws, in French, when the user turned the source off. */
export function ensureEnabled(id: PublicSourceId): void {
  if (!isEnabled(id)) throw new Error(`La source « ${publicSource(id).label} » est désactivée (réglages → sources).`)
}
