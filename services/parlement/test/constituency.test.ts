import { describe, expect, it } from 'vitest'
import { assemblyDepartment, communeOf, constituencyNumber, contains, csvCells, parseContours, parsePollingStations } from '../src/constituency'
import { CONTOURS, POLLING_STATIONS } from './fixtures'

describe('constituencies', () => {
  it('reads each commune’s constituencies from the polling stations, once each', () => {
    expect(parsePollingStations(POLLING_STATIONS)).toEqual([
      { commune: '01001', department: '01', constituency: '4' },
      { commune: '35238', department: '35', constituency: '1' },
      { commune: '35238', department: '35', constituency: '8' },
      { commune: '97101', department: '971', constituency: '1' }
    ])
    expect(() => parsePollingStations('a,b\n1,2')).toThrow(/changed shape/)
  })

  it('writes départements and constituencies as the Assemblée does', () => {
    expect(assemblyDepartment('ZA')).toBe('971')
    expect(assemblyDepartment('ZZ')).toBe('099')
    expect(assemblyDepartment('2a')).toBe('2A')
    expect(constituencyNumber('0104')).toBe('4')
    expect(constituencyNumber('ZA01')).toBe('1')
    expect(csvCells('a,"b, c","d ""e"""')).toEqual(['a', 'b, c', 'd "e"'])
  })

  it('looks the arrondissements of Paris, Lyon and Marseille up in their city', () => {
    expect(communeOf('75111')).toBe('75056')
    expect(communeOf('69383')).toBe('69123')
    expect(communeOf('13208')).toBe('13055')
    expect(communeOf('35238')).toBe('35238')
  })

  it('keeps the contours asked for, and tells which a point is in, holes aside', () => {
    const shapes = parseContours(CONTOURS, new Set(['35|1', '35|8']))
    expect(shapes.map((s) => [s.department, s.constituency, s.bbox])).toEqual([
      ['35', '1', [-1.7, 48.1, -1.68, 48.12]],
      ['35', '8', [-1.68, 48.1, -1.66, 48.12]]
    ])
    const [west, east] = shapes
    expect(contains(west.geometry, -1.69, 48.11)).toBe(true)
    expect(contains(east.geometry, -1.69, 48.11)).toBe(false)
    expect(contains(east.geometry, -1.67, 48.11)).toBe(true)
    // The hole of the eastern one.
    expect(contains(east.geometry, -1.6705, 48.1105)).toBe(false)
    expect(() => parseContours({}, new Set())).toThrow(/changed shape/)
  })
})
