import { describe, expect, it } from 'vitest'
import { plainKey } from '../../src/renderer/src/lib/keys'
import { accelOf, matches, SHORTCUTS, type KeyLike } from '../../src/shared/shortcuts'

/** A page's own Enter and Space, and the app's shortcuts made of them: each its own. */

const none = { ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }
const press = (key: string, mods: Partial<typeof none> = {}): KeyLike => ({ key, code: key === ' ' ? 'Space' : key, ...none, ...mods })

/** The event a shortcut's keys send. */
function eventOf(accel: string, mac: boolean): KeyLike {
  const parts = accel.split('+')
  const last = parts.pop() ?? ''
  const e = press(last === 'Space' ? ' ' : last)
  for (const m of parts) {
    if (m === 'CommandOrControl') e[mac ? 'metaKey' : 'ctrlKey'] = true
    if (m === 'Control') e.ctrlKey = true
    if (m === 'Alt') e.altKey = true
    if (m === 'Shift') e.shiftKey = true
  }
  return e
}

describe('a page’s Enter and Space', () => {
  it('answer the key alone, never with a modifier', () => {
    expect(plainKey(press('Enter'), 'Enter')).toBe(true)
    expect(plainKey(press(' '), 'Enter', ' ')).toBe(true)
    expect(plainKey(press('a'), 'Enter', ' ')).toBe(false)
    for (const mod of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey'] as const) {
      expect(plainKey(press('Enter', { [mod]: true }), 'Enter')).toBe(false)
      expect(plainKey(press(' ', { [mod]: true }), ' ')).toBe(false)
    }
  })

  it('leave the app’s shortcuts on Enter and Space to the app: a new folder, SOMMAIRE, search everywhere', () => {
    for (const mac of [false, true]) {
      const modified = SHORTCUTS.filter((def) => /\+(Enter|Space)$/.test(accelOf(def.id, mac)))
      expect(modified.map((def) => def.id)).toEqual(expect.arrayContaining(['marianne', 'menu', 'search']))
      for (const def of modified) {
        const e = eventOf(accelOf(def.id, mac), mac)
        expect(matches(e, accelOf(def.id, mac), mac)).toBe(true)
        expect(plainKey(e, 'Enter', ' ')).toBe(false)
      }
    }
  })
})
