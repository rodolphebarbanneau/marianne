import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import { SPEEDS, speedLabel, type TimeMode } from './time'
import type { StreamLevel } from './stream'

/** The volume: a slim slider, the Minitel's block as its knob. */
export function Level({ volume, muted, onVolume }: { volume: number; muted: boolean; onVolume(v: number): void }) {
  const el = useRef<HTMLSpanElement>(null)
  const v = muted ? 0 : volume
  const set = (e: ReactPointerEvent) => {
    const r = el.current?.getBoundingClientRect()
    if (r && r.width > 0) onVolume(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)))
  }
  return (
    <span
      ref={el}
      className="mp-level"
      role="slider"
      aria-label="volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      title="volume (↑ ↓)"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        set(e)
      }}
      onPointerMove={(e) => e.buttons & 1 && set(e)}
    >
      <i className="fill" style={{ width: `${v * 100}%` }} />
      <i className="knob" style={{ left: `${v * 100}%` }} />
    </span>
  )
}

/** A line of the menu: its icon and its words. */
const Row = ({ icon, children }: { icon: IconName; children: ReactNode }) => (
  <span className="k">
    <Icon name={icon} size={16} />
    {children}
  </span>
)

export type MenuView = 'main' | 'quality' | 'speed'

export interface OptionsMenuProps {
  view: MenuView
  onView(view: MenuView): void
  levels: StreamLevel[]
  /** The quality chosen (−1 automatic), and the one playing. */
  level: number
  playing: StreamLevel | null
  onLevel(index: number): void
  rate: number
  onRate(rate: number): void
  /** The time toggle: only when the video says when it began. */
  time?: TimeMode
  onTime(mode: TimeMode): void
  onClip?: () => void
  onShare?: () => void
  volume: number
  muted: boolean
  onVolume(v: number): void
  onMute(): void
  onMini?: () => void
  onPip?: () => void
}

const heightLabel = (l: StreamLevel) => `${l.height}p`

