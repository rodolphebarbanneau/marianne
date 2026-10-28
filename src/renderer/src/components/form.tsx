import { useEffect, useState, type ReactNode } from 'react'
import { Dropdown, type DropdownOption } from './dropdown'

/** A labelled field of a form grid; `wide` spans both columns. */
export function Field({ label, hint, error, wide, children }: { label: string; hint?: string; error?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`field ${wide ? 'wide' : ''} ${error ? 'invalid' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {(error || hint) && <span className={error ? 'field-error' : 'field-hint'}>{error || hint}</span>}
    </label>
  )
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="form-grid">{children}</div>
}

export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus,
  mono
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  autoFocus?: boolean
  /** Identifiers: no spell check, no autocomplete. */
  mono?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      spellCheck={!mono}
      autoComplete="off"
      className={mono ? 'mono' : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function Select<T extends string>({ value, options, onChange }: { value: T; options: Array<DropdownOption<T>>; onChange: (v: T) => void }) {
  return <Dropdown<T> value={value} options={options} onChange={onChange} />
}

/** A local copy of an object being edited, with a dirty flag; reset when the source changes. */
export function useDraft<T>(source: T): [T, (patch: Partial<T>) => void, boolean, () => void] {
  const [draft, setDraft] = useState<T>(source)
  const key = JSON.stringify(source)
  useEffect(() => setDraft(source), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== key
  return [draft, (patch) => setDraft((d) => ({ ...d, ...patch })), dirty, () => setDraft(source)]
}
