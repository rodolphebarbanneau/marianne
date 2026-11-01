import { describe, expect, it } from 'vitest'
import { toolArg } from '../../src/renderer/src/folder/tool-arg'

describe('a tool line in the conversation', () => {
  it('shows what a click in a page was for, and what was typed, not the element’s id', () => {
    expect(toolArg({ element: 'e37', purpose: 'Refuser les cookies' })).toBe('Refuser les cookies')
    expect(toolArg({ element: 'e7', value: '[[vehicle.1.plate]]' })).toBe('[[vehicle.1.plate]]')
  })

  it('keeps the query, the address or the id for the other tools', () => {
    expect(toolArg({ query: 'carte grise' })).toBe('carte grise')
    expect(toolArg({ url: 'https://www.sanef.com/', reason: 'Vérifier' })).toBe('https://www.sanef.com/')
    expect(toolArg({ id: 'f1', label: 'nom' })).toBe('f1')
    expect(toolArg({ other: 'x' })).toBe('x')
    expect(toolArg(null)).toBe('')
  })
})
