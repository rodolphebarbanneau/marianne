import { describe, expect, it } from 'vitest'
import { checkPassword, checkPin, crackTime, generatePassword, MIN_GUESSES } from '../src/shared/password'

describe('master password', () => {
  it('judges strength, not character rules: long random letters and digits pass without a symbol', () => {
    expect(checkPassword('Xk7mP2qR9vL4nT8wB3cZ').ok).toBe(true)
    expect(checkPassword('kq7zm2pr4wtx9bn3ehs5').ok).toBe(true)
  })

  it('refuses what is easy to guess, whatever characters it has', () => {
    for (const pw of [
      'Marianne2026!abcdef',
      'Azertyuiop123456!!!!',
      'aaaaaaaaaaaaaaaaaaaaaaaa',
      'M0tdepasse-M0tdepasse-1!',
      'chat-maison-soleil-rouge',
      'MonChienRex2019Bordeaux'
    ])
      expect(checkPassword(pw).ok, pw).toBe(false)
  })

  it('counts the person’s own names as guessable', () => {
    const pw = 'Durand-Camille-1985-Paris!'
    expect(checkPassword(pw, ['durand', 'camille']).guessesLog10).toBeLessThan(checkPassword(pw).guessesLog10)
    expect(checkPassword(pw, ['durand', 'camille']).ok).toBe(false)
  })

  it('accepts passphrases of enough uncommon words', () => {
    expect(checkPassword('grenouille-velours-cartable-hippodrome-moustique-tambour-orchidée').ok).toBe(true)
  })

  it('says what makes a weak password guessable, in French, and nothing once it is strong', () => {
    const weak = checkPassword('motdepasse')
    expect(weak.strength).toBe('weak')
    expect(weak.warning).toMatch(/[a-zé]/)
    const strong = checkPassword('Xk7mP2qR9vL4nT8wB3cZ')
    expect(strong).toMatchObject({ strength: 'strong', progress: 1, warning: '', suggestions: [] })
  })

  it('measures progress towards the target', () => {
    const mid = checkPassword('Marianne2026')
    expect(mid.progress).toBeGreaterThan(0)
    expect(mid.progress).toBeLessThan(1)
    expect(checkPassword('').progress).toBe(0)
    expect(MIN_GUESSES).toBe(1e25)
  })

  it('generates passwords that pass', () => {
    for (let i = 0; i < 20; i++) expect(checkPassword(generatePassword()).ok).toBe(true)
  })

  it('says plainly how long a search would take', () => {
    expect(crackTime(3.2e9)).toBe('plus d’un milliard d’années')
    expect(crackTime(Infinity)).toBe('plus d’un milliard d’années')
    expect(crackTime(4.2e6)).toBe('environ 4 millions d’années')
    expect(crackTime(13_480)).toBe(`environ ${(13_000).toLocaleString('fr-FR')} ans`)
    expect(crackTime(0.5 / 365.25)).toBe('environ 12 heures')
  })
})

describe('pin', () => {
  it('wants 6 to 12 digits, not repeated, not a sequence', () => {
    expect(checkPin('482916')).toBeNull()
    expect(checkPin('12345')).not.toBeNull()
    expect(checkPin('111111')).not.toBeNull()
    expect(checkPin('123456')).not.toBeNull()
    expect(checkPin('987654')).not.toBeNull()
  })
})
