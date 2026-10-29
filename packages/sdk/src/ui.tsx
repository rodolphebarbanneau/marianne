import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

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

/** Where what floats over the window goes: the window's root, out of a screen's own layout (a service's centred column…). */
export const floating = () => document.getElementById('root') ?? document.body

/**
 * A dialog over the window. Its buttons close it, and échap like its cancel button; a click beside
 * it doesn't, so a stray click loses nothing typed in it.
 */
export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  useEffect(() => {
    if (!onClose) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return createPortal(
    <div className="overlay">
      <div className="modal">{children}</div>
    </div>,
    floating()
  )
}
