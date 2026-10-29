import { foldText } from '@marianne/sdk'
import { query, type ServiceHttp } from '@marianne/sdk/main'
import { parseVideoRef, PORTAL, videoPage } from './links'
import { parisIso } from './time'
import type { LiveStream, VideoDetail, VideoItem, VideoQuery, VideoType } from './types'
import { child, children, isElement, parseXml, textOf, type XmlElement } from './xml'

/**
 * Videos of the Assemblée nationale (videos.assemblee-nationale.fr). There is no documented API:
 * this uses the portal's own endpoints (the search behind its pages, each video's metadata and
 * chapter files), the live streams the Assemblée's site lists, and plays the HLS streams of its
 * CDN, which allow cross-origin playback.
 */

export type Http = Pick<ServiceHttp, 'text'>

const CDN = 'https://videos-an.vodalys.com/videos/definst'
const LIVE_API = 'https://www.assemblee-nationale.fr/dyn/api/live/streams'

/** The portal's video types, by code, in French. */
export const VIDEO_TYPES: Record<string, string> = {
  S: 'séance publique',
  C: 'commission',
  QG: 'questions au gouvernement',
  P: 'présidence',
  E: 'événement',
  H: 'connaissance et histoire',
  A: 'autre'
}

/** Filter values of the portal's search ("TypeVideo"). */
export const VIDEO_TYPE_FILTERS: Record<VideoType, string> = {
  seance: 'Séance publique',
  commission: 'Commission',
  questions: 'Questions au gouvernement',
  autre: 'Autre'
}

/** JSON from the portal, which prefixes some answers with a byte-order mark. */
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
      line
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[\s\-–—•]+/, '')
        .trim()
    )
    .filter(Boolean)
}

/** The portal's images, served over https from its own host ("http://event.…/Datas/an/…" too). */
export function portalImage(url: string | null | undefined): string {
  if (!url) return ''
  const path = url.match(/^https?:\/\/[^/]+(\/Datas\/.+)$/)?.[1]
  if (path) return `${PORTAL}${encodePath(path)}`
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
const fromUnix = (seconds: string | undefined) => (seconds && Number(seconds) ? new Date(Number(seconds) * 1000).toISOString() : '')

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

/** Videos between two dates (YYYY-MM-DD), newest first; the portal returns at most 120. */
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
  const words = foldText(q.text ?? '')
    .split(/\s+/)
    .filter(Boolean)
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
        title,
        description,
        date: fromUnix(v.date),
        type: VIDEO_TYPES[v.video_type] ?? v.video_type ?? '',
        commission: v.commission ?? '',
        thumbnail: portalImage(v.thumbnail),
        // Speaker hits point to the passage: kept, for the player and the links.
        ...(ref.timecode ? { timecode: ref.timecode } : {}),
        url: videoPage(ref.id, ref.timecode)
      }
    ]
  })
}

/** Title, chapters with timecodes, speakers and the stream of one video ("19632460_6ae0ce76adf9c", or any reference to it). */
export async function videoDetail(http: Http, ref: string): Promise<VideoDetail> {
  const id = parseVideoRef(ref)?.id
  if (!id) throw new Error(`Ce n’est pas une vidéo de l’Assemblée : ${ref}`)
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
  return readVideo(id, data, player, smil)
}

/** A video from its three files: data.nvs, finalplayer.nvs (timecodes) and vodalys.smil (the stream). */
export function readVideo(id: string, data: XmlElement, player: XmlElement | null, smil: string): VideoDetail {
  const metadata = children(child(data, 'metadatas') ?? data, 'metadata').map((m) => m.attrs)
  const meta = (name: string) => metadata.find((m) => m.name === name)
  const timecodes = new Map((player ? children(player, 'synchro') : []).map((s) => [s.attrs.id, Number(s.attrs.timecode)]))
  const speakers = new Map(
    children(child(data, 'speakers') ?? data, 'speaker').map((s) => {
      const actor = textOf(child(s, 'url'))
      return [s.attrs.id, { name: textOf(child(s, 'name')), ...(/^\d+$/.test(actor) ? { deputy: `PA${actor}` } : {}) }]
    })
  )
  const chapters: VideoDetail['chapters'] = []
  const walk = (el: XmlElement, depth: number) => {
    for (const c of el.children.filter(isElement).filter((x) => x.tag === 'chapter')) {
      const speaker = speakers.get(child(c, 'speaker')?.attrs.id ?? '')
      const timecode = timecodes.get(c.attrs.id)
      chapters.push({
        id: c.attrs.id,
        title: (c.attrs.label ?? '').trim(),
        depth,
        timecode: timecode !== undefined && Number.isFinite(timecode) ? timecode : null,
        ...(speaker ? { speaker: speaker.name } : {}),
        ...(speaker?.deputy ? { deputy: speaker.deputy } : {})
      })
      walk(c, depth + 1)
    }
  }
  walk(child(data, 'chapters') ?? data, 0)
  // "mp4/ida/mp4:domain1/2026/10/x_1.mp4" → the multi-bitrate playlist next to it.
  const src = smil.match(/src="([^"]+\.mp4)"/)?.[1]?.replace('mp4:', '')
  const type = meta('video_type')
  const thumbnail = meta('Thumbnail')?.value?.match(/^mediafiles:\/\/this\/(.+)$/)?.[1]
  return {
    id,
    title: (data.attrs.mediatitle ?? '').trim(),
    date: fromUnix(meta('date')?.value),
    type: VIDEO_TYPES[type?.value ?? ''] ?? type?.label?.toLowerCase() ?? '',
    organ: meta('commission')?.label ?? '',
    meetingIds: metadata.filter((m) => m.name === 'meeting_id' && m.value).map((m) => m.value),
    durationMs: Number(player?.attrs.endtime) || 0,
    chapters,
    speakers: [...speakers.values()],
    hls: src ? `${CDN}/${src.replace(/_\d+\.mp4$/, '.smil')}/master.m3u8` : '',
    thumbnail: thumbnail ? `${PORTAL}${encodePath(`/Datas/an/${id}/files/${thumbnail}`)}` : '',
    url: videoPage(id)
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

/** Today's broadcasts: what is live now and, with `upcoming`, what is announced for later today. */
export async function liveStreams(http: Http, upcoming = false): Promise<LiveStream[]> {
  const data = await json<{ diffusions?: RawStream[] }>(http, LIVE_API, 60_000)
  return (data.diffusions ?? []).filter((d) => (d.isLive || upcoming) && d.liveUrl).map(readStream)
}

export function readStream(d: RawStream): LiveStream {
  return {
    meetingId: d.reunionUid ?? '',
    organ: d.organeLibelle ?? '',
    start: d.debutDateTimeLibelle ?? '',
    startAt: d.debutDateTime ? parisIso(d.debutDateTime) : '',
    title: htmlLines(d.titre).join(' ; '),
    subject: htmlLines(d.sujet).join(' ; '),
    place: d.lieu ?? '',
    live: !!d.isLive,
    hls: d.liveUrl.replace(/^http:/, 'https:'),
    poster: portalImage(d.posterUrl)
  }
}
