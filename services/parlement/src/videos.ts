import { foldText } from '@marianne/sdk'
import { query, type ServiceHttp } from '@marianne/sdk/main'
import { parseVideoRef, PORTAL, SENATE_PORTAL, videoPage } from './links'
import { decodeHtml } from './senate'
import { parisIso } from './time'
import type { Chamber, LiveStream, VideoDetail, VideoItem, VideoQuery, VideoType } from './types'
import { child, children, isElement, parseXml, textOf, type XmlElement } from './xml'

/**
 * Videos of both chambers. Neither portal documents an API: this uses their own endpoints (the
 * searches behind their pages, each video's metadata and chapter files), the live streams the
 * Assemblée's site lists, and the streams of their CDNs, which allow cross-origin playback. Both
 * portals are built on the same video platform (Vodalys): a video's chapters and speakers come in
 * the same files.
 */

export type Http = Pick<ServiceHttp, 'text'>

const CDN = 'https://videos-an.vodalys.com/videos/definst'
const LIVE_API = 'https://www.assemblee-nationale.fr/dyn/api/live/streams'
const SENATE_SEARCH = `${SENATE_PORTAL}/senat_function.php`

/** The Assemblée portal's video types, by code, in French. */
export const VIDEO_TYPES: Record<string, string> = {
  S: 'séance publique',
  C: 'commission',
  QG: 'questions au gouvernement',
  P: 'présidence',
  E: 'événement',
  H: 'connaissance et histoire',
  A: 'autre'
}

const AN_KINDS: Record<string, VideoType> = { S: 'seance', C: 'commission', QG: 'questions' }

/** The Assemblée portal's search filters ("TypeVideo"). */
export const VIDEO_TYPE_FILTERS: Record<VideoType, string> = {
  seance: 'Séance publique',
  commission: 'Commission',
  questions: 'Questions au gouvernement',
  autre: 'Autre'
}

/** The Sénat portal's video types, by code: its séance publique, its committees' work… */
const SENATE_TYPES: Record<string, [string, VideoType]> = {
  DG: ['séance publique', 'seance'],
  AC: ['commission', 'commission'],
  PR: ['présidence', 'autre'],
  NE: ['actualités', 'autre'],
  EV: ['colloque', 'autre'],
  IN: ['connaître le Sénat', 'autre'],
  RI: ['relations internationales', 'autre']
}

const SENATE_FILTERS: Record<VideoType, string> = {
  seance: 'Séance publique',
  commission: 'Travaux de commission',
  questions: 'Séance publique',
  autre: ''
}

/** Questions to the Government are sittings of their own: told by their title. */
const isQuestions = (title: string) => /questions (d.actualite )?au gouvernement/i.test(foldText(title))

/** JSON from a portal, which prefixes some answers with a byte-order mark. */
async function json<T>(http: Http, url: string, cacheMs: number): Promise<T> {
  const text = await http.text(url, { cacheMs })
  try {
    return JSON.parse(text.replace(/^﻿/, '')) as T
  } catch {
    throw new Error(`Réponse illisible de ${new URL(url).host}`)
  }
}

