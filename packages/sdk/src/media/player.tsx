import { useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type Ref } from 'react'
import { Spinner } from '../ui'
import { useHostOptional } from '../view'
import { clipTitleAt, saidAt, spanAt } from './chapters'
import { ClipStrip } from './clip'
import { useFullscreen, useMediaPrefs, useMediaStyles, usePlayback, useVolume } from './hooks'
import { Icon, SkipIcon } from './icons'
import { keyAction, ownsKeys, SKIP_MS, type MediaAction } from './keys'
import { OptionsMenu, SharePanel, Level, type MenuView, type ShareWhat } from './menu'
import { useStream } from './stream'
import { delay, nextSpeed, readTime, speedLabel, timeWriter, videoTime } from './time'
import { Track } from './timeline'
import { trackRange, type TrackRange } from './track'
import type { MediaChapter, MediaClip, MediaSpan, PinnedMedia } from './types'

export interface PlayerHandle {
  /** To a position, ms; and plays, unless `play` is false. */
  seek(ms: number, play?: boolean): void
  /** The position, ms. */
  time(): number
  play(): void
  pause(): void
  /** Live: to the live edge. */
  toLive(): void
}

export interface PlayerProps {
  src: string
  poster?: string
  /** A hint; live is also detected from the playlist (no ENDLIST). */
  live?: boolean
  /** Where to start, ms. */
  start?: number
  /** Pause there once (the end of a passage), ms. */
  stopAt?: number
  autoPlay?: boolean
  chapters?: MediaChapter[]
  /** Stretches with nothing to see (suspensions): dark on the track. */
  gaps?: MediaSpan[]
  /** Clips already kept: a yellow line above the track. */
  kept?: MediaSpan[]
  /** Unix ms of position 0: enables the "heure" (clock) time mode. */
  clockStart?: number
  /** Fullscreen top line / mini caption. */
  title?: string
  badge?: string
  onTime?(ms: number): void
  /** The current subject label was clicked. */
  onChapter?(chapter: MediaChapter): void
  /** Fullscreen agenda key. */
  onAgenda?(): void
  /** The share panel: a public link for the whole video (null), a moment (ms), or a clip. Absent: no share entry. */
  shareUrl?(at: number | null, clip?: MediaSpan): string
  /** "copier avec le titre": the line to copy. */
  shareText?(url: string, at: number | null, clip?: MediaClip): string
  /** Clip mode: absent → no clip entry. Called by "garder l'extrait". */
  onKeepClip?(clip: MediaClip): void
  /** "caler sur l'intervention": the span of what is said at ms (from the chapters by default). */
  snapClip?(ms: number): MediaSpan | null
  /** A suggested title for a clip being cut (default: the chapter's subject · speaker). */
  clipTitle?(span: MediaSpan): string
  /** Mini-player: absent → no mini key and no auto-pin. */
  pin?: Omit<PinnedMedia, 'src' | 'poster' | 'at' | 'live'>
  ref?: Ref<PlayerHandle>
}

const NO_CHAPTERS: MediaChapter[] = []
const NO_SPANS: MediaSpan[] = []

/** Without a move of the mouse for this long, while it plays, the controls fade away. */
const IDLE_MS = 3000
/** A second click within this is a double click: the first one's play/pause waits for it. */
const CLICK_MS = 220
/** Live: this close to the live edge, the player is at it (DIRECT lit). */
const EDGE_MS = 10_000
/** Live, without hls.js's own idea of it: the edge is played from this far back. */
const LIVE_BACK_MS = 30_000

/** The player that has the page's keys while nothing else has the focus: the last one used. */
let keyHolder: object | null = null

/**
 * A video: an HLS stream with Marianne's controls over the picture. The track with the agenda,
 * the clip being cut and the share panel; the keyboard; fullscreen; the mini-player of the app
 * (when the host has one and `pin` says how to come back).
 */
