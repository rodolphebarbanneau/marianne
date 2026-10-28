import { ENTITY_LABELS } from '../../shared/domains'
import { ID_DOCUMENT_LABELS, nirValid, RELATION_LABELS, type Profile } from '../../shared/profile'
import type { Site } from '../../shared/sites'

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
  p.household.forEach((m, i) => {
    const who = `${RELATION_LABELS[m.relation]} ${i + 1}`
    add(`household.${i + 1}.first_name`, `prénom (${who})`, m.firstName, 'text')
    if (m.lastName && m.lastName !== lastName) add(`household.${i + 1}.last_name`, `nom (${who})`, m.lastName, 'text')
    add(`household.${i + 1}.birth_date`, `date de naissance (${who})`, m.birthDate, 'date')
  })
  for (const doc of p.idDocuments) {
    const member = p.household.findIndex((m) => m.id === doc.holder)
    const name = `numéro de ${ID_DOCUMENT_LABELS[doc.type] ?? doc.type}`
    if (doc.holder === 'me') add(`id_document.${doc.type}.number`, name, doc.number, 'id')
    else if (member >= 0)
      add(
        `household.${member + 1}.id_document.${doc.type}.number`,
        `${name} (${RELATION_LABELS[p.household[member].relation]} ${member + 1})`,
        doc.number,
        'id'
      )
  }
  p.companies.forEach((c, i) => {
    add(`company.${i + 1}.siren`, `siren (${ENTITY_LABELS.companies.one} ${i + 1})`, c.siren, 'id')
    add(`company.${i + 1}.name`, `nom (${ENTITY_LABELS.companies.one} ${i + 1})`, c.name, 'text')
  })
  p.employers.forEach((e, i) => {
    add(`employer.${i + 1}.name`, `nom (${ENTITY_LABELS.employers.one} ${i + 1})`, e.name, 'text')
    add(`employer.${i + 1}.siren`, `siren (${ENTITY_LABELS.employers.one} ${i + 1})`, e.siren, 'id')
  })
  p.vehicles.forEach((v, i) => add(`vehicle.${i + 1}.plate`, `immatriculation (${ENTITY_LABELS.vehicles.one} ${i + 1})`, v.plate, 'id'))
  p.properties.forEach((x, i) => add(`property.${i + 1}.address`, `adresse (${ENTITY_LABELS.properties.one} ${i + 1})`, x.address, 'text'))
  return out
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Lower case, without accents or ligatures: "Lefèvre" → "lefevre". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').toLowerCase()

const VARIANTS: Record<string, string> = { a: 'aàâäáãå', c: 'cç', e: 'eéèêë', i: 'iîïíì', n: 'nñ', o: 'oôöóòõ', u: 'uùûüú', y: 'yÿý' }
/** Between the words of a name or a street: spaces, hyphens, apostrophes, commas. */
const SEP = "[\\s\\-'’,.]+"
const WORD = '[\\p{L}\\p{N}@]'
const DIGIT = '[\\p{L}\\p{N}]'
const bounded = (p: string, b = DIGIT) => `(?<!${b})(?:${p})(?!${b})`

/** A name or a street as it may be written: any case, accents or not, hyphens or spaces between words. */
function loose(value: string): string {
  return fold(value)
    .trim()
    .split(/[\s\-'’,.]+/)
    .filter(Boolean)
    .map((word) => [...word].map((ch) => (VARIANTS[ch] ? `[${VARIANTS[ch]}]` : escape(ch))).join(''))
    .join(SEP)
}

/** "2880344109123 47" matches with any spacing, dots or dashes between its characters. */
function spaced(value: string): string {
  return [...value.replace(/[\s.-]/g, '')].map(escape).join('[\\s.\\-]?')
}

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
        out.push(`(?<!${DIGIT})${spaced(compact)}(?=[\\s.]?\\d{3}[\\s.]?\\d{2}(?!${DIGIT}))`)
        out.push(`(?<=FR[\\s.]?\\d{2}[\\s.]?)${spaced(compact)}(?!${DIGIT})`)
      }
      return out
    }
    case 'phone': {
      const digits = t.value.replace(/\D/g, '')
      const national = digits.startsWith('33') ? `0${digits.slice(2)}` : digits
      return national.length >= 6 ? [bounded(spaced(national)), bounded(`\\+33[\\s.\\-]?(?:\\(0\\)[\\s.\\-]?)?${spaced(national.slice(1))}`)] : []
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
      return [t.value, ...(t.alt ?? [])].filter((v) => fold(v).replace(/[^\p{L}\p{N}]/gu, '').length >= 3).map((v) => bounded(loose(v), WORD))
  }
}

/** A NIR anywhere in the text, someone else's included (a spouse on a joint tax notice). */
const ANY_NIR = /(?<![\p{L}\p{N}])[1-478][\s.]?\d{2}[\s.]?\d{2}[\s.]?(?:\d{2}|2[AB])[\s.]?\d{3}[\s.]?\d{3}[\s.]?\d{2}(?![\p{L}\p{N}])/giu

/** Replace every identifier of `defs` in `text` by its token. */
export function redact(text: string, defs: TokenDef[]): string {
  if (!text) return text
  // Longest values first: "Marie Claire" before "Marie".
  const sorted = defs.filter((t) => !t.keep).sort((a, b) => b.value.length - a.value.length)
  let out = text
  for (const t of sorted) for (const p of patterns(t)) out = out.replace(new RegExp(p, 'giu'), `[[${t.token}]]`)

  // A short surname ("Ly") only next to the first names or a title.
  const last = defs.find((t) => t.token === 'last_name')
  if (last && fold(last.value).length < 3) {
    const n = loose(last.value)
    out = out
      .replace(new RegExp(`(\\[\\[first_names?\\]\\]|(?<!${WORD})(?:M\\.|Mme|Madame|Monsieur))${SEP}${n}(?!${WORD})`, 'giu'), '$1 [[last_name]]')
      .replace(new RegExp(`(?<!${WORD})${n}${SEP}(\\[\\[first_names?\\]\\])`, 'giu'), '[[last_name]] $1')
  }
  return out.replace(ANY_NIR, (m) => (nirValid(m.replace(/[\s.]/g, '')) ? '[[nir.other]]' : m))
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

/** Tokens a text refers to that the profile doesn't have. */
export function unknownTokens(text: string, defs: TokenDef[]): string[] {
  const known = new Set(defs.map((t) => t.token))
  return [...new Set([...text.matchAll(/\[\[([a-z0-9_.]+)\]\]/gi)].map((m) => m[1].toLowerCase()))].filter((t) => !known.has(t))
}
