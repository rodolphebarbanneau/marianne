import { describe, expect, it } from 'vitest'
import { panelTop } from '../src/ui'

describe('a side panel kept in view', () => {
  const room = 700

  it('stays near the top when it fits, however the page moves', () => {
    expect(panelTop(10, room, 400)).toBe(10)
    expect(panelTop(-300, room, 400)).toBe(10)
  })

  it('goes up with the page, taller than its room, until its end shows and no further', () => {
    const height = 1000
    expect(panelTop(10 - 100, room, height)).toBe(-90)
    expect(panelTop(10 - 5000, room, height)).toBe(700 - 1000 - 10)
  })

  it('comes down with the page until its top shows and no further', () => {
    const height = 1000
    const end = 700 - 1000 - 10
    expect(panelTop(end + 100, room, height)).toBe(end + 100)
    expect(panelTop(end + 5000, room, height)).toBe(10)
  })

  it('holds what it can when its height changes', () => {
    expect(panelTop(-200, room, 600)).toBe(90 > 10 ? 10 : 90)
    expect(panelTop(-200, room, 1200)).toBe(-200)
    expect(panelTop(-600, room, 1200)).toBe(-510)
  })
})
