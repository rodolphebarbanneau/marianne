import { Component, type ReactNode } from 'react'
import { Failure } from '@marianne/sdk/view'
import type { Usage } from '@shared/types'
import { usePixelRatio } from '../lib/pixel-ratio'
import { SearchIcon } from './icons'

/**
 * The account as a 5×5 symmetric mosaic, from its random id, in its frame. Laid out in screen
 * pixels, as near `size` as whole ones allow: every cell the same number of them, the frame as thick
 * as the window's other lines. A grid of CSS pixels would put some edges between two screen pixels
 * (at 125 %, an 18px mosaic is 22.5 of them) and draw one column a pixel wider than the others.
 */
export function Identicon({ id, size = 18 }: { id: string; size?: number }) {
  const ratio = usePixelRatio()
  const bits = parseInt(id.slice(0, 4) || '0', 16)
  const frame = Math.max(1, Math.round(ratio))
  const cell = Math.max(1, Math.round((size * ratio - 2 * frame) / 5))
  const n = 5 * cell + 2 * frame
  const cells = []
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if ((bits >> (r * 3 + Math.min(c, 4 - c))) & 1) cells.push([r, c])
  return (
    <svg className="identicon" width={n / ratio} height={n / ratio} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" aria-hidden>
      <rect className="frame" width={n} height={n} />
      <rect className="ground" x={frame} y={frame} width={5 * cell} height={5 * cell} />
      {cells.map(([r, c]) => (
        <rect key={r * 5 + c} className="on" x={frame + c * cell} y={frame + r * cell} width={cell} height={cell} />
      ))}
    </svg>
  )
}

/** How full the archive is. */
export function Gauge({ usage, title }: { usage: Usage; title?: string }) {
  const ratio = usage.used / usage.capacity
  return (
    <span className={`gauge${ratio >= 1 ? ' full' : ratio >= 0.8 ? ' warn' : ''}`} title={title}>
      <i style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </span>
  )
}

/** A page's head, the same on every page: its title (shown in pixel capitals), what it is about, its tools on the right. */
export function PageHead({ title, detail, children }: { title: string; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <h1 className="section-title">{title}</h1>
      {detail && <span className="detail">{detail}</span>}
      {children && <span className="tools">{children}</span>}
    </div>
  )
}

/** A search box: the magnifier, then the text, in a frame that lights up while typing. Échap empties it first. */
export function SearchField({
  value,
  onChange,
  placeholder,
  className
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <label className={`search-field${className ? ` ${className}` : ''}`}>
      <SearchIcon />
      <input
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || !value) return
          // Taken: a dialog around it closes on the next Échap only.
          e.preventDefault()
          onChange('')
        }}
      />
    </label>
  )
}

// Shared with the services' views.
export { Failure, Field, Loading, Modal, Notice, Spinner } from '@marianne/sdk/view'

/**
 * Keeps an error in one part of the window (a page, the conversation, a dialog) from blanking
 * the whole app: that part shows the error and a way to retry, the rest stays usable.
 */
export class Boundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.label}]`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <Failure title={`${this.props.label} : une erreur est survenue`} error={this.state.error.message} retry={() => this.setState({ error: null })} />
  }
}
