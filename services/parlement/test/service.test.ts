import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readManifest, type ServiceImpl, type SyncStatus } from '@marianne/sdk'
import { ToolError, type Commune, type HomeCommune, type ServiceContext, type ServiceRuntime } from '@marianne/sdk/main'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pkg from '../package.json'
import { indexDumps } from '../src/indexer'
import { service } from '../src/main'
import { DB_FILE, openWriter } from '../src/store'
import { todayItems } from '../src/today'
import type { ParlementMethods, LiveStream, Meeting } from '../src/types'
import { dumps, fakeHttp, HEARING, SITTING } from './fixtures'

const LIVE = 'https://www.assemblee-nationale.fr/dyn/api/live/streams'
const SEARCH = 'https://videos.assemblee-nationale.fr/php/eventsearch.php'
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

/** The portal: a live sitting, a later one, the recording of the hearing. */
const PORTAL = {
  [LIVE]: JSON.stringify({ diffusions: [stream({}), stream({ isLive: false, reunionUid: 'RUANR5L17S2027IDS31005', debutDateTime: '2026-10-28 21:30:00' })] }),
  [SEARCH]: JSON.stringify([
    {
      mediaId: '1',
      date: '1793195369',
      thumbnail: null,
      published: true,
      description: '',
      video_type: 'C',
      commission: 'PROTECEDUC',
      title: 'Protection des personnels éducatifs',
      url: `/${VIDEO}`
    },
    {
      mediaId: '2',
      date: '1793190000',
      thumbnail: null,
      published: true,
      description: '',
      video_type: 'C',
      commission: 'MASCO',
      title: 'Maillage scolaire',
      url: '/19640983_6ae1fde90bfa0'
    }
  ]),
  [`https://videos.assemblee-nationale.fr/Datas/an/${VIDEO}/content/data.nvs`]: `<data mediatitle="Protection des personnels éducatifs"><chapters><chapter id="1" label="Mme Anne Genetet, présidente"><speaker id="9"/></chapter></chapters><metadatas><metadata name="video_type" value="C"/><metadata name="meeting_id" value="${HEARING}"/></metadatas><speakers><speaker id="9"><name>Mme Anne Genetet</name><url>721024</url></speaker></speakers></data>`,
  [`https://videos.assemblee-nationale.fr/Datas/an/${VIDEO}/content/finalplayer.nvs`]: '<player endtime="600000"><synchro id="1" timecode="803810"/></player>',
  [`https://videos.assemblee-nationale.fr/Datas/an/${VIDEO}/meta-files/vodalys.smil`]:
    '<smil><body><video src="mp4/ida/mp4:domain1/2026/10/debr_1.mp4"/></body></smil>'
}

const BORDEAUX: Commune = {
  code: '33063',
  name: 'Bordeaux',
  postalCodes: ['33000'],
  department: '33',
  departmentName: 'Gironde',
  region: '75',
  population: 260_000,
  longitude: -0.58,
  latitude: 44.84
}

let dir: string
let home: HomeCommune | null
let status: SyncStatus
let runs: number
let runFails: boolean
let geoFails: boolean

function context(): ServiceContext {
  return {
    manifest: readManifest(pkg),
    http: { json: async () => ({}) as never, text: fakeHttp(PORTAL).text, page: async () => '' },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    storage: { get: () => null, set: () => undefined, remove: () => undefined },
    dataDir: join(dir, 'data'),
    geo: {
      findCommunes: async () => [],
      getCommune: async (code) => {
        if (geoFails) throw new Error('geo is off')
        return code === BORDEAUX.code ? BORDEAUX : null
      }
    },
    home: () => home,
    profile: { granted: () => [], vehicles: () => [] },
    sync: {
      status: () => status,
      run: async () => {
        runs++
        if (runFails) throw new Error('No sync job built for parlement')
      }
    }
  }
}

/** The data folder filled as a sync would. */
function synced(): void {
  mkdirSync(join(dir, 'data'), { recursive: true })
  const { db } = openWriter(join(dir, 'data', DB_FILE))
  indexDumps(db, dumps(), { reset: true })
  db.close()
}

