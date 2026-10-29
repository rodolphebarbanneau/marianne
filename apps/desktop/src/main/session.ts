import { Session } from '@marianne/archive'

/**
 * The open account of this process (see @marianne/archive): unlocked by account.ts, read by
 * every store, locked on idle, sleep or quit. Its own module, without Electron, so the engines,
 * the tools and the tests can import it.
 */
export const session = new Session()
