import { cutText, TILE_LIMITS, withoutLive, type ServiceTile, type TileItem } from '@marianne/sdk/main'
import { hour } from './time'
import type { Reading, Subject } from './types'

/**
 * 3615 INFOS's tile on the Services page: the front page at a glance. The subjects most told right
 * now, three at most, numbered as « à la une » numbers them, each by its latest title (the news
 * itself, rather than the words its titles share) and how many of the sources read tell it
 * (« 6/7 »); under them, how many subjects there are, of how many sources. Nobody chose them: they
 * change as the day goes. A click opens « à la une », where the same numbers open the same subjects.
 */

/** How many of the sources read tell a subject, and of how many: the user's accepted ones when theirs apply, else all of Marianne's. */
function coverage(r: Reading, s: Subject): string {
  return r.filtered && !r.all ? `${s.told}/${r.accepted}` : `${s.items.length}/${r.sources.length}`
}

/** A subject as a row: its latest title, how many tell it, and the live dot when one of its titles is a live coverage. */
function row(r: Reading, s: Subject): TileItem {
  return { text: cutText(withoutLive(s.items[0].title), TILE_LIMITS.item), figure: coverage(r, s), ...(s.live ? { tone: 'live' as const } : {}) }
}

export function infosTile(r: Reading): ServiceTile {
  if (!r.subjects.length) {
    const latest = r.items[0]
    return {
      title: r.items.length ? 'aucun sujet commun' : 'aucun titre pour le moment',
      lines: [{ text: latest ? cutText(withoutLive(latest.title), TILE_LIMITS.line) : 'les titres de vos sources, lus par Marianne', tone: 'dim' }]
    }
  }
  const n = r.subjects.length
  const of = r.filtered && !r.all ? `vos ${r.accepted}` : String(r.sources.length)
  return {
    visual: { kind: 'list', numbered: true, items: r.subjects.slice(0, TILE_LIMITS.items).map((s) => row(r, s)) },
    // No feed answered: the titles are the last ones Marianne read, and the tile says when.
    lines: [{ text: r.offline ? `hors ligne · titres de ${hour(r.readAt)}` : `${n} ${n > 1 ? 'sujets' : 'sujet'} sur ${of} sources`, tone: 'dim' }]
  }
}
