import { describe, expect, it } from 'vitest'
import { clock, parisDateTime, parisIso, parseClock, toParis } from '../src/time'
import {
  htmlLines,
  liveStreams,
  portalImage,
  portalLives,
  readSmil,
  searchBoth,
  searchSenateVideos,
  searchVideos,
  senateLive,
  senateVideoDetail,
  videoDetail,
  type RawItem,
  type RawSenateItem
} from '../src/videos'
import { decodeEntities, parseXml, textOf } from '../src/xml'
import { fakeHttp } from './fixtures'

const ID = '19640863_6ae1fd69f11bf'
const ROOT = `https://videos.assemblee-nationale.fr/Datas/an/${ID}`

/** The portal's files, as it serves them (shortened). */
const DATA_NVS = `<?xml version="1.0"?>
<data id="19640863" interfaceuid="${ID}" status="vod" mediatitle="Renforcer la protection des personnels &#xE9;ducatifs : Mme Micka&#xEB;lle Paty">
  <chapters>
    <chapter id="19640896" label="Audition de Mme Micka&#xEB;lle Paty">
      <type key="23" value="Texte"/>
      <chapter id="19640898" label="Mme Anne Genetet, pr&#xE9;sidente">
        <speaker id="19640892"/>
      </chapter>
      <chapter id="19640900" label="Mme Micka&#xEB;lle Paty">
        <speaker id="19640891"/>
      </chapter>
    </chapter>
    <chapter id="19649999" label="Non horodat&#xE9;"/>
  </chapters>
  <metadatas>
    <metadata name="date" value="1793195369"/>
    <metadata name="video_type" value="C" label="Commission"/>
    <metadata name="commission" value="PROTECEDUC" label="Protection des personnels &#xE9;ducatifs (mission)"/>
    <metadata name="meeting_id" value="RUANR5L17S2027IDC461515"/>
    <metadata name="meeting_id" value="RUANR5L17S2027IDC461516"/>
    <metadata name="Thumbnail" value="mediafiles://this/Vignette MI.jpg"/>
  </metadatas>
  <speakers>
    <speaker id="19640891"><name>Mme Micka&#xEB;lle Paty</name><role/></speaker>
    <speaker id="19640892"><name>Mme Anne Genetet</name><role/><url>721024</url></speaker>
  </speakers>
  <!-- storyboard left out -->
</data>`

const PLAYER_NVS = `<?xml version="1.0"?>
<player endtime="11484000">
  <synchro id="1964086300000" timecode="0"/>
  <synchro id="19640896" timecode="794540"/>
  <synchro id="19640898" timecode="803810"/>
  <synchro id="19640900" timecode="1011950"/>
</player>`

const SMIL = `<smil><head><meta base="rtmp://vipwowza.yacast.net/assembleenationale"/></head><body><video src="mp4/ida/mp4:domain1/2026/10/debr_20261028144930_1.mp4"/></body></smil>`

const item = (over: Partial<RawItem>): RawItem => ({
  mediaId: '19640863',
  date: '1793195369',
  thumbnail: `http://event.assemblee-nationale.fr/Datas/an/${ID}/files/Vignette MI.jpg`,
  published: true,
  description: '15h00 :<br>- Audition, ouverte à la presse, de Mme Mickaëlle Paty<br>',
  video_type: 'C',
  commission: 'PROTECEDUC',
  title: 'Renforcer la protection des personnels éducatifs',
  url: `/${ID}`,
  ...over
})

describe('xml', () => {
  it('reads elements, attributes, text and entities, skipping comments and declarations', () => {
    const root = parseXml('﻿<?xml version="1.0"?><!-- c --><a x="1 &amp; 2" y=\'a>b\'><b>t&#233;l&#xE9;</b><c/><![CDATA[<raw>]]></a>')
    expect(root.tag).toBe('a')
    expect(root.attrs).toEqual({ x: '1 & 2', y: 'a>b' })
    expect(textOf(root)).toBe('télé<raw>')
    expect(decodeEntities('&lt;&unknown;&#x1F600;')).toBe('<&unknown;😀')
  })

  it('refuses what is not XML', () => {
    expect(() => parseXml('<a><b></a>')).toThrow()
    expect(() => parseXml('<a>')).toThrow(/Unclosed/)
    expect(() => parseXml('plain text')).toThrow(/Empty/)
  })
})

