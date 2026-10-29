import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import Hls from 'hls.js'

/** An HLS stream in a <video>: hls.js where Media Source is available, the engine's own HLS otherwise. */

export interface PlayerHandle {
  /** Go to a position (ms) and play. */
  seek(ms: number): void
  /** The current position, ms. */
  time(): number
}

interface PlayerProps {
  src: string
  poster?: string
  /** Where to start, ms. */
  start?: number
  /** Pause there once (the end of a passage), ms. */
  stopAt?: number
  autoPlay?: boolean
  onTime?: (ms: number) => void
  ref?: Ref<PlayerHandle>
}

export function Player({ src, poster, start, stopAt, autoPlay, onTime, ref }: PlayerProps) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const stopped = useRef(false)
  const hlsRef = useRef<Hls | null>(null)
  // A live stream (no end in its playlist), and a playback that waits for too long: a stalled broadcast says so.
  const live = useRef(false)
  const [stalled, setStalled] = useState(false)
  const stall = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastMs = useRef(-1)
  const waiting = () => {
    if (!stall.current) stall.current = setTimeout(() => setStalled(true), 15_000)
  }
  const going = () => {
    clearTimeout(stall.current)
    stall.current = undefined
    setStalled(false)
  }
  useEffect(() => () => clearTimeout(stall.current), [])
  const retry = () => {
    going()
    const hls = hlsRef.current
    const v = video.current
    if (hls) {
      hls.stopLoad()
      hls.startLoad()
      if (live.current && hls.liveSyncPosition !== null && v) v.currentTime = hls.liveSyncPosition
    }
    void v?.play().catch(() => undefined)
  }

  useImperativeHandle(ref, () => ({
    seek(ms: number) {
      const v = video.current
      if (!v) return
      v.currentTime = ms / 1000
      void v.play().catch(() => undefined)
    },
    time: () => (video.current?.currentTime ?? 0) * 1000
  }))

  useEffect(() => {
    stopped.current = false
  }, [src, start, stopAt])

  useEffect(() => {
    const v = video.current
    if (!v || !src) return
    setError('')
    const play = () => autoPlay && void v.play().catch(() => undefined)
    if (Hls.isSupported()) {
      const hls = new Hls({ startPosition: start ? start / 1000 : -1 })
      hlsRef.current = hls
      hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => (live.current = data.details.live))
      let mediaRetries = 0
      let networkRetries = 0
      let reload: ReturnType<typeof setTimeout> | undefined
      hls.on(Hls.Events.MANIFEST_PARSED, play)
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
        if (start) v.currentTime = start / 1000
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
    setError('ce lecteur ne sait pas lire les flux de l’Assemblée')
    // The start position only matters when the stream is loaded: a new one reloads it.
  }, [src]) // eslint-disable-line react-hooks/exhaustive-deps

  const time = (ms: number) => {
    // Going again only when the position moves: a timeupdate without progress is no recovery.
    if (ms !== lastMs.current) {
      lastMs.current = ms
      if (stall.current || stalled) going()
    }
    onTime?.(ms)
    if (stopAt !== undefined && stopAt > 0 && !stopped.current && ms >= stopAt) {
      stopped.current = true
      video.current?.pause()
    }
  }

  return (
    <div className="parlement-player">
      <video
        ref={video}
        controls
        poster={poster || undefined}
        onTimeUpdate={(e) => time(e.currentTarget.currentTime * 1000)}
        onWaiting={waiting}
        onStalled={waiting}
        onPlaying={going}
        onPause={going}
      />
      {error && <p className="bad">✗ {error}</p>}
      {stalled && !error && (
        <p className="small accent">
          {live.current
            ? 'La diffusion ne reprend pas : la séance est peut-être suspendue, ou terminée.'
            : 'La vidéo ne se charge plus : la connexion au portail est peut-être coupée.'}{' '}
          <button className="link" onClick={retry}>
            réessayer
          </button>
        </p>
      )}
    </div>
  )
}
