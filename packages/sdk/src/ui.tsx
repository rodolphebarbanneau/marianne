import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Waits } from './wait'

/**
 * The building blocks Marianne's window and services' views share. They take Marianne's look
 * from its stylesheet (classes .spinner, .field, .overlay, .modal), so a service has no styles of
 * its own to write for them.
 */

/** What the screen around a view waits for; none outside one. */
export const WaitContext = createContext<Waits | null>(null)

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

/** How long a `Loading` box takes to appear, so a quick answer doesn't flash it… */
const LOADING_AFTER_MS = 200
/** …and, once it has, the least a screen held back leaves it there, for the same reason. */
const LOADING_LEAST_MS = 350

/** A meter's cells: as many as the lock screen's opening bar. */
const METER_CELLS = 32
/** While nothing says how far it is, one more cell lights at each step… */
const METER_STEP_MS = 70
/** …and the full bar holds this many steps before it starts again. */
const METER_HOLD = 4

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A bar of mosaic cells, as the lock screen's opening bar: lit to `share` (0 to 1) when it is
 * known, the next cell blinking; when it isn't, lit one cell after another, held full a moment, and
 * again, a Minitel's way of saying it is at work. A cell is on or off: nothing slides or fades.
 */
export function Meter({ share, cells = METER_CELLS }: { share?: number | null; cells?: number }) {
  const known = typeof share === 'number' && Number.isFinite(share)
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (known || reducedMotion()) return
    const t = setInterval(() => setStep((n) => (n + 1) % (cells + METER_HOLD)), METER_STEP_MS)
    return () => clearInterval(t)
  }, [known, cells])
  const lit = known ? Math.round(Math.max(0, Math.min(1, share)) * cells) : Math.min(step, cells)
  return (
    <span
      className="meter"
      style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}
      {...(known ? { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(Math.max(0, Math.min(1, share)) * 100) } : {})}
      aria-hidden={known ? undefined : true}
    >
      {Array.from({ length: cells }, (_, i) => (
        <i key={i} className={i < lit ? 'on' : i === lit ? 'on now' : undefined} />
      ))}
    </span>
  )
}

/**
 * What a page, a tab or a pane shows while its content comes: a box in the middle of the space it
 * is given, saying what is coming (`label`, "les prévisions de Bordeaux"), with a Meter (lit to
 * `progress`, 0 to 1, when the share is known; cell after cell otherwise) and a line of `detail`.
 * It appears after a moment, so a quick answer doesn't flash it. `inline`: one line instead, for a
 * part of a page already shown (a list in a card). While a screen opens, `LoadingGate` waits for it
 * too; a wait that says how far it is (`progress`, even unknown: a download) shows at once instead.
 */
export function Loading({ label, progress, detail, inline }: { label?: string; progress?: number | null; detail?: string; inline?: boolean }) {
  const shown = useLater(inline ? 0 : LOADING_AFTER_MS)
  const waits = useContext(WaitContext)
  const reports = progress !== undefined
  useEffect(() => (reports ? undefined : waits?.hold(label)), [waits, label, reports])
  if (inline)
    return (
      <p className="state-line dim" role="status">
        <Spinner /> {coming(label ?? 'chargement')}
      </p>
    )
  const known = typeof progress === 'number' && Number.isFinite(progress)
  const share = known ? Math.max(0, Math.min(1, progress)) : 0
  return (
    <div className="state" role="status" aria-busy="true">
      {shown && (
        <div className="state-box">
          <span className="state-head">
            <span className="label">chargement</span>
            {known && <span className="small">{Math.round(share * 100)} %</span>}
          </span>
          <span className="state-what">{coming(label ?? 'un instant')}</span>
          <Meter share={known ? share : null} />
          {detail && <span className="small dim">{detail}</span>}
        </div>
      )}
    </div>
  )
}

