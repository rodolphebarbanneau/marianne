import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import Hls from 'hls.js'

/**
 * An HLS stream in a <video>: hls.js where Media Source is available, the engine's own HLS
 * otherwise. Network hiccups are retried, decoding errors recovered, and a playback that waits for
 * too long says so (`stalled`), with a way to try again.
 */

/** A quality the stream offers. */
export interface StreamLevel {
  /** Its index in hls.js's levels. */
  index: number
  height: number
  bitrate: number
}

export interface Stream {
  /** No end in its playlist: a broadcast (the hint until the playlist is read). */
  live: boolean
  /** The qualities, best first; empty without hls.js. */
  levels: StreamLevel[]
  /** The quality chosen; −1: automatic. */
  level: number
  /** The quality playing (automatic's pick), −1 while unknown. */
  playing: number
  setLevel(index: number): void
  error: string
  stalled: boolean
  retry(): void
  /** Live: where to play the live edge from, s (a few fragments back from it); null when unknown. */
  liveSync(): number | null
}

/** A playback that has waited this long is stalled. */
const STALL_MS = 15_000

export function useStream(
  video: RefObject<HTMLVideoElement | null>,
  src: string,
  { start, autoPlay, live: hint }: { start?: number; autoPlay?: boolean; live?: boolean }
): Stream {
  const hlsRef = useRef<Hls | null>(null)
  const [error, setError] = useState('')
  // Null until the playlist says: the hint meanwhile.
  const [live, setLive] = useState<boolean | null>(null)
  const [levels, setLevels] = useState<StreamLevel[]>([])
  const [level, setLevelState] = useState(-1)
  const [playing, setPlaying] = useState(-1)
  const [stalled, setStalled] = useState(false)
  const stall = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const liveRef = useRef(false)
  // What the stream starts with is read when it loads: a new start alone doesn't reload it.
  const startRef = useRef({ start, autoPlay })
  startRef.current = { start, autoPlay }

  const going = useCallback(() => {
    clearTimeout(stall.current)
    stall.current = undefined
    setStalled(false)
  }, [])

  // Waiting, and going again only when the position moves: a timeupdate without progress is no recovery.
  useEffect(() => {
    const v = video.current
    if (!v) return
    let last = -1
    const waiting = () => {
      if (!stall.current) stall.current = setTimeout(() => setStalled(true), STALL_MS)
    }
    const moved = () => {
      if (v.currentTime === last) return
      last = v.currentTime
      if (stall.current) going()
      else setStalled(false)
    }
    v.addEventListener('waiting', waiting)
    v.addEventListener('stalled', waiting)
    v.addEventListener('playing', going)
    v.addEventListener('pause', going)
    v.addEventListener('timeupdate', moved)
    return () => {
      clearTimeout(stall.current)
      stall.current = undefined
      v.removeEventListener('waiting', waiting)
      v.removeEventListener('stalled', waiting)
      v.removeEventListener('playing', going)
      v.removeEventListener('pause', going)
      v.removeEventListener('timeupdate', moved)
    }
  }, [video, going])

  useEffect(() => {
    const v = video.current
    if (!v || !src) return
    setError('')
    setLive(null)
    liveRef.current = false
    setLevels([])
    setLevelState(-1)
    setPlaying(-1)
    const { start: at, autoPlay: auto } = startRef.current
    const play = () => auto && void v.play().catch(() => undefined)
    if (Hls.isSupported()) {
      const hls = new Hls({ startPosition: at ? at / 1000 : -1 })
      hlsRef.current = hls
      hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
        liveRef.current = data.details.live
        setLive(data.details.live)
      })
      let mediaRetries = 0
      let networkRetries = 0
      let reload: ReturnType<typeof setTimeout> | undefined
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(hls.levels.map((l, index) => ({ index, height: l.height, bitrate: l.bitrate })).sort((a, b) => b.height - a.height || b.bitrate - a.bitrate))
        play()
      })
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => setPlaying(data.level))
      // Playing again: the counts start over, so that a long sitting survives several hiccups.
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        networkRetries = 0
        setError('')
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return
        // A network hiccup (a live playlist that doesn't answer, a fragment that times out) is
        // retried a few times, a little later each time; a decoding one is recovered twice.
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 5) {
          networkRetries++
          reload = setTimeout(() => hls.startLoad(), 1000 * networkRetries)
          return
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 2) {
          mediaRetries++
          if (mediaRetries === 2) hls.swapAudioCodec()
          hls.recoverMediaError()
          return
        }
        setError('lecture impossible : la vidéo n’est peut-être plus en ligne')
      })
      hls.loadSource(src)
      hls.attachMedia(v)
      return () => {
        clearTimeout(reload)
        hlsRef.current = null
        hls.destroy()
      }
    }
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      const begin = () => {
        if (at) v.currentTime = at / 1000
        // The engine's HLS says a broadcast by an endless duration.
        liveRef.current = v.duration === Infinity
        setLive(liveRef.current)
        play()
      }
      v.src = src
      v.addEventListener('loadedmetadata', begin, { once: true })
      return () => {
        v.removeEventListener('loadedmetadata', begin)
        v.removeAttribute('src')
        v.load()
      }
    }
    setError('ce lecteur ne sait pas lire ce flux vidéo')
  }, [src, video])

  const liveSync = useCallback(() => hlsRef.current?.liveSyncPosition ?? null, [])

  const retry = useCallback(() => {
    going()
    const hls = hlsRef.current
    const v = video.current
    if (hls) {
      hls.stopLoad()
      hls.startLoad()
      if (liveRef.current && hls.liveSyncPosition !== null && v) v.currentTime = hls.liveSyncPosition
    }
    void v?.play().catch(() => undefined)
  }, [going, video])

  const setLevel = useCallback((index: number) => {
    const hls = hlsRef.current
    if (!hls) return
    // At once (the buffer is dropped for the new quality); −1 lets hls.js choose again.
    hls.currentLevel = index
    setLevelState(index)
  }, [])

  return { live: live ?? !!hint, levels, level, playing, setLevel, error, stalled, retry, liveSync }
}
