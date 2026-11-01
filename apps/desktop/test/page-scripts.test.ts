import { describe, expect, it } from 'vitest'
import { NAME_OF, SHOWN_BEFORE } from '../src/main/browser/scripts'

/** The page scripts' own functions, as the pages run them. */
const nameOf = new Function(`return ${NAME_OF}`)() as (names: unknown[]) => string
const shownBefore = new Function(`return ${SHOWN_BEFORE}`)() as (el: unknown) => string

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

  it('names a field with no label by the words just before it (ALIAE’s plate field)', () => {
    const block = (text: string, holds = false) => ({ innerText: text, matches: () => false, querySelector: () => (holds ? {} : null) })
    const field = (before: unknown) => ({ previousElementSibling: before })
    expect(shownBefore(field(block('Veuillez saisir votre plaque d’immatriculation \n*')))).toBe('Veuillez saisir votre plaque d’immatriculation')
    // Nothing before it, a block that holds a control of its own, another field, a paragraph: no name.
    expect(shownBefore(field(null))).toBe('')
    expect(shownBefore(field(block('Nom', true)))).toBe('')
    expect(shownBefore(field({ innerText: '', matches: () => true, querySelector: () => null }))).toBe('')
    expect(shownBefore(field(block('Une phrase bien plus longue qu’un nom de champ, qui explique une démarche entière à la personne.')))).toBe('')
  })
})
