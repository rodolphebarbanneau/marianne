import { foldText } from '@marianne/sdk'
import { DOCUMENT_TYPE_LABELS, type DocumentMeta, type Profile } from '@marianne/profile'
import type { Site } from '@shared/sites'

/** What the settings' long lists show and keep: pure, so that what a search or a filter keeps is tested apart. */

/** « a », « a et b », « a, b et c ». */
export const listing = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} et ${words[words.length - 1]}` : words.join(''))

/** "2021-04-12" → "12/04/2021"; « — » for no date. */
export function frDate(ymd: string | undefined): string {
  const m = ymd?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

/** Where a document is: in a folder (its conversation's pièces) or not. */
export type DocumentPlace = 'all' | 'folder' | 'loose'

/** The words a document is found by, besides its own: its folder's title, what it is linked to. */
export const documentWords =
  (more: (d: DocumentMeta) => Array<string | undefined>) =>
  (d: DocumentMeta): string =>
    [d.title, d.fileName, DOCUMENT_TYPE_LABELS[d.type], ...more(d)].filter(Boolean).join(' ')

/** The documents a search and the filters keep, the latest first (by their own date, else when they were added). */
export function filterDocuments(
  documents: DocumentMeta[],
  { query, place, domain }: { query: string; place: DocumentPlace; domain: string },
  words: (d: DocumentMeta) => string
): DocumentMeta[] {
  const q = foldText(query.trim())
  const when = (d: DocumentMeta) => d.date || d.addedAt.slice(0, 10)
  return documents
    .filter((d) => place === 'all' || (place === 'folder') === !!d.folderId)
    .filter((d) => domain === 'all' || d.domain === domain)
    .filter((d) => !q || foldText(words(d)).includes(q))
    .sort((a, b) => when(b).localeCompare(when(a)))
}

/**
 * The sites Réglages › Sites et API lists: those where Marianne keeps something for the user, an identifier
 * and its password, numbers, or that need the social security number. FranceConnect's and those without an
 * account have nothing to set: they are left out.
 */
export const settableSites = (sites: Site[]) => sites.filter((s) => s.login === 'account' || !!s.fields?.length || !!s.needsNir)

/** A site's state in the list: its login kept, its numbers given, the social security number it needs. */
export interface SiteState {
  login: boolean
  numbers: Array<{ label: string; given: boolean }>
  done: boolean
}

/**
 * Set up as the engine sees it (siteReady): a site with numbers or that needs the social security number only once
 * chosen, its record kept, though the number may already be in Identité.
 */
export function siteState(site: Site, profile: Pick<Profile, 'accounts' | 'person'> | null, hasLogin: boolean): SiteState {
  const account = profile?.accounts.find((a) => a.siteId === site.id)
  const fields = account?.fields ?? {}
  const numbers = (site.fields ?? []).map((f) => ({ label: f.label, given: !!fields[f.key]?.trim() }))
  if (site.needsNir) numbers.push({ label: 'n° de sécurité sociale', given: !!profile?.person.nir })
  const login = site.login === 'account' && hasLogin
  const chosen = !numbers.length || !!account
  return { login, numbers, done: chosen && (site.login !== 'account' || login) && numbers.every((n) => n.given) }
}

/** The sites a search and the filter keep: all, those set up, those left to set up. */
export function filterSites<T extends { site: Site; state: SiteState }>(rows: T[], query: string, which: 'all' | 'done' | 'todo'): T[] {
  const q = foldText(query.trim())
  return rows
    .filter((r) => which === 'all' || (which === 'done') === r.state.done)
    .filter((r) => !q || foldText(`${r.site.name} ${r.site.url} ${r.site.description ?? ''}`).includes(q))
}
