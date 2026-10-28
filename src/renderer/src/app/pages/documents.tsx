import { useState } from 'react'
import { frDate, type DocumentMeta, type DomainId } from '@shared/dossier'
import { DOMAINS, domainInfo } from '@shared/domains'
import { Card, PageHead } from '../../components/blocks'
import { Input, Select } from '../../components/form'
import { Action } from '../../components/ui'
import { useApp } from '../context'
import { ipcError } from '../hooks'

const api = window.marianne

export const DOC_TYPES: Array<{ value: DocumentMeta['type']; label: string }> = [
  { value: 'avis_impot', label: 'avis d’impôt' },
  { value: 'attestation', label: 'attestation' },
  { value: 'bulletin_paie', label: 'bulletin de paie' },
  { value: 'releve', label: 'relevé' },
  { value: 'courrier', label: 'courrier' },
  { value: 'contrat', label: 'contrat' },
  { value: 'justificatif', label: 'justificatif' },
  { value: 'autre', label: 'autre' }
]

const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1e3))} ko`)

/** One document of the vault: rename, classify, open, export, give to the assistant, delete. */
export function DocumentRow({ doc, showDomain = true }: { doc: DocumentMeta; showDomain?: boolean }) {
  const { apply, ask } = useApp()
  const [title, setTitle] = useState(doc.title)
  const [error, setError] = useState('')
  const patch = (p: Partial<Pick<DocumentMeta, 'title' | 'domain' | 'type' | 'date'>>) => void apply({ type: 'documentMeta', id: doc.id, patch: p })
  return (
    <div className="doc-row">
      <span className="doc-main">
        <input
          className="doc-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== doc.title && patch({ title })}
          spellCheck={false}
        />
        <span className="meta">
          <Select<DocumentMeta['type']> value={doc.type} onChange={(type) => patch({ type })} options={DOC_TYPES} />
          {showDomain && (
            <Select<DomainId> value={doc.domain} onChange={(domain) => patch({ domain })} options={DOMAINS.map((d) => ({ value: d.id, label: d.short }))} />
          )}
          <span className="dim">
            {frDate(doc.date)} · {doc.fileName} · {size(doc.size)}
          </span>
        </span>
        {error && <span className="error">✗ {error}</span>}
      </span>
      <span className="acts">
        <Action onClick={() => void api.openDocument(doc.id).catch((e: Error) => setError(ipcError(e)))}>ouvrir</Action>
        <Action
          onClick={() =>
            ask({
              text: `Lis ce document et dis-moi ce qu’il implique pour moi (délais, démarches, montants).`,
              attachments: [{ type: 'document', id: doc.id, title: doc.title }]
            })
          }
        >
          demander à marianne
        </Action>
        <Action onClick={() => void api.exportDocument(doc.id)}>exporter</Action>
        <Action danger onClick={() => void api.deleteDocument(doc.id)}>
          supprimer
        </Action>
      </span>
    </div>
  )
}

export function DocumentsPage() {
  const { dossier } = useApp()
  const [domain, setDomain] = useState<DomainId | ''>('')
  const [target, setTarget] = useState<DomainId>('impots')
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean)
  const list = dossier.documents
    .filter((d) => (!domain || d.domain === domain) && words.every((w) => `${d.title} ${d.fileName}`.toLowerCase().includes(w)))
    .sort((a, b) => b.date.localeCompare(a.date))
  const add = () =>
    void api
      .addDocuments(target)
      .then(() => setError(''))
      .catch((e: Error) => setError(ipcError(e)))
  return (
    <div className="page-inner">
      <PageHead
        code="3615 DOCUMENTS"
        color="vert"
        title="documents"
        description="Avis d’impôt, attestations, bulletins, courriers : chiffrés dans le coffre de cet ordinateur. Marianne les lit quand vous les lui confiez, identifiants remplacés par des jetons."
      />
      <div className="filters">
        <Select<DomainId | ''>
          value={domain}
          onChange={setDomain}
          options={[{ value: '', label: 'tous les domaines' }, ...DOMAINS.map((d) => ({ value: d.id, label: d.label }))]}
        />
        <Input value={filter} onChange={setFilter} placeholder="rechercher" />
        <span className="sp" />
        <span className="dim">ajouter dans</span>
        <Select<DomainId> value={target} onChange={setTarget} options={DOMAINS.map((d) => ({ value: d.id, label: d.short }))} />
        <Action onClick={add}>ajouter des documents</Action>
      </div>
      {error && <p className="line error">✗ {error}</p>}
      {!list.length && <p className="empty">Aucun document{domain ? ` dans ${domainInfo(domain).label}` : ''}.</p>}
      {list.length > 0 && (
        <Card title={`${list.length} document${list.length > 1 ? 's' : ''}`} color="vert">
          {list.map((d) => (
            <DocumentRow key={d.id} doc={d} />
          ))}
        </Card>
      )}
    </div>
  )
}
