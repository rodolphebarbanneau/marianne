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

/** True once a moment has passed: a wait that ends quickly shows nothing. */
function useLater(ms: number): boolean {
  const [later, setLater] = useState(ms <= 0)
  useEffect(() => {
    if (ms <= 0) return
    const t = setTimeout(() => setLater(true), ms)
    return () => clearTimeout(t)
  }, [ms])
  return later
}

/** "les prévisions" → "les prévisions…". */
const coming = (label: string) => (/[….]$/.test(label) ? label : `${label}…`)

const CELLS = Array.from({ length: 24 }, (_, i) => i)

/**
 * What a page, a tab or a pane shows while its content comes: a box in the middle of the space it
 * is given, saying what is coming (`label`, "les prévisions de Bordeaux"), with a bar (filled to
 * `progress`, 0 to 1, when the share is known; moving otherwise) and a line of `detail`. It
 * appears after a moment, so a quick answer doesn't flash it. `inline`: one line instead, for a
 * part of a page already shown (a list in a card).
 */
export function Loading({ label, progress, detail, inline }: { label?: string; progress?: number | null; detail?: string; inline?: boolean }) {
  const shown = useLater(inline ? 0 : 200)
  if (inline)
    return (
      <p className="state-line dim" role="status">
        <Spinner /> {coming(label ?? 'chargement')}
      </p>
    )
  const known = typeof progress === 'number' && Number.isFinite(progress)
  const share = known ? Math.max(0, Math.min(1, progress)) : 0
  const lit = Math.round(share * CELLS.length)
  return (
    <div className="state" role="status" aria-busy="true">
      {shown && (
        <div className="state-box">
          <span className="state-head">
            <span className="label">chargement</span>
            {known && <span className="small">{Math.round(share * 100)} %</span>}
          </span>
          <span className="state-what">{coming(label ?? 'un instant')}</span>
          <span
            className={`state-bar${known ? '' : ' moving'}`}
            {...(known ? { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(share * 100) } : {})}
          >
            {CELLS.map((i) => (
              <i key={i} className={known && i < lit ? 'on' : undefined} style={{ animationDelay: `${i * 55}ms` }} />
            ))}
          </span>
          {detail && <span className="small dim">{detail}</span>}
        </div>
      )}
    </div>
  )
}

/**
 * What a page, a tab or a pane shows when its content couldn't come: the same box as `Loading`,
 * where it would have been, with what went wrong and a way to try again. `title`: what is missing
 * ("Prévisions indisponibles"). `inline`: one line, for a part of a page.
 */
export function Failure({ title, error, retry, inline }: { title?: string; error: string; retry?: () => void; inline?: boolean }) {
  const again = retry && (
    <button className={inline ? 'link' : 'btn small'} onClick={retry}>
      réessayer
    </button>
  )
  if (inline)
    return (
      <p className="state-line bad" role="alert">
        ✗ {title ? `${title} : ` : ''}
        {error} {again}
      </p>
    )
  return (
    <div className="state" role="alert">
      <div className="state-box failed">
        <span className="state-head">
          <span className="label">✗ {title ?? 'indisponible'}</span>
        </span>
        <span className="state-what">{error}</span>
        {again && <span>{again}</span>}
      </div>
    </div>
  )
}

/** A note above a page's content: something to know, or to do first, with the way to do it. */
export function Notice({ children, action }: { children: ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="box-note">
      {children}
      {action && (
        <>
          {' '}
          <button className="link" onClick={action.onClick}>
            {action.label}
          </button>
        </>
      )}
    </div>
  )
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
 * it doesn't, so a stray click loses nothing typed in it. `wide`: for a list or a review that needs
 * the room (760 pixels rather than 580).
 */
export function Modal({ children, onClose, wide, label }: { children: ReactNode; onClose?: () => void; wide?: boolean; label?: string }) {
  useEffect(() => {
    if (!onClose) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return createPortal(
    <div className="overlay">
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>,
    floating()
  )
}