describe('videos', () => {
  it('reads a video: chapters with their timecodes and speakers, its meetings, its stream', async () => {
    const http = fakeHttp({
      [`${ROOT}/content/data.nvs`]: DATA_NVS,
      [`${ROOT}/content/finalplayer.nvs`]: PLAYER_NVS,
      [`${ROOT}/meta-files/vodalys.smil`]: SMIL
    })
    const v = await videoDetail(http, ID)
    expect(v).toMatchObject({
      id: ID,
      chamber: 'an',
      offsetMs: 0,
      title: 'Renforcer la protection des personnels éducatifs : Mme Mickaëlle Paty',
      date: new Date(1793195369 * 1000).toISOString(),
      type: 'commission',
      organ: 'Protection des personnels éducatifs (mission)',
      meetingIds: ['RUANR5L17S2027IDC461515', 'RUANR5L17S2027IDC461516'],
      durationMs: 11484000,
      hls: 'https://videos-an.vodalys.com/videos/definst/mp4/ida/domain1/2026/10/debr_20261028144930.smil/master.m3u8',
      mirrors: [],
      live: false,
      clockStart: 1793195369000,
      channel: '',
      thumbnail: `${ROOT}/files/Vignette%20MI.jpg`,
      url: `https://videos.assemblee-nationale.fr/video.${ID}`
    })
    expect(v.chapters).toEqual([
      { id: '19640896', title: 'Audition de Mme Mickaëlle Paty', depth: 0, timecode: 794540 },
      { id: '19640898', title: 'Mme Anne Genetet, présidente', depth: 1, timecode: 803810, speaker: 'Mme Anne Genetet', member: 'PA721024' },
      { id: '19640900', title: 'Mme Mickaëlle Paty', depth: 1, timecode: 1011950, speaker: 'Mme Mickaëlle Paty' },
      { id: '19649999', title: 'Non horodaté', depth: 0, timecode: null }
    ])
    expect(v.speakers).toEqual([{ name: 'Mme Mickaëlle Paty' }, { name: 'Mme Anne Genetet', member: 'PA721024' }])
  })

  it('has no stream while the portal is still processing the recording', async () => {
    const http = fakeHttp({ [`${ROOT}/content/data.nvs`]: DATA_NVS })
    const v = await videoDetail(http, ID)
    expect(v.hls).toBe('')
    expect(v.durationMs).toBe(0)
    expect(v.chapters.every((c) => c.timecode === null)).toBe(true)
  })

  it('searches a period: one entry per video, the passage of a speaker hit, words of the title', async () => {
    const http = fakeHttp({
      'https://videos.assemblee-nationale.fr/php/eventsearch.php': `﻿${JSON.stringify([
        item({ url: `/${ID}?timecode=803810` }),
        item({ url: `/${ID}?timecode=1782770` }),
        item({ mediaId: '1', url: '/19640983_6ae1fde90bfa0', title: 'Maillage scolaire', commission: 'MASCO' }),
        item({ mediaId: '2', url: '/19640000_6ae1fd000000a', published: false })
      ])}`
    })
    const found = await searchVideos(http, { from: '2026-10-20', to: '2026-10-28', type: 'commission', speaker: 'Genetet Anne' })
    expect(http.asked[0]).toContain('Date=20%2F10%2F2026-28%2F10%2F2026')
    expect(http.asked[0]).toContain('Intervenant=Genetet+Anne')
    expect(http.asked[0]).toContain('TypeVideo=Commission')
    expect(found.map((v) => [v.id, v.timecode, v.url])).toEqual([
      [ID, 803810, `https://videos.assemblee-nationale.fr/video.${ID}?timecode=803810`],
      ['19640983_6ae1fde90bfa0', undefined, 'https://videos.assemblee-nationale.fr/video.19640983_6ae1fde90bfa0']
    ])
    expect(found[0]).toMatchObject({
      chamber: 'an',
      type: 'commission',
      kind: 'commission',
      commission: 'PROTECEDUC',
      description: '15h00 :\nAudition, ouverte à la presse, de Mme Mickaëlle Paty',
      thumbnail: `${ROOT}/files/Vignette%20MI.jpg`
    })
    expect((await searchVideos(http, { from: '2026-10-28', to: '2026-10-28', text: 'PROTECTION educatifs' })).map((v) => v.id)).toEqual([ID])
    expect(http.asked[1]).toBe('https://videos.assemblee-nationale.fr/php/eventsearch.php?Date=28%2F10%2F2026')
  })

  it('reads the live streams: live now, and announced for later', async () => {
    const http = fakeHttp({
      'https://www.assemblee-nationale.fr/dyn/api/live/streams': JSON.stringify({
        diffusions: [
          {
            isLive: true,
            reunionUid: 'RUANR5L17S2027IDS30966',
            organeLibelle: 'Séance publique',
            debutDateTime: '2026-10-28 14:00:00',
            debutDateTimeLibelle: 'mercredi 28 octobre 2026 à 14h00',
            sujet: '- Questions au Gouvernement<br>- Suite de la discussion du projet de loi de finances<br>',
            liveUrl: 'https://videos.assemblee-nationale.fr/live/live36/playlist36.m3u8',
            posterUrl: 'https://videos.assemblee-nationale.fr/live/images/14000000.jpg',
            lieu: 'Assemblée nationale',
            titre: ''
          },
          {
            isLive: false,
            reunionUid: 'RUANR5L17S2027IDS31005',
            organeLibelle: 'Séance publique',
            debutDateTime: '2026-10-28 21:30:00',
            debutDateTimeLibelle: 'mercredi 28 octobre 2026 à 21h30',
            sujet: 'Suite de la discussion',
            liveUrl: 'https://videos.assemblee-nationale.fr/live/live36/playlist36.m3u8',
            posterUrl: ''
          }
        ]
      })
    })
    const now = await liveStreams(http)
    expect(now).toEqual([
      {
        id: 'RUANR5L17S2027IDS30966',
        chamber: 'an',
        organ: 'Séance publique',
        start: 'mercredi 28 octobre 2026 à 14h00',
        startAt: '2026-10-28T14:00:00+01:00',
        title: '',
        subject: 'Questions au Gouvernement ; Suite de la discussion du projet de loi de finances',
        place: 'Assemblée nationale',
        live: true,
        // Not on the portal (yet): the API's sliding stream, the portal's live page.
        hls: 'https://videos.assemblee-nationale.fr/live/live36/playlist36.m3u8',
        mirrors: [],
        poster: 'https://videos.assemblee-nationale.fr/live/images/14000000.jpg',
        url: 'https://videos.assemblee-nationale.fr/direct.php',
        channel: '36'
      }
    ])
    expect((await liveStreams(http, true)).map((s) => [s.id, s.live])).toEqual([
      ['RUANR5L17S2027IDS30966', true],
      ['RUANR5L17S2027IDS31005', false]
    ])
  })

  it('cleans the portal’s snippets and images', () => {
    expect(htmlLines('15h00 :<br>- Audition<br/>&nbsp;<b>Examen</b>\r\n')).toEqual(['15h00 :', 'Audition', 'Examen'])
    expect(portalImage('http://event.assemblee-nationale.fr/Datas/an/1_a/files/Une%20image.jpg')).toBe(
      'https://videos.assemblee-nationale.fr/Datas/an/1_a/files/Une%20image.jpg'
    )
    expect(portalImage('http://videos.assemblee-nationale.fr/live/images/1.jpg')).toBe('https://videos.assemblee-nationale.fr/live/images/1.jpg')
    expect(portalImage(null)).toBe('')
  })
})

