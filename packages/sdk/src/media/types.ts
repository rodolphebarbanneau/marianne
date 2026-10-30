/** A line of a video's table of contents. ms from the start of the video. */
export interface MediaChapter {
  at: number
  title: string
  speaker?: string
  depth: number
}

export interface MediaSpan {
  from: number
  to: number
}

export interface MediaClip extends MediaSpan {
  title: string
}

/** The four corners of the window the mini-player snaps to. */
export type MiniCorner = 'tl' | 'tr' | 'bl' | 'br'

/** What a screen hands to the app to keep playing in the corner. */
export interface PinnedMedia {
  src: string
  poster?: string
  title: string
  /** A short badge before the title in the caption, e.g. "AN" / "SÉNAT". */
  badge?: string
  live?: boolean
  /** Where it was, ms. */
  at: number
  /** The route and params that bring the user back to the video's page (see ServiceHost.openRoute), with the position to resume from. */
  route: string
  params?: Record<string, string | number>
}
