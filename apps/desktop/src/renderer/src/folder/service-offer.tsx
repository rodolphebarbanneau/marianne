import { useState } from 'react'
import { serviceCode, type ServiceState } from '@marianne/sdk'
import { Modal } from '@marianne/sdk/view'
import type { ApprovalPart } from '@shared/types'
import { useApp } from '../app/context'
import { useServices } from '../host'
import { Consent } from '../host/screen'
import { api, errorText } from '../lib/api'
import { ReviewDialog } from '../pages/services/dialogs'

/**
 * One of Marianne's own services, proposed in the conversation (service_propose): what it is, what it
 * reaches and would read, and the way to it. Adding stays the user's own act: « voir avant d’ajouter »
 * opens the Services page's dialog over the conversation, and a service they switched off comes back
 * with « réactiver », as on its screen. What it asks to read of the profile is asked right after, as
 * its screen would the first time, so that it works at once. The main process sees it on and settles
 * the card; « pas maintenant » refuses it.
 */
export function ServiceOffer({ part }: { part: ApprovalPart }) {
  const { toast } = useApp()
  const state = useServices().find((s) => s.manifest.id === part.service?.code)
  const [step, setStep] = useState<'review' | 'access' | null>(null)
  const [error, setError] = useState('')
  const pending = part.status === 'pending'
  const status = { pending: '', accepted: part.service?.off ? 'réactivé' : 'ajouté', refused: 'pas maintenant', expired: 'sans suite' }[part.status]
  // What it asks to read, not answered yet: asked as soon as it is among the user's services.
  const asks = !!state && state.access.asked.length > 0 && state.access.granted === null
  const done = (s: ServiceState) => {
    toast(`3615 ${serviceCode(s.manifest)} ${s.added ? 'réactivé' : 'ajouté à mes services'}`)
    setStep(asks ? 'access' : null)
  }
  const switchOn = (s: ServiceState) => {
    setError('')
    api
      .switchService(s.manifest.id, true)
      .then(() => done(s))
      .catch((err: unknown) => setError(errorText(err)))
  }
  return (
    <div className={`inline-card${pending ? ' ask' : ''}`}>
      <span className="h">
        service · {part.title}
        {status && ` · ${status}`}
      </span>
      <div className="in">
        {part.reason && <p className="dim">{part.reason}</p>}
        <table>
          <tbody>
            {part.fields.map((f, i) => (
              <tr key={i}>
                <td>{f.label}</td>
                <td className="hi selectable">{f.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pending && state && (
          <div className="acts">
            {state.on ? (
              asks && (
                <button className="btn primary" onClick={() => setStep('access')}>
                  répondre à sa demande
                </button>
              )
            ) : state.added ? (
              <button className="btn primary" onClick={() => switchOn(state)}>
                réactiver 3615 {serviceCode(state.manifest)}
              </button>
            ) : (
              <button className="btn primary" onClick={() => setStep('review')}>
                voir avant d’ajouter
              </button>
            )}
            <button className="btn" onClick={() => api.respondApproval(part.id, 'refuse')}>
              pas maintenant
            </button>
            <span className="small dim">rien n’est ajouté sans vous</span>
          </div>
        )}
        {error && <p className="small bad">{error}</p>}
      </div>
      {step === 'review' && state && <ReviewDialog subject={{ kind: 'official', state }} onAdded={() => done(state)} onClose={() => setStep(null)} />}
      {step === 'access' && state && <AccessDialog state={state} onAnswered={() => setStep(null)} />}
    </div>
  )
}

/** What the service asks to read, right after it was added: the same request as its screen's, with no way out but an answer. */
function AccessDialog({ state, onAnswered }: { state: ServiceState; onAnswered: () => void }) {
  return (
    <Modal label={`ce que 3615 ${serviceCode(state.manifest)} demande à lire`}>
      <div className="mh">
        <span className="t">AVANT DE L’UTILISER</span>
      </div>
      <div className="in">
        <Consent state={state} onAnswered={onAnswered} />
      </div>
    </Modal>
  )
}
