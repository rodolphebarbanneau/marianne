import { useEffect, useInsertionEffect, useState, type RefObject } from 'react'
import { onMediaPrefs, readMediaPrefs, saveMediaPrefs, type MediaPrefs } from './prefs'
import { injectMediaStyles } from './styles'

/** What a <video> is doing, ms, kept current by its events. */
export interface Playback {
  paused: boolean
  ended: boolean
  /** Playing, but waiting for data. */
  waiting: boolean
  time: number
  /** The video's length; a broadcast's: its live edge. */
  total: number
  /** Live: the end of what can be played. */
  edge: number
  /** The end of what is loaded ahead of the position. */
  buffered: number
}

const EVENTS = [
  'timeupdate',
  'durationchange',
  'progress',
  'play',
  'pause',
  'playing',
  'waiting',
  'seeking',
  'seeked',
  'canplay',
  'loadedmetadata',
  'ended',
  'emptied'
] as const

function read(v: HTMLVideoElement): Playback {
  const time = v.currentTime * 1000
  const s = v.seekable
  const edge = s.length ? s.end(s.length - 1) * 1000 : Number.isFinite(v.duration) ? v.duration * 1000 : 0
  const total = Number.isFinite(v.duration) && v.duration > 0 ? v.duration * 1000 : edge
  let buffered = 0
  for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) * 1000 <= time + 500) buffered = v.buffered.end(i) * 1000
  return {
    paused: v.paused,
    ended: v.ended,
    waiting: !v.paused && v.readyState < HTMLMediaElement.HAVE_FUTURE_DATA,
    time,
    total,
    edge,
    buffered
  }
}

const same = (a: Playback, b: Playback) => (Object.keys(a) as (keyof Playback)[]).every((k) => a[k] === b[k])

export function usePlayback(video: RefObject<HTMLVideoElement | null>): Playback {
  const [state, setState] = useState<Playback>({ paused: true, ended: false, waiting: false, time: 0, total: 0, edge: 0, buffered: 0 })
  useEffect(() => {
    const v = video.current
    if (!v) return
    const sync = () => {
      const next = read(v)
      setState((prev) => (same(prev, next) ? prev : next))
    }
    sync()
    for (const e of EVENTS) v.addEventListener(e, sync)
    return () => {
      for (const e of EVENTS) v.removeEventListener(e, sync)
    }
  }, [video])
  return state
}

/** The player's preferences, the same in every player of the window. */
export function useMediaPrefs(): [MediaPrefs, (patch: Partial<MediaPrefs>) => void] {
  const [prefs, setPrefs] = useState(readMediaPrefs)
  useEffect(() => onMediaPrefs(setPrefs), [])
  return [prefs, saveMediaPrefs]
}

/** The player's stylesheet in the page, before anything is drawn. */
export function useMediaStyles(): void {
  useInsertionEffect(() => injectMediaStyles(), [])
}

/** The volume and the sound cut of the preferences, on a <video>. */
export function useVolume(video: RefObject<HTMLVideoElement | null>, prefs: MediaPrefs): void {
  useEffect(() => {
    const v = video.current
    if (!v) return
    v.volume = prefs.volume
    v.muted = prefs.muted
  }, [video, prefs.volume, prefs.muted])
}

/** True while `el` is the page's fullscreen element. */
export function useFullscreen(el: RefObject<HTMLElement | null>): [boolean, () => void] {
  const [full, setFull] = useState(false)
  useEffect(() => {
    const change = () => setFull(!!el.current && document.fullscreenElement === el.current)
    document.addEventListener('fullscreenchange', change)
    return () => document.removeEventListener('fullscreenchange', change)
  }, [el])
  const toggle = () => {
    const node = el.current
    if (!node) return
    if (document.fullscreenElement === node) void document.exitFullscreen().catch(() => undefined)
    else void node.requestFullscreen?.().catch(() => undefined)
  }
  return [full, toggle]
}