/** The lines of the portal's HTML snippets ("- Audition…<br>- Examen…"), tags and leading dashes dropped. */
export function htmlLines(html: string | null | undefined): string[] {
  return (html ?? '')
    .split(/<br\s*\/?>|\r?\n/i)
    .map((line) =>
      decodeHtml(line.replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .replace(/^[\s\-–—•]+/, '')
        .trim()
    )
    .filter(Boolean)
}

/** The portal's images, served over https from its own host ("http://event.…/Datas/an/…" too). */
export function portalImage(url: string | null | undefined, portal = PORTAL): string {
  if (!url) return ''
  const path = url.match(/^https?:\/\/[^/]+(\/Datas\/.+)$/)?.[1]
  if (path) return `${portal}${encodePath(path)}`
  return url.replace(/^http:/, 'https:')
}

/** A path with its spaces and accents escaped, whether it came escaped or not. */
function encodePath(path: string): string {
  try {
    return encodeURI(decodeURI(path))
  } catch {
    return encodeURI(path)
  }
}

const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('/')
const fromUnix = (seconds: string | number | undefined) => (seconds && Number(seconds) ? new Date(Number(seconds) * 1000).toISOString() : '')

/** Words of a search, all of which a video's title and description must hold. */
const wordsOf = (text = '') => foldText(text).split(/\s+/).filter(Boolean)

// ---------------------------------------------------------------- the Assemblée's portal

export interface RawItem {
  mediaId: string
  date: string
  thumbnail: string | null
  published: boolean
  description: string | null
  video_type: string
  commission: string | null
  title: string
  url: string
}

/** The Assemblée's videos between two dates (YYYY-MM-DD), newest first; the portal returns at most 120. */
export async function searchVideos(http: Http, q: VideoQuery): Promise<VideoItem[]> {
  const raw = await json<RawItem[]>(
    http,
    `${PORTAL}/php/eventsearch.php${query({
      Date: q.from === q.to ? ddmmyyyy(q.from) : `${ddmmyyyy(q.from)}-${ddmmyyyy(q.to)}`,
      Intervenant: q.speaker?.trim() ?? '',
      Commission: '',
      Heure: '',
      TypeVideo: q.type ? VIDEO_TYPE_FILTERS[q.type] : '',
      Rubrique: ''
    })}`,
    120_000
  )
  const words = wordsOf(q.text)
  const seen = new Set<string>()
  return (Array.isArray(raw) ? raw : []).flatMap((v): VideoItem[] => {
    const ref = parseVideoRef(v.url ?? '')
    // One entry per video: a speaker has several hits in one sitting, the first one wins.
    if (!v.published || !ref || seen.has(ref.id)) return []
    const title = htmlLines(v.title).join(' ')
    const description = htmlLines(v.description).join('\n')
    if (!words.every((w) => foldText(`${title} ${description}`).includes(w))) return []
    seen.add(ref.id)
    return [
      {
        id: ref.id,
        chamber: 'an',
        title,
        description,
        date: fromUnix(v.date),
        type: VIDEO_TYPES[v.video_type] ?? v.video_type ?? '',
        kind: AN_KINDS[v.video_type] ?? 'autre',
        commission: v.commission ?? '',
        thumbnail: portalImage(v.thumbnail),
        durationMs: 0,
        // Speaker hits point to the passage: kept, for the player and the links.
        ...(ref.timecode ? { timecode: ref.timecode } : {}),
        url: videoPage('an', ref.id, ref.timecode)
      }
    ]
  })
}

/** Title, chapters with timecodes, speakers and the stream of one of the Assemblée's videos. */
export async function videoDetail(http: Http, id: string): Promise<VideoDetail> {
  const root = `${PORTAL}/Datas/an/${id}`
  const [data, player, smil] = await Promise.all([
    http.text(`${root}/content/data.nvs`, { cacheMs: 600_000 }).then(parseXml),
    http
      .text(`${root}/content/finalplayer.nvs`, { cacheMs: 600_000 })
      .then(parseXml)
      .catch(() => null),
    // Missing while the portal is still processing the recording.
    http.text(`${root}/meta-files/vodalys.smil`, { cacheMs: 600_000 }).catch(() => '')
  ])
  return readVideo('an', id, data, player, smil)
}

/** A video from its files: data.nvs (chapters, speakers, metadata), finalplayer.nvs (timecodes), and, at the Assemblée, vodalys.smil (the stream). */
export function readVideo(chamber: Chamber, id: string, data: XmlElement, player: XmlElement | null, stream: string): VideoDetail {
  const metadata = children(child(data, 'metadatas') ?? data, 'metadata').map((m) => m.attrs)
  const meta = (name: string) => metadata.find((m) => m.name === name)
  const timecodes = new Map((player ? children(player, 'synchro') : []).map((s) => [s.attrs.id, Number(s.attrs.timecode)]))
  // A speaker's url is their id: the Assemblée's actor number, the Sénat's matricule.
  const speakers = new Map(
    children(child(data, 'speakers') ?? data, 'speaker').map((s) => {
      const actor = textOf(child(s, 'url')).trim()
      const member = chamber === 'an' ? (/^\d+$/.test(actor) ? `PA${actor}` : '') : /^\d+[A-Z]$/i.test(actor) ? actor.toUpperCase() : ''
      return [s.attrs.id, { name: textOf(child(s, 'name')).trim(), ...(member ? { member } : {}) }]
    })
  )
  const chapters: VideoDetail['chapters'] = []
  const walk = (el: XmlElement, depth: number) => {
    for (const c of el.children.filter(isElement).filter((x) => x.tag === 'chapter')) {
      const speaker = speakers.get(child(c, 'speaker')?.attrs.id ?? '')
      const timecode = timecodes.get(c.attrs.id)
      chapters.push({
        id: c.attrs.id,
        title: (c.attrs.label ?? '').replace(/\s*\n\s*/g, ' · ').trim(),
        depth,
        timecode: timecode !== undefined && Number.isFinite(timecode) ? timecode : null,
        ...(speaker ? { speaker: speaker.name } : {}),
        ...(speaker?.member ? { member: speaker.member } : {})
      })
      walk(c, depth + 1)
    }
  }
  walk(child(data, 'chapters') ?? data, 0)
  const type = meta('video_type')
  const thumbnail = meta('Thumbnail')?.value?.match(/^mediafiles:\/\/this\/(.+)$/)?.[1]
  const portal = chamber === 'se' ? SENATE_PORTAL : PORTAL
  const folder = chamber === 'se' ? 'senat' : 'an'
  const hls =
    chamber === 'se'
      ? stream
      : (() => {
          // "mp4/ida/mp4:domain1/2026/10/x_1.mp4" → the multi-bitrate playlist next to it.
          const src = stream.match(/src="([^"]+\.mp4)"/)?.[1]?.replace('mp4:', '')
          return src ? `${CDN}/${src.replace(/_\d+\.mp4$/, '.smil')}/master.m3u8` : ''
        })()
  return {
    id,
    chamber,
    title: decodeHtml(data.attrs.mediatitle ?? '').trim(),
    date: fromUnix(meta('date')?.value ?? player?.attrs.sessionstart),
    type:
      chamber === 'se'
        ? (SENATE_TYPES[type?.value ?? '']?.[0] ?? type?.label?.toLowerCase() ?? '')
        : (VIDEO_TYPES[type?.value ?? ''] ?? type?.label?.toLowerCase() ?? ''),
    organ: meta('commission')?.label ?? '',
    meetingIds: metadata.filter((m) => m.name === 'meeting_id' && m.value).map((m) => m.value),
    durationMs: Number(player?.attrs.endtime) || 0,
    chapters,
    speakers: [...speakers.values()],
    hls,
    // The Sénat's streams start where the sitting does: its timecodes count from the recording's start.
    offsetMs: chamber === 'se' ? Number(player?.attrs.starttime) || 0 : 0,
    thumbnail: thumbnail ? `${portal}${encodePath(`/Datas/${folder}/${id}/files/${thumbnail}`)}` : '',
    url: videoPage(chamber, id)
  }
}

