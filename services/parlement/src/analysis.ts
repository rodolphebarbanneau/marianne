import { majority } from './present'
import type { BallotRecord, MemberRow, VoteRow } from './queries'
import type { MemberAnalysis, Position, VoteTally } from './types'

/**
 * How members vote, over the ballots of a period: who they vote like (a member, the majority of a
 * group), how they vote on the amendments of each group (the "colour" of an amendment is its
 * author's group), how often they take part and follow their own group. Pure computations on the
 * votes: the queries give them, the tests too.
 */

/** A vote that counts: for, against, abstention (not "non-votant": the chair, members of the Government…). */
const cast = (v: VoteRow) => v.position !== 'nonVoting'

/** Each ballot's votes, by ballot key. */
function byBallot(votes: VoteRow[]): Map<number, VoteRow[]> {
  const map = new Map<number, VoteRow[]>()
  for (const v of votes) map.set(v.ballot, [...(map.get(v.ballot) ?? []), v])
  return map
}

/** What most of each group's voters chose in each ballot: ballot → group → position. */
export function groupPositions(votes: VoteRow[], byKey: Map<number, MemberRow>): Map<number, Map<string, Position>> {
  const result = new Map<number, Map<string, Position>>()
  for (const [ballot, list] of byBallot(votes)) {
    const counts = new Map<string, { for: number; against: number; abstentions: number }>()
    for (const v of list) {
      const group = byKey.get(v.member)?.group?.id
      if (!group || !cast(v)) continue
      const c = counts.get(group) ?? { for: 0, against: 0, abstentions: 0 }
      if (v.position === 'for') c.for++
      else if (v.position === 'against') c.against++
      else c.abstentions++
      counts.set(group, c)
    }
    const positions = new Map<string, Position>()
    for (const [group, c] of counts) {
      const p = majority(c)
      if (p) positions.set(group, p)
    }
    result.set(ballot, positions)
  }
  return result
}

/**
 * The share of ballots where each member voted as a reference: a member (the ballots both voted
 * in), or a group's majority (the ballots the member voted in and the group had a position).
 * Members with fewer than `min` such ballots are left out: too few to tell.
 */
export function agreement(votes: VoteRow[], byKey: Map<number, MemberRow>, reference: { member: number } | { group: string }, min = 4): Map<number, number> {
  const same = new Map<number, [number, number]>()
  const groups = 'group' in reference ? groupPositions(votes, byKey) : null
  for (const [ballot, list] of byBallot(votes)) {
    const ref = 'member' in reference ? list.find((v) => v.member === reference.member && cast(v))?.position : groups!.get(ballot)?.get(reference.group)
    if (!ref) continue
    for (const v of list) {
      if (!cast(v) || ('member' in reference && v.member === reference.member)) continue
      const [s, n] = same.get(v.member) ?? [0, 0]
      same.set(v.member, [s + (v.position === ref ? 1 : 0), n + 1])
    }
  }
  return new Map([...same].filter(([, [, n]]) => n >= min).map(([member, [s, n]]) => [member, s / n]))
}

const tally = (): VoteTally => ({ for: 0, against: 0, abstention: 0, n: 0 })

function count(t: VoteTally, p: Position): void {
  if (p === 'nonVoting') return
  t[p]++
  t.n++
}

/** How some members vote over a period's ballots (and their votes): participation, loyalty, by author's group, like each group. */
export function analyse(ballots: BallotRecord[], votes: VoteRow[], byKey: Map<number, MemberRow>, members: number[]): MemberAnalysis[] {
  const groups = groupPositions(votes, byKey)
  const authors = new Map(ballots.map((b) => [b.key, b.kind === 'amendment' ? b.author_group : '']))
  const wanted = new Set(members)
  const results = new Map<number, MemberAnalysis>(
    members.map((m) => [m, { member: byKey.get(m)?.id ?? '', voted: 0, ballots: ballots.length, proxies: 0, loyal: 0, byAuthor: {}, likeGroup: {} }])
  )
  for (const v of votes) {
    if (!wanted.has(v.member) || !cast(v)) continue
    const a = results.get(v.member)!
    a.voted++
    if (v.proxy) a.proxies++
    const positions = groups.get(v.ballot)
    const own = byKey.get(v.member)?.group?.id
    if (own && positions?.get(own) === v.position) a.loyal++
    for (const [group, p] of positions ?? []) {
      const [s, n] = a.likeGroup[group] ?? [0, 0]
      a.likeGroup[group] = [s + (p === v.position ? 1 : 0), n + 1]
    }
    const author = authors.get(v.ballot)
    if (author) count((a.byAuthor[author] ??= tally()), v.position)
  }
  return [...results.values()]
}

/** How each group (its majority) voted on the amendments of each group: group → author's group → tally. */
export function groupsByAuthor(ballots: BallotRecord[], votes: VoteRow[], byKey: Map<number, MemberRow>): Record<string, Record<string, VoteTally>> {
  const positions = groupPositions(votes, byKey)
  const result: Record<string, Record<string, VoteTally>> = {}
  for (const b of ballots) {
    if (b.kind !== 'amendment' || !b.author_group) continue
    for (const [group, p] of positions.get(b.key) ?? []) count(((result[group] ??= {})[b.author_group] ??= tally()), p)
  }
  return result
}
