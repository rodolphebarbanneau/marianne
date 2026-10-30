import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ICON_SIZE, MAX_PICTURE_COLORS, nearestPaletteColor, PICTURE_SIZE, pictureProblems, readManifest, type SyncStatus } from '@marianne/sdk'
import type { HomeCommune, ServiceContext, ServiceRuntime } from '@marianne/sdk/main'
import { checkTile, fakeContext } from '@marianne/sdk/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pkg from '../package.json'
import { service } from '../src/main'
import { memberCard } from '../src/present'
import { getMember } from '../src/queries'
import { DB_FILE, openWriter } from '../src/store'
import { dayWords, deputyVotes, fit, hemicyclePicture, liveLine, shortSubject, streamLabel, tileOf, type TileFacts } from '../src/tile'
import type { LiveStream } from '../src/types'
import { buildIndex, fakeHttp, SITTING } from './fixtures'

/** The Assemblée as the index had it in October 2026, left to right: each group's members and the colour its open data gives. */
const ASSEMBLY: Array<[string, number, string]> = [
  ['LFI-NFP', 70, '#C00D0D'],
  ['GDR', 17, '#830E21'],
  ['EcoS', 38, '#77AA79'],
  ['SOC', 68, '#F5B4CE'],
  ['LIOT', 23, '#FFD96F'],
  ['Dem', 37, '#F07E26'],
  ['NI', 11, '#8D949A'],
  ['EPR', 90, '#7B4591'],
  ['DR', 47, '#8CB0DC'],
  ['HOR', 35, '#B5E2F9'],
  ['UDR', 17, '#3367A7'],
  ['RN', 121, '#313567']
]

const LIVE = 'https://www.assemblee-nationale.fr/dyn/api/live/streams'
const SENATE_SEARCH = 'https://videos.senat.fr/senat_function.php'

/** The portals at 20 h: the Assemblée's sitting of the day and the Sénat's, both live. */
const PORTALS = {
  [LIVE]: JSON.stringify({
    diffusions: [
      {
        isLive: true,
        reunionUid: SITTING,
        organeLibelle: 'Séance publique',
        debutDateTime: '2026-10-28 14:00:00',
        debutDateTimeLibelle: 'mercredi 28 octobre 2026 à 14h00',
        sujet: 'Questions au Gouvernement',
        liveUrl: 'https://videos.assemblee-nationale.fr/live/live36/playlist36.m3u8',
        posterUrl: ''
      }
    ]
  }),
  [SENATE_SEARCH]: JSON.stringify([
    {
      nid: '5979506',
      date: '1793219400',
      live: true,
      thumbnail: null,
      published: true,
      videotype: 'DG',
      description: ['Projet de loi', 'Protection des enfants'],
      commission: null,
      title: 'Séance publique du 28 octobre 2026 (soir)',
      url: '/5979506_6ae25732cc856'
    }
  ])
}

const CENON: HomeCommune = { code: '33119', name: 'Cenon', postcode: '33150' }

const stream = (over: Partial<LiveStream>): LiveStream => ({
  id: SITTING,
  chamber: 'an',
  organ: 'Séance publique',
  start: '',
  startAt: '2026-10-28T14:00:00+01:00',
  title: '',
  subject: '',
  place: '',
  live: true,
  hls: '',
  mirrors: [],
  poster: '',
  url: '',
  ...over
})

/** The painted cells of a picture, as a mask. */
const mask = (pixels: string[]) => pixels.map((row) => row.replace(/[^.]/g, 'o'))
const count = (pixels: string[], key: string) => pixels.join('').split(key).length - 1

