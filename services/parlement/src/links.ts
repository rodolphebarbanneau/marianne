import type { Chamber } from './types'

/** The chambers' pages, shared by the main side (tool results) and the view. */

/** The legislature whose open data the service follows (the 17th, since July 2024). */
export const LEGISLATURE = 17

const SITE = 'https://www.assemblee-nationale.fr'
const SENATE = 'https://www.senat.fr'
export const PORTAL = 'https://videos.assemblee-nationale.fr'
export const SENATE_PORTAL = 'https://videos.senat.fr'
/** The Assemblée portal's live page (it goes to the video of the main live, when there is one). */
export const LIVE_PAGE = `${PORTAL}/direct.php`
export const AGENDA_PAGE = 'https://www2.assemblee-nationale.fr/agendas/les-agendas'
export const SENATE_AGENDA_PAGE = 'https://agenda.senat.fr/'
/** Where the Assemblée tells anyone their deputy from their address. */
export const FIND_DEPUTY = `${SITE}/dyn/vos-deputes`

export const deputyPage = (id: string) => `${SITE}/dyn/deputes/${id}`

export const deputyPhoto = (id: string) => `${SITE}/dyn/static/tribun/${LEGISLATURE}/photos/carre/${id.replace(/^PA/i, '')}.jpg`

/** A ballot's page: VTANR5L17V9097 (the legislature in its id), SE2026-44. */
export function ballotPage(b: { chamber: Chamber; id: string; number: number }): string {
  if (b.chamber === 'se') {
    const session = b.id.match(/^SE(\d{4})-/)?.[1]
    return `${SENATE}/scrutin-public/${session}/scr${session}-${b.number}.html`
  }
  return `${SITE}/dyn/${b.id.match(/L(\d+)V/)?.[1] ?? LEGISLATURE}/scrutins/${b.number}`
}

export const videoPage = (chamber: Chamber, id: string, timecodeMs?: number) =>
  `${chamber === 'se' ? SENATE_PORTAL : PORTAL}/video.${id}${timecodeMs ? `?timecode=${Math.round(timecodeMs)}` : ''}`

/** A video's key across both portals: "se:5979506_6ae25732cc856"; the Assemblée's alone keep their bare id. */
export const videoKey = (chamber: Chamber, id: string) => (chamber === 'se' ? `se:${id}` : id)

/**
 * A video reference from either portal: an id ("19632460_6ae0ce76adf9c", the Assemblée's; "se:…",
 * the Sénat's), a search hit path ("/19634676_6ae0f545798fb?timecode=1069980", for a speaker or
 * chapter match) or a page URL (whose host tells the chamber).
 */
export function parseVideoRef(ref: string): { chamber: Chamber; id: string; timecode?: number } | null {
  const id = ref.match(/(\d+_[0-9a-f]+)/i)?.[1]
  if (!id) return null
  const chamber: Chamber = /^se:|videos\.senat\.fr/i.test(ref.trim()) ? 'se' : 'an'
  const timecode = ref.match(/[?&]timecode=(\d+)/)?.[1]
  return timecode ? { chamber, id, timecode: Number(timecode) } : { chamber, id }
}

/** "1re", "4e": a constituency's number as French writes it. */
export const ordinal = (n: string) => (n === '1' ? '1re' : `${n}e`)
