import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { counts, filled, indexDeputies, indexMeetings, senateBallotNumbers } from '../src/indexer'
import { memberCard } from '../src/present'
import {
  attendanceOn,
  ballotsBetween,
  billTitles,
  constituenciesOf,
  constituencyAt,
  findGroups,
  findMembers,
  getBallot,
  getMeeting,
  listGroups,
  meetingsOn,
  memberVotes,
  rapporteursOf,
  searchBallots,
  sittingStarts,
  votesIn
} from '../src/queries'
import { ParliamentIndex, DB_FILE, openWriter } from '../src/store'
import { buildIndex, dumps, HEARING, MEETINGS, SITTING } from './fixtures'

let dir: string
let file: string
let writer: DatabaseSync

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'marianne-parlement-'))
  file = join(dir, DB_FILE)
  const opened = openWriter(file)
  expect(opened.current).toBe(false)
  writer = opened.db
  buildIndex(writer)
})

afterEach(() => {
  writer.close()
  rmSync(dir, { recursive: true, force: true })
})

const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id)

describe('indexing', () => {
  it('fills every source: both chambers’ members and ballots, the agenda, bills and constituencies', () => {
    expect(counts(writer)).toEqual({ deputies: 5, senators: 3, ballots: 4, meetings: 6 })
    for (const source of ['deputies', 'senators', 'ballots', 'meetings', 'bills', 'constituencies'] as const) expect(filled(writer, source)).toBe(true)
    expect(senateBallotNumbers(writer, 2026)).toEqual(new Set([1, 2]))
    const again = openWriter(file)
    expect(again.current).toBe(true)
    again.db.close()
  })

  it('refills a source’s own rows, and leaves the others', () => {
    indexMeetings(writer, dumps(undefined, MEETINGS.slice(0, 2)).meetings)
    expect(counts(writer)).toEqual({ deputies: 5, senators: 3, ballots: 4, meetings: 2 })
    // The deputies again: the senators stay.
    const steps: number[] = []
    indexDeputies(writer, dumps().deputies, (done) => steps.push(done))
    expect(counts(writer)).toMatchObject({ deputies: 5, senators: 3 })
    // 5 organs, 6 actors (the déport is skipped).
    expect(steps.at(-1)).toBe(11)
  })

  it('leaves the index as it was when a source is unusable', () => {
    expect(() => indexDeputies(writer, dumps().ballots)).toThrow(/no sitting deputy/)
    expect(counts(writer)).toEqual({ deputies: 5, senators: 3, ballots: 4, meetings: 6 })
  })
})

describe('the main side’s index', () => {
  it('is there once a sync filled it, read-only, and sees a rebuild once it is committed', () => {
    expect(new ParliamentIndex(join(dir, 'none.db')).open()).toBeNull()
    const index = new ParliamentIndex(file)
    const reader = index.open()!
    expect(counts(reader).deputies).toBe(5)
    expect(() => reader.exec('delete from members')).toThrow(/readonly/)
    // While the sync job rebuilds, the main side still reads the previous index.
    writer.exec('begin')
    writer.exec('delete from members')
    expect(counts(reader).deputies).toBe(5)
    writer.exec('rollback')
    index.close()
    expect(counts(index.open()!).deputies).toBe(5)
    index.close()
  })

  it('ignores an index of another schema version', () => {
    writer.exec('pragma user_version = 99')
    expect(new ParliamentIndex(file).open()).toBeNull()
  })
})

describe('members', () => {
  it('finds them in either chamber by département (name or number), constituency, words of the name, group or id', () => {
    expect(ids(findMembers(writer, { chamber: 'an', department: '33' }))).toEqual(['PA1008'])
    expect(ids(findMembers(writer, { department: 'gironde' }))).toEqual(['PA1008', '21000A'])
    expect(ids(findMembers(writer, { chamber: 'an', department: '2a' }))).toEqual(['PA2'])
    expect(ids(findMembers(writer, { chamber: 'an', department: '35', constituency: '08' }))).toEqual(['PA3508'])
    expect(ids(findMembers(writer, { text: 'dup' }))).toEqual(['PA2'])
    expect(ids(findMembers(writer, { chamber: 'se', group: 'LR' }))).toEqual(['20032U'])
    expect(ids(findMembers(writer, { ids: ['pa1008', '21089r'] })).sort()).toEqual(['21089R', 'PA1008'])
    // Former deputies are not in the index.
    expect(findMembers(writer, { text: 'ancienne' })).toEqual([])
  })

  it('gives cards: the Assemblée’s photo, the Sénat’s page, the groups’ colours readable on the dark screen', () => {
    const [deputy] = findMembers(writer, { ids: ['PA841553'] }).map(memberCard)
    expect(deputy).toMatchObject({ chamber: 'an', name: 'M. Thierry Tesson', groupShort: 'RN', seat: 72, constituency: '17' })
    // The RN's navy, lifted.
    expect(deputy.groupColor).not.toBe('#313567')
    const [senator] = findMembers(writer, { ids: ['21089R'] }).map(memberCard)
    expect(senator).toMatchObject({ chamber: 'se', name: 'Mme Colombe Brossel', female: true, groupShort: 'SER', constituency: '', seat: 72 })
    expect(senator.url).toBe('https://www.senat.fr/senateur/brossel_colombe21089r.html')
  })

  it('lists each chamber’s groups from left to right in its hemicycle, with their members', () => {
    expect(listGroups(writer, 'an').map((g) => [g.shortName, g.members])).toEqual([
      ['SOC', 4],
      ['RN', 1]
    ])
    expect(listGroups(writer, 'se').map((g) => [g.shortName, g.members, g.color])).toEqual([
      ['SER', 2, '#fb6f99'],
      ['LR', 1, '#2e70d1']
    ])
    expect(findGroups(writer, 'an', 'socialistes').map((g) => g.id)).toEqual(['PO845419'])
  })
})

