import type { Site } from '@marianne/content'
import { ENTITY_LABELS } from './domains'
import { ID_DOCUMENT_LABELS, nirValid, numberOf, RELATION_LABELS, type Profile } from './profile'

/**
 * Tokens stand for the user's identifiers in everything the engines see. An engine writes [[nir]]
 * or [[tax_number]]; the app swaps in the real values locally (screen, letters, forms, tool
 * arguments), and swaps them back out of anything sent to the engine (messages, pages,
 * documents, tool results).
 */

export type TokenKind = 'id' | 'text' | 'date' | 'email' | 'phone'

export interface TokenDef {
  token: string
  label: string
  value: string
  kind: TokenKind
  /** Resolved in letters and forms, but not scrubbed from text: too common to identify anyone (a city). */
  keep?: boolean
  /** Other ways the value appears, scrubbed to the same token (the street without its complement). */
  alt?: string[]
}

/** Every identifier of the profile, as tokens. Empty values are left out. */
export function tokensOf(p: Profile, sites: Site[]): TokenDef[] {
  const out: TokenDef[] = []
  const add = (token: string, label: string, value: string, kind: TokenKind, keep = false, alt: string[] = []) => {
    const v = value.trim()
    const others = alt.map((x) => x.trim()).filter((x) => x && x !== v)
    if (v) out.push({ token, label, value: v, kind, ...(keep ? { keep } : {}), ...(others.length ? { alt: others } : {}) })
  }
  const me = p.person
  const lastName = me.usedName || me.birthName
  add('last_name', 'nom', lastName, 'text')
  if (me.usedName && me.birthName && me.usedName !== me.birthName) add('birth_name', 'nom de naissance', me.birthName, 'text')
  add('first_names', 'prénoms', me.firstNames, 'text')
  const first = me.firstNames.trim().split(/\s+/)[0] ?? ''
  if (first && first !== me.firstNames.trim()) add('first_name', 'prénom', first, 'text')
  add('birth_date', 'date de naissance', me.birthDate, 'date')
  add('birth_place', 'lieu de naissance', me.birthPlace, 'text', true)
  add('nir', 'numéro de sécurité sociale', me.nir, 'id')
  add('iban', 'iban', me.iban, 'id')
  add('phone', 'téléphone', me.phone, 'phone')
  add('email', 'courriel', me.email, 'email')
  add('address', 'adresse (numéro et rue)', [p.address.street, p.address.complement].filter(Boolean).join(', '), 'text', false, [
    p.address.street,
    p.address.complement
  ])

  for (const account of p.accounts) {
    const site = sites.find((s) => s.id === account.siteId)
    for (const f of site?.fields ?? []) add(f.key, `${f.label} (${site!.name})`, account.fields[f.key] ?? '', 'id')
  }
  // Each record by its number (numbered): a token keeps its meaning when an earlier record goes.
  p.household.forEach((m, i) => {
    const n = numberOf(m, i)
    const who = `${RELATION_LABELS[m.relation]} ${n}`
    add(`household.${n}.first_name`, `prénom (${who})`, m.firstName, 'text')
    if (m.lastName && m.lastName !== lastName) add(`household.${n}.last_name`, `nom (${who})`, m.lastName, 'text')
    add(`household.${n}.birth_date`, `date de naissance (${who})`, m.birthDate, 'date')
  })
  for (const doc of p.idDocuments) {
    const member = p.household.findIndex((m) => m.id === doc.holder)
    const name = `numéro de ${ID_DOCUMENT_LABELS[doc.type] ?? doc.type}`
    if (doc.holder === 'me') add(`id_document.${doc.type}.number`, name, doc.number, 'id')
    else if (member >= 0) {
      const n = numberOf(p.household[member], member)
      add(`household.${n}.id_document.${doc.type}.number`, `${name} (${RELATION_LABELS[p.household[member].relation]} ${n})`, doc.number, 'id')
    }
  }
  p.companies.forEach((c, i) => {
    const n = numberOf(c, i)
    add(`company.${n}.siren`, `siren (${ENTITY_LABELS.companies.one} ${n})`, c.siren, 'id')
    add(`company.${n}.name`, `nom (${ENTITY_LABELS.companies.one} ${n})`, c.name, 'text')
  })
  p.employers.forEach((e, i) => {
    const n = numberOf(e, i)
    add(`employer.${n}.name`, `nom (${ENTITY_LABELS.employers.one} ${n})`, e.name, 'text')
    add(`employer.${n}.siren`, `siren (${ENTITY_LABELS.employers.one} ${n})`, e.siren, 'id')
  })
  p.vehicles.forEach((v, i) => add(`vehicle.${numberOf(v, i)}.plate`, `immatriculation (${ENTITY_LABELS.vehicles.one} ${numberOf(v, i)})`, v.plate, 'id'))
  p.properties.forEach((x, i) =>
    add(`property.${numberOf(x, i)}.address`, `adresse (${ENTITY_LABELS.properties.one} ${numberOf(x, i)})`, x.address, 'text', false, streetsOf(x.address))
  )
  return out
}

