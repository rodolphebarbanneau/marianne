import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readManifest, type Leaning, type ServiceImpl, type SyncStatus } from '@marianne/sdk'
import { ToolError, type Commune, type HomeCommune, type ServiceContext, type ServiceRuntime } from '@marianne/sdk/main'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pkg from '../package.json'
import { service } from '../src/main'
import { liveMeetings } from '../src/methods'
import { DB_FILE, openWriter } from '../src/store'
import { todayItems } from '../src/today'
import type { Favorites, LiveStream, Meeting, ParlementMethods } from '../src/types'
import { buildIndex, fakeHttp, HEARING, SITTING } from './fixtures'

const LIVE = 'https://www.assemblee-nationale.fr/dyn/api/live/streams'
const AN_SEARCH = 'https://videos.assemblee-nationale.fr/php/eventsearch.php'
const SENATE_SEARCH = 'https://videos.senat.fr/senat_function.php'
const SENATE_AGENDA = 'https://www.senat.fr/api/v1/agenda/events'
const VIDEO = '19640863_6ae1fd69f11bf'

const stream = (over: Record<string, unknown>) => ({
  isLive: true,
  reunionUid: SITTING,
  organeLibelle: 'Séance publique',
  debutDateTime: '2026-10-28 14:00:00',
  debutDateTimeLibelle: 'mercredi 28 octobre 2026 à 14h00',
  sujet: 'Questions au Gouvernement',
  liveUrl: 'https://videos.assemblee-nationale.fr/live/live36/playlist36.m3u8',
  posterUrl: '',
  ...over
})

/** The portals and the Sénat's agenda: a live sitting at the Assemblée, a later one, a hearing's recording; the Sénat's sitting of the day. */
const SITES = {
  [LIVE]: JSON.stringify({ diffusions: [stream({}), stream({ isLive: false, reunionUid: 'RUANR5L17S2027IDS31005', debutDateTime: '2026-10-28 21:30:00' })] }),
  [AN_SEARCH]: JSON.stringify([
    {
      mediaId: '1',
      date: '1793195369',
      thumbnail: null,
      published: true,
      description: '',
      video_type: 'C',
      commission: 'PROTECEDUC',
      title: 'Protection des personnels éducatifs',
      url: `/${VIDEO}?timecode=803810`
    }
  ]),
  [`https://videos.assemblee-nationale.fr/Datas/an/${VIDEO}/content/data.nvs`]: `<data mediatitle="Protection des personnels éducatifs"><chapters><chapter id="1" label="M. Thierry Tesson"><speaker id="9"/></chapter></chapters><metadatas><metadata name="video_type" value="C"/><metadata name="meeting_id" value="${HEARING}"/></metadatas><speakers><speaker id="9"><name>M. Thierry Tesson</name><url>841553</url></speaker></speakers></data>`,
  [`https://videos.assemblee-nationale.fr/Datas/an/${VIDEO}/content/finalplayer.nvs`]: '<player endtime="600000"><synchro id="1" timecode="803810"/></player>',
  [`https://videos.assemblee-nationale.fr/Datas/an/${VIDEO}/meta-files/vodalys.smil`]:
    '<smil><body><video src="mp4/ida/mp4:domain1/2026/10/debr_1.mp4"/></body></smil>',
  [SENATE_SEARCH]: JSON.stringify([]),
  [SENATE_AGENDA]: JSON.stringify({
    '2026-10-28': {
      events: [
        {
          id: 559710,
          date: '2026-10-28',
          hour: '14h30',
          title: 'Suite PJL Protection des enfants',
          place: 'Hémicycle',
          instances: ['Séance publique'],
          public: true
        }
      ]
    }
  })
}

const GIRONDE: Commune = {
  code: '33119',
  name: 'Cenon',
  postalCodes: ['33150'],
  department: '33',
  departmentName: 'Gironde',
  region: '75',
  population: 25_000,
  longitude: -0.53,
  latitude: 44.86
}

let dir: string
let home: HomeCommune | null
let status: SyncStatus
let runs: number
let runFails: boolean
let granted: { leaning?: Leaning; themes?: string[] }
let stored: Map<string, unknown>