describe('ballots', () => {
  it('knows who tabled each amendment, and the kind of each ballot', () => {
    expect(getBallot(writer, 'an', 9000)).toMatchObject({ kind: 'amendment', author: 'PA841553', author_group: 'PO845401', bill: 'DLR5L17N54629' })
    expect(getBallot(writer, 'an', 'VTANR5L17V9097')).toMatchObject({ kind: 'text', author: '', sitting: SITTING })
    expect(getBallot(writer, 'se', 'SE2026-1')).toMatchObject({ kind: 'amendment', author: '21089R', author_group: 'SOC', number: 1 })
    expect(getBallot(writer, 'se', 'SE2026-2')?.kind).toBe('text')
  })

  it('searches the subjects of both chambers, accents and case aside, newest first, by kind and author’s group', () => {
    expect(ids(searchBallots(writer, { text: 'SÉCURITÉ sociale' }))).toEqual(['VTANR5L17V9000'])
    expect(ids(searchBallots(writer, { text: 'protection des enfants' }))).toEqual(['SE2026-2', 'SE2026-1'])
    expect(ids(searchBallots(writer, { chamber: 'an', kind: 'text' }))).toEqual(['VTANR5L17V9097'])
    expect(ids(searchBallots(writer, { authorGroup: 'SOC' }))).toEqual(['SE2026-1'])
    // The same day: the Assemblée first.
    expect(ids(searchBallots(writer, { result: 'adopted' }))).toEqual(['VTANR5L17V9097', 'SE2026-2'])
  })

  it('finds a ballot by its number, in either chamber', () => {
    expect(ids(searchBallots(writer, { number: 9097 }))).toEqual(['VTANR5L17V9097'])
    expect(ids(searchBallots(writer, { number: 2, chamber: 'se' }))).toEqual(['SE2026-2'])
    expect(searchBallots(writer, { number: 123456 })).toEqual([])
  })

  it('gives each member’s vote, with proxies at the Assemblée', () => {
    const an = votesIn(writer, 'an', [9000])
    expect(an.map((v) => [v.member, v.position, v.proxy]).sort()).toEqual([
      [1008, 'against', false],
      [3501, 'for', false],
      [3508, 'against', false],
      [841553, 'for', true]
    ])
    expect(memberVotes(writer, 'se', 0).length).toBe(0)
    expect(ballotsBetween(writer, 'se', '2026-10-28', '2026-10-28').map((b) => b.id)).toEqual(['SE2026-1', 'SE2026-2'])
  })
})

describe('agenda and attendance', () => {
  it('gives a day by start time, with the organs’ names, and a meeting by id', () => {
    expect(meetingsOn(writer, '2026-10-28').map((m) => m.id)).toEqual([
      'RUANR5L17S2027IDC461468',
      'RUANR5L17S2027IDFL461503',
      SITTING,
      HEARING,
      'RUANR5L17S2027IDC461999'
    ])
    expect(getMeeting(writer, HEARING.toLowerCase())).toMatchObject({
      chamber: 'an',
      organ: 'Mission d’information sur la protection des personnels éducatifs'
    })
    expect(sittingStarts(writer, [SITTING, ''])).toEqual(new Map([[SITTING, '2026-10-28T14:00:00.000+01:00']]))
  })

  it('says who attended a committee meeting', () => {
    expect(attendanceOn(writer, '2026-10-28').map((a) => [a.member, a.status, a.organ])).toEqual([
      [1008, 'excused', 'Mission d’information sur la protection des personnels éducatifs'],
      [841553, 'present', 'Mission d’information sur la protection des personnels éducatifs']
    ])
  })
})

describe('bills and constituencies', () => {
  it('gives a bill’s title and rapporteurs', () => {
    expect(billTitles(writer, ['DLR5L17N54629', 'pjl25-911'])).toEqual(
      new Map([
        ['DLR5L17N54629', 'Projet de loi de finances pour 2027'],
        ['pjl25-911', 'Projet de loi relatif à la protection des enfants']
      ])
    )
    expect(rapporteursOf(writer, ['DLR5L17N54629'])).toEqual([{ bill: 'DLR5L17N54629', member: 'PA841553', type: 'rapporteur général', date: '2026-07-08' }])
  })

  it('tells a commune’s constituencies, and where a point of a split commune falls', () => {
    expect(constituenciesOf(writer, '33119')).toEqual([{ department: '33', constituency: '4' }])
    const rennes = constituenciesOf(writer, '35238')
    expect(rennes).toEqual([
      { department: '35', constituency: '1' },
      { department: '35', constituency: '8' }
    ])
    expect(constituencyAt(writer, rennes, -1.67, 48.105)).toEqual({ department: '35', constituency: '8' })
    expect(constituencyAt(writer, rennes, -1.69, 48.105)).toEqual({ department: '35', constituency: '1' })
    expect(constituencyAt(writer, rennes, 2.35, 48.85)).toBeNull()
  })
})