export interface RawStream {
  isLive: boolean
  reunionUid: string
  organeLibelle: string
  debutDateTime: string
  debutDateTimeLibelle: string
  titre?: string
  sujet?: string
  lieu?: string
  liveUrl: string
  posterUrl: string
}

/** The Assemblée's broadcasts of today: what is live now and, with `upcoming`, what is announced for later today. */
export async function liveStreams(http: Http, upcoming = false): Promise<LiveStream[]> {
  const data = await json<{ diffusions?: RawStream[] }>(http, LIVE_API, 60_000)
  return (data.diffusions ?? []).filter((d) => (d.isLive || upcoming) && d.liveUrl).map(readStream)
}

export function readStream(d: RawStream): LiveStream {
  return {
    id: d.reunionUid ?? '',
    chamber: 'an',
    organ: d.organeLibelle ?? '',
    start: d.debutDateTimeLibelle ?? '',
    startAt: d.debutDateTime ? parisIso(d.debutDateTime) : '',
    title: htmlLines(d.titre).join(' ; '),
    subject: htmlLines(d.sujet).join(' ; '),
    place: d.lieu ?? '',
    live: !!d.isLive,
    hls: d.liveUrl.replace(/^http:/, 'https:'),
    poster: portalImage(d.posterUrl),
    url: 'https://www.assemblee-nationale.fr/dyn/direct-video'
  }
}

// ---------------------------------------------------------------- the Sénat's portal

export interface RawSenateItem {
  nid: string
  date: string
  live: boolean
  thumbnail: string | null
  published?: boolean
  videotype: string
  description: string[] | string | null
  commission: string | null
  title: string
  url: string
  duration?: number
}

