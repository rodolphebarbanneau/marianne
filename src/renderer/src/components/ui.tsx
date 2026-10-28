import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/** Track window focus so the title row dims when inactive, like native title bars. */
export function useWindowFocus(): void {
  useEffect(() => {
    const set = () => document.documentElement.classList.toggle('focused', document.hasFocus())
    set()
    window.addEventListener('focus', set)
    window.addEventListener('blur', set)
    return () => {
      window.removeEventListener('focus', set)
      window.removeEventListener('blur', set)
    }
  }, [])
}

/**
 * Draggable title row. The OS draws the window controls; the row is positioned around them
 * with the Window Controls Overlay env() variables (titlebar-area-x/width/height).
 */
export function TitleBar({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <header className="titlebar">
      <div className="titlebar-area">
        <span className="title">{children}</span>
        {right && <span className="right">{right}</span>}
      </div>
    </header>
  )
}

/** A Minitel function key: ENVOI, ANNULATION, RÉPÉTITION… with its keyboard shortcut. */
export function FKey({
  children,
  k,
  onClick,
  primary,
  danger,
  disabled,
  title
}: {
  children: ReactNode
  k?: string
  onClick: () => void
  primary?: boolean
  danger?: boolean
  disabled?: boolean
  title?: string
}) {
  return (
    <button className={`fkey ${primary ? 'primary' : ''} ${danger ? 'danger' : ''}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
      {k && <kbd>{k}</kbd>}
    </button>
  )
}

/** `[ action ]` */
export function Action({
  children,
  onClick,
  disabled,
  danger,
  title
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  title?: string
}) {
  return (
    <button className={`action ${danger ? 'danger' : ''}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}

/** `[x]` / `[ ]` */
export function Check({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button role="checkbox" aria-checked={checked} className="check" onClick={() => onChange(!checked)} disabled={disabled}>
      [<b>{checked ? 'x' : ' '}</b>]
    </button>
  )
}

/** `(•)` / `( )` */
export function Radio({ on }: { on: boolean }) {
  return <span className={`radio ${on ? 'on' : ''}`}>{on ? '(•)' : '( )'}</span>
}

/** Section heading: an inverse-video label and a dashed rule. */
export function Sep({ children, tail }: { children: ReactNode; tail?: ReactNode }) {
  return (
    <div className="sep">
      <span>{children}</span>
      {tail && <span className="tail">{tail}</span>}
    </div>
  )
}

// Help line: rows publish their description to the window's status line on hover/focus.
const HelpContext = createContext<(text: string) => void>(() => undefined)
export const HelpProvider = HelpContext.Provider

export function useHelp(hint?: string) {
  const setHelp = useContext(HelpContext)
  return () => setHelp(hint ?? '')
}

/** Setting row on a shared 3-column grid: label, value, trailing actions. */
export function Row({
  label,
  hint,
  children,
  actions,
  block
}: {
  label: ReactNode
  hint?: string
  children?: ReactNode
  actions?: ReactNode
  block?: boolean
}) {
  const show = useHelp(hint)
  return (
    <div className={`row ${block ? 'block' : ''}`} onMouseEnter={show} onFocus={show}>
      <span className="label">{label}</span>
      <span className="value">{children}</span>
      {actions && <span className="actions">{actions}</span>}
    </div>
  )
}

/** Container for ListRows: columns (main · meta · actions) line up across rows via subgrid. */
export function List({ children }: { children: ReactNode }) {
  return <div className="list">{children}</div>
}

export function ListRow({
  children,
  meta,
  actions,
  hint,
  selected
}: {
  children: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  hint?: string
  selected?: boolean
}) {
  const show = useHelp(hint)
  return (
    <div className={`list-row ${selected ? 'selected' : ''}`} onMouseEnter={show} onFocus={show}>
      <span className="list-main">{children}</span>
      <span className="list-meta">{meta}</span>
      <span className="list-actions">{actions}</span>
    </div>
  )
}

/** Text input that commits on blur/Enter (avoids saving config on every keystroke). */
export function TextInput({
  value,
  onCommit,
  placeholder,
  type = 'text',
  multiline,
  rows = 3
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  type?: string
  multiline?: boolean
  rows?: number
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => draft !== value && onCommit(draft)
  if (multiline) return <textarea rows={rows} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}

/** A horizontal bar: `filled` of `cells` solid, the rest dotted. */
export function Blocks({ cells, filled }: { cells: number; filled: number }) {
  return (
    <span className="blocks" style={{ width: `${cells}ch` }}>
      <span className="fill" style={{ width: `${(Math.max(0, Math.min(cells, filled)) / cells) * 100}%` }} />
    </span>
  )
}

/** Progress: ████░░░░  45%  (indeterminate without a total). */
export function Bar({ value, total, label }: { value: number; total: number; label?: string }) {
  const width = 16
  return (
    <span className="bar">
      {total > 0 ? <Blocks cells={width} filled={Math.round((value / total) * width)} /> : <Spinner />}
      <span className="dim"> {label ?? (total > 0 ? percent(value / total) : '')}</span>
    </span>
  )
}

export function percent(ratio: number): string {
  return `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`.padStart(4)
}

const FRAMES = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

export function Spinner() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 90)
    return () => clearInterval(id)
  }, [])
  return <span className="spin">{FRAMES[i]}</span>
}