function context(): ServiceContext {
  const http = fakeHttp(SITES)
  return {
    manifest: readManifest(pkg),
    http: { json: async (url) => JSON.parse(await http.text(url)) as never, text: http.text, page: async () => '' },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    storage: {
      get: <T>(key: string) => (stored.get(key) as T) ?? null,
      set: (key, value) => void stored.set(key, value),
      remove: (key) => void stored.delete(key)
    },
    dataDir: join(dir, 'data'),
    geo: { findCommunes: async () => [], getCommune: async (code) => (code === GIRONDE.code ? GIRONDE : null) },
    home: () => home,
    profile: {
      granted: () => [...(granted.leaning ? (['opinions.leaning'] as const) : []), ...(granted.themes ? (['opinions.themes'] as const) : [])],
      vehicles: () => [],
      leaning: () => granted.leaning ?? null,
      themes: () => granted.themes ?? [],
      sources: () => null
    },
    sync: {
      status: () => status,
      run: async () => {
        runs++
        if (runFails) throw new Error('No sync job built for parlement')
      }
    }
  }
}

/** The data folder filled as a first sync would. */
function synced(): void {
  mkdirSync(join(dir, 'data'), { recursive: true })
  const { db } = openWriter(join(dir, 'data', DB_FILE))
  buildIndex(db)
  db.close()
}

let runtime: ServiceRuntime
let methods: ServiceImpl<ParlementMethods>
const tool = (name: string) => runtime.tools!.find((t) => t.name === name)!
const call = (name: string, args: Record<string, unknown> = {}) => tool(name).run(args as never, {})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'marianne-parlement-service-'))
  home = { code: GIRONDE.code, name: 'Cenon', postcode: '33150' }
  status = {}
  runs = 0
  runFails = false
  granted = {}
  stored = new Map()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-28T19:00:00Z') })
  runtime = service.activate(context())
  methods = runtime.methods as ServiceImpl<ParlementMethods>
})

