import { useEffect, useState } from 'react'
import type { AppInfo, Config, UpdateState } from '@shared/types'
import { Action, Bar, Check, percent, Row, Sep, Spinner } from '../../components/ui'
import type { Update } from '../hooks'

const api = window.marianne

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')

function UpdateStatus({ state }: { state: UpdateState }) {
  switch (state.status) {
    case 'disabled':
      return <span className="dim">pas de mise à jour en développement</span>
    case 'checking':
      return (
        <span>
          <Spinner /> <span className="dim">vérification…</span>
        </span>
      )
    case 'latest':
      return (
        <span>
          <span className="green">à jour</span>
          {state.checkedAt && <span className="dim"> · vérifié à {time(state.checkedAt)}</span>}
        </span>
      )
    case 'available':
      return <span className="acc">{state.latest} disponible</span>
    case 'downloading':
      return <Bar value={state.percent ?? 0} total={100} label={`téléchargement ${state.latest ?? ''} · ${percent((state.percent ?? 0) / 100)}`} />
    case 'downloaded':
      return <span className="green">{state.latest} prête à installer</span>
    case 'error':
      return <span className="red">✗ {state.error}</span>
    default:
      return <span className="dim">pas encore vérifié</span>
  }
}

export function About({ config, update }: { config: Config; update: Update }) {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => void api.getInfo().then(setInfo), [])
  useEffect(() => {
    void api.getUpdateState().then(setState)
    return api.onUpdate(setState)
  }, [])

  const action =
    state?.status === 'available' ? (
      <Action onClick={() => api.downloadUpdate()}>télécharger</Action>
    ) : state?.status === 'downloaded' ? (
      <Action onClick={() => api.installUpdate()}>redémarrer et installer</Action>
    ) : state?.status === 'error' ? (
      <Action onClick={() => api.openReleases()}>versions</Action>
    ) : null

  return (
    <>
      <section>
        <Sep>marianne</Sep>
        <Row label="version">{info?.version}</Row>
        <Row label="système">{info?.platform}</Row>
        <Row label="code source" actions={<Action onClick={() => api.openExternal('https://github.com/rodolphebarbanneau/marianne')}>github</Action>}>
          <span className="dim">libre, sous licence MIT</span>
        </Row>
      </section>

      <section>
        <Sep
          tail={
            state &&
            state.status !== 'disabled' && (
              <Action onClick={() => api.checkForUpdates()} disabled={['checking', 'downloading', 'downloaded'].includes(state.status)}>
                vérifier
              </Action>
            )
          }
        >
          mises à jour
        </Sep>
        <Row label="état" hint="les nouvelles versions viennent des publications github de marianne" actions={action}>
          {state && <UpdateStatus state={state} />}
        </Row>
        <Row label="automatiques" hint="télécharger les mises à jour en arrière-plan et les installer à la fermeture">
          <Check checked={config.updates.auto} onChange={(auto) => void update({ updates: { auto } })} />
        </Row>
      </section>

      <section>
        <Sep>avertissement</Sep>
        <p className="note">
          marianne est un outil d’information indépendant, sans lien avec l’administration. ses réponses s’appuient sur des sources publiques mais peuvent être
          incomplètes ou erronées : vérifiez auprès de l’organisme concerné avant une démarche importante, et faites-vous conseiller (france services,
          point-justice, avocat) en cas de litige.
        </p>
      </section>
    </>
  )
}