// A sitting on air (30 Oct 2026, 1re séance, channel 36), shortened from the portal's files; then the same video recorded.
const LIVE_ID = '19655971_6ae44b8fc51ef'
const LIVE_ROOT = `https://videos.assemblee-nationale.fr/Datas/an/${LIVE_ID}`
const ON_AIR = Date.parse('2026-10-30T11:00:00+01:00')

const liveData = (status: string) => `<?xml version="1.0"?>
<data id="19655971" interfaceuid="${LIVE_ID}" lang="" status="${status}" mediatitle="1&#xE8;re s&#xE9;ance : Projet de loi de finances pour 2027 (suite)">
  <chapters>
    <chapter id="19656057" label="PROJET DE LOI DE FINANCES POUR 2027 (suite)">
      <chapter id="19656071" label="Discussion des articles">
        <chapter id="19656193" label="Article 17 (examen prioritaire)">
          <chapter id="19656211" label="M. Daniel Labaronne"><speaker id="19656497"/></chapter>
        </chapter>
        <chapter id="19656900" label="Article 19 (examen prioritaire)"/>
      </chapter>
    </chapter>
  </chapters>
  <files>
    <file id="19655980" title="live" url="http://anorigin.vodalys.com/live/live36/index36_19655971.m3u8?DVR"/>
  </files>
  <metadatas>
    <metadata name="date" value="1793346447"/>
    <metadata name="video_type" value="S" label="S&#xE9;ance publique"/>
    <metadata name="place" value="H&#xE9;micycle"/>
    <metadata name="stream" value="hemi" label="ida36"/>
    <metadata name="meeting_id" value="RUANR5L17S2027IDS31006"/>
    <metadata name="Thumbnail" value="mediafiles://this/s&#xE9;ance PLF 2027.jpg"/>
  </metadatas>
  <speakers>
    <speaker id="19656497"><name>M. Daniel Labaronne</name><role/><url>719798</url></speaker>
  </speakers>
</data>`

const LIVE_SMIL = `<smil>
  <head>
    <meta base="http://anorigin.vodalys.com/live"/>
  </head>
  <body>
    <video src="live36/index36_19655971.m3u8?DVR"/>
  </body>
</smil>`

const LIVE_PLAYER = `<?xml version="1.0"?>
<player id="19655981" starttime="1793346447">
  <synchro nid="19656347" id="19656057" timecode="767290"/>
  <synchro nid="19656353" id="19656071" timecode="773150"/>
  <synchro nid="19656494" id="19656193" timecode="4250960"/>
  <synchro nid="19656498" id="19656211" timecode="4250970"/>
</player>`

const RECORDED_SMIL = `<smil><head><meta base="rtmp://vipwowza.yacast.net/assembleenationale"/></head><body><video src="mp4/ida/mp4:domain1/2026/10/hemi_20261030084727_1.mp4"/></body></smil>`

const FINAL_PLAYER = `<?xml version="1.0"?>
<player endtime="15283000">
  <synchro id="1965597100000" timecode="0"/>
  <synchro id="19656057" timecode="767290"/>
  <synchro id="19656071" timecode="773150"/>
  <synchro id="19656193" timecode="4250960"/>
  <synchro id="19656211" timecode="4250970"/>
</player>`

