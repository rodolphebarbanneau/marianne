import { useEffect, useState, type ReactNode } from 'react'

/**
 * The building blocks Marianne's window and services' views share. They take Marianne's look
 * from its stylesheet (classes .spinner, .field, .overlay, .modal), so a service has no styles of
 * its own to write for them.
 */

const FRAMES = ['◐', '◓', '◑', '◒']

export function Spinner() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 150)
    return () => clearInterval(t)
  }, [])
  return <span className="spinner">{FRAMES[i]}</span>
}

export function Field({ label, hint, error, wide, children }: { label: string; hint?: ReactNode; error?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      {children}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  )
}

/** A dialog over the window. Échap or a click outside closes it. */
export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  useEffect(() => {
    if (!onClose) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal">{children}</div>
    </div>
  )
}