describe('the tile’s parts', () => {
  it('takes each group’s colour in the palette: its hue first, then its level; a grey for a grey', () => {
    expect(ASSEMBLY.map(([group, , color]) => [group, nearestPaletteColor(color)])).toEqual([
      ['LFI-NFP', 'rouge'],
      ['GDR', 'rouge-sombre'],
      ['EcoS', 'vert-sombre'],
      ['SOC', 'magenta-pale'],
      ['LIOT', 'jaune-clair'],
      ['Dem', 'jaune'],
      ['NI', 'gris-clair'],
      ['EPR', 'magenta-sombre'],
      ['DR', 'bleu-pale'],
      ['HOR', 'cyan-pale'],
      ['UDR', 'bleu-clair'],
      ['RN', 'bleu-sombre']
    ])
    // The Sénat's non-attached are black: a grey that shows.
    expect(nearestPaletteColor('#000000')).toBe('gris')
    expect(nearestPaletteColor('bleu')).toBe('gris-clair')
  })

  it('draws the Assemblée as it sits, in at most eight colours, small groups taking their neighbours’', () => {
    const picture = hemicyclePicture(ASSEMBLY.map(([, members, color]) => ({ members, color: nearestPaletteColor(color) })))
    expect(pictureProblems(picture, PICTURE_SIZE)).toEqual([])
    // GDR with LFI, LIOT with the MoDem, the non-attached with Ensemble, the UDR with the RN.
    expect(picture).toEqual({
      palette: { r: 'rouge', v: 'vert-sombre', m: 'magenta-pale', j: 'jaune', M: 'magenta-sombre', b: 'bleu-pale', c: 'cyan-pale', B: 'bleu-sombre' },
      pixels: [
        '........j.M.M.M........',
        '.....m.j.j.M.M.b.b.....',
        '....m.m.j.M.M.M.b.c....',
        '...v.m.m.j.M.M.b.c.B...',
        '..v.v.m.j.....b.c.B.B..',
        '.r.r.v.m.......B.B.B.B.',
        'r.r.r.r.........B.B.B.B',
        '.r.r.r...........B.B.B.'
      ]
    })
    expect(Object.keys(picture.palette).length).toBeLessThanOrEqual(MAX_PICTURE_COLORS)
    // An arc as wide on the left as on the right.
    expect(mask(picture.pixels)).toEqual(mask(picture.pixels).map((row) => [...row].reverse().join('')))
  })

  it('gives each group its share of the seats, and grey seats before the first sync', () => {
    const picture = hemicyclePicture([
      { members: 4, color: 'magenta-pale' },
      { members: 1, color: 'bleu-sombre' }
    ])
    expect(picture.palette).toEqual({ m: 'magenta-pale', b: 'bleu-sombre' })
    expect([count(picture.pixels, 'm'), count(picture.pixels, 'b')]).toEqual([46, 12])
    const empty = hemicyclePicture([])
    expect(empty.palette).toEqual({ g: 'gris' })
    expect(mask(empty.pixels)).toEqual(mask(picture.pixels))
    expect(pictureProblems(empty, PICTURE_SIZE)).toEqual([])
  })

  it('names a broadcast in a few words: the text a sitting debates, a committee, the Sénat', () => {
    const items = ['Questions au Gouvernement', 'Suite de la discussion du projet de loi de finances pour 2027']
    expect(streamLabel(stream({ subject: 'Questions au Gouvernement' }), items)).toBe('PLF 2027')
    expect(streamLabel(stream({ subject: 'Questions au Gouvernement' }))).toBe('questions au Gouvernement')
    expect(streamLabel(stream({ title: 'Projet de loi de financement rectificative de la sécurité sociale pour 2026' }))).toBe('PLFRSS 2026')
    expect(streamLabel(stream({ organ: 'Commission des finances, de l’économie générale et du contrôle budgétaire' }))).toBe('commission des finances')
    expect(streamLabel(stream({ chamber: 'se', title: 'Séance publique du 28 octobre 2026 (soir)' }))).toBe('Sénat')
    expect(streamLabel(stream({}))).toBe('séance publique')
    expect(shortSubject('Suite de la discussion de la proposition de loi visant à protéger les enfants (n° 1234)')).toBe(
      'proposition de loi visant à protéger les enfants'
    )
  })

  it('says what is live in one line, held to the tile’s length', () => {
    expect(liveLine([])).toBeNull()
    expect(liveLine(['PLF 2027', 'Sénat'])).toEqual({ text: '2 directs · PLF 2027, Sénat', tone: 'live' })
    expect(liveLine(['Sénat', 'Sénat'])).toEqual({ text: '2 directs · Sénat', tone: 'live' })
    const long = liveLine(['PLF 2027', 'commission des affaires culturelles et de l’éducation', 'Sénat'])!
    expect(long.text).toBe('3 directs · PLF 2027, commission des affaires culturelles…')
    expect(checkTile({ lines: [long] })).toEqual({ lines: [long] })
    expect(fit('court', 60)).toBe('court')
  })

  it('says the day of the ballots from today', () => {
    expect(dayWords('2026-10-28', '2026-10-28')).toBe('aujourd’hui')
    expect(dayWords('2026-10-27', '2026-10-28')).toBe('hier')
    expect(dayWords('2026-10-01', '2026-10-28')).toBe('le 1er octobre')
    expect(dayWords('2025-07-21', '2026-01-05')).toBe('le 21 juillet 2025')
  })

  it('says which day the deputy’s votes are of when it isn’t the figure’s, and when there is no ballot', () => {
    const facts: TileFacts = {
      today: '2026-10-29',
      index: { groups: [], ballots: { day: '2026-10-29', count: 2 } },
      sync: {},
      live: [],
      deputy: { female: true, voted: 12, total: 14, day: '2026-10-28' }
    }
    expect(checkTile(tileOf(facts))).toMatchObject({
      value: { text: '2', unit: 'scrutins aujourd’hui' },
      lines: [{ text: 'votre députée : 12 / 14 votes hier' }]
    })
    expect(checkTile(tileOf({ ...facts, index: { groups: [], ballots: null }, deputy: null }))).toMatchObject({ title: 'aucun scrutin public pour l’instant' })
    expect(checkTile(tileOf({ ...facts, index: { groups: [], ballots: null }, deputy: null }))?.lines).toBeUndefined()
  })
})

