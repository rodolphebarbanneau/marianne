import type { ServiceHost } from '../view'

/**
 * A player starts playing `src`. The same video in the app's mini-player is taken back from it:
 * played again from the stand-in while it went on there, or pinned a moment ago by a player of the
 * same page that remounted (its take, as this one rendered, came before that pin). Any other video
 * there stops: one at a time. Where to go on from, ms; null: from here.
 */
export function startedPlaying(media: ServiceHost['media'], src: string): number | null {
  if (!media) return null
  const at = media.take(src)
  media.playing(src)
  return at
}
