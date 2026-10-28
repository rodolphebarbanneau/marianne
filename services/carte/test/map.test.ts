import { describe, expect, it } from 'vitest'
import { communeView, departmentCode, DEPARTMENTS, findDepartments, fitPoints, franceMap, parseRing, simplify, svgPath, type CommuneFeature } from '../src/map'
import { departmentOrder, lambert93, projectOnMap, projectPoint } from '../src/projection'

const square = (lon: number, lat: number, size: number): Array<[number, number]> => [
  [lon, lat],
  [lon + size, lat],
  [lon + size, lat + size],
  [lon, lat + size],
  [lon, lat]
]

describe('projection', () => {
  it('puts the origin of Lambert-93 at its false easting and northing, and Paris where IGN does', () => {
    expect(lambert93(3, 46.5).map(Math.round)).toEqual([700000, 6600000])
    const [x, y] = lambert93(2.3522, 48.8566)
    expect(Math.abs(x - 652469)).toBeLessThan(1000)
    expect(Math.abs(y - 6862035)).toBeLessThan(1000)
  })

  it('fits points in a box, centred, north up', () => {
    const fit = fitPoints('local', square(0, 0, 1), [10, 20, 100, 50], 0)
    expect(fit.scale).toBe(50)
    expect(projectPoint(fit, 0, 1)).toEqual([35, 20])
    expect(projectPoint(fit, 1, 0)).toEqual([85, 70])
  })

  it('names the département of a commune, overseas too', () => {})

  it('sorts Corsica between 19 and 21', () => {
    const codes = ['21', '2B', '971', '19', '2A', '95', '01']
    expect(codes.sort((a, b) => departmentOrder(a).localeCompare(departmentOrder(b), 'en', { numeric: true }))).toEqual([
      '01',
      '19',
      '2A',
      '2B',
      '21',
      '95',
      '971'
    ])
  })
})

describe('the départements', () => {
  it('bundles the 101 départements', () => {
    expect(DEPARTMENTS).toHaveLength(101)
    expect(DEPARTMENTS.filter((d) => d.code.startsWith('97')).map((d) => d.code)).toEqual(['971', '972', '973', '974', '976'])
  })

  it('reads codes as the APIs write them', () => {
    expect(['1', '2a', ' 33 ', '971', '20', '99', ''].map(departmentCode)).toEqual(['01', '2A', '33', '971', null, null, null])
  })

  it('finds départements by code or name, partial names giving several', () => {
    const codes = (text: string) => findDepartments(text).map((d) => d.code)
    expect(codes('Gironde')).toEqual(['33'])
    expect(codes('savoie')).toEqual(['73'])
    expect(codes('Côtes d’Armor')).toEqual(['22'])
    expect(codes('reunion')).toEqual(['974'])
    expect(codes('Corse')).toEqual(['2A', '2B'])
    expect(codes('2b')).toEqual(['2B'])
    expect(codes('Atlantide')).toEqual([])
    expect(codes(' - ')).toEqual([])
  })
})

describe('the map of France', () => {
  const view = franceMap()

  it('draws every département, the metropole beside five overseas insets', () => {
    expect(view.height).toBe(1000)
    expect(view.shapes).toHaveLength(101)
    expect(view.shapes.every((s) => s.path.startsWith('M') && s.path.endsWith('Z'))).toBe(true)
    expect(view.frames).toHaveLength(6)
    expect(view.frames[0].box).toBeUndefined()
    expect(view.frames.slice(1).map((f) => f.label)).toEqual(['Guadeloupe', 'Martinique', 'Guyane', 'La Réunion', 'Mayotte'])
    for (const f of view.frames.slice(1)) expect(f.box![0] + f.box![2]).toBeLessThanOrEqual(150)
    const gironde = view.shapes.find((s) => s.code === '33')!
    expect(gironde.x).toBeGreaterThan(180)
    expect(gironde.x).toBeLessThan(view.width)
    expect(franceMap()).toBe(view)
  })

  it('places a point in the metropole or in its inset, and nowhere off the map', () => {
    const bordeaux = projectOnMap(view, -0.5848, 44.8624)!
    expect(bordeaux[0]).toBeGreaterThan(180)
    expect(bordeaux[1]).toBeGreaterThan(500)
    const reunion = view.frames.find((f) => f.label === 'La Réunion')!.box!
    const [x, y] = projectOnMap(view, 55.45, -20.88)!
    expect(x).toBeGreaterThanOrEqual(reunion[0])
    expect(x).toBeLessThanOrEqual(reunion[0] + reunion[2])
    expect(y).toBeGreaterThanOrEqual(reunion[1])
    expect(y).toBeLessThanOrEqual(reunion[1] + reunion[3])
    expect(projectOnMap(view, -30, 40)).toBeNull()
  })
})

describe('geometry', () => {
  it('parses the bundled rings', () => {
    expect(parseRing('5.825,45.939 5.829,45.938')).toEqual([
      [5.825, 45.939],
      [5.829, 45.938]
    ])
  })

  it('writes SVG paths, one subpath per ring', () => {
    const fit = { kind: 'local' as const, scale: 10, dx: 0, dy: 100, lat0: 0 }
    expect(svgPath([[square(0, 0, 1)]], fit)).toBe('M0.0 100.0L10.0 100.0L10.0 90.0L0.0 90.0L0.0 100.0Z')
  })

  it('drops the points a line does not need', () => {
    const line: Array<[number, number]> = [
      [0, 0],
      [1, 0.01],
      [2, 0],
      [3, 0.02],
      [4, 0],
      [4, 4]
    ]
    expect(simplify(line, 0.5)).toEqual([
      [0, 0],
      [4, 0],
      [4, 4]
    ])
  })

  it('draws a département by commune, at the size of its own map', () => {
    const features: CommuneFeature[] = [
      { properties: { nom: 'Ouest', code: '33001', centre: { coordinates: [-0.5, 44.5] } }, geometry: { type: 'Polygon', coordinates: [square(-1, 44, 1)] } },
      { properties: { nom: 'Est', code: '33002' }, geometry: { type: 'MultiPolygon', coordinates: [[square(0, 44, 1)], [square(0.2, 45.2, 0.2)]] } },
      { properties: { nom: 'Sans contour', code: '33003' }, geometry: null }
    ]
    const view = communeView(features, '33')
    expect(view.shapes.map((s) => s.code)).toEqual(['33001', '33002'])
    expect(Math.max(view.width, view.height)).toBe(1000)
    expect(view.width).toBeGreaterThan(view.height)
    expect(view.shapes[1].path.match(/M/g)).toHaveLength(2)
    const [x, y] = projectOnMap(view, -0.5, 44.5)!
    expect([view.shapes[0].x, view.shapes[0].y]).toEqual([Math.round(x * 10) / 10, Math.round(y * 10) / 10])
    expect(view.frames).toHaveLength(1)
  })
})
