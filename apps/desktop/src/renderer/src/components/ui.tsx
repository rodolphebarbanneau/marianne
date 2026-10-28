import { Component, type ReactNode } from 'react'
import type { Usage } from '@shared/types'

/** The account as a 5×5 symmetric mosaic, from its random id. */
export function Identicon({ id, size = 18 }: { id: string; size?: number }) {
  const bits = parseInt(id.slice(0, 4) || '0', 16)
  const cells = []
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) cells.push((bits >> (r * 3 + Math.min(c, 4 - c))) & 1)
  return (
    <span className="identicon" style={{ width: size, height: size }} aria-hidden>
      {cells.map((on, i) => (
        <i key={i} className={on ? 'on' : ''} />
      ))}
    </span>
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

// Shared with the services' views.
export { Field, Modal, Spinner } from '@marianne/sdk/view'

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
    return (
      <div className="section">
        <p className="bad">✗ {this.props.label} : une erreur est survenue.</p>
        <p className="dim selectable">{this.state.error.message}</p>
        <button className="btn small" onClick={() => this.setState({ error: null })}>
          réessayer
        </button>
      </div>
    )
  }
}