const LIVE_ITEM = item({
  mediaId: '19655971',
  date: '1793346447',
  video_type: 'S',
  commission: null,
  title: '1ère séance : Projet de loi de finances pour 2027 (suite)',
  description: '- Suite de la discussion du projet de loi de finances pour 2027 (première partie)<br>',
  thumbnail: `http://event.assemblee-nationale.fr/Datas/an/${LIVE_ID}/files/séance PLF 2027.jpg`,
  url: `/${LIVE_ID}`
})

const API_LIVE = {
  flux: '36',
  isLive: true,
  // The API names the day's first sitting, not the one on air.
  reunionUid: 'RUANR5L17S2027IDS30972',
  organeLibelle: 'Séance publique',
  debutDateTime: '2026-10-30 09:00:00',
  debutDateTimeLibelle: 'vendredi 30 octobre 2026 à 09h00',
  sujet: '- Suite de la discussion du projet de loi de finances pour 2027 (première partie)<br>',
  liveUrl: 'https://videos.assemblee-nationale.fr/live/live36/playlist36.m3u8',
  posterUrl: 'https://videos.assemblee-nationale.fr/live/images/14000000.jpg',
  lieu: 'Assemblée nationale',
  titre: ''
}

/** Today's portal: the sitting on air, and a hearing of the morning already recorded. */
const portalToday = (api: unknown) =>
  fakeHttp({
    'https://www.assemblee-nationale.fr/dyn/api/live/streams': JSON.stringify(api),
    'https://videos.assemblee-nationale.fr/php/eventsearch.php': `﻿${JSON.stringify([LIVE_ITEM, item({ date: '1793340000' })])}`,
    [`${LIVE_ROOT}/content/data.nvs`]: liveData('live'),
    [`${LIVE_ROOT}/meta-files/vodalys.smil`]: LIVE_SMIL,
    [`${ROOT}/content/data.nvs`]: DATA_NVS,
    [`${ROOT}/meta-files/vodalys.smil`]: SMIL
  })

