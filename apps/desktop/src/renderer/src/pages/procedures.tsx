import { useEffect, useState } from 'react'
import { DOMAIN_CATEGORIES, DOMAINS } from '@shared/domains'
import { frDate, type Deadline } from '@shared/profile'
import { useApp } from '../app/context'
import { api } from '../lib/api'
import { useDocuments } from '../lib/profile'
import { NextArrow } from './next'

/** Démarches: the domains by category, with their folders in progress, deadlines and letters; each opens its dashboard. */
export function ProceduresPage() {
  const app = useApp()
  const documents = useDocuments()
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  useEffect(() => void api.getDeadlines(120).then(setDeadlines), [])

  return (
    <div className="page">
      <div className="page-body">
        <div className="section">
          <span className="section-title">DÉMARCHES</span>
          {DOMAIN_CATEGORIES.map((cat) => (
            <div key={cat.id} className="cat">
              <span className="dim">{cat.label}</span>
              <div className="grid">
                {DOMAINS.filter((d) => d.category === cat.id).map((d) => {
                  const folders = app.folders.filter((f) => f.domain === d.id && !f.settledAt)
                  const waiting = folders.filter((f) => f.status === 'approval').length
                  const next = deadlines.find((x) => x.domain === d.id && x.status === 'todo')
                  const letters = documents.filter((x) => x.domain === d.id && x.type === 'letter' && !x.folderId).length
                  return (
                    <button key={d.id} className="card" onClick={() => app.go({ kind: 'domain', id: d.id })}>
                      <span className="t">{d.label}</span>
                      {folders.length ? (
                        <span className="l">
                          {folders.length} dossier{folders.length > 1 ? 's' : ''} en cours
                          {waiting ? ` · ${waiting} attend${waiting > 1 ? 'ent' : ''} votre accord` : ''}
                        </span>
                      ) : (
                        <span className="idle">rien en cours</span>
                      )}
                      {next && (
                        <span className="l">
                          {next.title} · {frDate(next.date)}
                        </span>
                      )}
                      {letters > 0 && (
                        <span className="l">
                          {letters} courrier{letters > 1 ? 's' : ''} à traiter
                        </span>
                      )}
                      <span className="foot">
                        <span>{folders[0]?.title ?? 'commencer'}</span>
                        <span>›</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <NextArrow page="procedures" />
    </div>
  )
}
