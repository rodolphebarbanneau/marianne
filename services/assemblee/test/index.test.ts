import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { indexDumps } from '../src/indexer'
import { ballotDetail, deputyCard, deputyProfile } from '../src/present'
import { counts, findDeputies, findGroups, getBallot, getMeeting, listGroups, meetingsOn, searchBallots } from '../src/queries'
import { AssemblyIndex, DB_FILE, openWriter } from '../src/store'
import { ACTORS, BALLOTS, dumps, HEARING, MEETINGS, SITTING } from './fixtures'

let dir: string
let file: string
let writer: DatabaseSync

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'marianne-assemblee-'))
  file = join(dir, DB_FILE)
  const opened = openWriter(file)
  expect(opened.current).toBe(false)
  writer = opened.db
  indexDumps(writer, dumps(), { reset: true })
})

afterEach(() => {
  writer.close()
  rmSync(dir, { recursive: true, force: true })
})

const ids = (rows: Array<{ deputy: { id: string } }>) => rows.map((r) => r.deputy.id)

describe('indexing', () => {
  it('keeps sitting deputies, every ballot and the agenda, and reports its progress', () => {
    expect(counts(writer)).toEqual({ deputies: 3, ballots: 2, meetings: 6 })
    const steps: Array<[number, number]> = []
    indexDumps(writer, dumps(), { reset: false, progress: (done, total) => steps.push([done, total]) })
    // 5 organs, 4 actors (the déport is skipped), 2 ballots, 7 meetings (one withdrawn).
    expect(steps.at(-1)).toEqual([18, 18])
    const again = openWriter(file)
    expect(again.current).toBe(true)
    again.db.close()
  })

  it('rebuilds only the dumps given, and a new index needs them all', () => {
    indexDumps(writer, { meetings: dumps(BALLOTS, MEETINGS.slice(0, 2)).meetings }, { reset: false })
    expect(counts(writer)).toEqual({ deputies: 3, ballots: 2, meetings: 2 })
    expect(() => indexDumps(writer, { meetings: dumps().meetings }, { reset: true })).toThrow(/every dump/)
  })

  it('leaves the index as it was when a dump is unusable', () => {
    const noDeputies = { ...dumps(), deputies: dumps().ballots }
    expect(() => indexDumps(writer, noDeputies, { reset: false })).toThrow(/no sitting deputy/)
    expect(counts(writer)).toEqual({ deputies: 3, ballots: 2, meetings: 6 })
  })
})

describe('the main side’s index', () => {
  it('is there once a sync filled it, read-only, and sees a rebuild once it is committed', () => {
    const empty = new AssemblyIndex(join(dir, 'none.db'))
    expect(empty.open()).toBeNull()
    const index = new AssemblyIndex(file)
    const reader = index.open()!
    expect(counts(reader).deputies).toBe(3)
    expect(() => reader.exec('delete from deputies')).toThrow(/readonly/)
    // While the sync job rebuilds, the main side still reads the previous index.
    writer.exec('begin')
    writer.exec('delete from deputies')
    expect(counts(reader).deputies).toBe(3)
    writer.exec('rollback')
    indexDumps(writer, { deputies: dumps().deputies }, { reset: false })
    index.close()
    expect(counts(index.open()!).deputies).toBe(3)
    index.close()
  })

  it('ignores an index of another schema version', () => {
    writer.exec('pragma user_version = 99')
    expect(new AssemblyIndex(file).open()).toBeNull()
  })
})

