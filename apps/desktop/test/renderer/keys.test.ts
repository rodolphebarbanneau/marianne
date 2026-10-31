import { describe, expect, it } from 'vitest'
import { dialogEnter, plainKey, tabFromKey, type DialogKey } from '../../src/renderer/src/lib/keys'
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

describe('a page’s tabs', () => {
  it('open on F2, F3… in their order, F1 left to GUIDE', () => {
    expect(tabFromKey(press('F2'), 3)).toBe(0)
    expect(tabFromKey(press('F3'), 3)).toBe(1)
    expect(tabFromKey(press('F4'), 3)).toBe(2)
    expect(tabFromKey(press('F1'), 3)).toBeNull()
  })

  it('stop at the page’s last tab, and leave F10, F11 and F12 to the window', () => {
    expect(tabFromKey(press('F4'), 2)).toBeNull()
    expect(tabFromKey(press('F5'), 4)).toBe(3)
    for (const key of ['F10', 'F11', 'F12']) expect(tabFromKey(press(key), 9)).toBeNull()
  })

  it('answer the key alone, never with a modifier', () => {
    for (const mod of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey'] as const) expect(tabFromKey(press('F2', { [mod]: true }), 3)).toBeNull()
    expect(tabFromKey(press('2'), 3)).toBeNull()
  })
})

describe('a dialog’s Entrée', () => {
  const at = (timeStamp: number, more: Partial<DialogKey> = {}): DialogKey => ({
    ...press('Enter'),
    timeStamp,
    defaultPrevented: false,
    repeat: false,
    ...more
  })
  const opened = 1000

  it('is not the Entrée that opened the dialog, which reaches the window after the dialog is drawn', () => {
    // The page's keydown drew the dialog in its microtask: the event is older than the dialog.
    expect(dialogEnter(at(999.5), opened)).toBe(false)
    // performance.now() is coarse: the same instant is still the key that opened it.
    expect(dialogEnter(at(opened), opened)).toBe(false)
    expect(dialogEnter(at(1250), opened)).toBe(true)
    // That Entrée held down: its repeats, after the dialog opened, are not a press of its button.
    expect(dialogEnter(at(1500, { repeat: true }), opened)).toBe(false)
  })

  it('leaves an Entrée a field took, and ctrl+entrée to the app', () => {
    expect(dialogEnter(at(1250, { defaultPrevented: true }), opened)).toBe(false)
    expect(dialogEnter(at(1250, { ctrlKey: true }), opened)).toBe(false)
    expect(dialogEnter({ ...at(1250), key: 'a' }, opened)).toBe(false)
  })
})

describe('the conversation’s keys', () => {
  it('keep RÉPÉTITION off ctrl+maj+R, which reloads the window', () => {
    for (const mac of [false, true]) {
      const reload = eventOf(accelOf('reload', mac), mac)
      expect(matches(reload, accelOf('retry', mac), mac)).toBe(false)
      expect(matches(eventOf(accelOf('retry', mac), mac), accelOf('retry', mac), mac)).toBe(true)
    }
  })

  it('follow the keys the user chose in Réglages', () => {
    const custom = { send: 'CommandOrControl+Enter', stop: 'F8' }
    expect(matches(press('Enter'), accelOf('send', false, custom), false)).toBe(false)
    expect(matches(press('Enter', { ctrlKey: true }), accelOf('send', false, custom), false)).toBe(true)
    expect(matches(press('Escape'), accelOf('stop', false, custom), false)).toBe(false)
    expect(matches(press('F8'), accelOf('stop', false, custom), false)).toBe(true)
  })
})
