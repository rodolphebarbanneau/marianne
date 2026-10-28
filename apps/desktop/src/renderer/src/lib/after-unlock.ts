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

let state: AfterUnlockState = { recoveryKey: '', resetPassword: false, offerPin: false }
const listeners = new Set<() => void>()

export const afterUnlock = {
  get: (): AfterUnlockState => state,
  set(patch: Partial<AfterUnlockState>): void {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
}

/** "Changer de compte": the lock screen opens on the list of accounts. */
export const lockIntent = { list: false }
