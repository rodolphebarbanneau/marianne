import { describe, expect, it } from 'vitest'
import { afterUnlock, openingBar } from '../../src/renderer/src/lib/after-unlock'

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

describe('the opening bar', () => {
  it('names the steps, never an assistant, and ends full', () => {
    expect(openingBar({ phase: 'archive' })).toEqual({ share: 0, text: 'déchiffrement de l’archive' })
    expect(openingBar({ phase: 'engines', checked: 0, of: 2 })).toEqual({ share: 1 / 3, text: 'vérification des assistants' })
    expect(openingBar({ phase: 'engines', checked: 1, of: 2 }).share).toBeCloseTo(2 / 3)
    expect(openingBar({ phase: 'engines', checked: 2, of: 2 }).share).toBe(1)
    expect(openingBar({ phase: 'engines', checked: 0, of: 1 }).text).toBe('vérification de l’assistant')
  })
})
