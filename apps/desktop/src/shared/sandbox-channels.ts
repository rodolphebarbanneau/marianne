/**
 * The IPC channels of a community service's sandbox (its main side): a module of their own, so that its preload
 * (bundled alone, sandboxed: it may require nothing but Electron) holds them without sharing a
 * chunk with another preload. See shared/community.ts.
 */

/** The IPC channels between a sandbox's preload and the main process (and nothing else). */
export const SANDBOX_CHANNELS = {
  /** invoke: the context's network and communes. */
  call: 'community:call',
  /** sendSync: the context's storage, the commune of the address, the profile fields granted. */
  callSync: 'community:call-sync',
  /** main → sandbox: something to run (activate, a method, a tool, the tile…). */
  invoke: 'community:invoke',
  /** sandbox → main: the answer to an invoke. */
  reply: 'community:reply',
  log: 'community:log'
} as const
