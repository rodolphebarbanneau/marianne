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
      let recovered = false
      hls.on(Hls.Events.MANIFEST_PARSED, play)
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return
        // A decoding hiccup is worth one more try; anything else ends the playback.
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
          recovered = true
          hls.recoverMediaError()
          return
        }
        setError('lecture impossible : la vidéo n’est peut-être plus en ligne')
      })
      hls.loadSource(src)
      hls.attachMedia(v)
      return () => hls.destroy()
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
    onTime?.(ms)
    if (stopAt && !stopped.current && ms >= stopAt) {
      stopped.current = true
      video.current?.pause()
    }
  }

  return (
    <div className="assemblee-player">
      <video ref={video} controls poster={poster || undefined} onTimeUpdate={(e) => time(e.currentTarget.currentTime * 1000)} />
      {error && <p className="bad">✗ {error}</p>}
    </div>
  )
}
