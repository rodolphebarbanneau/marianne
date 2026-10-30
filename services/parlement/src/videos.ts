import { foldText } from '@marianne/sdk'
import { query, type ServiceHttp } from '@marianne/sdk/main'
import { LIVE_PAGE, parseVideoRef, PORTAL, SENATE_PORTAL, videoPage } from './links'
import { decodeHtml } from './senate'
import { addDays, parisDateTime, parisDay, parisIso, parisTime, toParis } from './time'
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
/** The Assemblée's live streams: its origin, and the CDN that mirrors it. */
const LIVE_HOSTS = ['https://anorigin.vodalys.com/live', 'https://assemblee-nationale.akamaized.net/live']
const LIVE_API = 'https://www.assemblee-nationale.fr/dyn/api/live/streams'
const SENATE_SEARCH = `${SENATE_PORTAL}/senat_function.php`

/** What changes during a live (the stream's files, its chapters, what is on air): asked again this often. */
export const LIVE_CACHE_MS = 20_000
/** A finished video's files. */
const VIDEO_CACHE_MS = 600_000

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
export async function searchVideos(http: Http, q: VideoQuery, cacheMs = 120_000): Promise<VideoItem[]> {
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
    cacheMs
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

/** Title, chapters with timecodes, speakers and the stream of one of the Assemblée's videos, live or recorded. */
export async function videoDetail(http: Http, id: string): Promise<VideoDetail> {
  const root = `${PORTAL}/Datas/an/${id}`
  const [data, player, smil] = await Promise.all([
    // Its status and chapters change during a live.
    http.text(`${root}/content/data.nvs`, { cacheMs: LIVE_CACHE_MS }).then(parseXml),
    // Missing until the recording is ready.
    http
      .text(`${root}/content/finalplayer.nvs`, { cacheMs: VIDEO_CACHE_MS })
      .then(parseXml)
      .catch(() => null),
    // A live's while on air, then the recording's; missing while the portal is still processing it.
    http.text(`${root}/meta-files/vodalys.smil`, { cacheMs: LIVE_CACHE_MS }).catch(() => '')
  ])
  noteRecording(http, id, readSmil(smil))
  return readVideo('an', id, data, player, smil, player ? null : await livePlayer(http, root))
}

/** The times of a live's chapters so far, as the portal's live player reads them; null when it has none. */
const livePlayer = (http: Http, root: string) =>
  http
    .text(`${root}/content/liveplayer.nvs`, { cacheMs: LIVE_CACHE_MS })
    .then(parseXml)
    .catch(() => null)

/** What a stream plays: a playlist, others of the same stream to try when it fails, a live or not, its channel. */
export interface StreamInfo {
  hls: string
  mirrors: string[]
  live: boolean
  channel: string
}

const NO_STREAM: StreamInfo = { hls: '', mirrors: [], live: false, channel: '' }

/**
 * The stream of an Assemblée's vodalys.smil. A recording: its multi-bitrate playlist on the CDN. A
 * live: the whole sitting so far (DVR, growing), on the origin it names and the CDN that mirrors it.
 */
export function readSmil(smil: string): StreamInfo {
  // base "http://anorigin.vodalys.com/live", src "live36/index36_19655971.m3u8?DVR".
  const live = smil.match(/src="(live\d+\/[^"?]+\.m3u8)/)?.[1]
  if (live) return dvr(live, smil.match(/base="https?:\/\/([^/"]+)/)?.[1])
  // "mp4/ida/mp4:domain1/2026/10/x_1.mp4" → the multi-bitrate playlist next to it.
  const src = smil.match(/src="([^"]+\.mp4)"/)?.[1]?.replace('mp4:', '')
  return src ? { ...NO_STREAM, hls: `${CDN}/${src.replace(/_\d+\.mp4$/, '.smil')}/master.m3u8` } : NO_STREAM
}

/**
 * The Assemblée's videos known to be recordings (their smil plays an mp4), for each Http: the
 * service's own, for as long as it runs. Over for good, they aren't asked again whether they are
 * live. A day has a few dozen videos: past RECORDINGS_MAX, the first known are forgotten.
 */
const recordings = new WeakMap<Http, Set<string>>()
const RECORDINGS_MAX = 1000

