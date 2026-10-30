import { cutText, TILE_LIMITS, withoutLive, type Lean, type PaletteColor, type ServiceTile } from '@marianne/sdk/main'
import { byLean, shownSources } from './model'
import type { Reading } from './types'

/**
 * 3615 INFOS's tile on the Services page: the first subject, the most told right now. Its words name
 * it; under them, the sources that tell it, from the left to the right, one block each in its colour
 * (how far across the spectrum it goes, at a glance); then its latest title, the news itself, and how
 * many of the user's sources tell it. Nobody chose it: it changes as the day goes.
 */

/** A source's editorial line in the palette, as near as its colours go: the centre is the neutral white. */
export const LEAN_PALETTE: Record<Lean, PaletteColor> = {
  gauche: 'rouge',
  'centre-gauche': 'rouge-clair',
  centre: 'blanc',
  'centre-droit': 'bleu-clair',
  droite: 'bleu'
}

/** What a tile's title shows whole on one line, in its pixel font. */
const TITLE_FITS = 30

/** The subject's words that fit whole: a word cut in half (« cyberatta… ») names nothing. */
function fitWords(words: string[]): string {
  let title = words[0]
  for (const w of words.slice(1)) {
    if (`${title} · ${w}`.length > TITLE_FITS) break
    title = `${title} · ${w}`
  }
  return cutText(title, TILE_LIMITS.title)
}

export function infosTile(r: Reading): ServiceTile {
  const first = r.subjects[0]
  if (!first) {
    const latest = r.items[0]
    return {
      title: r.items.length ? 'aucun sujet commun' : 'aucun titre pour le moment',
      lines: [{ text: latest ? cutText(withoutLive(latest.title), TILE_LIMITS.line) : 'les titres de vos sources, lus par Marianne', tone: 'dim' }]
    }
  }
  // Only the sources that tell it: the blocks say how far across the spectrum it goes, not who keeps quiet.
  const telling = new Set(first.items.map((h) => h.source))
  const sources = byLean(shownSources(r).filter((s) => telling.has(s.id))).slice(0, TILE_LIMITS.blocks)
  const who =
    r.filtered && !r.all ? `${first.told} de vos ${r.accepted} sources en parlent` : `${first.items.length} sources sur ${r.sources.length} en parlent`
  return {
    title: first.words.length ? fitWords(first.words) : cutText(withoutLive(first.items[0].title), TILE_LIMITS.title),
    visual: { kind: 'blocks', blocks: sources.map((s) => ({ color: LEAN_PALETTE[s.lean] })) },
    lines: [
      { text: cutText(withoutLive(first.items[0].title), TILE_LIMITS.line), tone: first.live ? 'live' : 'normal' },
      { text: who, tone: 'dim' }
    ],
    params: { subject: first.id }
  }
}
