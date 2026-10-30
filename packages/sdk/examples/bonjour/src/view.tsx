import { useState, type FormEvent } from 'react'
import { errorText, Failure, Field, Loading, Notice, Pixels, ServiceTools, Spinner, useCall, useHost, useStored, type PixelArt } from '@marianne/sdk/view'
import { visitsText } from './greet'
import type { BonjourMethods, Greeting } from './types'
import './view.css'

/** 3615 BONJOUR: one page, made of the SDK's blocks: a greeting for the name given, the visits counted. */

const WAVE: PixelArt = {
  palette: { j: 'jaune', J: 'jaune-sombre' },
  pixels: ['..j.j...', '.jj.jj..', '.jjjjj.j', '.jjjjjjj', 'Jjjjjjj.', '.Jjjjjj.', '..Jjjj..', '...JJ...']
}

export function View() {
  const host = useHost<BonjourMethods>()
  const [kept, keep] = useStored<{ name: string }>('prefs', { name: '' })
  const [draft, setDraft] = useState<string | null>(null)
  const [greeting, setGreeting] = useState<Greeting | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const visits = useCall<BonjourMethods, 'visits'>('visits', [])
  const name = draft ?? kept.name

  const greet = (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    host
      .call('greet', name)
      .then((g) => {
        setGreeting(g)
        keep({ name: name.trim() })
        visits.reload()
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false))
  }
  const reset = () =>
    void host.call('reset').then(() => {
      setGreeting(null)
      visits.reload()
      host.toast('compteur remis à zéro')
    })

  if (visits.error) return <Failure title="3615 BONJOUR indisponible" error={visits.error} retry={visits.reload} />
  if (visits.data === null) return <Loading label="vos visites" />
  return (
    <div className="bonjour">
      <ServiceTools>
        <button className="btn small" onClick={reset} disabled={!visits.data}>
          remettre à zéro
        </button>
      </ServiceTools>
      {!host.home && (
        <Notice action={{ label: 'renseigner mon adresse', onClick: () => host.openRoute('settings/identity') }}>
          Votre commune n’est pas renseignée : 3615 BONJOUR vous saluera sans savoir d’où.
        </Notice>
      )}
      <div className="card bonjour-card">
        <Pixels art={WAVE} cell={7} label="une main qui salue" />
        <div className="bonjour-words">
          <span className="bonjour-text">{greeting ? greeting.text : 'Bonjour !'}</span>
          <span className="dim small">
            {visitsText(greeting?.visits ?? visits.data)} sur ce service
            {greeting?.from ? ` · depuis ${greeting.from}` : ''}
          </span>
        </div>
        {greeting && (
          <button className="btn small" onClick={() => host.copy(greeting.text, 'salut copié')}>
            copier
          </button>
        )}
      </div>
      <form className="bonjour-form" onSubmit={greet}>
        <Field label="votre prénom" error={error || undefined}>
          <input value={name} maxLength={40} onChange={(e) => setDraft(e.target.value)} placeholder="Camille" />
        </Field>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? <Spinner /> : 'saluer'}
        </button>
      </form>
    </div>
  )
}
