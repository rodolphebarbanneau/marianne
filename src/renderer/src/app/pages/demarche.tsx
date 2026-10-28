import { useEffect, useState } from 'react'
import { domainInfo } from '@shared/domains'
import { setupRoute } from '@shared/setup'
import type { Demarche as DemarcheType, DemarcheStep } from '@shared/types'
import { Card, PageHead } from '../../components/blocks'
import { Markdown } from '../../components/markdown'
import { Action, Check, Spinner } from '../../components/ui'
import { openSite } from '../app'
import { useApp } from '../context'
import { ipcError } from '../hooks'

const api = window.marianne

function StepActions({ demarche, step }: { demarche: DemarcheType; step: DemarcheStep }) {
  const { services, go, ask } = useApp()
  const [error, setError] = useState('')
  return (
    <p className="step-actions">
      {step.actions.map((a) => {
        const run = () => {
          setError('')
          if (a.kind === 'ouvrir') openSite(a.target, services)
          else if (a.kind === 'configurer') {
            const target = setupRoute(a.target, services)
            if (target) go(target.route)
          } else if (a.kind === 'document') void api.addDocuments(demarche.domain).catch((e: Error) => setError(ipcError(e)))
          else if (a.kind === 'demander') ask({ text: a.target, send: !a.target.includes('['), fresh: true })
          else if (a.kind === 'fiche') go(`fiche/${a.target}`)
        }
        return (
          <Action key={`${a.kind}:${a.target}`} onClick={run}>
            {a.label}
          </Action>
        )
      })}
      {error && <span className="error">✗ {error}</span>}
    </p>
  )
}

export function Demarche({ id }: { id: string }) {
  const { dossier, apply, ask } = useApp()
  const [demarche, setDemarche] = useState<DemarcheType | null | undefined>(undefined)
  useEffect(() => void api.listDemarches().then((list) => setDemarche(list.find((x) => x.id === id) ?? null)), [id])
  if (demarche === undefined) return <Spinner />
  if (demarche === null) return <p className="empty">Démarche inconnue.</p>
  const done = new Set(dossier.procedures[id] ?? [])
  const info = domainInfo(demarche.domain)
  return (
    <div className="page-inner">
      <PageHead
        code={`${info.code} · DEMARCHE`}
        color={info.color}
        title={demarche.title}
        description={demarche.description}
        right={
          <span>
            {done.size}/{demarche.steps.length}
          </span>
        }
      />
      <div className="kv" style={{ marginBottom: 10 }}>
        {demarche.when && (
          <span className="kv-row">
            <span className="k">quand</span>
            <span className="v">{demarche.when}</span>
          </span>
        )}
        {demarche.duration && (
          <span className="kv-row">
            <span className="k">durée</span>
            <span className="v">{demarche.duration}</span>
          </span>
        )}
        {demarche.pieces.length > 0 && (
          <span className="kv-row">
            <span className="k">à préparer</span>
            <span className="v">{demarche.pieces.join(' · ')}</span>
          </span>
        )}
      </div>
      <p className="line">
        <Action
          onClick={() =>
            ask({
              text: `Accompagne-moi pas à pas dans la démarche « ${demarche.title} » (démarche ${demarche.id}), en tenant compte de mon dossier.`,
              send: true,
              fresh: true
            })
          }
        >
          faire la démarche avec marianne
        </Action>
      </p>
      {demarche.steps.map((step, i) => (
        <Card
          key={i}
          title={
            <span className="step-title">
              <Check checked={done.has(i)} onChange={(v) => void apply({ type: 'procedureStep', id, step: i, done: v })} /> {i + 1}. {step.title}
            </span>
          }
          color={done.has(i) ? undefined : info.color}
        >
          <div className={done.has(i) ? 'step-done' : ''}>
            <Markdown source={step.body} />
            {step.actions.length > 0 && <StepActions demarche={demarche} step={step} />}
          </div>
        </Card>
      ))}
    </div>
  )
}
