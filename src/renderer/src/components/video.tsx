import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import Hls from 'hls.js'
import type { VideoDetail } from '@shared/types'
import { Action, Spinner } from './ui'

const api = window.marianne

export interface PlayerHandle {
  seek(ms: number): void
}

/** An HLS stream in a <video>: native playback when the engine supports it, hls.js otherwise. */
export const Player = forwardRef<PlayerHandle, { src: string; poster?: string; startMs?: number; autoPlay?: boolean; onTime?: (ms: number) => void }>(
  function Player({ src, poster, startMs, autoPlay, onTime }, ref) {
    const video = useRef<HTMLVideoElement>(null)
    const [error, setError] = useState('')

    useImperativeHandle(ref, () => ({
      seek(ms: number) {
        const v = video.current
        if (!v) return
        v.currentTime = ms / 1000
        void v.play().catch(() => undefined)
      }
    }))

    useEffect(() => {
      const v = video.current
      if (!v || !src) return
      setError('')
      const start = () => {
        if (startMs) v.currentTime = startMs / 1000
        if (autoPlay) void v.play().catch(() => undefined)
      }
      if (Hls.isSupported()) {
        const hls = new Hls({ startPosition: startMs ? startMs / 1000 : -1 })
        hls.loadSource(src)
        hls.attachMedia(v)
        hls.on(Hls.Events.MANIFEST_PARSED, () => autoPlay && void v.play().catch(() => undefined))
        hls.on(Hls.Events.ERROR, (_e, data) => data.fatal && setError('lecture impossible : la vidéo n’est peut-être plus en ligne'))
        return () => hls.destroy()
      }
      v.src = src
      v.addEventListener('loadedmetadata', start, { once: true })
      return () => v.removeAttribute('src')
    }, [src]) // eslint-disable-line react-hooks/exhaustive-deps

    return (
      <div className="player">
        <video ref={video} controls poster={poster} onTimeUpdate={(e) => onTime?.(e.currentTarget.currentTime * 1000)} />
        {error && <p className="line error">✗ {error}</p>}
      </div>
    )
  }
)

/** A video of the Assemblée cited in an answer: loads its stream, starts at the cited passage. */
export function VideoCard({ id, timecode }: { id: string; timecode?: number }) {
  const [detail, setDetail] = useState<VideoDetail | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    api
      .getVideo(id)
      .then((d) => alive && setDetail(d))
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [id])

  return (
    <div className="video-card">
      {open && detail?.hls ? <Player src={detail.hls} startMs={timecode} autoPlay /> : null}
      <div className="caption">
        <span>
          <span className="magenta">▶ vidéo · </span>
          {error ? <span className="error">{error}</span> : detail ? <span className="hi">{detail.title}</span> : <Spinner />}
          {detail && <span className="dim"> · {new Date(detail.date).toLocaleDateString('fr-FR')}</span>}
        </span>
        <span>
          {detail?.hls && !open && <Action onClick={() => setOpen(true)}>lire{timecode ? ` à ${Math.floor(timecode / 60000)} min` : ''}</Action>}{' '}
          <Action onClick={() => api.openBrowser(`https://videos.assemblee-nationale.fr/video.${id}${timecode ? `?timecode=${timecode}` : ''}`)}>page</Action>
        </span>
      </div>
    </div>
  )
}
