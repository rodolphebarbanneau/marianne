import type { DatabaseSync } from 'node:sqlite'
import { ballotPage, deputyPage, deputyPhoto } from './links'
import { ballotPositions, deputyParticipation, deputyVotes, findDeputies, getOrgans, type BallotRow } from './queries'
import type { Ballot, BallotDetail, BallotSummary, Deputy, DeputyCard, DeputyProfile, DeputyRow, Position } from './types'

/** What the view and the tools show of the index: deputies' cards and profiles, ballots with their links. */

export const deputyName = (d: Pick<Deputy, 'civility' | 'firstName' | 'lastName'>) => [d.civility, d.firstName, d.lastName].filter(Boolean).join(' ')

export function deputyCard({ deputy: d, group }: DeputyRow): DeputyCard {
  return {
    id: d.id,
    name: deputyName(d),
    firstName: d.firstName,
    lastName: d.lastName,
    groupId: d.groupId,
    group: group?.name ?? '',
    groupShort: group?.shortName ?? '',
    groupColor: group?.color ?? '',
    department: d.department,
    departmentNumber: d.departmentNumber,
    constituency: d.constituency,
    photo: deputyPhoto(d.id),
    url: deputyPage(d.id)
  }
}

export function ballotSummary(row: BallotRow & { position?: Position | null; proxy?: boolean }): BallotSummary {
  return { ...row, url: ballotPage(row) }
}

/** The organs worth listing as a deputy's roles, in this order: committees, delegations, offices, missions… */
const ROLE_TYPES = [
  'BUREAU',
  'CONFPT',
  'COMPER',
  'COMNL',
  'COMSPSENAT',
  'CMP',
  'DELEG',
  'DELEGBUREAU',
  'OFFPAR',
  'CNPE',
  'CNPS',
  'MISINFO',
  'MISINFOCOM',
  'MISINFOPRE',
  'GE',
  'API'
]

export function deputyProfile(db: DatabaseSync, row: DeputyRow, votes = 12): DeputyProfile {
  const d = row.deputy
  const organIds = d.organs.map((o) => o.id)
  const organs = getOrgans(db, organIds)
  const roles = d.organs
    .flatMap((o) => {
      const organ = organs.get(o.id)
      return organ && ROLE_TYPES.includes(organ.type) ? [{ organId: o.id, organ: organ.name, role: o.role, rank: ROLE_TYPES.indexOf(organ.type) }] : []
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ rank: _rank, ...role }) => role)
  return {
    ...deputyCard(row),
    profession: d.profession,
    birthDate: d.birthDate,
    mandateStart: d.mandateStart,
    emails: d.emails,
    websites: d.websites,
    office: d.office,
    hatvp: d.hatvp,
    roles,
    participation: deputyParticipation(db, d.id, d.mandateStart),
    votes: deputyVotes(db, d.id, votes).map(ballotSummary)
  }
}

export function ballotDetail(db: DatabaseSync, ballot: Ballot, deputyIds: string[]): BallotDetail {
  const groupIds = ballot.groups.map((g) => g.organId)
  const organs = getOrgans(db, groupIds)
  const positions = ballotPositions(db, ballot.number, deputyIds)
  const deputies = deputyIds.length ? findDeputies(db, { ids: deputyIds }) : []
  return {
    ...ballot,
    url: ballotPage(ballot),
    groups: ballot.groups.map((g) => {
      const organ = organs.get(g.organId)
      return { ...g, name: organ?.name ?? g.organId, shortName: organ?.shortName ?? '', color: organ?.color ?? '' }
    }),
    votes: deputies.map((row) => {
      const vote = positions.get(row.deputy.id)
      return { deputy: deputyCard(row), position: vote?.position ?? null, proxy: vote?.proxy ?? false }
    })
  }
}
