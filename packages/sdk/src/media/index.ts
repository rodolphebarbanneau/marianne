/**
 * @marianne/sdk/media: Marianne's video player, for a service's screen. `Player` plays an HLS
 * stream (a recording or a broadcast) with the controls over the picture: the track with the
 * agenda's chapters, clips, sharing, the keyboard, fullscreen, and the app's mini-player through
 * the host (`ServiceHost.media`). `MiniPlayer` is the app's side of it. Its styles come with it.
 */

export type { MediaChapter, MediaClip, MediaSpan, MiniCorner, PinnedMedia } from './types'
export { Player, type PlayerHandle, type PlayerProps } from './player'
export { MiniPlayer, type MiniPlayerProps } from './mini'
export { chapterEnd, chapterIndexAt, clipTitleAt, parentIndex, saidAt, spanAt, type Said } from './chapters'
export { clockTime, delay, duration, readTime, SPEEDS, speedLabel, timeWriter, videoTime, type TimeMode } from './time'
export { DEFAULT_PREFS, onMediaPrefs, parsePrefs, PREFS_KEY, readMediaPrefs, saveMediaPrefs, type MediaPrefs } from './prefs'
export { keyAction, type KeyState, type MediaAction } from './keys'
