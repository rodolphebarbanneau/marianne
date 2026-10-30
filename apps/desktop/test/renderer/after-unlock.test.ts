import { describe, expect, it } from 'vitest'
import { afterUnlock } from '../../src/renderer/src/lib/after-unlock'

describe('what an account shows on opening', () => {
  it('goes when the account locks: a recovery key not yet noted never opens over the next account', () => {
    let told = 0
    const off = afterUnlock.subscribe(() => told++)
    afterUnlock.set({ recoveryKey: 'AAAAA-BBBBB-CCCCC', offerPin: true })
    expect(afterUnlock.get().recoveryKey).toBe('AAAAA-BBBBB-CCCCC')
    afterUnlock.reset()
    expect(afterUnlock.get()).toEqual({ recoveryKey: '', resetPassword: false, offerPin: false })
    expect(told).toBe(2)
    // Nothing left to forget: the screens aren't drawn again.
    afterUnlock.reset()
    expect(told).toBe(2)
    off()
  })
})
