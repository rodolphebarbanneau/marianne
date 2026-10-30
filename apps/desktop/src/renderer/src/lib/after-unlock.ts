/**
 * What the application shows once it opens, decided on the lock screen: the recovery key of a
 * new account, a new password after a recovery, the offer of a PIN on this computer. A store the
 * first screen subscribes to: the session may open before the lock screen knows the recovery key.
 */

export interface AfterUnlockState {
  recoveryKey: string
  resetPassword: boolean
  offerPin: boolean
}

const NOTHING: AfterUnlockState = { recoveryKey: '', resetPassword: false, offerPin: false }
let state: AfterUnlockState = NOTHING
const listeners = new Set<() => void>()

export const afterUnlock = {
  get: (): AfterUnlockState => state,
  set(patch: Partial<AfterUnlockState>): void {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  },
  /**
   * The account locked: what it was to show goes with it. A recovery key not yet noted would
   * otherwise open over the next account in this window, and stay in memory meanwhile.
   */
  reset(): void {
    if (state === NOTHING) return
    state = NOTHING
    for (const listener of listeners) listener()
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
}

/** What the lock screen opens on: the list of accounts ("changer de compte"), or one account (an archive opened from the system). */
export const lockIntent: { list: boolean; account: string | null } = { list: false, account: null }

let isOpening = false
const openingListeners = new Set<() => void>()

/**
 * Set while the lock screen opens an account: the session opens first, and the window stays on the
 * lock screen, its progress bar running, until the assistants are checked.
 */
export const opening = {
  get: (): boolean => isOpening,
  set(next: boolean): void {
    if (next === isOpening) return
    isOpening = next
    for (const listener of openingListeners) listener()
  },
  subscribe(listener: () => void): () => void {
    openingListeners.add(listener)
    return () => openingListeners.delete(listener)
  }
}