/**
 * The street of an address typed in one line ("12 avenue des Tilleuls, bât. C, 69003 Lyon"), the way
 * a lease or a tax notice often shows it: without the postcode and the city, and without what follows
 * the number and street. Only parts with a number and a word, so that "12" alone never becomes a pattern.
 */
function streetsOf(address: string): string[] {
  const head = address.split(/[\s,]*(?<!\d)\d{5}(?!\d)/u)[0]
  const first = head.split(',')[0]
  return [...new Set([head, first].map((x) => x.trim().replace(/[\s,]+$/, '')))].filter((x) => /\d.*\p{L}{3}/u.test(x))
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Lower case, without accents or ligatures: "Lefèvre" → "lefevre", "Lætitia" → "laetitia". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').toLowerCase()

const VARIANTS: Record<string, string> = { a: 'aàâäáãå', c: 'cç', e: 'eéèêë', i: 'iîïíì', n: 'nñ', o: 'oôöóòõ', u: 'uùûüú', y: 'yÿý' }
/** The ligatures `fold` unties: the text may keep them ("Cœur") where the value is folded ("coeur"). */
const LIGATURES: Record<string, string> = { oe: 'œ', ae: 'æ' }
/** Between the words of a name or a street: spaces, hyphens, apostrophes, commas. */
const SEP = "[\\s\\-'’,.]+"
/** Between the characters of a number: a space, a dot or a dash, doubled or around a dash ("FR76 - 3000"). */
const GAP = '[\\s.\\-]{0,3}'
const WORD = '[\\p{L}\\p{N}@]'
const DIGIT = '[\\p{L}\\p{N}]'
const bounded = (p: string, b = DIGIT) => `(?<!${b})(?:${p})(?!${b})`

/**
 * The words of a street written in full or shortened, both ways: a lease says "av." where the profile
 * says "avenue", or the other way round. Folded, as `loose` compares them.
 */
const STREET_WORDS = [
  ['avenue', 'av', 'ave'],
  ['boulevard', 'bd', 'bld', 'blvd', 'boul'],
  ['rue', 'r'],
  ['place', 'pl'],
  ['chemin', 'chem', 'ch'],
  ['impasse', 'imp'],
  ['allee', 'all'],
  ['route', 'rte'],
  ['faubourg', 'fg', 'fbg'],
  ['square', 'sq'],
  ['cours', 'crs'],
  ['quai', 'qu'],
  ['residence', 'res'],
  ['lotissement', 'lot'],
  ['passage', 'pass'],
  ['hameau', 'ham'],
  ['saint', 'st'],
  ['sainte', 'ste']
]
const STREET_FORMS = new Map(STREET_WORDS.flatMap((forms) => forms.map((form) => [form, forms] as const)))

/** One folded word, each letter with its accented forms and each "oe" or "ae" with its ligature. */
function letters(word: string): string {
  const chars = [...word]
  let out = ''
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const pair = LIGATURES[ch + (chars[i + 1] ?? '')]
    const one = (c: string) => (VARIANTS[c] ? `[${VARIANTS[c]}]` : escape(c))
    if (pair) {
      out += `(?:${one(ch)}${one('e')}|${pair})`
      i++
    } else out += one(ch)
  }
  return out
}

/**
 * A name or a street as it may be written: any case, accents or not, ligatures or not, hyphens or
 * spaces between words; for a street, its words shortened or not.
 */