/**
 * A screen shown whole: one `Loading` box in its place until all it loads has come (`useCall`,
 * `useStored`, any `Loading` in it), its children there meanwhile, at their width, loading unseen.
 * Marianne holds each tab back so; a pane opened over a tab holds itself back by the same means. It
 * waits for what the screen loads as it opens: after that, a filter or a search says so in place.
 * `tab`: when it changes, it holds back again, its children kept. `label`: what is coming, until a
 * `Loading` among them says better.
 */
export function LoadingGate({ children, label, tab = '' }: { children: ReactNode; label?: string; tab?: string }) {
  const [came, setCame] = useState<string | null>(null)
  const [said, setSaid] = useState<{ tab: string; what: string } | null>(null)
  const current = useRef(tab)
  current.current = tab
  const [waits] = useState(() => new Waits((what) => setSaid({ tab: current.current, what })))
  // Its children's effects have run: what they load is counted.
  useEffect(() => {
    const opened = Date.now()
    let later: ReturnType<typeof setTimeout> | undefined
    const stop = waits.watch(() => {
      const since = Date.now() - opened
      if (since < LOADING_AFTER_MS) setCame(tab)
      else later = setTimeout(() => setCame(tab), LOADING_AFTER_MS + LOADING_LEAST_MS - since)
    })
    return () => {
      stop()
      clearTimeout(later)
    }
  }, [waits, tab])
  const shown = came === tab
  return (
    <>
      {!shown && <Loading label={said?.tab === tab ? said.what : label} />}
      <WaitContext.Provider value={waits}>
        <div className={shown ? 'load-gate' : 'load-gate waiting'}>{children}</div>
      </WaitContext.Provider>
    </>
  )
}

/** What a `StickyPanel` keeps from the edges of the space it has. */
const PANEL_GAP = 10

/** Where a side panel goes: as far as it was, within what leaves its top in view (a panel that fits) or its end (a taller one). */
export const panelTop = (top: number, room: number, height: number) => Math.min(PANEL_GAP, Math.max(room - height - PANEL_GAP, top))

/**
 * A side panel kept in view while what it sits beside scrolls, without a scroll bar of its own.
 * Taller than the space it has, it moves with the page, either way, until an end of it shows, then
 * stays: all of it is a short scroll away, wherever the page is. `at`: what it shows; when that
 * changes, its top comes back into view.
 */
export function StickyPanel({ className, at, children }: { className?: string; at?: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const toTop = useRef(() => {})
  useEffect(() => {
    const el = panel.current
    let view: HTMLElement | null = null
    for (let p = el?.parentElement ?? null; p && !view; p = p.parentElement) if (/auto|scroll/.test(getComputedStyle(p).overflowY)) view = p
    if (!el || !view) return
    const scroller = view
    let top = PANEL_GAP
    let last = scroller.scrollTop
    const place = () => {
      // Sticky offsets count from inside the scroller's padding.
      top = panelTop(top, scroller.clientHeight - parseFloat(getComputedStyle(scroller).paddingTop), el.offsetHeight)
      el.style.top = `${top}px`
    }
    const scrolled = () => {
      top -= scroller.scrollTop - last
      last = scroller.scrollTop
      place()
    }
    toTop.current = () => {
      top = PANEL_GAP
      place()
    }
    place()
    scroller.addEventListener('scroll', scrolled, { passive: true })
    const observer = new ResizeObserver(place)
    observer.observe(el)
    observer.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', scrolled)
      observer.disconnect()
    }
  }, [])
  useEffect(() => toTop.current(), [at])
  return (
    <div ref={panel} className={`sticky-panel${className ? ` ${className}` : ''}`}>
      {children}
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
 * the room (760 pixels rather than 580). It takes the focus when it opens (the keys are then its
 * own, not those of a field behind it) and gives it back when it closes.
 */
export function Modal({ children, onClose, wide, label }: { children: ReactNode; onClose?: () => void; wide?: boolean; label?: string }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // The dialog itself, not its first button: Enter is then its own action, not that button's.
    if (!box.current?.contains(document.activeElement)) box.current?.focus({ preventScroll: true })
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true })
    }
  }, [])
  useEffect(() => {
    if (!onClose) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return createPortal(
    <div className="overlay">
      <div ref={box} className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>,
    floating()
  )
}