describe('a live at the Assemblée', () => {
  it('reads a live smil as the whole sitting so far, on the origin and its mirror', () => {
    expect(readSmil(LIVE_SMIL)).toEqual({
      hls: 'https://anorigin.vodalys.com/live/live36/index36_19655971.m3u8',
      mirrors: ['https://assemblee-nationale.akamaized.net/live/live36/index36_19655971.m3u8'],
      live: true,
      channel: '36'
    })
    expect(readSmil(SMIL)).toEqual({
      hls: 'https://videos-an.vodalys.com/videos/definst/mp4/ida/domain1/2026/10/debr_20261028144930.smil/master.m3u8',
      mirrors: [],
      live: false,
      channel: ''
    })
    expect(readSmil('').hls).toBe('')
  })

  it('reads a video on air: its DVR stream, its status, its timed chapters so far, its clock, its meeting', async () => {
    const http = fakeHttp({
      [`${LIVE_ROOT}/content/data.nvs`]: liveData('live'),
      [`${LIVE_ROOT}/meta-files/vodalys.smil`]: LIVE_SMIL,
      [`${LIVE_ROOT}/content/liveplayer.nvs`]: LIVE_PLAYER
    })
    const v = await videoDetail(http, LIVE_ID)
    expect(v).toMatchObject({
      id: LIVE_ID,
      live: true,
      hls: 'https://anorigin.vodalys.com/live/live36/index36_19655971.m3u8',
      mirrors: ['https://assemblee-nationale.akamaized.net/live/live36/index36_19655971.m3u8'],
      channel: '36',
      clockStart: 1793346447000,
      offsetMs: 0,
      durationMs: 0,
      type: 'séance publique',
      meetingIds: ['RUANR5L17S2027IDS31006'],
      url: `https://videos.assemblee-nationale.fr/video.${LIVE_ID}`
    })
    // Article 19 isn't reached yet: left out.
    expect(v.chapters.map((c) => [c.id, c.depth, c.timecode])).toEqual([
      ['19656057', 0, 767290],
      ['19656071', 1, 773150],
      ['19656193', 2, 4250960],
      ['19656211', 3, 4250970]
    ])
    expect(v.chapters[3]).toMatchObject({ speaker: 'M. Daniel Labaronne', member: 'PA719798' })
  })

  it('plays the live file of its data.nvs when its smil is missing', async () => {
    const http = fakeHttp({ [`${LIVE_ROOT}/content/data.nvs`]: liveData('live') })
    const v = await videoDetail(http, LIVE_ID)
    expect([v.live, v.hls, v.chapters.length]).toEqual([true, 'https://anorigin.vodalys.com/live/live36/index36_19655971.m3u8', 5])
    expect(v.chapters.every((c) => c.timecode === null)).toBe(true)
  })

  it('is the recording under the same id once over, and nothing to play in between', async () => {
    const recorded = await videoDetail(
      fakeHttp({
        [`${LIVE_ROOT}/content/data.nvs`]: liveData('vod'),
        [`${LIVE_ROOT}/meta-files/vodalys.smil`]: RECORDED_SMIL,
        [`${LIVE_ROOT}/content/finalplayer.nvs`]: FINAL_PLAYER
      }),
      LIVE_ID
    )
    expect(recorded).toMatchObject({
      live: false,
      hls: 'https://videos-an.vodalys.com/videos/definst/mp4/ida/domain1/2026/10/hemi_20261030084727.smil/master.m3u8',
      mirrors: [],
      channel: '36',
      clockStart: 1793346447000,
      durationMs: 15283000
    })
    // Recorded: the chapters not timed are kept, as before.
    expect(recorded.chapters.map((c) => c.timecode)).toEqual([767290, 773150, 4250960, 4250970, null])
    // Over, the DVR gone, the recording not ready: being processed.
    const between = await videoDetail(
      fakeHttp({ [`${LIVE_ROOT}/content/data.nvs`]: liveData('vod'), [`${LIVE_ROOT}/meta-files/vodalys.smil`]: LIVE_SMIL }),
      LIVE_ID
    )
    expect([between.live, between.hls, between.channel]).toEqual([false, '', '36'])
  })

  it('finds the portal video of a live by its channel, not by the meeting the API names', async () => {
    const http = portalToday({
      diffusions: [
        API_LIVE,
        {
          ...API_LIVE,
          flux: '12',
          reunionUid: 'RUANR5L17S2027IDC1',
          organeLibelle: 'Commission des finances',
          liveUrl: 'https://videos.assemblee-nationale.fr/live/live12/playlist12.m3u8'
        }
      ]
    })
    const [sitting, committee] = await liveStreams(http, false, ON_AIR)
    expect(http.asked.find((u) => u.includes('eventsearch'))).toMatch(/Date=30%2F10%2F2026(&|$)/)
    expect(sitting).toMatchObject({
      id: 'RUANR5L17S2027IDS30972',
      live: true,
      video: LIVE_ID,
      channel: '36',
      meeting: 'RUANR5L17S2027IDS31006',
      hls: 'https://anorigin.vodalys.com/live/live36/index36_19655971.m3u8',
      mirrors: ['https://assemblee-nationale.akamaized.net/live/live36/index36_19655971.m3u8'],
      url: `https://videos.assemblee-nationale.fr/video.${LIVE_ID}`,
      poster: 'https://videos.assemblee-nationale.fr/live/images/14000000.jpg'
    })
    // No video of its channel on the portal: the API's stream and the portal's live page.
    expect(committee).toMatchObject({
      channel: '12',
      hls: 'https://videos.assemblee-nationale.fr/live/live12/playlist12.m3u8',
      url: 'https://videos.assemblee-nationale.fr/direct.php'
    })
    expect(committee.video).toBeUndefined()
  })

  it('finds a live on the portal when the API lists nothing, or doesn’t answer', async () => {
    const expected = {
      id: 'RUANR5L17S2027IDS31006',
      chamber: 'an',
      organ: 'Séance publique',
      start: 'vendredi 30 octobre 2026 à 08h47',
      startAt: '2026-10-30T08:47:27+01:00',
      title: '1ère séance : Projet de loi de finances pour 2027 (suite)',
      subject: 'Suite de la discussion du projet de loi de finances pour 2027 (première partie)',
      place: 'Hémicycle',
      live: true,
      hls: 'https://anorigin.vodalys.com/live/live36/index36_19655971.m3u8',
      mirrors: ['https://assemblee-nationale.akamaized.net/live/live36/index36_19655971.m3u8'],
      poster: `${LIVE_ROOT}/files/s%C3%A9ance%20PLF%202027.jpg`,
      url: `https://videos.assemblee-nationale.fr/video.${LIVE_ID}`,
      video: LIVE_ID,
      channel: '36',
      meeting: 'RUANR5L17S2027IDS31006'
    }
    expect(await liveStreams(portalToday({ diffusions: [] }), false, ON_AIR)).toEqual([expected])
    const down = fakeHttp({
      'https://videos.assemblee-nationale.fr/php/eventsearch.php': `﻿${JSON.stringify([LIVE_ITEM])}`,
      [`${LIVE_ROOT}/content/data.nvs`]: liveData('live'),
      [`${LIVE_ROOT}/meta-files/vodalys.smil`]: LIVE_SMIL
    })
    expect(await liveStreams(down, false, ON_AIR)).toEqual([expected])
    await expect(liveStreams(fakeHttp({}), false, ON_AIR)).rejects.toThrow(/404/)
  })

  it('takes, for an announced broadcast, the live that names its meeting; leaves a video whose data.nvs says it is over', async () => {
    const announced = { ...API_LIVE, isLive: false, reunionUid: 'RUANR5L17S2027IDS31006' }
    const [s] = await liveStreams(portalToday({ diffusions: [announced] }), false, ON_AIR)
    expect([s.live, s.video, s.id]).toEqual([true, LIVE_ID, 'RUANR5L17S2027IDS31006'])
    const over = fakeHttp({
      'https://www.assemblee-nationale.fr/dyn/api/live/streams': '{"diffusions":[]}',
      'https://videos.assemblee-nationale.fr/php/eventsearch.php': JSON.stringify([LIVE_ITEM]),
      [`${LIVE_ROOT}/content/data.nvs`]: liveData('vod'),
      [`${LIVE_ROOT}/meta-files/vodalys.smil`]: LIVE_SMIL
    })
    expect(await liveStreams(over, false, ON_AIR)).toEqual([])
  })

  it('gives the channel’s live to the broadcast on air, whichever the API lists first', async () => {
    // Announced, for the meeting the portal's live names: the API is late, or the sitting started early.
    const announced = { ...API_LIVE, isLive: false, reunionUid: 'RUANR5L17S2027IDS31006', debutDateTime: '2026-10-30 15:00:00' }
    for (const diffusions of [
      [announced, API_LIVE],
      [API_LIVE, announced]
    ]) {
      const streams = await liveStreams(portalToday({ diffusions }), true, ON_AIR)
      const onAir = streams.find((s) => s.id === API_LIVE.reunionUid)
      const later = streams.find((s) => s.id === announced.reunionUid)
      expect(onAir).toMatchObject({ live: true, video: LIVE_ID, meeting: 'RUANR5L17S2027IDS31006', hls: readSmil(LIVE_SMIL).hls })
      expect([later?.live, later?.video]).toEqual([false, undefined])
      // One hémicycle, one live.
      expect(streams.filter((s) => s.live)).toHaveLength(1)
    }
  })

  it('finds the hémicycle’s live from the portal’s live page while the search doesn’t list it yet', async () => {
    const http = fakeHttp({
      'https://www.assemblee-nationale.fr/dyn/api/live/streams': '{"diffusions":[]}',
      'https://videos.assemblee-nationale.fr/php/eventsearch.php': '[]',
      // direct.php leads to "direct.<id>", whose page names the video.
      'https://videos.assemblee-nationale.fr/direct.php': `<html><a href="/video.${LIVE_ID}">la vidéo</a></html>`,
      [`${LIVE_ROOT}/content/data.nvs`]: liveData('live'),
      [`${LIVE_ROOT}/meta-files/vodalys.smil`]: LIVE_SMIL
    })
    const [s] = await liveStreams(http, false, ON_AIR)
    expect(s).toMatchObject({
      live: true,
      video: LIVE_ID,
      organ: 'Séance publique',
      title: '1ère séance : Projet de loi de finances pour 2027 (suite)',
      hls: 'https://anorigin.vodalys.com/live/live36/index36_19655971.m3u8'
    })
  })

  it('looks at yesterday’s videos too after midnight', async () => {
    const http = portalToday({ diffusions: [] })
    await liveStreams(http, false, Date.parse('2026-10-31T00:30:00+01:00'))
    expect(http.asked.find((u) => u.includes('eventsearch'))).toContain('Date=30%2F10%2F2026-31%2F10%2F2026')
  })

  it('asks whether a video is live until it is known to be a recording: it won’t be live again', async () => {
    const http = portalToday({ diffusions: [] })
    const smils = (root: string) => http.asked.filter((u) => u === `${root}/meta-files/vodalys.smil`).length
    await liveStreams(http, false, ON_AIR)
    await liveStreams(http, false, ON_AIR)
    // The morning's hearing, recorded: once. The sitting on air: at each look.
    expect([smils(ROOT), smils(LIVE_ROOT)]).toEqual([1, 2])
    // A recording seen in its page isn't asked by the look for lives either.
    const opened = portalToday({ diffusions: [] })
    await videoDetail(opened, ID)
    await liveStreams(opened, false, ON_AIR)
    expect(opened.asked.filter((u) => u === `${ROOT}/meta-files/vodalys.smil`)).toHaveLength(1)
    // Unless the portal's live page leads to it: that one is asked whatever was known of it.
    const led = fakeHttp({
      'https://www.assemblee-nationale.fr/dyn/api/live/streams': '{"diffusions":[]}',
      'https://videos.assemblee-nationale.fr/php/eventsearch.php': '[]',
      'https://videos.assemblee-nationale.fr/direct.php': `<a href="/video.${ID}">`,
      [`${ROOT}/meta-files/vodalys.smil`]: SMIL
    })
    await liveStreams(led, false, ON_AIR)
    await liveStreams(led, false, ON_AIR)
    expect(led.asked.filter((u) => u === `${ROOT}/meta-files/vodalys.smil`)).toHaveLength(2)
  })

  it('asks the portal’s live page along with its search, not once the search has answered', async () => {
    const portal = portalToday({ diffusions: [] })
    let answer = () => {}
    const searched = new Promise<void>((resolve) => (answer = resolve))
    // The search answers when the test says.
    const http = {
      async text(url: string) {
        if (url.includes('eventsearch')) await searched
        return portal.text(url)
      }
    }
    const lives = portalLives(http, ON_AIR)
    expect(portal.asked).toEqual(['https://videos.assemblee-nationale.fr/direct.php'])
    answer()
    expect((await lives).map((l) => l.item.id)).toEqual([LIVE_ID])
  })
})