let dir: string
let runtime: ServiceRuntime | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'marianne-parlement-tile-'))
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-28T19:00:00Z') })
})

afterEach(() => {
  runtime?.synced?.()
  runtime = undefined
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

/** The data folder filled as a first sync would. */
function synced(): void {
  mkdirSync(join(dir, 'data'), { recursive: true })
  const { db } = openWriter(join(dir, 'data', DB_FILE))
  buildIndex(db)
  db.close()
}

/** The service in Marianne's fake context: the user's address, the portals (none answers by default), the sync job's status. */
function start(options: { home?: HomeCommune | null; portals?: Record<string, string>; sync?: SyncStatus } = {}) {
  const fake = fakeContext(pkg, { home: options.home ?? null, answer: () => ({}) })
  const ctx: ServiceContext = {
    ...fake.ctx,
    dataDir: join(dir, 'data'),
    http: { ...fake.ctx.http, text: fakeHttp(options.portals ?? {}).text },
    sync: { ...fake.ctx.sync, status: () => options.sync ?? {} }
  }
  // The previous one's index closed: the folder is removed after the test.
  runtime?.synced?.()
  runtime = service.activate(ctx)
  return { tile: async () => checkTile(await runtime!.tile!()), urls: fake.urls }
}

describe('the tile', () => {
  it('is asked again every 5 minutes, and the manifest declares the runtime’s tools and an 8 × 8 icon', () => {
    start()
    expect(service.tile).toEqual({ everyMinutes: 5 })
    const manifest = readManifest(pkg)
    expect(manifest.tools).toEqual(runtime!.tools!.map(({ name, label }) => ({ name, label })))
    expect(pictureProblems(manifest.icon, { width: ICON_SIZE, height: ICON_SIZE, exact: true })).toEqual([])
  })

  it('before the first sync, says what is coming in a grey hemicycle, and never fails', async () => {
    const before = await start().tile()
    expect(before).toEqual({
      title: 'données pas encore téléchargées',
      visual: { kind: 'pixels', palette: { g: 'gris' }, pixels: expect.any(Array) },
      lines: [{ text: 'à télécharger depuis le service', tone: 'dim' }]
    })
    expect(await start({ sync: { running: { phase: 'index', done: 3, total: 8, label: 'les scrutins du Sénat' } } }).tile()).toMatchObject({
      title: 'données en cours de téléchargement',
      lines: [{ text: 'indexation : les scrutins du Sénat', tone: 'dim' }]
    })
    expect((await start({ sync: { error: 'HTTP 503' } }).tile())?.lines).toEqual([{ text: 'le dernier téléchargement a échoué', tone: 'dim' }])
  })

  it('once synced, counts today’s public ballots in both chambers and draws the hemicycle; without an address, says what is missing', async () => {
    synced()
    const { tile, urls } = start()
    expect(await tile()).toEqual({
      value: { text: '3', unit: 'scrutins aujourd’hui' },
      visual: { kind: 'pixels', palette: { m: 'magenta-pale', b: 'bleu-sombre' }, pixels: expect.any(Array) },
      lines: [{ text: 'votre député·e : renseignez votre adresse', tone: 'dim' }],
      params: { tab: 'ballots' }
    })
    // Neither the Sénat's agenda nor anything else through `json`.
    expect(urls).toEqual([])
  })

  it('says how the user’s deputy took part in the day’s ballots, in their gender', async () => {
    synced()
    expect((await start({ home: CENON }).tile())?.lines).toEqual([{ text: 'votre député : 1 / 1 vote' }])
    const rennes = { code: '35238', name: 'Rennes', postcode: '35000' }
    expect((await start({ home: { ...rennes, latitude: 48.11, longitude: -1.69 } }).tile())?.lines).toEqual([{ text: 'votre députée : 0 / 1 vote' }])
    expect((await start({ home: rennes }).tile())?.lines).toEqual([{ text: 'votre député·e : complétez votre adresse', tone: 'dim' }])
  })

  it('without a ballot today, counts the last day’s and says which', async () => {
    synced()
    vi.setSystemTime(new Date('2026-10-29T10:00:00Z'))
    expect(await start({ home: CENON }).tile()).toMatchObject({ value: { text: '3', unit: 'scrutins hier' }, lines: [{ text: 'votre député : 1 / 1 vote' }] })
    vi.setSystemTime(new Date('2026-10-25T10:00:00Z'))
    expect(await start({ home: CENON }).tile()).toMatchObject({
      value: { text: '1', unit: 'scrutin le 22 octobre' },
      lines: [{ text: 'votre député : 1 / 1 vote' }]
    })
  })

  it('takes the deputy’s votes from the Assemblée’s last day when the figure’s had ballots at the Sénat only', () => {
    mkdirSync(join(dir, 'data'), { recursive: true })
    const { db } = openWriter(join(dir, 'data', DB_FILE))
    buildIndex(db)
    const card = memberCard(getMember(db, 'an', 'PA1008')!)
    const mine = { commune: null, deputies: [card], exact: true, senators: [], leaning: null, themes: [] }
    expect(deputyVotes(db, mine, { day: '2026-10-29', an: [], se: 2 }, '2026-10-29')).toEqual({ female: false, voted: 1, total: 1, day: '2026-10-28' })
    db.close()
  })

  it('says what is live, first: the text the Assemblée’s sitting debates, from its agenda once synced', async () => {
    expect((await start({ portals: PORTALS }).tile())?.lines).toEqual([
      { text: '2 directs · questions au Gouvernement, Sénat', tone: 'live' },
      { text: 'à télécharger depuis le service', tone: 'dim' }
    ])
    synced()
    expect((await start({ home: CENON, portals: PORTALS }).tile())?.lines).toEqual([
      { text: '2 directs · PLF 2027, Sénat', tone: 'live' },
      { text: 'votre député : 1 / 1 vote' }
    ])
  })
})