function senateItem(v: RawSenateItem): VideoItem | null {
  const ref = parseVideoRef(`se:${v.url ?? ''}`)
  if (!ref || v.published === false) return null
  const title = htmlLines(v.title).join(' ')
  const [type, kind] = SENATE_TYPES[v.videotype] ?? [v.videotype?.toLowerCase() ?? '', 'autre' as VideoType]
  return {
    id: ref.id,
    chamber: 'se',
    title,
    description: (Array.isArray(v.description) ? v.description : htmlLines(v.description)).join(' · '),
    date: fromUnix(v.date),
    type: kind === 'seance' && isQuestions(title) ? 'questions d’actualité au gouvernement' : type,
    kind: kind === 'seance' && isQuestions(title) ? 'questions' : kind,
    commission: v.commission ?? '',
    thumbnail: portalImage(v.thumbnail, SENATE_PORTAL),
    durationMs: (Number(v.duration) || 0) * 1000,
    ...(v.live ? { live: true } : {}),
    ...(ref.timecode ? { timecode: ref.timecode } : {}),
    url: videoPage('se', ref.id, ref.timecode)
  }
}

/** The Sénat's videos between two dates, newest first. */
export async function searchSenateVideos(http: Http, q: VideoQuery): Promise<VideoItem[]> {
  const raw = await json<RawSenateItem[]>(
    http,
    `${SENATE_SEARCH}${query({
      method: 'senat_main.search',
      limit: 120,
      period: 'custom',
      begin: ddmmyyyy(q.from),
      end: ddmmyyyy(q.to),
      videotype: q.type ? SENATE_FILTERS[q.type] : '',
      speaker: q.speaker?.trim() ?? ''
    })}`,
    120_000
  )
  const words = wordsOf(q.text)
  const seen = new Set<string>()
  return (Array.isArray(raw) ? raw : []).flatMap((v) => {
    const item = senateItem(v)
    if (!item || seen.has(item.id) || (q.type && item.kind !== q.type)) return []
    if (!words.every((w) => foldText(`${item.title} ${item.description}`).includes(w))) return []
    seen.add(item.id)
    return [item]
  })
}

/** What the Sénat broadcasts now (its portal flags it live among its latest videos). */
export async function senateLive(http: Http): Promise<LiveStream[]> {
  const raw = await json<RawSenateItem[]>(http, `${SENATE_SEARCH}${query({ method: 'senat_main.search', limit: 12, live: 'true' })}`, 60_000)
  const live = (Array.isArray(raw) ? raw : []).filter((v) => v.live)
  return Promise.all(
    live.map(async (v): Promise<LiveStream> => {
      const item = senateItem(v)!
      return {
        id: item.id,
        chamber: 'se',
        organ: item.kind === 'seance' ? 'Séance publique' : item.commission || item.type,
        start: '',
        startAt: item.date,
        title: item.title,
        subject: item.description,
        place: '',
        live: true,
        hls: await senateStream(http, item.id).catch(() => ''),
        poster: item.thumbnail,
        url: item.url
      }
    })
  )
}

/** A Sénat video's HLS stream (live or recorded), from its embedded player's page. */
export async function senateStream(http: Http, id: string): Promise<string> {
  const page = await http.text(`${SENATE_PORTAL}/iframe.${id}`, { cacheMs: 60_000 })
  return decodeHtml(page.match(/<source src="([^"]+\.m3u8[^"]*)"/)?.[1] ?? '')
}

/** Title, chapters with timecodes, speakers (with their matricule) and the stream of one of the Sénat's videos. */
export async function senateVideoDetail(http: Http, id: string): Promise<VideoDetail> {
  const root = `${SENATE_PORTAL}/Datas/senat/${id}`
  const [data, player, stream] = await Promise.all([
    http.text(`${root}/content/data.nvs`, { cacheMs: 600_000 }).then(parseXml),
    http
      .text(`${root}/content/finalplayer.nvs`, { cacheMs: 600_000 })
      .then(parseXml)
      .catch(() => null),
    senateStream(http, id).catch(() => '')
  ])
  return readVideo('se', id, data, player, stream)
}

// ---------------------------------------------------------------- both

/** Videos of either chamber or both, newest first. */
export async function searchBoth(http: Http, q: VideoQuery): Promise<VideoItem[]> {
  const asked: Chamber[] = q.chamber ? [q.chamber] : ['an', 'se']
  const parts = await Promise.allSettled(asked.map((c) => (c === 'an' ? searchVideos(http, q) : searchSenateVideos(http, q))))
  const found = parts.flatMap((p) => (p.status === 'fulfilled' ? p.value : []))
  if (!found.length && parts.every((p) => p.status === 'rejected')) throw (parts[0] as PromiseRejectedResult).reason
  return found.sort((a, b) => b.date.localeCompare(a.date))
}

export const detailOf = (http: Http, chamber: Chamber, id: string) => (chamber === 'se' ? senateVideoDetail(http, id) : videoDetail(http, id))
