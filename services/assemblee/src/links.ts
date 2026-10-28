/** The Assemblée's pages, shared by the main side (tool results) and the view. */

/** The legislature whose open data the service follows (the 17th, since July 2024). */
export const LEGISLATURE = 17

const SITE = 'https://www.assemblee-nationale.fr'
export const PORTAL = 'https://videos.assemblee-nationale.fr'
export const AGENDA_PAGE = 'https://www2.assemblee-nationale.fr/agendas/les-agendas'

export const deputyPage = (id: string) => `${SITE}/dyn/deputes/${id}`

export const deputyPhoto = (id: string) => `${SITE}/dyn/static/tribun/${LEGISLATURE}/photos/carre/${id.replace(/^PA/i, '')}.jpg`

/** VTANR5L17V9097 → the legislature in its id. */
export const ballotPage = (b: { id: string; number: number }) => `${SITE}/dyn/${b.id.match(/L(\d+)V/)?.[1] ?? LEGISLATURE}/scrutins/${b.number}`

export const videoPage = (id: string, timecodeMs?: number) => `${PORTAL}/video.${id}${timecodeMs ? `?timecode=${Math.round(timecodeMs)}` : ''}`

/**
 * A video reference from the portal: an id ("19632460_6ae0ce76adf9c"), a search hit path
 * ("/19634676_6ae0f545798fb?timecode=1069980", for a speaker or chapter match) or a page URL.
 */
export function parseVideoRef(ref: string): { id: string; timecode?: number } | null {
  const id = ref.match(/(\d+_[0-9a-f]+)/i)?.[1]
  if (!id) return null
  const timecode = ref.match(/[?&]timecode=(\d+)/)?.[1]
  return timecode ? { id, timecode: Number(timecode) } : { id }
}

/** "1re", "4e": a constituency's number as French writes it. */
export const ordinal = (n: string) => (n === '1' ? '1re' : `${n}e`)