const SENATE_ID = '5979506_6ae25732cc856'
const SENATE_ROOT = `https://videos.senat.fr/Datas/senat/${SENATE_ID}`
const SENATE_SEARCH = 'https://videos.senat.fr/senat_function.php'

const senateItem = (over: Partial<RawSenateItem>): RawSenateItem => ({
  nid: '5979506',
  date: '1793219400',
  live: false,
  thumbnail: `https://videos.senat.fr/Datas/senat/${SENATE_ID}/files/11011.jpg`,
  published: true,
  videotype: 'DG',
  description: ['Projet de loi', 'Protection des enfants', '(Discussion des articles - suite)'],
  commission: null,
  title: 'Séance publique du 28 octobre 2026 (soir)',
  url: `/${SENATE_ID}`,
  duration: 10063,
  ...over
})

describe('the Sénat’s videos', () => {
  it('reads a video: chapters, speakers with their matricule, the stream of its player, and where it starts', async () => {
    const http = fakeHttp({
      [`${SENATE_ROOT}/content/data.nvs`]: `<data id="5979506" mediatitle="S&#xE9;ance publique du 28 octobre 2026 (soir)"><chapters><chapter id="1" label="Projet de loi&#10;Protection des enfants"><chapter id="2" label="Mme Marie-Claude Varaillas"><speaker id="9"/></chapter></chapter></chapters><speakers><speaker id="9"><name>VARAILLAS Marie-Claude</name><role>Sénateur</role><url>20046A</url></speaker></speakers></data>`,
      [`${SENATE_ROOT}/content/finalplayer.nvs`]:
        '<player sessionstart="1793218519" endtime="11011000" starttime="948000"><synchro id="1" timecode="948000"/><synchro id="2" timecode="1041000"/></player>',
      [`https://videos.senat.fr/iframe.${SENATE_ID}`]:
        '<video><source src="https://vodsenat.akamaized.net/senat/2026/10/encoder1_20261028211515_1.mp4/master.m3u8?embed=true&amp;wowzaplaystart=948000" type="application/x-mpegURL"></video>'
    })
    const v = await senateVideoDetail(http, SENATE_ID)
    expect(v).toMatchObject({
      id: SENATE_ID,
      chamber: 'se',
      title: 'Séance publique du 28 octobre 2026 (soir)',
      date: new Date(1793218519 * 1000).toISOString(),
      durationMs: 11011000,
      offsetMs: 948000,
      hls: 'https://vodsenat.akamaized.net/senat/2026/10/encoder1_20261028211515_1.mp4/master.m3u8?embed=true&wowzaplaystart=948000',
      url: `https://videos.senat.fr/video.${SENATE_ID}`
    })
    expect(v.chapters).toEqual([
      { id: '1', title: 'Projet de loi · Protection des enfants', depth: 0, timecode: 948000 },
      { id: '2', title: 'Mme Marie-Claude Varaillas', depth: 1, timecode: 1041000, speaker: 'VARAILLAS Marie-Claude', member: '20046A' }
    ])
  })

  it('searches a period of its portal: sittings, committees, questions to the Government told by their title', async () => {
    const http = fakeHttp({
      [SENATE_SEARCH]: JSON.stringify([
        senateItem({}),
        senateItem({ nid: '1', url: '/5979001_6ae2000000001', videotype: 'AC', title: 'Masculinismes : audition de Léa Clermont-Dion', description: null }),
        senateItem({ nid: '2', url: '/5979002_6ae2000000002', title: 'Questions d’actualité au Gouvernement du 28 octobre 2026' }),
        senateItem({ nid: '3', url: '/5979003_6ae2000000003', published: false })
      ])
    })
    const found = await searchSenateVideos(http, { from: '2026-10-28', to: '2026-10-28' })
    expect(http.asked[0]).toContain('period=custom')
    expect(http.asked[0]).toContain('begin=28%2F10%2F2026')
    expect(found.map((v) => [v.id, v.kind, v.type])).toEqual([
      [SENATE_ID, 'seance', 'séance publique'],
      ['5979001_6ae2000000001', 'commission', 'commission'],
      ['5979002_6ae2000000002', 'questions', 'questions d’actualité au gouvernement']
    ])
    expect(found[0]).toMatchObject({
      chamber: 'se',
      durationMs: 10063000,
      description: 'Projet de loi · Protection des enfants · (Discussion des articles - suite)'
    })
    expect((await searchSenateVideos(http, { from: '2026-10-28', to: '2026-10-28', type: 'questions' })).map((v) => v.id)).toEqual(['5979002_6ae2000000002'])
  })

  it('finds what is live, with its stream', async () => {
    const http = fakeHttp({
      [SENATE_SEARCH]: JSON.stringify([
        senateItem({ live: true, title: 'Séance publique du 29 octobre 2026 (après-midi)' }),
        senateItem({ nid: '1', url: '/5979001_6ae2000000001' })
      ]),
      [`https://videos.senat.fr/iframe.${SENATE_ID}`]:
        '<source src="https://livesenat.akamaized.net/hls/live/2036979/senat1/playlist-archive.m3u8?startTime=1793279709" type="application/x-mpegURL">'
    })
    expect(await senateLive(http)).toEqual([
      expect.objectContaining({
        id: SENATE_ID,
        chamber: 'se',
        organ: 'Séance publique',
        live: true,
        hls: 'https://livesenat.akamaized.net/hls/live/2036979/senat1/playlist-archive.m3u8?startTime=1793279709',
        mirrors: [],
        video: SENATE_ID,
        channel: 'senat1'
      })
    ])
  })

  it('reads a video on air: its live stream, the chapters its live player times, where its stream starts', async () => {
    // Inferred from a recording's files: no live of the Sénat to check against.
    const SENATE_LIVE_DATA = `<data id="5979506" status="live" mediatitle="S&#xE9;ance publique du 29 octobre 2026 (soir)"><chapters><chapter id="1" label="Projet de loi&#10;Protection des enfants"><chapter id="2" label="Mme Marie-Claude Varaillas"><speaker id="9"/></chapter><chapter id="3" label="M. Jean Dupont"/></chapter></chapters><files><file id="8" title="live" url="https://livesenat.akamaized.net/hls/live/2036979/senat1/playlist-archive.m3u8?startTime=1793304912"/></files><metadatas><metadata name="date" value="1793305800"/></metadatas><speakers><speaker id="9"><name>VARAILLAS Marie-Claude</name><url>20046A</url></speaker></speakers></data>`
    const http = fakeHttp({
      [`${SENATE_ROOT}/content/data.nvs`]: SENATE_LIVE_DATA,
      [`${SENATE_ROOT}/content/liveplayer.nvs`]:
        '<player id="5981490" starttime="1793304911" cdndelay="-3"><synchro nid="5" id="1" timecode="838000"/><synchro nid="6" id="2" timecode="908000"/></player>',
      [`https://videos.senat.fr/iframe.${SENATE_ID}`]:
        '<source src="https://livesenat.akamaized.net/hls/live/2036979/senat1/playlist-archive.m3u8?startTime=1793304912" type="application/x-mpegURL">'
    })
    const v = await senateVideoDetail(http, SENATE_ID)
    expect(v).toMatchObject({
      live: true,
      hls: 'https://livesenat.akamaized.net/hls/live/2036979/senat1/playlist-archive.m3u8?startTime=1793304912',
      channel: 'senat1',
      // Its stream starts a second after the moment its live player counts from.
      offsetMs: 1000,
      clockStart: 1793304912000,
      durationMs: 0
    })
    expect(v.chapters.map((c) => [c.id, c.timecode])).toEqual([
      ['1', 838000],
      ['2', 908000]
    ])
    // Its player page down: the live file of its data.nvs.
    const fallback = await senateVideoDetail(fakeHttp({ [`${SENATE_ROOT}/content/data.nvs`]: SENATE_LIVE_DATA }), SENATE_ID)
    expect([fallback.live, fallback.hls]).toEqual([true, 'https://livesenat.akamaized.net/hls/live/2036979/senat1/playlist-archive.m3u8?startTime=1793304912'])
  })

  it('searches both portals, newest first, and goes on when one of them fails', async () => {
    const http = fakeHttp({ [SENATE_SEARCH]: JSON.stringify([senateItem({})]) })
    expect((await searchBoth(http, { from: '2026-10-28', to: '2026-10-28' })).map((v) => v.chamber)).toEqual(['se'])
    await expect(searchBoth(fakeHttp({}), { from: '2026-10-28', to: '2026-10-28' })).rejects.toThrow(/404/)
  })
})

describe('time', () => {
  it('writes Paris times with their offset, winter and summer', () => {
    expect(parisIso('2026-10-28 14:00:00')).toBe('2026-10-28T14:00:00+01:00')
    expect(parisIso('2026-06-10 09:30')).toBe('2026-06-10T09:30:00+02:00')
    expect(toParis(new Date(1793346447000))).toBe('2026-10-30T08:47:27+01:00')
    expect(toParis(new Date('2026-06-10T07:30:00Z'))).toBe('2026-06-10T09:30:00+02:00')
    expect(parisDateTime('2026-10-30T07:47:27Z')).toBe('vendredi 30 octobre 2026 à 08h47')
  })

  it('reads and writes positions in a video', () => {
    expect(clock(3_735_000)).toBe('1:02:15')
    expect(clock(245_000)).toBe('4:05')
    expect(parseClock('1:02:15')).toBe(3_735_000)
    expect(parseClock('4:05')).toBe(245_000)
    expect(parseClock('quatre')).toBeNaN()
    expect(parseClock('')).toBeNaN()
  })
})
