import { useCallback } from 'react'
import { useApp } from '../app/context'
import { api, errorText } from '../lib/api'
import type { SearchTarget } from '../lib/demarches'

/** What a row of the Démarches pages opens: the same way from « à faire », a domain's page and the search. */
export function useOpenTarget(documentTitle: (id: string) => string = () => ''): (target: SearchTarget, options?: { read?: boolean }) => void {
  const app = useApp()
  const { go, goPage, setSeed, toast } = app
  return useCallback(
    (target, { read = false } = {}) => {
      const start = (request: Parameters<typeof api.send>[0]) =>
        api
          .send(request)
          .then((id) => go({ kind: 'folder', id }))
          .catch((err: unknown) => toast(errorText(err)))
      switch (target.kind) {
        case 'folder':
          return go({ kind: 'folder', id: target.id })
        case 'service':
          return go({ kind: 'service', id: target.id, params: target.params ?? {} })
        case 'domain':
          return go({ kind: 'domain', id: target.id })
        case 'url':
          return api.openExternal(target.url)
        case 'procedure':
          setSeed({ text: '', attachments: [], procedure: target.id })
          return goPage('home')
        case 'ask':
          return void start({ text: target.text, attachments: [] })
        case 'letter':
          // From the search, a pièce opens; from « à faire », a letter becomes a folder.
          if (read) return void api.openDocument(target.id)
          return void start({
            text: 'Aidez-moi à traiter ce courrier.',
            attachments: [{ type: 'document', id: target.id, title: documentTitle(target.id) }]
          })
      }
    },
    [go, goPage, setSeed, toast, documentTitle]
  )
}