function loose(value: string, street = false): string {
  return fold(value)
    .trim()
    .split(/[\s\-'’,.]+/)
    .filter(Boolean)
    .map((word) => {
      const forms = street ? STREET_FORMS.get(word) : undefined
      return forms ? `(?:${forms.map(letters).join('|')})` : letters(word)
    })
    .join(SEP)
}

/** "2880344109123 47" matches with any spacing, dots or dashes between its characters. */
function spaced(value: string): string {
  return [...value.replace(/[\s.-]/g, '')].map(escape).join(GAP)
}

/** The tokens whose values are addresses, written with the street's words in full or shortened. */
const isAddress = (t: TokenDef) => t.token === 'address' || /^property\.\d+\.address$/.test(t.token)

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** The ways a value can appear in text, as complete patterns (boundaries included). */
function patterns(t: TokenDef): string[] {
  switch (t.kind) {
    case 'id': {
      const compact = t.value.replace(/[\s.-]/g, '')
      // Shorter numbers ("2025") would erase years and amounts.
      if (compact.length < 6) return []
      const out = [bounded(spaced(compact))]
      // The NIR is often written without its key.
      if (t.token === 'nir' && compact.length === 15) out.push(bounded(spaced(compact.slice(0, 13))))
      // A SIREN inside a SIRET (SIREN + 5 digits) or a VAT number (FR + 2 digits + SIREN).
      if (t.token.endsWith('.siren') && /^\d{9}$/.test(compact)) {
        out.push(`(?<!${DIGIT})${spaced(compact)}(?=${GAP}\\d{3}${GAP}\\d{2}(?!${DIGIT}))`)
        out.push(`(?<=FR${GAP}\\d{2}${GAP})${spaced(compact)}(?!${DIGIT})`)
      }
      return out
    }
    case 'phone': {
      const digits = t.value.replace(/\D/g, '')
      const national = digits.startsWith('33') ? `0${digits.slice(2)}` : digits
      // From abroad: +33 or 0033, the 0 of the national number dropped or kept in brackets.
      const international = `(?:\\+|00${GAP})33${GAP}(?:\\(0\\)${GAP})?${spaced(national.slice(1))}`
      return national.length >= 6 ? [bounded(spaced(national)), bounded(international)] : []
    }
    case 'date': {
      const m = t.value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!m) return []
      const [y, mo, d] = [m[1], Number(m[2]), Number(m[3])]
      const day = d === 1 ? '(?:1er|0?1)' : d < 10 ? `0?${d}` : String(d)
      const month = mo < 10 ? `0?${mo}` : String(mo)
      return [
        bounded(`${y}-${m[2]}-${m[3]}`),
        bounded(`${day}[/.\\-]${month}[/.\\-]${y}`),
        bounded(`${m[3]}${m[2]}${y}`),
        bounded(`${day}\\s+${loose(MONTHS[mo - 1])}\\.?\\s+${y}`)
      ]
    }
    case 'email':
      return [bounded(escape(t.value), WORD)]
    case 'text':
      // Short words ("Lo", "Ba") would erase too much: see the surname rule in redact.
      return [t.value, ...(t.alt ?? [])].filter((v) => fold(v).replace(/[^\p{L}\p{N}]/gu, '').length >= 3).map((v) => bounded(loose(v, isAddress(t)), WORD))
  }
}

/** A NIR anywhere in the text, someone else's included (a spouse on a joint tax notice). */
const ANY_NIR = new RegExp(`(?<!${DIGIT})[1-478]${GAP}\\d{2}${GAP}\\d{2}${GAP}(?:\\d{2}|2[AB])${GAP}\\d{3}${GAP}\\d{3}${GAP}\\d{2}(?!${DIGIT})`, 'giu')

/** Replace every identifier of `defs` in `text` by its token. */
export function redact(text: string, defs: TokenDef[]): string {
  if (!text) return text
  // Longest values first: "Marie Claire" before "Marie".
  const sorted = defs.filter((t) => !t.keep).sort((a, b) => b.value.length - a.value.length)
  // The patterns are written for composed letters: a name from a macOS file name or a PDF may come
  // decomposed ("e" then a combining accent), and would slip between them.
  let out = text.normalize('NFC')
  for (const t of sorted) for (const p of patterns(t)) out = out.replace(new RegExp(p, 'giu'), `[[${t.token}]]`)

  // A short surname ("Ly") only next to the first names or a title.
  const last = defs.find((t) => t.token === 'last_name')
  if (last && fold(last.value).length < 3) {
    const n = loose(last.value)
    out = out
      .replace(new RegExp(`(\\[\\[first_names?\\]\\]|(?<!${WORD})(?:M\\.|Mme|Madame|Monsieur))${SEP}${n}(?!${WORD})`, 'giu'), '$1 [[last_name]]')
      .replace(new RegExp(`(?<!${WORD})${n}${SEP}(\\[\\[first_names?\\]\\])`, 'giu'), '[[last_name]] $1')
  }
  return out.replace(ANY_NIR, (m) => (nirValid(m.replace(/[\s.-]/g, '')) ? '[[nir.other]]' : m))
}

/** The display form of a value: dates as dd/mm/yyyy, the rest as stored. */
export function display(t: TokenDef): string {
  if (t.kind === 'date') {
    const m = t.value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (m) return `${m[3]}/${m[2]}/${m[1]}`
  }
  return t.value
}

/** Replace [[tokens]] by their values; unknown tokens are left as they are. */
export function resolve(text: string, defs: TokenDef[]): string {
  if (!text || !text.includes('[[')) return text
  const byToken = new Map(defs.map((t) => [t.token, display(t)]))
  return text.replace(/\[\[([a-z0-9_.]+)\]\]/gi, (all, token: string) => byToken.get(token.toLowerCase()) ?? all)
}

/** Resolve tokens in every string of a value (tool arguments). */
export function resolveDeep<T>(value: T, defs: TokenDef[]): T {
  if (typeof value === 'string') return resolve(value, defs) as T
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, defs)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDeep(v, defs)])) as T
  return value
}
