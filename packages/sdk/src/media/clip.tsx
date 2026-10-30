import { useEffect, useState } from 'react'
import { duration } from './time'
import type { MediaClip } from './types'

/** A bound of the clip: its moment, typed or set at the position. */
function Bound({
  label,
  ms,
  when,
  read,
  onChange,
  onHere,
  keyName
}: {
  label: string
  ms: number
  when(ms: number): string
  read(text: string): number | null
  onChange(ms: number): void
  onHere(): void
  keyName: string
}) {
  const shown = when(ms)
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  const commit = () => {
    const v = read(text)
    if (v === null) setText(shown)
    else onChange(v)
  }
  return (
    <span className="b">
      <span className="dim">{label}</span>
      <input
        value={text}
        aria-label={`${label} de l’extrait`}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setText(shown)
        }}
      />
      <button className="btn small" title={`à la position (${keyName})`} onClick={onHere}>
        ici
      </button>
    </span>
  )
}

export interface ClipStripProps {
  clip: MediaClip
  onChange(clip: MediaClip): void
  when(ms: number): string
  /** A typed moment back to ms (the time's mode). */
  read(text: string): number | null
  onFromHere(): void
  onToHere(): void
  /** "caler sur l'intervention": absent when nothing says what is said here. */
  onSnap?: () => void
  onReplay(): void
  onShare?: () => void
  onCancel(): void
  onKeep(): void
}

/** Cutting a clip: the strip under the picture. */
export function ClipStrip(p: ClipStripProps) {
  const { clip } = p
  return (
    <div className="mp-clip" role="group" aria-label="extrait">
      <span className="code">✂ EXTRAIT</span>
      <Bound
        label="début"
        keyName="I"
        ms={clip.from}
        when={p.when}
        read={p.read}
        onChange={(from) => p.onChange({ ...clip, from: Math.min(from, clip.to - 1000) })}
        onHere={p.onFromHere}
      />
      <Bound
        label="fin"
        keyName="O"
        ms={clip.to}
        when={p.when}
        read={p.read}
        onChange={(to) => p.onChange({ ...clip, to: Math.max(to, clip.from + 1000) })}
        onHere={p.onToHere}
      />
      <span className="len">durée {duration(clip.to - clip.from)}</span>
      <span>
        <button className="btn small" disabled={!p.onSnap} onClick={p.onSnap} title="les bornes de l’intervention en cours, d’après l’ordre du jour">
          ⇤ caler sur l’intervention ⇥
        </button>
      </span>
      <span className="title">
        <span className="dim">titre</span>
        <input value={clip.title} aria-label="titre de l’extrait" onChange={(e) => p.onChange({ ...clip, title: e.target.value })} />
      </span>
      <span className="acts">
        <button className="btn small" onClick={p.onReplay}>
          ▶ revoir l’extrait
        </button>
        {p.onShare && (
          <button className="btn small" onClick={p.onShare}>
            partager l’extrait
          </button>
        )}
        <span className="mp-grow" />
        <button className="btn small" onClick={p.onCancel} title="abandonner l’extrait (échap)">
          annuler
        </button>
        <button className="btn small primary" onClick={p.onKeep} title="garder l’extrait (entrée)">
          garder l’extrait
        </button>
      </span>
    </div>
  )
}