/** The gear's menu: qualité, vitesse, temps; garder un extrait, partager; the sound and the mini-player when the bar is narrow; image dans l'image. */
export function OptionsMenu(p: OptionsMenuProps) {
  if (p.view === 'quality') {
    const low = p.levels.at(-1)
    return (
      <div className="menu mp-opts" role="menu" aria-label="qualité">
        <button className="back" onClick={() => p.onView('main')}>
          ‹ qualité
        </button>
        <button className={`pick${p.level < 0 ? ' sel' : ''}`} role="menuitemradio" aria-checked={p.level < 0} onClick={() => p.onLevel(-1)}>
          auto<span className="v">{p.playing ? `en ce moment ${heightLabel(p.playing)}` : ''}</span>
        </button>
        {p.levels.map((l) => (
          <button
            key={l.index}
            className={`pick${p.level === l.index ? ' sel' : ''}`}
            role="menuitemradio"
            aria-checked={p.level === l.index}
            onClick={() => p.onLevel(l.index)}
          >
            {heightLabel(l)}
            <span className="v">{l.height >= 720 ? 'HD' : l === low && p.levels.length > 1 ? 'économe' : ''}</span>
          </button>
        ))}
      </div>
    )
  }
  if (p.view === 'speed') {
    return (
      <div className="menu mp-opts" role="menu" aria-label="vitesse">
        <button className="back" onClick={() => p.onView('main')}>
          ‹ vitesse
        </button>
        {SPEEDS.map((s) => (
          <button key={s} className={`pick${p.rate === s ? ' sel' : ''}`} role="menuitemradio" aria-checked={p.rate === s} onClick={() => p.onRate(s)}>
            {speedLabel(s)}
            <span className="v">{s === 1 ? 'normale' : ''}</span>
          </button>
        ))}
      </div>
    )
  }
  const chosen = p.levels.find((l) => l.index === p.level)
  const quality = chosen ? heightLabel(chosen) : p.playing ? `auto · ${heightLabel(p.playing)}` : 'auto'
  const tools = p.onClip || p.onShare
  return (
    <div className="menu mp-opts" role="menu" aria-label="options">
      <span className="label">options</span>
      {p.levels.length > 1 && (
        <button className="go" onClick={() => p.onView('quality')}>
          <Row icon="quality">qualité</Row>
          <span className="v">{quality}</span>
        </button>
      )}
      <button className="go" onClick={() => p.onView('speed')}>
        <Row icon="speed">vitesse</Row>
        <span className="v">{p.rate === 1 ? 'normale' : speedLabel(p.rate)}</span>
      </button>
      {p.time && (
        <div className="item">
          <Row icon="clock">temps</Row>
          <span className="mp-seg" role="radiogroup" aria-label="temps">
            <button
              className={p.time === 'video' ? 'on' : ''}
              role="radio"
              aria-checked={p.time === 'video'}
              onClick={() => p.onTime('video')}
              title="le temps de la vidéo"
            >
              vidéo
            </button>
            <button
              className={p.time === 'heure' ? 'on' : ''}
              role="radio"
              aria-checked={p.time === 'heure'}
              onClick={() => p.onTime('heure')}
              title="l’heure de la salle"
            >
              heure
            </button>
          </span>
        </div>
      )}
      {tools && <hr />}
      {p.onClip && (
        <button onClick={p.onClip}>
          <Row icon="cut">garder un extrait</Row>
          <span className="sc">X</span>
        </button>
      )}
      {p.onShare && (
        <button className="go" onClick={p.onShare}>
          <Row icon="share">partager le lien</Row>
          <span className="v" />
        </button>
      )}
      <hr />
      <div className="item mp-narrow">
        <button className="k" onClick={p.onMute} title={p.muted ? 'remettre le son (M)' : 'couper le son (M)'}>
          <Icon name={p.muted ? 'mute' : 'sound'} size={16} />
          son
        </button>
        <span className="mp-vol">
          <Level volume={p.volume} muted={p.muted} onVolume={p.onVolume} />
          <span className="v">{p.muted ? 'coupé' : `${Math.round(p.volume * 100)} %`}</span>
        </span>
      </div>
      {p.onMini && (
        <button className="mp-narrow" onClick={p.onMini}>
          <Row icon="mini">mini-lecteur</Row>
          <span className="sc">P</span>
        </button>
      )}
      {p.onPip && (
        <button onClick={p.onPip} title="la fenêtre du système, au-dessus des autres applications">
          <Row icon="pip">image dans l’image</Row>
          <span className="v">système</span>
        </button>
      )}
    </div>
  )
}

export type ShareWhat = 'video' | 'at' | 'clip'

export interface SharePanelProps {
  what: ShareWhat
  onWhat(what: ShareWhat): void
  url: string
  /** The chips' words: "à 0:31:02", "l'extrait · 0:30:58 → 0:32:38" (absent: no clip to share). */
  atLabel: string
  clipLabel?: string
  onBack(): void
  onCopy(): void
  onCopyText(): void
  onOpen(): void
}

/** Partager le lien: the whole video, this moment, or the clip; its public URL, to copy or open. */
export function SharePanel(p: SharePanelProps) {
  const chip = (id: ShareWhat, label: string) => (
    <button className={`chip${p.what === id ? ' on' : ''}`} aria-pressed={p.what === id} onClick={() => p.onWhat(id)}>
      {label}
    </button>
  )
  return (
    <div className="menu mp-share" role="dialog" aria-label="partager le lien">
      <button className="back" onClick={p.onBack}>
        ‹ partager le lien
      </button>
      <div className="in">
        <span className="chips">
          {chip('video', 'la vidéo')}
          {chip('at', p.atLabel)}
          {p.clipLabel && chip('clip', p.clipLabel)}
        </span>
        <span className="url">
          <input readOnly value={p.url} aria-label="le lien" onFocus={(e) => e.currentTarget.select()} />
        </span>
        <span className="acts">
          <button className="btn small primary" onClick={p.onCopy}>
            copier le lien
          </button>
          <button className="btn small" onClick={p.onCopyText}>
            copier avec le titre
          </button>
          <button className="btn small" onClick={p.onOpen}>
            ouvrir dans le navigateur
          </button>
        </span>
      </div>
    </div>
  )
}
