import type { LiveStream, VideoDetail, VideoItem } from '../../shared/types'
import { fetchJson, fetchText, query } from '../http'
import { children, child, isElement, parseXml, type XmlElement } from './xml'

/**
 * Videos of the Assemblée nationale (videos.assemblee-nationale.fr). There is no documented API:
 * this uses the portal's own endpoints (the search behind its pages, each video's metadata and
 * chapter files) and plays the HLS streams of its CDN, which allow cross-origin playback.
 */

const PORTAL = 'https://videos.assemblee-nationale.fr'
const CDN = 'https://videos-an.vodalys.com/videos/definst'

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
export const VIDEO_TYPE_FILTERS: Record<string, string> = {
  seance: 'Séance publique',
  commission: 'Commission',
  questions: 'Questions au gouvernement',
  autre: 'Autre'
}

interface RawItem {
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

const https = (url: string | null) => (url ? url.replace(/^http:/, 'https:') : '')
const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('/')
const cleanHtml = (s: string | null) =>
  (s ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

export const videoPage = (id: string, timecodeMs?: number) => `${PORTAL}/video.${id}${timecodeMs ? `?timecode=${Math.round(timecodeMs)}` : ''}`

/**
 * A video reference from the portal: an id ("19632460_6ae0ce76adf9c"), a search hit path
 * ("/19634676_6ae0f545798fb?timecode=1069980", for a speaker or chapter match) or a page URL.
 */
export function parseVideoRef(ref: string): { id: string; timecode?: number } | null {
  const id = ref.match(/(\d+_[0-9a-f]+)/i)?.[1]
  if (!id) return null
  const timecode = ref.match(/[?&]timecode=(\d+)/)?.[1]
  return timecode ? { id, timecode: Number(timecode) } : { id }
}

/** Videos between two dates (YYYY-MM-DD), newest first; the portal returns at most 120. */
export async function searchVideos(opts: {
  from: string
  to: string
  type?: string
  commission?: string
  speaker?: string
  text?: string
}): Promise<VideoItem[]> {
  const raw = await fetchJson<RawItem[]>(
    `${PORTAL}/php/eventsearch.php${query({
      Date: opts.from === opts.to ? ddmmyyyy(opts.from) : `${ddmmyyyy(opts.from)}-${ddmmyyyy(opts.to)}`,
      Intervenant: opts.speaker ?? '',
      Commission: opts.commission ?? '',
      Heure: '',
      TypeVideo: opts.type ? (VIDEO_TYPE_FILTERS[opts.type] ?? opts.type) : '',
      Rubrique: ''
    })}`,
    { cacheMs: 120_000 }
  )
  const words = (opts.text ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const seen = new Set<string>()
  return (
    (Array.isArray(raw) ? raw : [])
      .filter((v) => v.published)
      .flatMap((v) => {
        const ref = parseVideoRef(v.url ?? '')
        if (!ref) return []
        return {
          id: ref.id,
          title: cleanHtml(v.title),
          description: cleanHtml(v.description),
          date: new Date(Number(v.date) * 1000).toISOString(),
          type: VIDEO_TYPES[v.video_type] ?? v.video_type,
          commission: v.commission ?? '',
          thumbnail: https(v.thumbnail),
          // Speaker hits point to the passage: keep it, for the player and the links.
          ...(ref.timecode ? { timecode: ref.timecode } : {}),
          url: videoPage(ref.id, ref.timecode)
        }
      })
      // One entry per video (a speaker can have several hits in one sitting: the first one wins).
      .filter((v) => !seen.has(v.id) && seen.add(v.id))
      .filter((v) => words.every((w) => `${v.title} ${v.description}`.toLowerCase().includes(w)))
  )
}

const attr = (el: XmlElement | undefined, name: string) => el?.attrs[name] ?? ''

/** Title, chapters with timecodes, speakers and the stream of one video ("19632460_6ae0ce76adf9c", or any reference to it). */
export async function videoDetail(ref: string): Promise<VideoDetail> {
  const id = parseVideoRef(ref)?.id
  if (!id) throw new Error(`Identifiant de vidéo invalide : ${ref}`)
  const root = `${PORTAL}/Datas/an/${id}`
  const [data, player, smil] = await Promise.all([
    fetchText(`${root}/content/data.nvs`, { cacheMs: 600_000 }).then(parseXml),
    fetchText(`${root}/content/finalplayer.nvs`, { cacheMs: 600_000 })
      .then(parseXml)
      .catch(() => null),
    fetchText(`${root}/meta-files/vodalys.smil`, { cacheMs: 600_000 }).catch(() => '')
  ])
  const meta = new Map(children(child(data, 'metadatas') ?? data, 'metadata').map((m) => [m.attrs.name, m.attrs]))
  const timecodes = new Map((player ? children(player, 'synchro') : []).map((s) => [s.attrs.id, Number(s.attrs.timecode)]))
  const speakers = new Map(
    children(child(data, 'speakers') ?? data, 'speaker').map((s) => {
      const name = child(s, 'name')?.children.join('') ?? ''
      const ref = child(s, 'url')?.children.join('').trim()
      return [s.attrs.id, { name: String(name).trim(), deputy: ref && /^\d+$/.test(ref) ? `PA${ref}` : undefined }]
    })
  )
  const chapters: VideoDetail['chapters'] = []
  const walk = (el: XmlElement, depth: number) => {
    for (const c of el.children.filter(isElement).filter((x) => x.tag === 'chapter')) {
      const speaker = speakers.get(attr(child(c, 'speaker'), 'id'))
      chapters.push({
        id: c.attrs.id,
        title: c.attrs.label.trim(),
        depth,
        timecode: timecodes.get(c.attrs.id) ?? null,
        speaker: speaker?.name,
        deputy: speaker?.deputy
      })
      walk(c, depth + 1)
    }
  }
  walk(child(data, 'chapters') ?? data, 0)
  // "mp4/ida/mp4:domain1/2026/10/x_1.mp4" → the multi-bitrate playlist next to it.
  const src = smil.match(/src="([^"]+\.mp4)"/)?.[1]?.replace('mp4:', '')
  const date = meta.get('date')?.value
  return {
    id,
    title: data.attrs.mediatitle?.trim() ?? '',
    date: date ? new Date(Number(date) * 1000).toISOString() : '',
    type: meta.get('video_type')?.label ?? VIDEO_TYPES[meta.get('video_type')?.value ?? ''] ?? '',
    organ: meta.get('commission')?.label ?? '',
    meetingId: meta.get('meeting_id')?.value ?? '',
    durationMs: Number(player?.attrs.endtime) || 0,
    chapters,
    speakers: [...speakers.values()],
    hls: src ? `${CDN}/${src.replace(/_\d+\.mp4$/, '.smil')}/master.m3u8` : '',
    url: videoPage(id)
  }
}

/** Sittings and meetings broadcast live right now. */
export async function liveStreams(): Promise<LiveStream[]> {
  const data = await fetchJson<{
    diffusions?: Array<{
      isLive: boolean
      reunionUid: string
      organeLibelle: string
      debutDateTimeLibelle: string
      sujet: string
      liveUrl: string
      posterUrl: string
    }>
  }>('https://www.assemblee-nationale.fr/dyn/api/live/streams', { cacheMs: 60_000 })
  return (data.diffusions ?? [])
    .filter((d) => d.isLive && d.liveUrl)
    .map((d) => ({
      meetingId: d.reunionUid,
      organ: d.organeLibelle,
      start: d.debutDateTimeLibelle,
      subject: cleanHtml(d.sujet),
      hls: d.liveUrl,
      poster: https(d.posterUrl)
    }))
}

/** "1h02m15s"-style position, for chapter lists. */
export function hms(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h ? `${h}h` : ''}${String(m).padStart(h ? 2 : 1, '0')}m${String(s % 60).padStart(2, '0')}s`
}
