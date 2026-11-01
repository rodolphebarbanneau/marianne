import { describe, expect, it } from 'vitest'
import { NAME_OF } from '../src/main/browser/scripts'

/** The page scripts' own function, as the pages run it. */
const nameOf = new Function(`return ${NAME_OF}`)() as (names: unknown[]) => string

describe('naming what a page shows', () => {
  it('takes the first name there is, its spaces collapsed', () => {
    expect(nameOf(['', null, undefined, '  Valider\n la  recherche '])).toBe('Valider la recherche')
    expect(nameOf(['Payer', 'aria'])).toBe('Payer')
    expect(nameOf(['', '', ''])).toBe('')
    expect(nameOf([])).toBe('')
  })

  it('skips a missing value a page printed as a name (Sanef’s plate field: aria-label="undefined")', () => {
    // Its own text, its aria-label, its label's lines, its value, its placeholder, as the page reader orders them.
    expect(nameOf(['', 'undefined', 'N° d’immatriculation', '', 'AA123BB'])).toBe('N° d’immatriculation')
    expect(nameOf(['', 'null', 'NULL', '', 'AA123BB'])).toBe('AA123BB')
    // A word that only holds one: a name.
    expect(nameOf(['undefined value'])).toBe('undefined value')
  })
})
