import { describe, expect, it } from 'vitest'
import { keyAction, type KeyElement, type KeyState } from '../src/keys'

// An element, as the keys see it: the selectors it is inside of.
const el = (...inside: string[]): KeyElement => ({ closest: (selector: string) => (inside.some((x) => selector.includes(x)) ? {} : null) })
const BODY = el()
const FRONT: KeyState = { front: true, numbered: true, typed: '', open: 0 }

describe('the keys', () => {
  it('work wherever the focus is in Marianne’s frame: a tab just clicked, « toutes » in the tools', () => {
    const tab = el('button')
    expect(keyAction('ArrowDown', tab, tab, FRONT)).toBe('down')
    expect(keyAction('3', tab, tab, FRONT)).toBe('digit')
    expect(keyAction('Escape', tab, tab, { ...FRONT, open: 1 })).toBe('close')
  })

  it('are kept by a dialog over the window and by a text field', () => {
    for (const over of ['[role="dialog"]', '.modal', '#root > .overlay']) {
      expect(keyAction('ArrowDown', BODY, el(over), FRONT)).toBeNull()
      expect(keyAction('Escape', BODY, el(over), { ...FRONT, open: 1 })).toBeNull()
    }
    const field = el('input')
    expect(keyAction('3', field, field, FRONT)).toBeNull()
  })

  it('échap clears the digits typed first, then closes the subject open, else leaves it to Marianne', () => {
    expect(keyAction('Escape', BODY, BODY, { ...FRONT, typed: '2', open: 1 })).toBe('clear')
    expect(keyAction('Escape', BODY, BODY, { ...FRONT, open: 1 })).toBe('close')
    expect(keyAction('Escape', BODY, BODY, FRONT)).toBeNull()
  })

  it('digits then Entrée open that subject, even from a button; Entrée alone leaves a button its own', () => {
    const button = el('button')
    expect(keyAction('Enter', button, button, { ...FRONT, typed: '4' })).toBe('typed')
    expect(keyAction('Enter', button, button, FRONT)).toBeNull()
    expect(keyAction('Enter', BODY, BODY, FRONT)).toBe('chosen')
    expect(keyAction('Enter', BODY, BODY, { ...FRONT, front: false })).toBeNull()
  })

  it('only on a tab with numbers, nothing open', () => {
    expect(keyAction('3', BODY, BODY, { ...FRONT, front: false, numbered: false })).toBeNull()
    expect(keyAction('ArrowDown', BODY, BODY, { ...FRONT, front: false })).toBeNull()
    expect(keyAction('Backspace', BODY, BODY, FRONT)).toBeNull()
    expect(keyAction('Backspace', BODY, BODY, { ...FRONT, typed: '1' })).toBe('erase')
  })
})