const recordingsOf = (http: Http) => recordings.get(http) ?? recordings.set(http, new Set()).get(http)!

/** Notes a video whose smil is a recording's. */
function noteRecording(http: Http, id: string, stream: StreamInfo): void {
  const known = recordingsOf(http)
  if (stream.live || !stream.hls || known.has(id)) return
  known.add(id)
  if (known.size > RECORDINGS_MAX) known.delete(known.values().next().value!)
}

/** A live's DVR playlist from a URL to it (data.nvs' "live" file: ".../live/live36/index36_19655971.m3u8?DVR"). */
export function dvrOf(url: string): StreamInfo {
  const found = url.match(/^https?:\/\/([^/]+)\/live\/(live\d+\/[^?#]+\.m3u8)/)
  return found ? dvr(found[2], found[1]) : NO_STREAM
}

/** "live36/index36_19655971.m3u8" on the host given first (over https), the other as a mirror. */
function dvr(path: string, host = ''): StreamInfo {
  const first = LIVE_HOSTS.find((h) => new URL(h).host === host) ?? LIVE_HOSTS[0]
  const urls = [first, ...LIVE_HOSTS.filter((h) => h !== first)].map((h) => `${h}/${path}`)
  return { hls: urls[0], mirrors: urls.slice(1), live: true, channel: path.match(/^live(\d+)\//)?.[1] ?? '' }
}

/** A data.nvs' metadata, in order. */
const metadataOf = (data: XmlElement) => children(child(data, 'metadatas') ?? data, 'metadata').map((m) => m.attrs)

/** The open-data meetings (réunions) a video covers. */
const meetingIdsOf = (data: XmlElement) =>
  metadataOf(data)
    .filter((m) => m.name === 'meeting_id' && m.value)
    .map((m) => m.value)

/** A number from an attribute (unix seconds, ms); 0 when absent. */
const num = (value: string | undefined) => Number(value) || 0

/**
 * A video from its files: data.nvs (status, chapters, speakers, metadata), finalplayer.nvs
 * (timecodes, once recorded) or else liveplayer.nvs (those of a live so far: only the chapters it
 * times are kept), and the stream: at the Assemblée its vodalys.smil, at the Sénat its playlist.
 */
export function readVideo(
  chamber: Chamber,
  id: string,
  data: XmlElement,
  player: XmlElement | null,
  stream: string,
  live: XmlElement | null = null
): VideoDetail {
  const metadata = metadataOf(data)
  const meta = (name: string) => metadata.find((m) => m.name === name)
  const timing = player ?? live
  const timedOnly = !player && !!live
  const timecodes = new Map((timing ? children(timing, 'synchro') : []).map((s) => [s.attrs.id, Number(s.attrs.timecode)]))
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
      const timed = timecode !== undefined && Number.isFinite(timecode)
      if (timed || !timedOnly)
        chapters.push({
          id: c.attrs.id,
          title: (c.attrs.label ?? '').replace(/\s*\n\s*/g, ' · ').trim(),
          depth,
          timecode: timed ? timecode : null,
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
  // "live" while on air, "vod" after; a video that doesn't say: its stream tells.
  const status = data.attrs.status ?? ''
  const liveFile = children(child(data, 'files') ?? data, 'file').find((f) => f.attrs.title === 'live')?.attrs.url ?? ''
  const media = chamber === 'se' ? senateMedia(stream, liveFile, status, player, live) : anMedia(stream, liveFile, status)
  const channel = media.channel || (chamber === 'an' ? (meta('stream')?.label?.match(/(\d+)$/)?.[1] ?? dvrOf(liveFile).channel) : senateChannel(liveFile))
  // Where the recording's timeline starts, unix s: at the Assemblée its live player or its date (the same), at the Sénat its players.
  const origin = chamber === 'se' ? num(player?.attrs.sessionstart) || num(live?.attrs.starttime) : num(live?.attrs.starttime) || num(meta('date')?.value)
  return {
    id,
    chamber,
    title: decodeHtml(data.attrs.mediatitle ?? '').trim(),
    date: fromUnix(meta('date')?.value ?? player?.attrs.sessionstart ?? live?.attrs.starttime),
    type:
      chamber === 'se'
        ? (SENATE_TYPES[type?.value ?? '']?.[0] ?? type?.label?.toLowerCase() ?? '')
        : (VIDEO_TYPES[type?.value ?? ''] ?? type?.label?.toLowerCase() ?? ''),
    organ: meta('commission')?.label ?? '',
    meetingIds: meetingIdsOf(data),
    durationMs: num(player?.attrs.endtime),
    chapters,
    speakers: [...speakers.values()],
    hls: media.hls,
    mirrors: media.mirrors,
    live: media.live,
    offsetMs: media.offsetMs,
    clockStart: media.clockStart || (origin ? origin * 1000 + media.offsetMs : 0),
    channel,
    thumbnail: thumbnail ? `${portal}${encodePath(`/Datas/${folder}/${id}/files/${thumbnail}`)}` : '',
    url: videoPage(chamber, id)
  }
}

type Media = StreamInfo & { offsetMs: number; clockStart: number }

/** The Assemblée's: its smil's stream, or data.nvs' live file while on air; a live's DVR is gone once the sitting is over. */
function anMedia(smil: string, liveFile: string, status: string): Media {
  let s = readSmil(smil)
  const live = status ? status === 'live' : s.live
  if (live && !s.hls) s = dvrOf(liveFile)
  // Over, and the recording not ready yet: nothing to play (the view says it is being processed).
  if (!live && s.live) s = { ...NO_STREAM, channel: s.channel }
  return { ...s, live, offsetMs: 0, clockStart: 0 }
}

/**
 * The Sénat's: its player's playlist (data.nvs' live file while on air, when the player page
 * doesn't answer). A recording's starts where the sitting does (its finalplayer's starttime, or the
 * playlist's wowzaplaystart); a live's at its startTime, a little after the moment its live
 * player's times count from (inferred: no live to check it against).
 */
function senateMedia(stream: string, liveFile: string, status: string, player: XmlElement | null, live: XmlElement | null): Media {
  const url = stream || (status === 'live' ? liveFile.replace(/^http:/, 'https:') : '')
  const isLive = status ? status === 'live' : /\/hls\/live\//.test(url)
  const startTime = num(url.match(/[?&]startTime=(\d+)/)?.[1])
  const liveOffset = isLive && startTime && num(live?.attrs.starttime) ? Math.max(0, (startTime - num(live?.attrs.starttime)) * 1000) : 0
  const offsetMs = num(player?.attrs.starttime) || num(url.match(/[?&]wowzaplaystart=(\d+)/)?.[1]) || liveOffset
  return {
    hls: url,
    mirrors: [],
    live: isLive,
    channel: senateChannel(url),
    offsetMs,
    clockStart: isLive && startTime ? startTime * 1000 : 0
  }
}

/** The Sénat's channel, from a live playlist ("…/hls/live/2036979/senat1/playlist-archive.m3u8"): "senat1". */
const senateChannel = (url: string) => url.match(/\/hls\/live\/\d+\/([^/]+)\//)?.[1] ?? ''

export interface RawStream {
  isLive: boolean
  /** The channel: "36", the hémicycle's. */
  flux?: string
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

/** A video of the Assemblée's portal on air: found among today's, its stream, its data.nvs. */
export interface PortalLive {
  item: VideoItem
  stream: StreamInfo
  data: XmlElement
}

/**
 * The Assemblée's portal videos on air now: today's whose smil plays a live and whose data.nvs says
 * so (early in the morning, yesterday's too: a night sitting goes on past midnight).
 */
export async function portalLives(http: Http, now = Date.now()): Promise<PortalLive[]> {
  const today = parisDay(new Date(now))
  const early = Number(parisTime(new Date(now).toISOString()).slice(0, 2)) < 6
  // The search lists a live only some time after it starts; the portal's live page leads to the main one at once. Both asked together.
  const [items, main] = await Promise.all([searchVideos(http, { from: early ? addDays(today, -1) : today, to: today }, LIVE_CACHE_MS), mainLive(http)])
  // Not those announced for much later (the portal lists a video a little before its live starts).
  const started = items.filter((v) => !v.date || Date.parse(v.date) <= now + 30 * 60_000)
  if (main && !started.some((v) => v.id === main)) started.push(liveItem(main))
  // A recording doesn't go live again: its smil, asked once, isn't asked again.
  const recorded = recordingsOf(http)
  const unknown = started.filter((v) => !recorded.has(v.id))
  const found = await Promise.all(
    unknown.map(async (item): Promise<PortalLive[]> => {
      const root = `${PORTAL}/Datas/an/${item.id}`
      const stream = readSmil(await http.text(`${root}/meta-files/vodalys.smil`, { cacheMs: LIVE_CACHE_MS }).catch(() => ''))
      noteRecording(http, item.id, stream)
      if (!stream.live) return []
      const data = await http
        .text(`${root}/content/data.nvs`, { cacheMs: LIVE_CACHE_MS })
        .then(parseXml)
        .catch(() => null)
      if (!data || (data.attrs.status && data.attrs.status !== 'live')) return []
      return [{ item, stream, data }]
    })
  )
  return found.flat()
}

/** The video of the portal's live page (direct.php, which leads to "direct.<id>"): the hémicycle's live; null when none. */
export async function mainLive(http: Http): Promise<string | null> {
  const page = await http.text(LIVE_PAGE, { cacheMs: LIVE_CACHE_MS }).catch(() => '')
  return page.match(/\b(\d{6,}_[0-9a-f]{13})\b/)?.[1] ?? null
}

/** A live known by its id alone: what the search would say of it, its data.nvs telling the rest. */
const liveItem = (id: string): VideoItem => ({
  id,
  chamber: 'an',
  title: '',
  description: '',
  date: '',
  type: VIDEO_TYPES.S,
  kind: 'seance',
  commission: '',
  thumbnail: '',
  durationMs: 0,
  live: true,
  url: videoPage('an', id)
})

/** The channel of a broadcast of the Assemblée's API: its "flux", or its playlist's ".../live36/playlist36.m3u8". */
const channelOf = (d: RawStream) => (d.flux ?? '').trim() || (d.liveUrl ?? '').match(/\/live(\d+)\//)?.[1] || ''

/**
 * The Assemblée's broadcasts of today: what is live now and, with `upcoming`, what is announced for
 * later today. Each live is matched to its portal video by channel (the API names the day's first
 * sitting all day, not the one on air), to play the whole sitting so far; one the API doesn't list
 * (at times it lists nothing while on air) comes from the portal alone.
 */
export async function liveStreams(http: Http, upcoming = false, now = Date.now()): Promise<LiveStream[]> {
  const [api, portal] = await Promise.allSettled([json<{ diffusions?: RawStream[] }>(http, LIVE_API, LIVE_CACHE_MS), portalLives(http, now)])
  if (api.status === 'rejected' && portal.status === 'rejected') throw api.reason
  const diffusions = api.status === 'fulfilled' ? (api.value.diffusions ?? []).filter((d) => d.liveUrl) : []
  const lives = portal.status === 'fulfilled' ? portal.value : []
  const videos = matchLives(diffusions, lives)
  const streams = diffusions.map((d) => readStream(d, videos.get(d)))
  const taken = new Set(videos.values())
  streams.push(...lives.filter((l) => !taken.has(l)).map(portalStream))
  return streams.filter((s) => s.live || upcoming)
}

/**
 * The portal video of each broadcast, the latest started first. The broadcasts on air take the live
 * of their channel first; then those left, on air before announced ones, take a live that names
 * their meeting (an announced one started early). In this order, whatever order the API lists them
 * in: an announced broadcast listed first would otherwise take the channel's live through its
 * meeting, and leave the one on air with the API's 30 seconds.
 */
function matchLives(diffusions: readonly RawStream[], lives: readonly PortalLive[]): Map<RawStream, PortalLive> {
  const free = [...lives].sort((a, b) => b.item.date.localeCompare(a.item.date))
  const found = new Map<RawStream, PortalLive>()
  const take = (list: readonly RawStream[], fits: (d: RawStream, l: PortalLive) => boolean) => {
    for (const d of list) {
      const i = free.findIndex((l) => fits(d, l))
      if (i >= 0) found.set(d, free.splice(i, 1)[0])
    }
  }
  take(
    diffusions.filter((d) => d.isLive),
    (d, l) => !!channelOf(d) && l.stream.channel === channelOf(d)
  )
  const left = diffusions.filter((d) => !found.has(d))
  take([...left.filter((d) => d.isLive), ...left.filter((d) => !d.isLive)], (d, l) => meetingIdsOf(l.data).includes(d.reunionUid))
  return found
}

/** A broadcast of the Assemblée's API, with its portal video when found (its whole stream so far, its page, its meeting). */
export function readStream(d: RawStream, video?: PortalLive): LiveStream {
  const stream: LiveStream = {
    id: d.reunionUid ?? '',
    chamber: 'an',
    organ: d.organeLibelle ?? '',
    start: d.debutDateTimeLibelle ?? '',
    startAt: d.debutDateTime ? parisIso(d.debutDateTime) : '',
    title: htmlLines(d.titre).join(' ; '),
    subject: htmlLines(d.sujet).join(' ; '),
    place: d.lieu ?? '',
    live: !!d.isLive || !!video,
    // Without its video, the API's stream: a window of the last 30 seconds.
    hls: d.liveUrl.replace(/^http:/, 'https:'),
    mirrors: [],
    poster: portalImage(d.posterUrl),
    url: LIVE_PAGE,
    channel: channelOf(d)
  }
  return video ? { ...stream, ...onPortal(video) } : stream
}

/** What a broadcast takes from its portal video. */
function onPortal(l: PortalLive): Partial<LiveStream> {
  const meeting = meetingIdsOf(l.data)[0]
  return {
    video: l.item.id,
    hls: l.stream.hls,
    mirrors: l.stream.mirrors,
    channel: l.stream.channel,
    url: l.item.url,
    ...(meeting ? { meeting } : {})
  }
}

/** A live known from the portal alone. */
function portalStream(l: PortalLive): LiveStream {
  const { item } = l
  const meta = metadataOf(l.data)
  const meeting = meetingIdsOf(l.data)[0]
  const sitting = item.kind === 'seance' || item.kind === 'questions'
  return {
    id: meeting ?? item.id,
    chamber: 'an',
    organ: sitting ? 'Séance publique' : meta.find((m) => m.name === 'commission')?.label || item.commission || item.type,
    start: item.date ? parisDateTime(item.date) : '',
    startAt: item.date ? toParis(new Date(item.date)) : '',
    title: item.title || decodeHtml(l.data.attrs.mediatitle ?? '').trim(),
    subject: item.description.split('\n').join(' ; '),
    place: decodeHtml(meta.find((m) => m.name === 'place')?.value ?? ''),
    live: true,
    hls: '',
    mirrors: [],
    poster: item.thumbnail,
    url: item.url,
    ...onPortal(l)
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
  const raw = await json<RawSenateItem[]>(http, `${SENATE_SEARCH}${query({ method: 'senat_main.search', limit: 12, live: 'true' })}`, LIVE_CACHE_MS)
  const live = (Array.isArray(raw) ? raw : []).filter((v) => v.live).flatMap((v) => senateItem(v) ?? [])
  return Promise.all(
    live.map(async (item): Promise<LiveStream> => {
      const hls = await senateStream(http, item.id).catch(() => '')
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
        hls,
        mirrors: [],
        poster: item.thumbnail,
        url: item.url,
        video: item.id,
        channel: senateChannel(hls)
      }
    })
  )
}

/** A Sénat video's HLS stream (live or recorded), from its embedded player's page. */
export async function senateStream(http: Http, id: string): Promise<string> {
  const page = await http.text(`${SENATE_PORTAL}/iframe.${id}`, { cacheMs: LIVE_CACHE_MS })
  return decodeHtml(page.match(/<source src="([^"]+\.m3u8[^"]*)"/)?.[1] ?? '')
}

/** Title, chapters with timecodes, speakers (with their matricule) and the stream of one of the Sénat's videos, live or recorded. */
export async function senateVideoDetail(http: Http, id: string): Promise<VideoDetail> {
  const root = `${SENATE_PORTAL}/Datas/senat/${id}`
  const [data, player, stream] = await Promise.all([
    http.text(`${root}/content/data.nvs`, { cacheMs: LIVE_CACHE_MS }).then(parseXml),
    http
      .text(`${root}/content/finalplayer.nvs`, { cacheMs: VIDEO_CACHE_MS })
      .then(parseXml)
      .catch(() => null),
    senateStream(http, id).catch(() => '')
  ])
  return readVideo('se', id, data, player, stream, player ? null : await livePlayer(http, root))
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