let runtime: ServiceRuntime
let methods: ServiceImpl<ParlementMethods>
const tool = (name: string) => runtime.tools!.find((t) => t.name === name)!
const call = (name: string, args: Record<string, unknown> = {}) => tool(name).run(args as never, {})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'marianne-parlement-service-'))
  home = { code: BORDEAUX.code, name: 'Bordeaux', postcode: '33000' }
  status = {}
  runs = 0
  runFails = false
  geoFails = false
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
  it('declares a valid manifest, a daily sync, its tools, guide and instructions', () => {
    expect(readManifest(pkg)).toMatchObject({ id: 'parlement', name: 'Parlement', category: 'democracy', links: ['https://videos.assemblee-nationale.fr/'] })
    expect(service.sync).toEqual({ everyHours: 24 })
    expect(runtime.tools!.map((t) => [t.name, t.label])).toEqual([
      ['deputies', 'députés'],
      ['deputy', 'député'],
      ['ballots', 'scrutins'],
      ['ballot', 'scrutin'],
      ['agenda', 'agenda'],
      ['videos', 'vidéos'],
      ['video', 'vidéo'],
      ['live', 'en direct']
    ])
    expect(runtime.tools!.every((t) => t.readOnly)).toBe(true)
    const guide = runtime.skills![0]
    expect(guide).toMatch(/^---\nname: national-assembly\n/)
    const named = guide.match(/`parlement_[a-z]+`/g) ?? []
    expect(named.length).toBeGreaterThan(0)
    for (const name of named) expect(runtime.tools!.map((t) => `\`parlement_${t.name}\``)).toContain(name)
    expect(guide).not.toMatch(/`(depute|deputes|scrutins?|videos_assemblee|video_assemblee|direct_assemblee)`/)
    expect(runtime.instructions).toContain('?timecode=<milliseconds>')
  })
})

describe('before the first sync', () => {
  it('tells the model the data is missing and how the user gets it', async () => {
    for (const name of ['deputies', 'deputy', 'ballots', 'ballot', 'agenda']) {
      const failure = call(name, { department: '33', deputy: 'David', ballot: 1 })
      await expect(failure).rejects.toBeInstanceOf(ToolError)
      await expect(failure).rejects.toThrow(/3615 PARLEMENT/)
    }
    status = { running: { phase: 'download', done: 1, total: 2 } }
    await expect(call('deputies', { department: '33' })).rejects.toThrow(/being downloaded/)
  })

  it('shows the view a status to act on, and starts a sync on demand', async () => {
    expect(await methods.status()).toEqual({ ready: false, deputies: 0, ballots: 0, meetings: 0, sync: {} })
    expect(() => methods.deputies({ department: '33' })).toThrow(/pas encore téléchargées/)
    status = { running: { phase: 'download', done: 0, total: 0 } }
    expect((await methods.sync()).sync.running).toBeDefined()
    expect(runs).toBe(1)
  })

  it('says why a sync could not start', async () => {
    runFails = true
    await methods.sync()
    await vi.waitFor(async () => expect((await methods.status()).sync.error).toMatch(/No sync job/))
  })

  it('gives today’s broadcasts as the lines of the day', async () => {
    const items = await runtime.today!('2026-10-28')
    expect(items.map((i) => [i.id, i.title, i.start, i.live, i.params])).toEqual([
      [SITTING, 'Séance publique', '2026-10-28T14:00:00+01:00', true, { meeting: SITTING }],
      ['RUANR5L17S2027IDS31005', 'Séance publique', '2026-10-28T21:30:00+01:00', undefined, { meeting: 'RUANR5L17S2027IDS31005' }]
    ])
    expect(items.every((i) => i.source === 'Assemblée nationale')).toBe(true)
    // A meeting known only from its broadcast still opens.
    expect((await methods.meeting(SITTING)).meeting).toMatchObject({ kind: 'sitting', organ: 'Séance publique', items: ['Questions au Gouvernement'] })
    expect((await methods.agenda('2026-10-28')).indexed).toBe(false)
  })
})

