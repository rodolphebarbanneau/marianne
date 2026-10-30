import { ICON_SIZE, pictureProblems } from '@marianne/sdk'
import { describe, expect, it } from 'vitest'
import { compass, fallWord, skyColor, skyOf, skyPicture, weatherLabel, WMO_LABELS } from '../src/sky'

const CODES = [0, 1, 2, 3, 45, 48, 51, 56, 61, 66, 71, 77, 80, 85, 95, 99]

describe('the sky', () => {
  it('sorts the WMO codes into kinds of sky', () => {
    expect(CODES.map(skyOf)).toEqual([
      'clear',
      'clear',
      'partly',
      'overcast',
      'fog',
      'fog',
      'drizzle',
      'drizzle',
      'rain',
      'rain',
      'snow',
      'snow',
      'showers',
      'snow',
      'storm',
      'storm'
    ])
  })

  it('colours a day by its sky, and names what falls', () => {
    expect([0, 2, 3, 45, 51, 61, 71, 80, 86, 95].map(skyColor)).toEqual([
      'jaune',
      'jaune',
      'gris-clair',
      'gris-clair',
      'cyan',
      'cyan',
      'blanc',
      'cyan',
      'blanc',
      'magenta'
    ])
    expect([0, 3, 45, 53, 63, 81, 73, 96].map(fallWord)).toEqual([null, null, null, 'bruine', 'pluie', 'averses', 'neige', 'orage'])
  })

  it('names codes and wind directions in French', () => {
    expect(weatherLabel(95)).toBe('Orage')
    expect(weatherLabel(42)).toBe('Temps indéterminé')
    expect([0, 44, 90, 180, 225, 270, 337, 359, -45].map(compass)).toEqual(['N', 'NE', 'E', 'S', 'SO', 'O', 'NO', 'N', 'NO'])
  })

  it('draws every sky, by day and by night, as a right picture of the palette, eight by eight', () => {
    const codes = Object.keys(WMO_LABELS).map(Number)
    for (const code of codes)
      for (const isDay of [true, false])
        expect(pictureProblems(skyPicture(code, isDay), { width: ICON_SIZE, height: ICON_SIZE, exact: true }), `${code} ${isDay}`).toEqual([])
    expect(skyPicture(0, false)).not.toEqual(skyPicture(0, true))
    expect(skyPicture(80, false)).toEqual(skyPicture(61))
  })
})
