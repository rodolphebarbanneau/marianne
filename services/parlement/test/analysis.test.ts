import { describe, expect, it } from 'vitest'
import { agreement, analyse, groupPositions, groupsByAuthor } from '../src/analysis'
import type { BallotRecord, MemberRow, VoteRow } from '../src/queries'
import type { Position } from '../src/types'

/** Four deputies in two groups. */
const member = (key: number, group: string): MemberRow => ({
  chamber: 'an',
  id: `PA${key}`,
  key,
  seat: key,
  data: {} as MemberRow['data'],
  group: { chamber: 'an', id: group, short_name: group, name: group, color: '', rank: 0 }
})
const MEMBERS = new Map([1, 2, 3, 4].map((k) => [k, member(k, k <= 2 ? 'G1' : 'G2')]))

const ballot = (key: number, kind: BallotRecord['kind'], author_group = ''): BallotRecord => ({
  chamber: 'an',
  id: `B${key}`,
  key,
  number: key,
  date: '2026-10-28',
  title: '',
  kind,
  result: '',
  author: '',
  author_group,
  bill: '',
  sitting: '',
  data: '{}'
})

const v = (ballot: number, member: number, position: Position, proxy = false): VoteRow => ({ ballot, member, position, proxy })

// Ballot 1, G1's amendment: G1 for, G2 against. Ballot 2, G2's amendment: G1 against, G2 for, but 2 for.
// Ballot 3, an article: everyone for but 4, who abstains by proxy.
const BALLOTS = [ballot(1, 'amendment', 'G1'), ballot(2, 'amendment', 'G2'), ballot(3, 'article')]
const VOTES = [
  v(1, 1, 'for'),
  v(1, 2, 'for'),
  v(1, 3, 'against'),
  v(1, 4, 'against'),
  v(2, 1, 'against'),
  v(2, 2, 'for'),
  v(2, 3, 'for'),
  v(2, 4, 'nonVoting'),
  v(3, 1, 'for'),
  v(3, 2, 'for'),
  v(3, 3, 'for'),
  v(3, 4, 'abstention', true)
]

describe('how members vote', () => {
  it('finds each group’s majority in each ballot, non-voters aside, none when it splits evenly', () => {
    const positions = groupPositions(VOTES, MEMBERS)
    expect(Object.fromEntries(positions.get(1)!)).toEqual({ G1: 'for', G2: 'against' })
    // G1 splits one for, one against: no majority.
    expect(Object.fromEntries(positions.get(2)!)).toEqual({ G2: 'for' })
  })

  it('measures agreement with a member, and with a group’s majority', () => {
    const withOne = agreement(VOTES, MEMBERS, { member: 1 }, 1)
    expect(withOne.get(2)).toBeCloseTo(2 / 3)
    expect(withOne.get(3)).toBeCloseTo(1 / 3)
    expect(withOne.has(1)).toBe(false)
    expect(agreement(VOTES, MEMBERS, { member: 1 }, 3).has(4)).toBe(false)
    const withG2 = agreement(VOTES, MEMBERS, { group: 'G2' }, 1)
    expect(withG2.get(3)).toBe(1)
    expect(withG2.get(1)).toBe(0)
  })

  it('analyses members: participation, proxies, loyalty, by author’s group, like each group', () => {
    const [one, four] = analyse(BALLOTS, VOTES, MEMBERS, [1, 4])
    // Loyal in ballots 1 and 3; in ballot 2 their group had no majority.
    expect(one).toMatchObject({ member: 'PA1', voted: 3, ballots: 3, proxies: 0, loyal: 2 })
    expect(one.byAuthor).toEqual({ G1: { for: 1, against: 0, abstention: 0, n: 1 }, G2: { for: 0, against: 1, abstention: 0, n: 1 } })
    expect(one.likeGroup.G2).toEqual([0, 2])
    expect(four).toMatchObject({ member: 'PA4', voted: 2, proxies: 1, loyal: 1 })
  })

  it('tallies how each group voted on each group’s amendments', () => {
    expect(groupsByAuthor(BALLOTS, VOTES, MEMBERS)).toEqual({
      G1: { G1: { for: 1, against: 0, abstention: 0, n: 1 } },
      G2: { G1: { for: 0, against: 1, abstention: 0, n: 1 }, G2: { for: 1, against: 0, abstention: 0, n: 1 } }
    })
  })
})
