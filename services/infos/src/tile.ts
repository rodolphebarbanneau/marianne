import { cutText, TILE_LIMITS, withoutLive, type Lean, type PaletteColor, type ServiceTile } from '@marianne/sdk/main'
import { byLean, shownSources } from './model'
import type { Reading } from './types'

/**
 * 3615 INFOS's tile on the Services page: the first subject, the most told right now (its words,
 * who tells it as a row of blocks in their colours, its latest title). Nobody chose it: it changes
 * as the day goes.
 */

/** A source's editorial line in the palette, as near as its colours go (orange has no hue of its own). */
export const LEAN_PALETTE: Record<Lean, PaletteColor> = {
  gauche: 'rouge',
  'centre-gauche': 'rouge-clair',
  centre: 'jaune',
  'centre-droit': 'bleu-clair',
  droite: 'bleu',
  aucune: 'gris-clair'
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
  const telling = new Set(first.items.map((h) => h.source))
  const sources = byLean(shownSources(r)).slice(0, TILE_LIMITS.blocks)
  const who = r.filtered && !r.all ? `chez ${first.told} de vos ${r.accepted} sources` : `chez ${first.items.length} sources sur ${r.sources.length}`
  return {
    title: cutText(first.words.join(' · ') || withoutLive(first.items[0].title), TILE_LIMITS.title),
    visual: { kind: 'blocks', blocks: sources.map((s) => ({ color: telling.has(s.id) ? LEAN_PALETTE[s.lean] : null })) },
    lines: [
      { text: who, tone: first.live ? 'live' : 'normal' },
      { text: cutText(withoutLive(first.items[0].title), TILE_LIMITS.line), tone: 'dim' }
    ],
    params: { subject: first.id }
  }
}
