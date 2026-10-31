import { describe, expect, it } from 'vitest'
import { communeOfArrondissement } from '../src/geo'

describe('the arrondissements of Paris, Lyon and Marseille', () => {
  it('are each part of their city’s commune', () => {
    expect(communeOfArrondissement('75101')).toBe('75056')
    expect(communeOfArrondissement('75111')).toBe('75056')
    expect(communeOfArrondissement('75120')).toBe('75056')
    expect(communeOfArrondissement('69381')).toBe('69123')
    expect(communeOfArrondissement('69389')).toBe('69123')
    expect(communeOfArrondissement('13201')).toBe('13055')
    expect(communeOfArrondissement('13216')).toBe('13055')
  })

  it('leave every other code alone, the cities’ own included', () => {
    for (const code of ['75056', '75100', '75121', '69123', '69380', '13055', '13200', '13217', '33063', '2A004'])
      expect(communeOfArrondissement(code)).toBeNull()
  })
})