describe('once synced', () => {
  beforeEach(() => {
    synced()
    runtime.synced!()
  })

  it('lists deputies for the model, the user’s own from their address', async () => {
    expect(await call('deputies', { department: '33', limit: 30 })).toBe(
      '1 sitting deputy:\n\n| deputy | group | département | constituency | id |\n| --- | --- | --- | --- | --- |\n| M. Alain David | SOC | Gironde (33) | 4 | PA1008 |'
    )
    expect(await call('deputies', { mine: true, limit: 30 })).toContain("département of the user's address: Gironde (33)")
    geoFails = true
    expect(await call('deputies', { mine: true, limit: 30 })).toContain('PA1008')
    home = null
    await expect(call('deputies', { mine: true, limit: 30 })).rejects.toThrow(/Settings → Identity/)
    await expect(call('deputies', { limit: 30 })).rejects.toThrow(/Give a name/)
    await expect(call('deputies', { group: 'personne', limit: 30 })).rejects.toThrow(/No sitting deputy/)
  })

  it('gives a deputy’s profile, and asks which one when several match', async () => {
    const profile = await call('deputy', { deputy: 'Tesson', votes: 12 })
    expect(profile).toContain('# M. Thierry Tesson (PA841553)')
    expect(profile).toContain('Rassemblement National (RN) · Nord (59), constituency 17 · deputy since 2024-07-08')
    expect(profile).toContain('- Rapporteur · Mission d’information sur la protection des personnels éducatifs')
    expect(profile).toContain('Took part in 1 of the 2 public ballots')
    expect(profile).toContain('| 2026-10-22 | no. 9000 |')
    expect(profile).toContain('| rejeté | against (by proxy) |')
    await expect(call('deputy', { deputy: 'd', votes: 12 })).rejects.toThrow(
      /Several sitting deputies match "d": M\. Alain David \(PA1008, Gironde, SOC\); M\. Jean-Paul Dupuis/
    )
    await expect(call('deputy', { deputy: 'PA9', votes: 12 })).rejects.toThrow(/No sitting deputy/)
  })

  it('searches ballots with a deputy’s votes, and details one', async () => {
    const found = await call('ballots', { text: 'projet de loi', deputy: 'PA2', final: false, limit: 15 })
    expect(found).toContain('2 public ballots · with the vote of M. Jean-Paul Dupuis (PA2), newest first:')
    expect(found).toContain(
      "| 2026-10-23 | 9097 | l'ensemble du projet de loi de finances pour 2027 (première lecture) | adopté | abstention | https://www.assemblee-nationale.fr/dyn/17/scrutins/9097 |"
    )
    expect(found).toContain('| rejeté | did not take part |')
    await expect(call('ballots', { text: 'introuvable', final: false, limit: 15 })).rejects.toThrow(/No public ballot found for "introuvable"/)
    const detail = await call('ballot', { ballot: 9000, deputy: 'Tesson' })
    expect(detail).toContain('# Ballot no. 9000 of 2026-10-22 (VTANR5L17V9000)')
    expect(detail).toContain('legislative file: Projet de loi de finances pour 2027 (DLR5L17N54629)')
    expect(detail).toContain('Vote of M. Thierry Tesson (PA841553): **against (by proxy)**')
    expect(detail).toContain('| SOC | 100 | for | 1 | 0 | 0 | 0 |')
    await expect(call('ballot', { ballot: '1' })).rejects.toThrow(/No public ballot 1/)
  })

  it('gives the agenda of a day, live sittings flagged', async () => {
    const agenda = await call('agenda', { day: '2026-10-28' })
    expect(agenda).toContain('# Agenda of the Assemblée nationale, 2026-10-28 (Paris time)')
    expect(agenda).toContain(`- 14:00 · **Public sitting** · LIVE NOW · filmed · id ${SITTING}\n  - Questions au Gouvernement`)
    expect(agenda).toContain('**Commission de la défense nationale et des forces armées** · CANCELLED')
    expect(agenda).toContain('· tentative ·')
    expect(await call('agenda', { day: '2026-10-28', kind: 'committee', text: 'paty' })).toContain(`15:00–17:00 · **Mission d’information`)
    expect(await call('agenda', { day: '2026-10-30' })).toBe('Nothing on the agenda of the Assemblée nationale on 2026-10-30.')
  })

  it('gives the videos, a video’s chapters and what is live', async () => {
    expect(await call('videos', { limit: 15 })).toContain(`https://videos.assemblee-nationale.fr/video.${VIDEO}`)
    const video = await call('video', { video: `https://videos.assemblee-nationale.fr/video.${VIDEO}?timecode=5` })
    expect(video).toContain(`- [13:23](https://videos.assemblee-nationale.fr/video.${VIDEO}?timecode=803810) Mme Anne Genetet, présidente (PA721024)`)
    await expect(call('video', { video: 'nope' })).rejects.toThrow(/not a video/)
    const live = await call('live')
    expect(live).toContain(`# Live now\n\n- Séance publique · since 2026-10-28 14:00 · meeting ${SITTING}`)
    expect(live).toContain('# Later today')
  })

  it('answers the view', async () => {
    expect(await methods.status()).toMatchObject({ ready: true, deputies: 3, ballots: 2, meetings: 6 })
    expect(await methods.myDeputies()).toMatchObject({
      commune: { name: 'Bordeaux', department: '33', departmentName: 'Gironde' },
      deputies: [{ id: 'PA1008' }]
    })
    home = null
    expect(await methods.myDeputies()).toEqual({ commune: null, deputies: [] })
    expect((await methods.group('PO845419')).members.map((d) => d.id)).toEqual(['PA1008', 'PA2'])
    expect((await methods.ballot('9000', ['PA1008'])).votes).toMatchObject([{ deputy: { id: 'PA1008' }, position: 'for' }])
    expect(() => methods.deputy('PA9')).toThrow(/Aucun député/)
    const agenda = await methods.agenda('2026-10-28')
    expect(agenda.meetings.find((m) => m.id === SITTING)?.live).toBe(true)
    expect(agenda.streams).toHaveLength(2)
    expect((await methods.agenda('2026-10-29')).streams).toEqual([])
    const hearing = await methods.meeting(HEARING)
    expect(hearing.stream).toBeNull()
    expect(hearing.videos.map((v) => v.id)).toEqual([VIDEO])
    expect(await methods.video(`https://videos.assemblee-nationale.fr/video.${VIDEO}?timecode=803810`)).toMatchObject({ id: VIDEO, timecode: 803810 })
  })

  it('gives its lines of the day: sittings and committees, live and cancelled ones flagged', async () => {
    const items = await runtime.today!('2026-10-28')
    expect(items.map((i) => [i.title, i.live ?? false, i.cancelled ?? false])).toEqual([
      ['Commission de la défense nationale et des forces armées', false, true],
      ['Séance publique', true, false],
      ['Mission d’information sur la protection des personnels éducatifs', false, false],
      ['Commission de la défense nationale et des forces armées', false, false]
    ])
    expect(items[1]).toMatchObject({
      id: SITTING,
      detail: 'Questions au Gouvernement ; Suite de la discussion du projet de loi de finances pour 2027',
      start: '2026-10-28T14:00:00.000+01:00',
      url: 'https://www2.assemblee-nationale.fr/agendas/les-agendas',
      source: 'Assemblée nationale',
      params: { meeting: SITTING }
    })
    expect(items[1].place).toBeUndefined()
    expect(items[2]).toMatchObject({ place: 'salle 4088, 9 rue de Bourgogne', end: '2026-10-28T17:00:00.000+01:00' })
    expect(items[3].detail).toBe('À confirmer · Examen pour avis')
    expect((await runtime.today!('2026-10-29')).map((i) => i.live)).toEqual([undefined])
  })
})