describe('deputies', () => {
  it('finds them by département (name or number), constituency, words of the name, group or id', () => {
    expect(ids(findDeputies(writer, { department: '33' }))).toEqual(['PA1008'])
    expect(ids(findDeputies(writer, { department: 'gironde' }))).toEqual(['PA1008'])
    expect(ids(findDeputies(writer, { department: '2a' }))).toEqual(['PA2'])
    expect(ids(findDeputies(writer, { department: 'Corse du Sud' }))).toEqual(['PA2'])
    expect(ids(findDeputies(writer, { department: '59', constituency: '017' }))).toEqual(['PA841553'])
    expect(ids(findDeputies(writer, { department: '59', constituency: '1' }))).toEqual([])
    // Words match the start of a name's words.
    expect(ids(findDeputies(writer, { text: 'paul' }))).toEqual(['PA2'])
    expect(ids(findDeputies(writer, { text: 'avid' }))).toEqual([])
    expect(ids(findDeputies(writer, { group: 'soc' }))).toEqual(['PA1008', 'PA2'])
    expect(ids(findDeputies(writer, { group: 'socialistes' }))).toEqual(['PA1008', 'PA2'])
    expect(ids(findDeputies(writer, { group: 'personne' }))).toEqual([])
    expect(ids(findDeputies(writer, { ids: ['pa841553', 'PA9'] }))).toEqual(['PA841553'])
    expect(ids(findDeputies(writer, { ids: [] }))).toEqual([])
  })

  it('lists the groups with their members', () => {
    expect(listGroups(writer)).toEqual([
      { id: 'PO845419', name: 'Socialistes et apparentés', shortName: 'SOC', color: '#F5B4CE', members: 2 },
      { id: 'PO845401', name: 'Rassemblement National', shortName: 'RN', color: '#313567', members: 1 }
    ])
    expect(findGroups(writer, 'rassemblement').map((g) => g.id)).toEqual(['PO845401'])
    expect(findGroups(writer, 'PO845419').map((g) => g.shortName)).toEqual(['SOC'])
  })

  it('makes a profile: roles, participation, latest votes', () => {
    const p = deputyProfile(writer, findDeputies(writer, { ids: ['PA841553'] })[0])
    expect(p).toMatchObject({
      id: 'PA841553',
      name: 'M. Thierry Tesson',
      group: 'Rassemblement National',
      groupShort: 'RN',
      groupColor: '#313567',
      department: 'Nord',
      constituency: '17',
      photo: 'https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/841553.jpg',
      url: 'https://www.assemblee-nationale.fr/dyn/deputes/PA841553',
      office: '7 Avenue Roger Schwob 33150 Cenon',
      emails: ['Thierry.Tesson@assemblee-nationale.fr'],
      roles: [{ organId: 'PO884520', organ: 'Mission d’information sur la protection des personnels éducatifs', role: 'Rapporteur' }],
      participation: { voted: 1, total: 2 }
    })
    expect(p.votes).toEqual([
      {
        id: 'VTANR5L17V9000',
        number: 9000,
        date: '2026-10-22',
        title: BALLOTS[0].scrutin.titre,
        result: 'rejeté',
        position: 'against',
        proxy: true,
        url: 'https://www.assemblee-nationale.fr/dyn/17/scrutins/9000'
      }
    ])
    expect(deputyCard(findDeputies(writer, { ids: ['PA2'] })[0]).name).toBe('M. Jean-Paul Dupuis')
  })

  it('skips former deputies', () => {
    expect(ACTORS.map((a) => a.acteur.uid['#text'])).toContain('PA9')
    expect(findDeputies(writer, { ids: ['PA9'] })).toEqual([])
  })
})

describe('ballots', () => {
  it('searches the titles, accents and case aside, newest first, with a deputy’s position', () => {
    expect(searchBallots(writer, { text: 'PROJET de loi' }).map((b) => b.number)).toEqual([9097, 9000])
    expect(searchBallots(writer, { text: 'finances' }).map((b) => b.number)).toEqual([9097])
    expect(searchBallots(writer, { text: 'sécurité sociale' }).map((b) => b.number)).toEqual([9000])
    expect(searchBallots(writer, { finalOnly: true }).map((b) => b.number)).toEqual([9097])
    expect(searchBallots(writer, { from: '2026-10-23' }).map((b) => b.number)).toEqual([9097])
    expect(searchBallots(writer, { to: '2026-10-22' }).map((b) => b.number)).toEqual([9000])
    expect(searchBallots(writer, { deputy: 'PA841553' }).map((b) => [b.number, b.position, b.proxy])).toEqual([
      [9097, null, false],
      [9000, 'against', true]
    ])
    expect(searchBallots(writer, { text: 'introuvable' })).toEqual([])
  })

  it('gives a ballot by number or id, with the groups and the positions asked for', () => {
    expect(getBallot(writer, 'VTANR5L17V9000')?.number).toBe(9000)
    expect(getBallot(writer, 'n° 9097')?.number).toBe(9097)
    expect(getBallot(writer, 'abc')).toBeNull()
    const detail = ballotDetail(writer, getBallot(writer, 9000)!, ['PA1008', 'PA841553', 'PA2'])
    expect(detail.url).toBe('https://www.assemblee-nationale.fr/dyn/17/scrutins/9000')
    expect(detail.groups.map((g) => [g.shortName, g.position, g.for, g.against])).toEqual([
      ['SOC', 'for', 1, 0],
      ['RN', 'against', 0, 1]
    ])
    expect(detail.votes.map((v) => [v.deputy.id, v.position, v.proxy])).toEqual([
      ['PA1008', 'for', false],
      ['PA2', null, false],
      ['PA841553', 'against', true]
    ])
  })
})

describe('agenda', () => {
  it('gives a day by start time, with the organs’ names, and a meeting by id', () => {
    const day = meetingsOn(writer, '2026-10-28')
    expect(day.map((m) => [m.start.slice(11, 16), m.kind, m.state, m.organ])).toEqual([
      ['11:00', 'committee', 'cancelled', 'Commission de la défense nationale et des forces armées'],
      ['11:00', 'other', 'confirmed', ''],
      ['14:00', 'sitting', 'confirmed', 'Assemblée nationale de la 17ème législature'],
      ['15:00', 'committee', 'confirmed', 'Mission d’information sur la protection des personnels éducatifs'],
      ['16:00', 'committee', 'tentative', 'Commission de la défense nationale et des forces armées']
    ])
    expect(day.find((m) => m.id === SITTING)?.items).toEqual(['Questions au Gouvernement', 'Suite de la discussion du projet de loi de finances pour 2027'])
    expect(getMeeting(writer, HEARING.toLowerCase())).toMatchObject({
      id: HEARING,
      end: '2026-10-28T17:00:00.000+01:00',
      items: ['Audition, ouverte à la presse, de Mme Mickaëlle Paty']
    })
    expect(getMeeting(writer, 'RUANR5L17S2027IDC400000')).toBeNull()
    expect(meetingsOn(writer, '2026-10-30')).toEqual([])
  })
})
