/**
 * The IPC channels of a community service's screen: a module of their own, so that its preload
 * (bundled alone, sandboxed: it may require nothing but Electron) holds them without sharing a
 * chunk with another preload. See shared/community.ts.
 */

/** The IPC channels between a screen's preload and the main process. */
export const SCREEN_CHANNELS = {
  /** screen → main: a FromFrame message. */
  post: 'community-screen:post',
  /** main → screen: a ToFrame message. */
  message: 'community-screen:message'
} as const

/** What a screen's preload lets cross to the main process: a message as JSON text within this length, so often. */
export const SCREEN_LIMITS = { chars: 1_100_000, perSecond: 100, burst: 300 } as const
