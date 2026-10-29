import { foldText } from '@marianne/sdk'
import type { BallotKind, Chamber } from './types'

/**
 * What a ballot is about, and who tabled it, from its subject as each chamber words it:
 *
 * - Assemblée: "l'amendement n° 1274 de M. Fournier après l'article 15 du projet de loi…",
 *   "l'amendement n° 851 du Gouvernement…", "l'amendement n° 859 de la commission des affaires
 *   économiques…", "le sous-amendement n° 48 de M. Jean-Philippe Tanguy à l'amendement…";
 * - Sénat: "sur l'amendement n° 5, présenté par M. Bernard Jomier et plusieurs de ses
 *   collègues, à l'article 1er…", "… repris par Mme Colombe Brossel, …".
 *
 * The author's political group (the colour of the amendment) comes from matching the name with
 * the members the index holds: the Assemblée names a deputy by civility and surname (a first
 * name only for namesakes), the Sénat by full name. The Government and the committees are
 * authors of their own.
 */

/** Pseudo-groups of amendments that no member tabled. */
export const GOVERNMENT = 'GOUV'
export const COMMITTEE = 'COM'

export interface Mention {
  kind: BallotKind
  /** "1274", "304 rectifié quater". */
  amendment: string
  /** Who tabled it: a member as the subject names them ("M. Fournier"), the Government or a committee. */
  author: { type: 'member'; name: string } | { type: 'government' } | { type: 'committee'; name: string } | null
}

/** Folded for names: no accents, hyphens as spaces ("Pirès-Beaune"), a space after a civility ("M.Mattei"). */
const fold = (s: string) =>
  foldText(s)
    .replace(/[’`]/g, "'")
    .replace(/[-‐]/g, ' ')
    .replace(/\b(mmes|mme|mm|m)\.(?=\S)/g, '$1. ')
    .replace(/\s+/g, ' ')
    .trim()

/** The kind of a ballot from its subject. */
export function ballotKind(title: string): BallotKind {
  const t = fold(title).replace(/^sur /, '')
  if (/^(l'|le |les )?(sous[- ])?amendements? /.test(t) || /^l'amendement/.test(t)) return 'amendment'
  if (/^(l'ensemble|la totalite|le texte elabore|la proposition de loi|le projet de loi)/.test(t)) return 'text'
  if (/^(la |une )?motion/.test(t)) return 'motion'
  if (/^(l'article|les articles|l'article premier|l'article liminaire)/.test(t)) return 'article'
  return 'other'
}

// Where the Assemblée's author's name ends: what follows it in the subject.
const AN_STOP = /\s(?:apres|avant|a l'|a la|au|aux|sur|et plusieurs|et les|et l'|tendant|portant|visant|\()|,|$/

/** The kind, the amendment's number and its author, as the subject says them. */
export function parseMention(chamber: Chamber, title: string): Mention {
  const kind = ballotKind(title)
  const t = fold(title)
  const amendment = t.match(/amendements? (?:identiques )?n° ?(\d+(?: \([^)]*\)| (?:rectifie|rect\.)(?: [a-z]+)?)?)/)?.[1]?.replace(/[()]/g, '') ?? ''
  if (kind !== 'amendment') return { kind, amendment: '', author: null }
  if (chamber === 'an') {
    // The first amendment named is the one voted on (a sub-amendment comes first).
    const after = t.slice(t.search(/amendement n° ?\d+/)).replace(/^(amendement n° ?\d+) \([^)]*\)/, '$1')
    if (/^amendement n° ?\d+[^,]*? du gouvernement/.test(after)) return { kind, amendment, author: { type: 'government' } }
    const committee = after.match(/^amendement n° ?\d+[^,]*? de la (commission [^,(]+?)(?:\s(?:apres|avant|a l'|au|aux|sur)\b|,|\(|$)/)
    if (committee) return { kind, amendment, author: { type: 'committee', name: committee[1].trim() } }
    const member = after.match(/^amendement n° ?\d+(?: rect(?:ifie|\.)(?: [a-z]+)?)? de ((?:m\.|mme) .+)$/)
    if (!member) return { kind, amendment, author: null }
    const name = member[1].split(AN_STOP)[0].trim()
    return { kind, amendment, author: { type: 'member', name } }
  }
  if (/(?:presente|repris) par le gouvernement/.test(t)) return { kind, amendment, author: { type: 'government' } }
  // "présenté (en seconde délibération) par MM. Olivier Bitz et David Margueritte au nom de…": the first one named.
  const by = t.match(/(?:presente|repris)(?: [a-z' ]+?)? par ((?:mmes|mme|mm\.|m\.) [^,]+?)(?: et | au nom|,|$)/)
  if (by) return { kind, amendment, author: { type: 'member', name: by[1].replace(/^mm\./, 'm.').replace(/^mmes/, 'mme').trim() } }
  const committee = t.match(/(?:presente|repris) par la (commission [^,]+?)(?:,|$)/)
  return { kind, amendment, author: committee ? { type: 'committee', name: committee[1].trim() } : null }
}

export interface NamedMember {
  id: string
  groupId: string
  civility: string
  firstName: string
  lastName: string
}

/**
 * Members by the ways subjects name them ("m. fournier", "m. charles fournier", "charles
 * fournier"); a name two members share is left out: the subject then gives the first name.
 */
export class MemberNames {
  private byName = new Map<string, NamedMember | null>()

  constructor(members: NamedMember[]) {
    for (const m of members) {
      const civ = fold(m.civility).replace(/\.$/, '')
      const first = fold(m.firstName)
      const last = fold(m.lastName)
      for (const key of [`${civ}. ${last}`, `${civ} ${last}`, `${civ}. ${first} ${last}`, `${civ} ${first} ${last}`, `${first} ${last}`]) {
        this.byName.set(key, this.byName.has(key) && this.byName.get(key)?.id !== m.id ? null : m)
      }
    }
  }

  /** The member a name designates: the longest beginning of the name that is one. */
  find(name: string): NamedMember | null {
    const words = fold(name).split(' ')
    for (let n = words.length; n >= 2; n--) {
      const hit = this.byName.get(words.slice(0, n).join(' '))
      if (hit !== undefined) return hit
    }
    return null
  }
}

/** The author's group of a ballot (the colour of its amendment), and the member when one tabled it. */
export function ballotAuthor(mention: Mention, names: MemberNames): { author: string; group: string } {
  const a = mention.author
  if (!a) return { author: '', group: '' }
  if (a.type === 'government') return { author: GOVERNMENT, group: GOVERNMENT }
  if (a.type === 'committee') return { author: COMMITTEE, group: COMMITTEE }
  const member = names.find(a.name)
  return member ? { author: member.id, group: member.groupId } : { author: '', group: '' }
}
