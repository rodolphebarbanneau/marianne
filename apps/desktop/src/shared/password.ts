import { ZxcvbnFactory } from '@zxcvbn-ts/core'
import * as common from '@zxcvbn-ts/language-common'
import * as en from '@zxcvbn-ts/language-en'
import * as fr from '@zxcvbn-ts/language-fr'

/**
 * The master password guards an archive that can be copied and attacked offline, so it must
 * resist a search of at least MIN_GUESSES guesses: more than a billion years at ATTACK_RATE
 * guesses per second (a large cluster, against scrypt at 256 MiB). There is no rule about which
 * characters to use: only the estimated strength counts, against that target.
 *
 * The estimate finds what makes a password guessable with zxcvbn (French and English words,
 * first names and surnames, common passwords, keyboard runs, repeats, sequences, dates) and
 * prices each part; what it cannot explain counts at the size of its own alphabet. Shared by the
 * screens (live feedback) and the main process (enforcement).
 */

export const ATTACK_RATE = 1e8
export const MIN_GUESSES = 1e25
const TARGET_LOG10 = Math.log10(MIN_GUESSES)
const SECONDS_PER_YEAR = 31_557_600
/** Past this, a password is long enough not to need a closer look (and zxcvbn slows down). */
const MAX_LENGTH = 128

const zxcvbn = new ZxcvbnFactory({
  dictionary: { ...common.dictionary, ...en.dictionary, ...fr.dictionary },
  graphs: common.adjacencyGraphs,
  translations: fr.translations,
  // Enough to catch "P@ssw0rd"-style words; more costs a lot on long random strings (checked at each keystroke).
  l33tMaxSubstitutions: 16
})

export type Strength = 'weak' | 'fair' | 'good' | 'strong'

export interface PasswordCheck {
  /** Strong enough: the estimate reaches the target. */
  ok: boolean
  strength: Strength
  /** log10 of the estimated number of guesses. */
  guessesLog10: number
  /** How far it is to the target, 0 to 1 (for a meter). */
  progress: number
  /** Years for a search at ATTACK_RATE. */
  years: number
  /** What makes it guessable, in French, when it is not strong enough. */
  warning: string
  suggestions: string[]
}

/** The size of the alphabet a run of characters is drawn from. */
function alphabet(token: string): number {
  let size = 0
  if (/[a-z]/.test(token)) size += 26
  if (/[A-Z]/.test(token)) size += 26
  if (/\d/.test(token)) size += 10
  if (/[^a-zA-Z\d]/.test(token)) size += 33
  return Math.max(size, 10)
}

