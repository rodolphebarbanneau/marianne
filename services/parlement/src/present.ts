import { COMMITTEE, GOVERNMENT } from './authors'
import { ballotPage, deputyPage, deputyPhoto } from './links'
import type { BallotRecord, GroupRecord, MemberRow, VoteRow } from './queries'
import type { Senator } from './senate'
import type { Author, BallotLine, Chamber, Deputy, GroupCount, GroupInfo, MemberCard, Position } from './types'

/** What the view and the tools show of the index: members' cards, ballots' lines with their author, how groups voted. */

/**
 * A colour readable on the window's dark background: the chambers' own (the Sénat's non-attached
 * are black, the Assemblée's RN a dark navy), lifted toward white until it shows.
 */
export function visibleColor(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#8089c4'
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const lum = (c: number[]) =>
    c.map((v) => v / 255).reduce((s, v, i) => s + [0.2126, 0.7152, 0.0722][i] * (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4), 0)
  let mix = rgb
  for (let t = 0; t <= 1 && lum(mix) < 0.09; t += 0.05) mix = rgb.map((v) => Math.round(v + (255 - v) * t))
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** The pseudo-groups of amendments no member tabled. */
export const AUTHOR_GROUPS: Record<string, { name: string; short: string; color: string }> = {
  [GOVERNMENT]: { name: 'Gouvernement', short: 'Gouv.', color: '#eef1ff' },
  [COMMITTEE]: { name: 'Commission', short: 'Com.', color: '#8089c4' }
}

const isDeputy = (row: MemberRow): row is MemberRow & { data: Deputy } => row.chamber === 'an'

export const memberName = (d: { civility: string; firstName: string; lastName: string }) => [d.civility, d.firstName, d.lastName].filter(Boolean).join(' ')

export function memberCard(row: MemberRow): MemberCard {
  const g = row.group
  const base = {
    chamber: row.chamber,
    id: row.id,
    name: memberName(row.data),
    firstName: row.data.firstName,
    lastName: row.data.lastName,
    groupId: g?.id ?? '',
    group: g?.name ?? '',
    groupShort: g?.short_name ?? '',
    groupColor: visibleColor(g?.color ?? ''),
    seat: row.seat
  }
  if (isDeputy(row)) {
    const d = row.data
    return {
      ...base,
      female: d.civility === 'Mme',
      department: d.department,
      departmentNumber: d.departmentNumber,
      constituency: d.constituency,
      photo: deputyPhoto(d.id),
      url: deputyPage(d.id),
      organs: d.organs.map((o) => o.id)
    }
  }
  const s = row.data as Senator
  return {
    ...base,
    female: s.female,
    department: s.department,
    departmentNumber: s.departmentNumber,
    constituency: '',
    photo: s.photo,
    url: s.page,
    organs: s.organs.map((o) => o.code)
  }
}

export const groupInfo = (g: GroupRecord, members = 0): GroupInfo => ({
  chamber: g.chamber,
  id: g.id,
  name: g.name,
  shortName: g.short_name,
  color: visibleColor(g.color),
  members
})

/** Who tabled a ballot's amendment, with their group's colour; null when the subject doesn't say (or no member matches). */
export function authorOf(
  b: Pick<BallotRecord, 'chamber' | 'author' | 'author_group'> & { data?: string },
  members: Map<string, MemberRow>,
  groups: Map<string, GroupRecord>
): Author | null {
  const pseudo = AUTHOR_GROUPS[b.author_group]
  if (pseudo) return { id: b.author_group, name: pseudo.name, groupId: b.author_group, groupShort: pseudo.short, groupColor: pseudo.color }
  if (!b.author) return null
  const member = members.get(`${b.chamber}:${b.author}`)
  const group = groups.get(`${b.chamber}:${b.author_group}`)
  return {
    id: b.author,
    // A member who left office: their name as the ballot kept it.
    name: member ? memberName(member.data) : (b.data && (JSON.parse(b.data) as { authorName?: string }).authorName) || b.author,
    groupId: b.author_group,
    groupShort: group?.short_name ?? '',
    groupColor: visibleColor(group?.color ?? '')
  }
}

interface BallotData {
  type?: string
  voters?: number
  for?: number
  against?: number
  abstentions?: number
  billTitle?: string
  amendment?: string
}

export interface LineContext {
  members: Map<string, MemberRow>
  groups: Map<string, GroupRecord>
  bills: Map<string, string>
  sittings: Map<string, string>
}

export function ballotLine(b: BallotRecord, ctx: LineContext): BallotLine {
  const data = JSON.parse(b.data) as BallotData
  return {
    chamber: b.chamber,
    id: b.id,
    number: b.number,
    date: b.date,
    title: b.title,
    kind: b.kind,
    amendment: data.amendment ?? '',
    result: b.result,
    adopted: /^adopt/i.test(b.result),
    voters: data.voters ?? 0,
    for: data.for ?? 0,
    against: data.against ?? 0,
    abstentions: data.abstentions ?? 0,
    author: authorOf(b, ctx.members, ctx.groups),
    bill: b.bill,
    billTitle: ctx.bills.get(b.bill) || data.billTitle || '',
    sitting: b.sitting,
    sittingStart: ctx.sittings.get(b.sitting) ?? '',
    url: ballotPage({ chamber: b.chamber, id: b.id, number: b.number })
  }
}

export const ballotType = (b: BallotRecord) => (JSON.parse(b.data) as BallotData).type || (b.chamber === 'se' ? 'scrutin public' : 'scrutin public ordinaire')

/** What most voters of a group chose; null when none voted, or when it split evenly (no majority). */
export function majority(c: { for: number; against: number; abstentions: number }): Position | null {
  const best = Math.max(c.for, c.against, c.abstentions)
  if (!best || [c.for, c.against, c.abstentions].filter((n) => n === best).length > 1) return null
  return c.for === best ? 'for' : c.against === best ? 'against' : 'abstention'
}

/** How each group voted in a ballot, from the members' votes, on its seats; in the order of the groups given (left to right). */
export function groupCounts(votes: VoteRow[], byKey: Map<number, MemberRow>, groups: GroupInfo[]): GroupCount[] {
  const counts = new Map(groups.map((g) => [g.id, { for: 0, against: 0, abstentions: 0, nonVoting: 0 }]))
  for (const v of votes) {
    const c = counts.get(byKey.get(v.member)?.group?.id ?? '')
    if (!c) continue
    if (v.position === 'for') c.for++
    else if (v.position === 'against') c.against++
    else if (v.position === 'abstention') c.abstentions++
    else c.nonVoting++
  }
  return groups.map((g) => {
    const c = counts.get(g.id)!
    return { groupId: g.id, shortName: g.shortName, name: g.name, color: g.color, members: g.members, ...c, position: majority(c) }
  })
}

/** "p", "c", "a", "n", capitals by proxy: a vote in a hemicycle's map. */
export const voteCode = (position: Position, proxy: boolean) => {
  const code = { for: 'p', against: 'c', abstention: 'a', nonVoting: 'n' }[position]
  return proxy ? code.toUpperCase() : code
}

export const memberKeyOf = (chamber: Chamber, id: string) => `${chamber}:${id}`
