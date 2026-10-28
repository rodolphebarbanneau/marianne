import { describe, expect, it } from 'vitest'
import { classOf, densityClasses, inhabitants, legend, perSquareKm, quantiles, sortRows, squareKm } from '../src/display'

describe('shading', () => {
  it('splits values into groups of about the same size', () => {
    const values = [10, 1, 9, 2, 8, 3, 7, 4, 6, 5]
    expect(quantiles(values)).toEqual([3, 5, 7, 9])
    expect(quantiles([])).toEqual([])
    expect([0, 3, 4.9, 5, 9, 100].map((v) => classOf(v, [3, 5, 7, 9]))).toEqual([0, 1, 1, 2, 4, 4])
  })

  it('gives each place its density class, and the legend of the classes', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((code, i) => ({ code, density: (i + 1) * 100 }))
    const { classes, thresholds } = densityClasses(rows)
    expect(thresholds).toEqual([200, 300, 400, 500])
    expect(classes).toEqual({ a: 0, b: 1, c: 2, d: 3, e: 4 })
    expect(legend([45, 80, 1200, 3000])).toEqual(['moins de 45', '45 à 80', '80 à 1 200', '1 200 à 3 000', '3 000 et plus'])
    expect(legend([])).toEqual([])
  })
})

describe('tables', () => {
  const rows = [
    { code: '2A', name: 'Corse-du-Sud', population: 160814 },
    { code: '01', name: 'Ain', population: 657856 },
    { code: '2B', name: 'Haute-Corse', population: 182258 },
    { code: '10', name: 'Aube', population: 310242 },
    { code: '73', name: 'Écrins', population: 1 }
  ]

  it('sorts by number or by text, in French order', () => {
    expect(sortRows(rows, { key: 'population', desc: true }).map((r) => r.code)).toEqual(['01', '10', '2B', '2A', '73'])
    expect(sortRows(rows, { key: 'name', desc: false }).map((r) => r.name)).toEqual(['Ain', 'Aube', 'Corse-du-Sud', 'Écrins', 'Haute-Corse'])
    expect(sortRows(rows, { key: 'code', desc: false }).map((r) => r.code)).toEqual(['01', '10', '2A', '2B', '73'])
    expect(rows[0].code).toBe('2A')
  })

  it('writes the figures the French way', () => {
    expect(inhabitants(267991)).toBe('267 991 hab.')
    expect(squareKm(49.77)).toBe('49,77 km²')
    expect(squareKm(10000.4)).toBe('10 000 km²')
    expect(perSquareKm(5384.6)).toBe('5 385 hab./km²')
    expect(perSquareKm(12.34)).toBe('12,3 hab./km²')
  })
})
