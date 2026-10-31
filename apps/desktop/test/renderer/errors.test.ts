import { describe, expect, it } from 'vitest'
import { describeError } from '../../src/renderer/src/lib/errors'

/** The window's errors, kept in memory for « signaler un bug ». */

describe('the window’s errors', () => {
  it('say their message and where they were thrown', () => {
    const error = new TypeError('x is undefined')
    error.stack = 'TypeError: x is undefined\n    at render (index.js:10:5)\n    at a (index.js:1:1)\n    at b (index.js:2:2)\n    at c (index.js:3:3)'
    expect(describeError(error)).toBe('TypeError: x is undefined | at render (index.js:10:5) | at a (index.js:1:1) | at b (index.js:2:2)')
    expect(describeError(undefined, 'boom')).toBe('boom')
  })
})