afterEach(() => {
  runtime.synced?.()
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

describe('the service', () => {
  it('declares a valid manifest, a daily sync, its tools, guide, instructions, and what it asks to read', () => {
    expect(readManifest(pkg)).toMatchObject({
      id: 'parlement',
      name: 'Parlement',
      category: 'democracy',
      links: ['https://videos.assemblee-nationale.fr/', 'https://videos.senat.fr/'],
      permissions: { profile: ['opinions.leaning', 'opinions.themes'] }
    })
    expect(service.sync).toEqual({ everyHours: 24 })
    expect(runtime.tools!.map((t) => [t.name, t.label])).toEqual([
      ['members', 'élus'],
      ['member', 'élu'],
      ['ballots', 'scrutins'],
      ['ballot', 'scrutin'],
      ['agenda', 'agenda'],
      ['videos', 'vidéos'],
      ['video', 'vidéo'],
      ['live', 'en direct']
    ])
    expect(runtime.tools!.every((t) => t.readOnly)).toBe(true)
    const guide = runtime.skills![0]
    expect(guide).toMatch(/^---\nname: parliament\n/)
    const named = guide.match(/`parlement_[a-z]+`/g) ?? []
    expect(named.length).toBeGreaterThan(0)
    for (const name of named) expect(runtime.tools!.map((t) => `\`parlement_${t.name}\``)).toContain(name)
    expect(runtime.instructions).toContain('?timecode=<milliseconds>')
  })
})

describe('before the first sync', () => {
  it('tells the model the data is missing and how the user gets it', async () => {
    for (const name of ['members', 'member', 'ballots', 'ballot']) {
      const failure = call(name, { department: '33', member: 'David', ballot: 1 })
      await expect(failure).rejects.toBeInstanceOf(ToolError)
      await expect(failure).rejects.toThrow(/3615 PARLEMENT/)
    }
    status = { running: { phase: 'download', done: 1, total: 2 } }
    await expect(call('members', { department: '33' })).rejects.toThrow(/being downloaded/)
  })

  it('shows the view a status to act on, and starts a sync on demand', async () => {
    expect(await methods.status()).toEqual({ ready: false, deputies: 0, senators: 0, ballots: 0, meetings: 0, sync: {} })
    expect(() => methods.members({ department: '33' })).toThrow(/pas encore téléchargées/)
    status = { running: { phase: 'download', done: 0, total: 0 } }
    expect((await methods.sync()).sync.running).toBeDefined()
    expect(runs).toBe(1)
  })

  it('says why a sync could not start', async () => {
    runFails = true
    await methods.sync()
    await vi.waitFor(async () => expect((await methods.status()).sync.error).toMatch(/No sync job/))
  })

  it('gives today’s broadcasts and the Sénat’s agenda as the lines of the day', async () => {
    const items = await runtime.today!('2026-10-28')
    expect(items.map((i) => [i.id, i.source, i.start, i.live])).toEqual([
      [SITTING, 'Assemblée nationale', '2026-10-28T14:00:00+01:00', true],
      ['SE-559710', 'Sénat', '2026-10-28T14:30:00+01:00', undefined],
      ['RUANR5L17S2027IDS31005', 'Assemblée nationale', '2026-10-28T21:30:00+01:00', undefined]
    ])
    // A meeting known only from its broadcast still opens.
    expect((await methods.meeting(SITTING)).meeting).toMatchObject({ kind: 'sitting', organ: 'Séance publique', items: ['Questions au Gouvernement'] })
    expect((await methods.agenda('2026-10-28', 1)).indexed).toBe(false)
  })
})

describe('once synced', () => {
  beforeEach(() => {
    synced()
    runtime.synced!()
  })

  it('finds the user’s deputy from their commune, their senators from their département', async () => {
    const mine = await methods.mine()
    expect(mine).toMatchObject({ commune: { name: 'Cenon', code: '33119', department: '33' }, exact: true, leaning: null, themes: [] })
    expect(mine.deputies.map((d) => d.id)).toEqual(['PA1008'])
    expect(mine.senators.map((s) => s.id)).toEqual(['21000A'])
  })

  it('finds the deputy of a split commune from the address’s coordinates, and says when it can’t', async () => {
    home = { code: '35238', name: 'Rennes', postcode: '35000', latitude: 48.105, longitude: -1.67 }
    expect((await methods.mine()).deputies.map((d) => d.id)).toEqual(['PA3508'])
    home = { code: '35238', name: 'Rennes', postcode: '35000' }
    const unsure = await methods.mine()
    expect(unsure.exact).toBe(false)
    expect(unsure.deputies.map((d) => d.id)).toEqual(['PA3501', 'PA3508'])
    home = null
    expect(await methods.mine()).toMatchObject({ commune: null, deputies: [], senators: [] })
  })

  it('gives the lens and the themes only when the user let it read them', async () => {
    granted = { leaning: { assembly: ['SOC'], senate: ['SER'] }, themes: ['health'] }
    expect(await methods.mine()).toMatchObject({ leaning: { an: ['SOC'], se: ['SER'] }, themes: ['health'] })
  })

  it('gives a member’s profile: roles, votes of the last 30 days, how they vote', async () => {
    const p = await methods.member('an', 'PA1008')
    expect(p).toMatchObject({
      name: 'M. Alain David',
      groupShort: 'SOC',
      constituency: '4',
      roles: [{ organ: 'Commission de la défense nationale et des forces armées', role: 'Président' }]
    })
    expect(p.recent.map((r) => [r.ballot.number, r.vote.position])).toEqual([
      [9000, 'against'],
      [9097, 'abstention']
    ])
    expect(p.analysis).toMatchObject({ voted: 2, ballots: 2, loyal: 2 })
    const senator = await methods.member('se', '21089R')
    expect(senator).toMatchObject({
      chamber: 'se',
      roles: [{ organ: 'Commission de la culture, de l’éducation, de la communication et du sport', role: 'Membre' }]
    })
    await expect(async () => methods.member('an', 'PA404')).rejects.toThrow(/Aucun député/)
  })

  it('draws each hemicycle: seats, groups from left to right, and how everyone voted in a ballot', async () => {
    const an = await methods.hemicycle('an')
    expect(an.groups.map((g) => g.shortName)).toEqual(['SOC', 'RN'])
    expect(an.seats.find((s) => s.member === 'PA841553')).toEqual({
      seat: 72,
      member: 'PA841553',
      name: 'M. Thierry Tesson',
      groupId: 'PO845401',
      place: 'Nord · 17e circ.'
    })
    expect(await methods.votes('an', 'VTANR5L17V9000')).toEqual({ PA1008: 'c', PA3501: 'p', PA3508: 'c', PA841553: 'P' })
    expect(await methods.votes('se', 'SE2026-2')).toEqual({ '21089R': 'c', '20032U': 'p', '21000A': 'a' })
  })

  it('gives the day: ballots by bill in both chambers, with their authors, and who took part', async () => {
    const day = await methods.day('2026-10-28')
    expect(day.bills.map((b) => [b.chamber, b.title, b.ballots.map((l) => l.number)])).toEqual([
      ['an', 'Projet de loi de finances pour 2027', [9097]],
      ['se', 'Projet de loi relatif à la protection des enfants', [1, 2]]
    ])
    const [amendment] = day.bills[1].ballots
    expect(amendment).toMatchObject({
      kind: 'amendment',
      amendment: '12',
      author: { id: '21089R', name: 'Mme Colombe Brossel', groupShort: 'SER' },
      adopted: false,
      for: 2,
      against: 1
    })
    expect(day.bills[0].ballots[0].sittingStart).toBe('2026-10-28T14:00:00.000+01:00')
    expect(day.proxies).toBe(1)
    const presence = await methods.presence('2026-10-28')
    expect(presence.PA3508).toEqual({ voted: 1, proxy: 1, ballots: 1, committees: [] })
    expect(presence.PA841553.committees).toEqual([
      { meeting: HEARING, organ: 'Mission d’information sur la protection des personnels éducatifs', start: '2026-10-28T15:00:00.000+01:00', status: 'present' }
    ])
  })

  it('details a ballot: its groups, the votes asked for, those who voted otherwise than their group', async () => {
    const b = await methods.ballot('an', '9000', ['PA1008', 'PA2'])
    expect(b.groups.map((g) => [g.shortName, g.position, g.for, g.against])).toEqual([
      ['SOC', 'against', 1, 2],
      ['RN', 'for', 1, 0]
    ])
    expect(b.votes.map((v) => [v.member.id, v.vote.position, v.groupPosition])).toEqual([
      ['PA1008', 'against', 'against'],
      ['PA2', null, 'against']
    ])
    expect(b.dissidents.map((d) => [d.member.id, d.position])).toEqual([['PA3501', 'for']])
    expect(b).toMatchObject({
      author: { name: 'M. Thierry Tesson', groupShort: 'RN' },
      proxies: 1,
      url: 'https://www.assemblee-nationale.fr/dyn/17/scrutins/9000'
    })
    expect(await methods.positions('an', ['VTANR5L17V9000', 'VTANR5L17V9097'], ['PA3508'])).toEqual({
      PA3508: { VTANR5L17V9000: { position: 'against', proxy: false }, VTANR5L17V9097: { position: 'for', proxy: true } }
    })
  })

  it('analyses how members vote, by the colour of the amendments, and who votes like a group', async () => {
    const a = await methods.analysis('an', ['PA1008'], '2026-10-01', '2026-10-28')
    expect(a.ballots).toBe(2)
    expect(a.members[0].byAuthor).toEqual({ PO845401: { for: 0, against: 1, abstention: 0, n: 1 } })
    expect(a.groups.PO845419).toEqual({ PO845401: { for: 0, against: 1, abstention: 0, n: 1 } })
    // Too few ballots in common to tell: nobody.
    expect(await methods.agreement('an', { group: 'RN' }, 30)).toEqual({})
    expect(await methods.agreement('an', { group: 'XYZ' }, 30)).toEqual({})
  })

  it('suggests members to follow, saying why, never one already followed', async () => {
    granted = { themes: ['health'] }
    stored.set('favorites', { members: [], groups: [] } satisfies Favorites)
    const found = await methods.suggestions()
    // The bill voted on this week: its rapporteur.
    expect(found.map((s) => [s.member.id, s.kind])).toEqual([['PA841553', 'rapporteur']])
    expect(found[0].why).toBe('rapporteur général du texte de la semaine (Projet de loi de finances pour 2027)')
    stored.set('favorites', { members: ['PA841553'], groups: [] } satisfies Favorites)
    expect(await methods.suggestions()).toEqual([])
  })

  it('answers the model: members, a profile, ballots with a member’s votes, a ballot, the agenda', async () => {
    expect(await call('members', { department: '33', limit: 30 })).toContain('| M. Alain David | Assemblée | SOC | Gironde (33) | 4 | PA1008 |')
    expect(await call('members', { mine: true, limit: 30 })).toContain('Hervé Gillé')
    expect(await call('member', { member: 'Tesson' })).toContain('# M. Thierry Tesson (PA841553)')
    await expect(call('member', { member: 'zzz' })).rejects.toThrow(/No member/)
    const ballots = await call('ballots', { text: 'protection des enfants', member: 'Brossel' })
    expect(ballots).toContain('Mme Colombe Brossel (21089R)')
    expect(ballots).toContain('| Sénat | 2026-10-28 | 1 |')
    expect(await call('ballot', { ballot: 'SE2026-1' })).toContain('tabled by: Mme Colombe Brossel (SER)')
    await expect(call('ballot', { ballot: 404 })).rejects.toThrow(/No public ballot 404/)
    const agenda = await call('agenda', { day: '2026-10-28', chamber: 'senat' })
    expect(agenda).toContain('Sénat · public sitting')
    expect(agenda).not.toContain('Assemblée')
  })

  it('gives its lines of the day: both chambers’ sittings and committees, live and cancelled ones flagged', async () => {
    const items = await runtime.today!('2026-10-28')
    expect(items.map((i) => [i.title, i.source, i.live ?? false, i.cancelled ?? false])).toEqual([
      ['Commission de la défense nationale et des forces armées', 'Assemblée nationale', false, true],
      ['Séance publique', 'Assemblée nationale', true, false],
      ['Séance publique', 'Sénat', false, false],
      ['Mission d’information sur la protection des personnels éducatifs', 'Assemblée nationale', false, false],
      ['Commission de la défense nationale et des forces armées', 'Assemblée nationale', false, false]
    ])
  })
})

describe('today’s lines', () => {
  const meeting = (over: Partial<Meeting>): Meeting => ({
    id: 'M1',
    chamber: 'an',
    kind: 'committee',
    state: 'confirmed',
    start: '2026-10-28T10:00:00+01:00',
    organId: 'PO1',
    organ: 'Commission des finances',
    place: 'salle 6350',
    items: ['Audition du gouverneur de la Banque de France'],
    video: true,
    ...over
  })
  const live: LiveStream = {
    id: 'S1',
    chamber: 'an',
    organ: 'Séance publique',
    start: 'mercredi 28 octobre 2026 à 15h00',
    startAt: '2026-10-28T15:00:00+01:00',
    title: '',
    subject: 'Questions au Gouvernement',
    place: '',
    live: true,
    hls: 'https://x/live.m3u8',
    mirrors: [],
    poster: '',
    url: ''
  }

  it('fall back on the Assemblée’s broadcasts without its agenda', () => {
    expect(todayItems('2026-10-28', [], [live]).map((i) => [i.id, i.title, i.live, i.params])).toEqual([['S1', 'Séance publique', true, { meeting: 'S1' }]])
    expect(todayItems('2026-10-28', [meeting({})], [live]).map((i) => i.id)).toEqual(['M1'])
    // Its video on the portal: the line opens it, the whole sitting so far.
    expect(todayItems('2026-10-28', [], [{ ...live, video: '19655971_6ae44b8fc51ef', meeting: 'M2' }])[0].params).toEqual({ video: '19655971_6ae44b8fc51ef' })
    expect(todayItems('2026-10-28', [], [{ ...live, meeting: 'M2' }])[0].params).toEqual({ meeting: 'M2' })
  })

  it('cut a long agenda', () => {
    const long = todayItems('2026-10-28', [meeting({ items: ['x '.repeat(400)] })], [])
    expect(long[0].detail!.length).toBeLessThanOrEqual(240)
  })
})

describe('the meetings live broadcasts show', () => {
  const at = (day: string, hour: string) => `${day}T${hour}:00+01:00`
  const meeting = (id: string, chamber: 'an' | 'se', kind: Meeting['kind'], start: string, organ = kind === 'sitting' ? 'Séance publique' : ''): Meeting => ({
    id,
    chamber,
    kind,
    state: 'confirmed',
    start,
    organId: '',
    organ,
    place: '',
    items: [id],
    video: true
  })
  const stream = (id: string, chamber: 'an' | 'se', organ: string): LiveStream => ({
    id,
    chamber,
    organ,
    start: '',
    startAt: '',
    title: '',
    subject: '',
    place: '',
    live: true,
    hls: 'https://x/live.m3u8',
    mirrors: [],
    poster: '',
    url: ''
  })
  const day = '2026-10-29'
  const meetings = [
    meeting('AN-0900', 'an', 'sitting', at(day, '09:00')),
    meeting('AN-1500', 'an', 'sitting', at(day, '15:00')),
    meeting('AN-2130', 'an', 'sitting', at(day, '21:30')),
    meeting('SE-1030', 'se', 'sitting', at(day, '10:30')),
    meeting('SE-2130', 'se', 'sitting', at(day, '21:30')),
    meeting('SE-COM', 'se', 'committee', at(day, '21:00'), 'Commission des affaires sociales')
  ]
  const now = Date.parse('2026-10-29T22:15:00+01:00')

  it('is the sitting under way, whatever meeting the chamber names (the Assemblée names its first of the day)', () => {
    const live = liveMeetings(meetings, [stream('AN-0900', 'an', 'Séance publique'), stream('5981480_x', 'se', 'Séance publique')], now)
    expect([...live.keys()].sort()).toEqual(['AN-2130', 'SE-2130'])
  })

  it('is the meeting its video names, when the portal says', () => {
    const live = { ...stream('AN-0900', 'an', 'Séance publique'), meeting: 'AN-1500' }
    expect([...liveMeetings(meetings, [live], now).keys()]).toEqual(['AN-1500'])
    // One the agenda doesn't have: the sitting under way.
    expect([...liveMeetings(meetings, [{ ...live, meeting: 'AN-XXXX' }], now).keys()]).toEqual(['AN-2130'])
  })

  it('keeps, of two broadcasts that show one meeting, the one with its video, in either order', () => {
    // The API's, its video not found, and the portal's: both the sitting under way.
    const api = stream('AN-0900', 'an', 'Séance publique')
    const portal = { ...stream('AN-2130', 'an', 'Séance publique'), video: '19655971_6ae44b8fc51ef', meeting: 'AN-2130' }
    for (const streams of [
      [api, portal],
      [portal, api]
    ])
      expect(liveMeetings(meetings, streams, now)).toEqual(new Map([['AN-2130', portal]]))
  })

  it('is, for a committee, the meeting named, or at the Sénat the latest of that committee', () => {
    expect([...liveMeetings(meetings, [stream('AN-COM', 'an', 'Commission des lois')], now).keys()]).toEqual(['AN-COM'])
    expect([...liveMeetings(meetings, [stream('5981999_y', 'se', 'Affaires sociales')], now).keys()]).toEqual(['SE-COM'])
  })

  it('picks, between sittings started together, the one whose agenda the broadcast speaks of', () => {
    const together = [
      { ...meeting('SE-CONV', 'se', 'sitting', at(day, '10:30')), items: ['1 convention internationale'] },
      { ...meeting('SE-PJL', 'se', 'sitting', at(day, '10:30')), items: ['Suite PJL Protection des enfants'] }
    ]
    const live = { ...stream('5981480_x', 'se', 'Séance publique'), subject: 'Projet de loi · Protection des enfants (discussion des articles)' }
    expect([...liveMeetings(together, [live], now).keys()]).toEqual(['SE-PJL'])
  })

  it('leaves sittings not yet started, cancelled, or of another day', () => {
    const early = Date.parse('2026-10-29T12:00:00+01:00')
    expect([...liveMeetings(meetings, [stream('AN-0900', 'an', 'Séance publique')], early).keys()]).toEqual(['AN-0900'])
    const cancelled = meetings.map((m) => (m.id === 'AN-2130' ? { ...m, state: 'cancelled' as const } : m))
    expect([...liveMeetings(cancelled, [stream('AN-0900', 'an', 'Séance publique')], now).keys()]).toEqual(['AN-1500'])
    expect([...liveMeetings([], [stream('AN-0900', 'an', 'Séance publique')], now).keys()]).toEqual(['AN-0900'])
  })
})
