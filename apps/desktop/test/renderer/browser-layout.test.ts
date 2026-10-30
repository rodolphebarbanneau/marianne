import { describe, expect, it } from 'vitest'
import { BROWSER_MIN, draggedWidth, pageBounds } from '../../src/renderer/src/browser/layout'

describe('the browser’s edge, dragged', () => {
  it('widens the browser to the left and narrows it to the right', () => {
    expect(draggedWidth(560, -100, 400)).toBe(660)
    expect(draggedWidth(560, 120, 400)).toBe(440)
  })

  it('leaves the conversation its room, and the browser its least width', () => {
    expect(draggedWidth(560, -900, 200)).toBe(760)
    expect(draggedWidth(560, 900, 200)).toBe(BROWSER_MIN)
    // A conversation already narrow gives nothing more; the browser can still be narrowed.
    expect(draggedWidth(560, -50, -40)).toBe(560)
    expect(draggedWidth(560, 50, -40)).toBe(510)
  })
})

describe('where the page goes', () => {
  it('stays within its box, in whole pixels: never over the edge beside it', () => {
    // At 125 %, a border of one device pixel is 0.8 of a CSS pixel: the box starts between pixels.
    expect(pageBounds({ left: 882.4, top: 80.2, right: 1441.6, bottom: 816.8 })).toEqual({ x: 883, y: 81, width: 558, height: 735 })
    expect(pageBounds({ left: 697, top: 80, right: 1442, bottom: 816 })).toEqual({ x: 697, y: 80, width: 745, height: 736 })
    expect(pageBounds({ left: 10.5, top: 0, right: 10.7, bottom: 0 })).toEqual({ x: 11, y: 0, width: 0, height: 0 })
  })
})
