import { describe, expect, it } from 'vitest'
import { clock, parisIso, parseClock } from '../src/time'
import { htmlLines, liveStreams, portalImage, searchVideos, videoDetail, type RawItem } from '../src/videos'
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
    const v = await videoDetail(http, `https://videos.assemblee-nationale.fr/video.${ID}?timecode=958000`)
    expect(v).toMatchObject({
      id: ID,
      title: 'Renforcer la protection des personnels éducatifs : Mme Mickaëlle Paty',
      date: new Date(1793195369 * 1000).toISOString(),
      type: 'commission',
      organ: 'Protection des personnels éducatifs (mission)',
      meetingIds: ['RUANR5L17S2027IDC461515', 'RUANR5L17S2027IDC461516'],
      durationMs: 11484000,
      hls: 'https://videos-an.vodalys.com/videos/definst/mp4/ida/domain1/2026/10/debr_20261028144930.smil/master.m3u8',
      thumbnail: `${ROOT}/files/Vignette%20MI.jpg`,
      url: `https://videos.assemblee-nationale.fr/video.${ID}`
    })
    expect(v.chapters).toEqual([
      { id: '19640896', title: 'Audition de Mme Mickaëlle Paty', depth: 0, timecode: 794540 },
      { id: '19640898', title: 'Mme Anne Genetet, présidente', depth: 1, timecode: 803810, speaker: 'Mme Anne Genetet', deputy: 'PA721024' },
      { id: '19640900', title: 'Mme Mickaëlle Paty', depth: 1, timecode: 1011950, speaker: 'Mme Mickaëlle Paty' },
      { id: '19649999', title: 'Non horodaté', depth: 0, timecode: null }
    ])
    expect(v.speakers).toEqual([{ name: 'Mme Mickaëlle Paty' }, { name: 'Mme Anne Genetet', deputy: 'PA721024' }])
  })

  it('has no stream while the portal is still processing the recording', async () => {
    const http = fakeHttp({ [`${ROOT}/content/data.nvs`]: DATA_NVS })
    const v = await videoDetail(http, ID)
    expect(v.hls).toBe('')
    expect(v.durationMs).toBe(0)
    expect(v.chapters.every((c) => c.timecode === null)).toBe(true)
    await expect(videoDetail(http, 'pas une vidéo')).rejects.toThrow(/vidéo/)
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
      type: 'commission',
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
        meetingId: 'RUANR5L17S2027IDS30966',
        organ: 'Séance publique',
        start: 'mercredi 28 octobre 2026 à 14h00',
        startAt: '2026-10-28T14:00:00+01:00',
        title: '',
        subject: 'Questions au Gouvernement ; Suite de la discussion du projet de loi de finances',
        place: 'Assemblée nationale',
        live: true,
        hls: 'https://videos.assemblee-nationale.fr/live/live36/playlist36.m3u8',
        poster: 'https://videos.assemblee-nationale.fr/live/images/14000000.jpg'
      }
    ])
    expect((await liveStreams(http, true)).map((s) => [s.meetingId, s.live])).toEqual([
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

describe('time', () => {
  it('writes Paris times with their offset, winter and summer', () => {
    expect(parisIso('2026-10-28 14:00:00')).toBe('2026-10-28T14:00:00+01:00')
    expect(parisIso('2026-06-10 09:30')).toBe('2026-06-10T09:30:00+02:00')
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