export function Player(props: PlayerProps) {
  const {
    src,
    poster,
    start,
    stopAt,
    autoPlay,
    clockStart,
    title,
    badge,
    onTime,
    onChapter,
    onAgenda,
    shareUrl,
    shareText,
    onKeepClip,
    snapClip,
    clipTitle,
    pin,
    ref
  } = props
  const chapters = props.chapters ?? NO_CHAPTERS
  const gaps = props.gaps ?? NO_SPANS
  const kept = props.kept ?? NO_SPANS
  useMediaStyles()
  const host = useHostOptional()
  const root = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const stream = useStream(video, src, { start, autoPlay, live: props.live })
  const pb = usePlayback(video)
  const [prefs, setPrefs] = useMediaPrefs()
  useVolume(video, prefs)
  const [full, toggleFull] = useFullscreen(root)
  const [rate, setRate] = useState(1)
  const [menu, setMenu] = useState<MenuView | 'share' | null>(null)
  const [share, setShare] = useState<{ what: ShareWhat; at: number }>({ what: 'at', at: 0 })
  const [clip, setClip] = useState<MediaClip | null>(null)
  const [held, setHeld] = useState<TrackRange | null>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [idle, setIdle] = useState(false)
  const [flash, setFlash] = useState<{ dir: -1 | 1; seconds: number } | null>(null)
  const [away, setAway] = useState(false)
  const [started, setStarted] = useState(false)

  const live = stream.live
  const total = live ? pb.edge : pb.total
  const time = scrub ?? pb.time
  const mode = clockStart !== undefined ? prefs.time : 'video'
  const when = timeWriter(mode, clockStart, total)
  const read = (text: string) => readTime(text, mode === 'heure' ? clockStart : undefined)
  const liveTarget = () => {
    const sync = stream.liveSync()
    return sync !== null ? sync * 1000 : Math.max(0, pb.edge - LIVE_BACK_MS)
  }
  const atEdge = live && pb.time >= liveTarget() - EDGE_MS
  const canPin = !!pin && !!host?.media
  const said = saidAt(chapters, pb.time)
  const playingLevel = stream.levels.find((l) => l.index === stream.playing) ?? null

  // ---- playing

  const play = useCallback(() => {
    setAway(false)
    void video.current?.play().catch(() => undefined)
  }, [])
  const seekTo = useCallback((ms: number) => {
    const v = video.current
    if (v) v.currentTime = Math.max(0, ms) / 1000
  }, [])
  const toggle = () => {
    const v = video.current
    if (!v) return
    if (v.paused || v.ended) play()
    else v.pause()
  }
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const skip = (ms: number) => {
    // From the element's own position: two presses in a row add up before the next render.
    seekTo(Math.min(Math.max(0, (video.current?.currentTime ?? 0) * 1000 + ms), total || Infinity))
    const dir = ms < 0 ? -1 : 1
    // Pressed again in a row: the seconds add up (−20 s, −30 s…).
    setFlash((f) => ({ dir, seconds: (f && f.dir === dir ? f.seconds : 0) + Math.abs(ms) / 1000 }))
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 650)
  }
  const toLive = useCallback(() => {
    const sync = stream.liveSync()
    const v = video.current
    if (!v) return
    const s = v.seekable
    const edge = s.length ? s.end(s.length - 1) * 1000 : 0
    seekTo(sync !== null ? sync * 1000 : Math.max(0, edge - LIVE_BACK_MS))
    play()
  }, [stream, seekTo, play])

  // The end of a passage: paused there once. "revoir l'extrait" sets one too.
  const stopRef = useRef<number | null>(null)
  useEffect(() => {
    stopRef.current = stopAt !== undefined && stopAt > 0 ? stopAt : null
  }, [src, start, stopAt])
  const timeRef = useRef(0)
  const playingRef = useRef(false)
  const onTimeUpdate = () => {
    const ms = (video.current?.currentTime ?? 0) * 1000
    timeRef.current = ms
    onTime?.(ms)
    if (stopRef.current !== null && ms >= stopRef.current) {
      stopRef.current = null
      video.current?.pause()
    }
  }

  useEffect(() => {
    const v = video.current
    if (!v) return
    v.defaultPlaybackRate = rate
    v.playbackRate = rate
  }, [rate, src])

  useImperativeHandle(
    ref,
    () => ({
      seek(ms: number, andPlay = true) {
        seekTo(ms)
        if (andPlay) play()
      },
      time: () => (video.current?.currentTime ?? 0) * 1000,
      play,
      pause: () => video.current?.pause(),
      toLive
    }),
    [seekTo, play, toLive]
  )

  // ---- the mini-player

  const pinNow = () => {
    if (!pin || !host?.media) return
    host.media.pin({ ...pin, src, poster, at: pb.time, live })
    video.current?.pause()
    setAway(true)
    setMenu(null)
    if (document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => undefined)
  }
  // Leaving the page of a video that plays: it goes on in the corner.
  const latest = useRef({ pin, host, src, poster, live, away })
  latest.current = { pin, host, src, poster, live, away }
  useEffect(
    () => () => {
      const l = latest.current
      if (l.pin && l.host?.media && playingRef.current && !l.away)
        l.host.media.pin({ ...l.pin, src: l.src, poster: l.poster, at: timeRef.current, live: l.live })
    },
    []
  )

  // ---- clips

  const snap = (ms: number) => (snapClip ? snapClip(ms) : spanAt(chapters, ms, total))
  const titleOf = (span: MediaSpan) => clipTitle?.(span) ?? clipTitleAt(chapters, span.from)
  const startClip = () => {
    const at = pb.time
    const span = snap(at) ?? { from: at, to: Math.min(total || at + 60_000, at + 60_000) }
    setClip({ ...span, title: titleOf(span) })
    setMenu(null)
  }
  const keepClip = () => {
    if (!clip || !onKeepClip) return
    onKeepClip({ from: Math.round(clip.from), to: Math.round(clip.to), title: clip.title.trim() || titleOf(clip) })
    setClip(null)
  }
  const boundHere = (which: 'from' | 'to') =>
    setClip((c) => {
      if (!c) return c
      const at = pb.time
      if (which === 'from') return { ...c, from: at, to: c.to > at + 1000 ? c.to : Math.min(total, at + 30_000) }
      return { ...c, to: at, from: c.from < at - 1000 ? c.from : Math.max(0, at - 30_000) }
    })

  // ---- sharing

  const openShare = (what: ShareWhat) => {
    setShare({ what, at: pb.time })
    setMenu('share')
  }
  const shareAt = share.what === 'video' ? null : share.what === 'clip' && clip ? clip.from : share.at
  const shareClip = share.what === 'clip' && clip ? clip : undefined
  const url = menu === 'share' && shareUrl ? shareUrl(shareAt, shareClip && { from: shareClip.from, to: shareClip.to }) : ''
  const copy = (text: string, done: string) => {
    if (host) host.copy(text, done)
    else void navigator.clipboard?.writeText(text).catch(() => undefined)
  }
  const lineOf = () => {
    if (shareText) return shareText(url, shareAt, shareClip)
    const what = shareClip
      ? `${shareClip.title} (${when(shareClip.from)} → ${when(shareClip.to)})`
      : [title, shareAt !== null ? `à ${when(shareAt)}` : ''].filter(Boolean).join(' · ')
    return what ? `${what}\n${url}` : url
  }

  // ---- the keyboard

  const act = (a: MediaAction) => {
    switch (a.type) {
      case 'toggle':
        return toggle()
      case 'skip':
        return skip(a.ms)
      case 'volume': {
        const volume = Math.round(Math.min(1, Math.max(0, (prefs.muted ? 0 : prefs.volume) + a.step)) * 100) / 100
        return setPrefs({ volume, muted: volume === 0 })
      }
      case 'mute':
        return setPrefs(prefs.muted && prefs.volume === 0 ? { muted: false, volume: 0.5 } : { muted: !prefs.muted })
      case 'fullscreen':
        return toggleFull()
      case 'mini':
        return pinNow()
      case 'speed':
        return setRate((r) => nextSpeed(r, a.step))
      case 'seekShare':
        return seekTo(a.share * total)
      case 'clip':
        return clip ? setClip(null) : startClip()
      case 'clipFrom':
        return boundHere('from')
      case 'clipTo':
        return boundHere('to')
      case 'clipKeep':
        return keepClip()
      case 'clipCancel':
        return setClip(null)
      case 'live':
        return toLive()
      case 'agenda':
        return onAgenda?.()
      case 'close':
        return setMenu(null)
    }
  }
  const keyed = useRef(false)
  const onKey = (e: KeyboardEvent | ReactKeyboardEvent) => {
    if (e.defaultPrevented) return
    // A field keeps its keys; Échap there closes a menu, not the clip being cut.
    if (ownsKeys(e.target) && !(e.key === 'Escape' && menu !== null)) return
    // Entrée on one of its keys presses it.
    if (e.key === 'Enter' && (e.target as HTMLElement | null)?.closest?.('button')) return
    const a = keyAction(e, { popup: menu !== null, clipping: !!clip, clips: !!onKeepClip, live, mini: canPin, agenda: full && !!onAgenda })
    if (!a) return
    e.preventDefault()
    keyed.current = e.key === ' '
    act(a)
    wake()
  }
  const onKeyRef = useRef(onKey)
  onKeyRef.current = onKey
  const self = useRef({})
  useEffect(() => {
    const me = self.current
    keyHolder = me
    const onDocument = (e: KeyboardEvent) => {
      if (keyHolder !== me) return
      const focus = document.activeElement
      if (focus && focus !== document.body && focus !== document.documentElement) return
      // A dialog over the page has the keys.
      if (document.querySelector('.overlay')) return
      onKeyRef.current(e)
    }
    document.addEventListener('keydown', onDocument)
    return () => {
      document.removeEventListener('keydown', onDocument)
      if (keyHolder === me) keyHolder = null
    }
  }, [])

  // ---- the controls fade away while it plays

  const calm = !pb.paused && menu === null && !clip && !away
  const calmRef = useRef(calm)
  calmRef.current = calm
  const overControls = useRef(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const arm = useCallback(() => {
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => calmRef.current && !overControls.current && setIdle(true), IDLE_MS)
  }, [])
  const wake = () => {
    setIdle(false)
    arm()
  }
  useEffect(() => {
    if (calm) arm()
    else setIdle(false)
  }, [calm, arm])
  useEffect(
    () => () => {
      clearTimeout(idleTimer.current)
      clearTimeout(flashTimer.current)
    },
    []
  )

  // A menu closes on a click elsewhere.
  const popup = useRef<HTMLDivElement>(null)
  const gear = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (menu === null) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (!popup.current?.contains(t) && !gear.current?.contains(t)) setMenu(null)
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [menu])

  // ---- the picture: a click plays or pauses; a double click on a side, ∓10 s; in the middle, fullscreen

  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(clickTimer.current), [])
  const onPicture = (e: MouseEvent<HTMLDivElement>) => {
    if (menu !== null) return setMenu(null)
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const side = x < 1 / 3 ? -1 : x > 2 / 3 ? 1 : 0
    clearTimeout(clickTimer.current)
    if (e.detail <= 1) {
      clickTimer.current = setTimeout(toggle, CLICK_MS)
      return
    }
    if (side) skip(side * SKIP_MS)
    else if (e.detail === 2) toggleFull()
  }

  const range = held ?? trackRange(total, clip)
  const gearTag = rate !== 1 ? speedLabel(rate) : playingLevel && playingLevel.height >= 720 ? 'HD' : ''
  const pip = typeof document !== 'undefined' && document.pictureInPictureEnabled
  const togglePip = () => {
    setMenu(null)
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined)
    else void video.current?.requestPictureInPicture().catch(() => undefined)
  }
  const setVolume = (volume: number) => setPrefs({ volume, muted: volume === 0 })
  const toggleMute = () => act({ type: 'mute' })
  const sound = prefs.muted || prefs.volume === 0 ? 'mute' : 'sound'

  return (
    <div
      ref={root}
      className={`mp${full ? ' full' : ''}${idle && calm ? ' idle' : ''}`}
      tabIndex={0}
      aria-label={title ? `lecteur vidéo : ${title}` : 'lecteur vidéo'}
      onKeyDown={onKey}
      onKeyUp={(e) => {
        // Espace, handled as play/pause, doesn't also press the key that has the focus.
        if (e.key === ' ' && keyed.current) e.preventDefault()
        keyed.current = false
      }}
      onPointerDown={() => (keyHolder = self.current)}
      onFocus={() => (keyHolder = self.current)}
      onMouseMove={(e) => {
        overControls.current = !!(e.target as Element).closest('.mp-over > *, .menu, .mp-top, .mp-clip')
        wake()
      }}
      onMouseLeave={() => calm && setIdle(true)}
    >
      <div className="mp-stage">
        <div className="mp-screen" onClick={onPicture}>
          <video
            ref={video}
            poster={poster || undefined}
            playsInline
            onTimeUpdate={onTimeUpdate}
            onPlay={() => {
              playingRef.current = true
              setStarted(true)
              setAway(false)
            }}
            onPause={() => (playingRef.current = false)}
            onEnded={() => (playingRef.current = false)}
          />
        </div>
        {full && (
          <div className="mp-top">
            {badge && (
              <span className="mp-badge" data-badge={badge}>
                {badge}
              </span>
            )}
            {live && <span className="mp-onair">● en direct</span>}
            <span className="what">
              {title && <b>{title}</b>}
              {(said.subject || said.speaker) && <span className="dim"> · {[said.subject?.title, said.speaker].filter(Boolean).join(' · ')}</span>}
            </span>
          </div>
        )}
        {away && (
          <div className="mp-away" onClick={play}>
            <Icon name="mini" size={27} />
            <span>la vidéo continue dans le mini-lecteur</span>
          </div>
        )}
        {pb.paused && !away && (started || !autoPlay) && !stream.error && (
          <button className="mp-big" onClick={play} title="lecture (espace)">
            <Icon name="play" size={27} />
          </button>
        )}
        {pb.waiting && !stream.error && !stream.stalled && (
          <span className="mp-wait" aria-label="chargement">
            <Spinner />
          </span>
        )}
        {flash && (
          <span className={`mp-flash ${flash.dir < 0 ? 'back' : 'fwd'}`} aria-hidden="true">
            <Icon name={flash.dir < 0 ? 'chevBack' : 'chevFwd'} size={22} />
            {flash.dir < 0 ? '−' : '+'}
            {flash.seconds} s
          </span>
        )}
        {(stream.error || stream.stalled) && (
          <p className="mp-note" role="status">
            {stream.error ? (
              <span className="bad">✗ {stream.error}</span>
            ) : (
              <>
                {live
                  ? 'La diffusion ne reprend pas : la séance est peut-être suspendue, ou terminée.'
                  : 'La vidéo ne se charge plus : la connexion est peut-être coupée.'}{' '}
                <button className="link" onClick={stream.retry}>
                  réessayer
                </button>
              </>
            )}
          </p>
        )}
        <div className="mp-over">
          <Track
            range={range}
            at={time}
            buffered={pb.buffered}
            total={total}
            live={live}
            chapters={chapters}
            gaps={gaps}
            kept={kept}
            clip={clip}
            when={when}
            quiet={menu !== null}
            onSeek={seekTo}
            onScrub={setScrub}
            onClip={(span) => setClip((c) => c && { ...c, ...span })}
            onHold={(h) => setHeld(h ? trackRange(total, clip) : null)}
          />
          <div className="mp-bar">
            <button className="mp-btn" onClick={toggle} title={pb.paused ? 'lecture (espace)' : 'pause (espace)'}>
              <Icon name={pb.paused ? 'play' : 'pause'} />
            </button>
            <button className="mp-btn" onClick={() => skip(-SKIP_MS)} title="reculer de 10 s (←)">
              <SkipIcon dir={-1} />
            </button>
            <button className="mp-btn" onClick={() => skip(SKIP_MS)} title="avancer de 10 s (→)">
              <SkipIcon dir={1} />
            </button>
            <span className="mp-vol mp-wide">
              <button className="mp-btn" onClick={toggleMute} title={sound === 'mute' ? 'remettre le son (M)' : 'couper le son (M)'}>
                <Icon name={sound} />
              </button>
              <Level volume={prefs.volume} muted={prefs.muted} onVolume={setVolume} />
            </span>
            <span className="mp-time">
              {mode === 'heure' ? (
                <>
                  {when(time)}
                  {live && !atEdge && <span className="late">{delay(Math.max(0, pb.edge - time))}</span>}
                </>
              ) : (
                <>
                  {videoTime(time, total)} <span className="of">/ {videoTime(total, total)}</span>
                </>
              )}
            </span>
            {live && (
              <button className={`mp-live${atEdge ? ' edge' : ''}`} onClick={toLive} title={atEdge ? 'au direct' : 'revenir au direct (Fin)'}>
                <Icon name="dot" size={11} />
                DIRECT
              </button>
            )}
            {said.subject &&
              (onChapter ? (
                <button className="mp-chap" onClick={() => said.subject && onChapter(said.subject)} title="dans l’ordre du jour">
                  {said.subject.title}
                </button>
              ) : (
                <span className="mp-chap">{said.subject.title}</span>
              ))}
            <span className="mp-grow" />
            {full && onAgenda && (
              <button className="mp-btn" onClick={onAgenda} title="ordre du jour (O)">
                <Icon name="list" />
              </button>
            )}
            <button
              ref={gear}
              className={`mp-btn${menu !== null ? ' on' : ''}`}
              onClick={() => setMenu((m) => (m === null ? 'main' : null))}
              title="options : qualité, vitesse, temps, extrait, partager"
              aria-haspopup="menu"
              aria-expanded={menu !== null}
            >
              <Icon name="gear" />
              {gearTag && <span className="badge-x">{gearTag}</span>}
            </button>
            {canPin && !full && (
              <button className="mp-btn mp-wide" onClick={pinNow} title="mini-lecteur : la vidéo dans un coin, partout dans Marianne (P)">
                <Icon name="mini" />
              </button>
            )}
            <button className="mp-btn" onClick={toggleFull} title={full ? 'quitter le plein écran (échap)' : 'plein écran (F)'}>
              <Icon name={full ? 'unfull' : 'full'} />
            </button>
          </div>
        </div>
        {menu !== null && (
          <div ref={popup} className="mp-popup">
            {menu === 'share' ? (
              <SharePanel
                what={share.what}
                onWhat={(what) => setShare((s) => ({ ...s, what }))}
                url={url}
                atLabel={`à ${when(share.at)}`}
                clipLabel={clip ? `l’extrait · ${when(clip.from)} → ${when(clip.to)}` : undefined}
                onBack={() => setMenu(clip ? null : 'main')}
                onCopy={() => copy(url, 'lien copié')}
                onCopyText={() => copy(lineOf(), 'lien copié avec le titre')}
                onOpen={() => (host ? host.openUrl(url) : window.open(url, '_blank', 'noopener'))}
              />
            ) : (
              <OptionsMenu
                view={menu}
                onView={setMenu}
                levels={stream.levels}
                level={stream.level}
                playing={playingLevel}
                onLevel={(i) => {
                  stream.setLevel(i)
                  setMenu('main')
                }}
                rate={rate}
                onRate={(r) => {
                  setRate(r)
                  setMenu('main')
                }}
                time={clockStart !== undefined ? mode : undefined}
                onTime={(time) => setPrefs({ time })}
                onClip={onKeepClip && (clip ? undefined : startClip)}
                onShare={shareUrl && (() => openShare('at'))}
                volume={prefs.volume}
                muted={prefs.muted}
                onVolume={setVolume}
                onMute={toggleMute}
                onMini={canPin ? pinNow : undefined}
                onPip={pip ? togglePip : undefined}
              />
            )}
          </div>
        )}
      </div>
      {clip && (
        <ClipStrip
          clip={clip}
          onChange={setClip}
          when={when}
          read={read}
          onFromHere={() => boundHere('from')}
          onToHere={() => boundHere('to')}
          onSnap={
            snap(pb.time)
              ? () => {
                  const span = snap(pb.time)
                  if (span) setClip((c) => c && { ...c, ...span })
                }
              : undefined
          }
          onReplay={() => {
            stopRef.current = clip.to
            seekTo(clip.from)
            play()
          }}
          onShare={shareUrl && (() => openShare('clip'))}
          onCancel={() => setClip(null)}
          onKeep={keepClip}
        />
      )}
    </div>
  )
}
