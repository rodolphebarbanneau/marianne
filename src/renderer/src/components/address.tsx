import { useEffect, useRef, useState } from 'react'
import type { AddressSuggestion } from '@shared/api'

const api = window.marianne

/** An address field with suggestions from the national address base (number, street, commune, insee code). */
export function AddressSearch({ onPick, placeholder }: { onPick: (a: AddressSuggestion) => void; placeholder?: string }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const seq = useRef(0)
  useEffect(() => {
    if (q.trim().length < 4) return setList([])
    const n = ++seq.current
    const t = setTimeout(
      () =>
        void api
          .searchAddress(q)
          .then((r) => {
            if (n !== seq.current) return
            setList(r)
            setError('')
            setOpen(true)
          })
          .catch(() => setError('recherche d’adresse indisponible : saisissez les champs à la main')),
      300
    )
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="address-search">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? 'tapez votre adresse : 12 rue …, commune'}
        spellCheck={false}
      />
      {error && <span className="field-hint">{error}</span>}
      {open && list.length > 0 && (
        <ul className="suggestions">
          {list.map((a) => (
            <li
              key={a.label}
              onMouseDown={(e) => {
                e.preventDefault()
                onPick(a)
                setQ('')
                setList([])
                setOpen(false)
              }}
            >
              {a.label} <span className="dim">· {a.codeInsee}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