describe('today’s lines', () => {
  const live: LiveStream = {
    meetingId: 'RUX',
    organ: 'Commission des affaires sociales',
    start: 'mercredi 28 octobre 2026 à 09h30',
    startAt: '2026-10-28T09:30:00+01:00',
    title: '',
    subject: 'Audition',
    place: 'Salle 6351',
    live: true,
    hls: 'https://videos.assemblee-nationale.fr/live/live1/playlist1.m3u8',
    poster: ''
  }

  it('fall back on the day’s broadcasts without an agenda', () => {
    expect(todayItems('2026-10-28', [], [live, { ...live, meetingId: 'RUY', startAt: '2026-10-29T09:30:00+01:00' }])).toEqual([
      {
        id: 'RUX',
        title: 'Commission des affaires sociales',
        detail: 'Audition',
        start: '2026-10-28T09:30:00+01:00',
        place: 'Salle 6351',
        url: 'https://www2.assemblee-nationale.fr/agendas/les-agendas',
        live: true,
        source: 'Assemblée nationale',
        params: { meeting: 'RUX' }
      }
    ])
  })

  it('cut a long agenda', () => {
    const m: Meeting = {
      id: 'RUZ',
      kind: 'committee',
      state: 'confirmed',
      start: '2026-10-28T09:30:00+01:00',
      organId: '',
      place: '',
      items: ['mot '.repeat(100)],
      video: false
    }
    const [item] = todayItems('2026-10-28', [m], [])
    expect(item.title).toBe('Réunion de commission')
    expect(item.detail!.length).toBeLessThanOrEqual(240)
    expect(item.detail!.endsWith('…')).toBe(true)
  })
})
