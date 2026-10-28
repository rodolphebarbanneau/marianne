import { useEffect, useState } from 'react'
import type { SpDocument } from '@shared/api'
import { frDate } from '@shared/dossier'
import { PageHead } from '../../components/blocks'
import { Markdown } from '../../components/markdown'
import { Action, Spinner } from '../../components/ui'
import { useApp } from '../context'

const api = window.marianne

/** A Service-Public document, read from the local index (works offline). */
export function Fiche({ id }: { id: string }) {
  const { ask } = useApp()
  const [doc, setDoc] = useState<SpDocument | null | undefined>(undefined)
  useEffect(() => {
    setDoc(undefined)
    void api.spFiche(id).then(setDoc)
  }, [id])
  if (doc === undefined) return <Spinner />
  if (doc === null)
    return (
      <div className="page-inner">
        <p className="empty">
          Fiche {id} introuvable dans l’index local (téléchargement en cours ?).{' '}
          <Action onClick={() => api.openBrowser(`https://www.service-public.gouv.fr/particuliers/vosdroits/${id}`)}>ouvrir sur service-public</Action>
        </p>
      </div>
    )
  return (
    <div className="page-inner">
      <PageHead
        code={`SERVICE-PUBLIC · ${doc.id}`}
        color="bleu"
        title={doc.title}
        description={
          <>
            {doc.kind} · {doc.theme} · mise à jour le {frDate(doc.updated)} ·{' '}
            <Action onClick={() => api.openBrowser(doc.url)}>ouvrir sur service-public</Action>{' '}
            <Action
              onClick={() => ask({ text: `Explique-moi ce que la fiche « ${doc.title} » (${doc.id}) implique dans ma situation.`, send: true, fresh: true })}
            >
              demander à marianne
            </Action>
          </>
        }
      />
      {doc.description && <p className="lead">{doc.description}</p>}
      <Markdown source={doc.body} />
    </div>
  )
}