/** What people put between words; each one is one of a few, so it counts for about one digit of guesses. */
const SEPARATORS = /([\s\-_.,;:!?/\\|+*~'"()]+)/
const SEPARATOR_ONLY = /^[\s\-_.,;:!?/\\|+*~'"()]+$/

/**
 * log10 of the guesses for a stretch zxcvbn could not explain. It may still hold words glued to
 * separators ("chat-", "-soleil-"): each piece between separators that zxcvbn recognizes as a
 * whole (a word, a name, a date, a keyboard run) counts at its price, the rest at its alphabet's.
 */
function unexplained(token: string, avoid: string[]): number {
  let log10 = 0
  for (const piece of token.split(SEPARATORS).filter(Boolean)) {
    if (SEPARATOR_ONLY.test(piece)) {
      log10 += piece.length
      continue
    }
    const random = piece.length * Math.log10(alphabet(piece))
    const known = zxcvbn.check(piece, avoid)
    log10 += known.sequence.every((m) => m.pattern !== 'bruteforce') ? Math.min(random, known.guessesLog10) : random
  }
  return log10
}

/** log10 of the guesses to find the password, `avoid` being words of the user's own (their names). */
export function estimateGuesses(pw: string, avoid: string[] = []): { log10: number; warning: string; suggestions: string[] } {
  const head = pw.slice(0, MAX_LENGTH)
  const result = zxcvbn.check(head, avoid)
  let log10 = 0
  for (const m of result.sequence) log10 += m.pattern === 'bruteforce' ? unexplained(m.token, avoid) : m.guessesLog10
  // What lies beyond the first characters only adds to the search.
  log10 += (pw.length - head.length) * Math.log10(alphabet(pw.slice(MAX_LENGTH)))
  return { log10, warning: result.feedback.warning ?? '', suggestions: result.feedback.suggestions }
}

/** The screens check the same text more than once per keystroke: the last answer is kept. */
let last: { key: string; check: PasswordCheck } | null = null

export function checkPassword(pw: string, avoid: string[] = []): PasswordCheck {
  const key = JSON.stringify([pw, avoid])
  if (last?.key === key) return last.check
  const check = estimate(pw, avoid)
  last = { key, check }
  return check
}

function estimate(pw: string, avoid: string[]): PasswordCheck {
  const { log10, warning, suggestions } = pw ? estimateGuesses(pw, avoid) : { log10: 0, warning: '', suggestions: [] }
  const ok = log10 >= TARGET_LOG10
  const strength: Strength = ok ? 'strong' : log10 >= 18 ? 'good' : log10 >= 11 ? 'fair' : 'weak'
  return {
    ok,
    strength,
    guessesLog10: log10,
    // Steeper than the log scale: 10^18 guesses (thousands of years) is far from a billion years.
    progress: Math.min(1, (log10 / TARGET_LOG10) ** 3),
    years: 10 ** log10 / ATTACK_RATE / SECONDS_PER_YEAR,
    warning: ok ? '' : warning,
    suggestions: ok ? [] : suggestions
  }
}

/** How long a search would take, plainly: "plus d’un milliard d’années", "environ 4 heures"… */
export function crackTime(years: number): string {
  if (!Number.isFinite(years) || years >= 1e9) return 'plus d’un milliard d’années'
  if (years >= 1e6) return `environ ${Math.floor(years / 1e6).toLocaleString('fr-FR')} million${years >= 2e6 ? 's' : ''} d’années`
  if (years >= 1) {
    // Two significant digits: "environ 13 000 ans", not a falsely precise count.
    const rounded = Number(Math.floor(years).toPrecision(2))
    return `environ ${rounded.toLocaleString('fr-FR')} an${rounded >= 2 ? 's' : ''}`
  }
  const days = years * 365.25
  if (days >= 1) return `environ ${Math.floor(days)} jour${days >= 2 ? 's' : ''}`
  const hours = days * 24
  if (hours >= 1) return `environ ${Math.floor(hours)} heure${hours >= 2 ? 's' : ''}`
  return 'moins d’une heure'
}

/** Easy to read back: no 0/O, 1/l/I. */
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SPECIAL = '#%&*+=?@!$'

function pick(alphabet: string): string {
  const n = new Uint32Array(1)
  crypto.getRandomValues(n)
  return alphabet[n[0] % alphabet.length]
}

/** A strong password to copy or print: 6 groups of 4, every kind of character in each group. */
export function generatePassword(): string {
  const all = LOWER + UPPER + DIGITS + SPECIAL
  const groups = Array.from({ length: 6 }, () => {
    const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(all)]
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Number(pick('0123'.slice(0, i + 1)))
      ;[chars[i], chars[j]] = [chars[j], chars[i]]
    }
    return chars.join('')
  })
  return groups.join('-')
}

/** A PIN for the quick unlock on one computer: 6 to 12 digits, not all the same, not a plain sequence. */
export function checkPin(pin: string): string | null {
  if (!/^\d{6,12}$/.test(pin)) return 'Le code fait de 6 à 12 chiffres.'
  if (/^(\d)\1+$/.test(pin)) return 'Évitez un code fait d’un seul chiffre répété.'
  if ('01234567890123456789'.includes(pin) || '98765432109876543210'.includes(pin)) return 'Évitez une suite de chiffres.'
  return null
}
