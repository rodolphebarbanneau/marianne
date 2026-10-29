import { useEffect, useRef, useState } from 'react'
import type { Procedure } from '@marianne/content'
import { domainInfo } from '@marianne/profile'
import { ENGINE_LABELS } from '@shared/config'
import type { Attachment, DomainId, EngineId } from '@shared/types'
import { useApp, type ComposerSeed } from '../app/context'
import { api, errorText } from '../lib/api'

/**
 * Where the user writes to Marianne: on the first page (a new folder) and at the bottom of a
 * folder. Entrée sends, maj+entrée goes to the line, ↑ in an empty box takes back the last message.
 */
export function Composer({
  folderId,
  domain,
  engine,
  running,
  lastUserText,
  autoFocus,
  placeholder
}: {
  folderId?: string
  domain?: DomainId | ''
  engine?: EngineId
  running?: boolean
  lastUserText?: string
  autoFocus?: boolean
  placeholder: string
}) {
  const app = useApp()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [procedure, setProcedure] = useState<Procedure | null>(null)
  /** A new folder started from a domain's dashboard: it goes in that domain. */
  const [inDomain, setInDomain] = useState<DomainId | null>(null)
  const [chosen, setChosen] = useState<EngineId | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const draft = useRef<ComposerSeed | null>(null)

  const usable = app.lights.filter((l) => l.ok)
  const fallback = engine ?? app.config.engines.default
  const current: EngineId = chosen ?? (usable.some((l) => l.id === fallback) ? fallback : (usable[0]?.id ?? fallback))

  // "Demander à Marianne" from an article, a procedure from the menu…: the composer starts with it.
  useEffect(() => {
    if (folderId || !app.seed) return
    const seed = app.seed
    app.setSeed(null)
    setText(seed.text)
    setAttachments(seed.attachments)
    setInDomain(seed.domain ?? null)
    if (seed.procedure) void api.listProcedures().then((list) => setProcedure(list.find((p) => p.id === seed.procedure) ?? null))
    box.current?.focus()
  }, [app, folderId])

  // A new folder's draft survives a change of page: leaving, it becomes the seed it comes back with.
  const { setSeed } = app
  useEffect(() => {
    const empty = !text.trim() && !attachments.length && !procedure && !inDomain
    draft.current = folderId || empty ? null : { text, attachments, procedure: procedure?.id, domain: inDomain ?? undefined }
  })
  useEffect(
    () => () => {
      if (draft.current) setSeed(draft.current)
    },
    [setSeed]
  )

  const send = async () => {
    if (busy || running || (!text.trim() && !attachments.length && !procedure)) return
    setBusy(true)
    setError('')
    try {
      const id = await api.send({
        folderId,
        text: text.trim() || (procedure ? `Commençons la démarche « ${procedure.title} ».` : ''),
        attachments,
        engine: current,
        procedure: procedure?.id,
        domain: inDomain ?? undefined
      })
      // Sent: nothing to keep, even if the composer goes before it renders empty.
      draft.current = null
      setText('')
      setAttachments([])
      setProcedure(null)
      setInDomain(null)
      if (!folderId) app.go({ kind: 'folder', id })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const attach = async () => {
    try {
      const docs = await api.addDocuments({ domain: domain || procedure?.domain || inDomain || 'identity', folderId })
      setAttachments([...attachments, ...docs.map((d): Attachment => ({ type: 'document', id: d.id, title: d.title }))])
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <div className="composer">
      {(attachments.length > 0 || procedure || inDomain) && (
        <div className="attachments">
          {inDomain && !procedure && (
            <span className="chip">
              domaine : {domainInfo(inDomain).short}{' '}
              <button className="link" onClick={() => setInDomain(null)}>
                ✕
              </button>
            </span>
          )}
          {procedure && (
            <span className="chip">
              démarche : {procedure.title}{' '}
              <button className="link" onClick={() => setProcedure(null)}>
                ✕
              </button>
            </span>
          )}
          {attachments.map((a, i) => (
            <span key={i} className="chip">
              {a.type === 'page' ? `page : ${a.title || a.url}` : `pièce : ${a.title}`}{' '}
              <button className="link" onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea
        ref={box}
        autoFocus={autoFocus}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault()
            void send()
          } else if (e.key === 'ArrowUp' && !text && lastUserText) {
            e.preventDefault()
            setText(lastUserText)
          }
        }}
      />
      <div className="tools">
        <button className="attach" onClick={() => void attach()}>
          + pièce
        </button>
        {error && <span className="bad small">{error}</span>}
        <span className="grow" />
        {usable.length > 1 && (
          <select value={current} title="le moteur de ce dossier" onChange={(e) => setChosen(e.target.value as EngineId)}>
            {usable.map((l) => (
              <option key={l.id} value={l.id}>
                {ENGINE_LABELS[l.id]}
              </option>
            ))}
          </select>
        )}
        {running ? (
          <button className="btn" onClick={() => folderId && api.cancel(folderId)}>
            arrêter
          </button>
        ) : (
          <button className="btn primary" disabled={busy || (!text.trim() && !attachments.length && !procedure)} onClick={() => void send()}>
            envoyer ↵
          </button>
        )}
      </div>
    </div>
  )
}
