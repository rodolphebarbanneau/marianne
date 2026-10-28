import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { domainInfo } from '@shared/domains'
import type { DomainId } from '@shared/dossier'
import type { Attachment, Conversation, ConversationSummary } from '@shared/types'
import { useApp } from '../app/context'
import { ipcError, when } from '../app/hooks'
import { routeTitle } from '../app/routes'
import { Dropdown } from '../components/dropdown'
import { Action, FKey } from '../components/ui'
import { AttachmentChip, Message } from './message'

const api = window.marianne

// Pages sent from the built-in browser arrive even before the panel is open.
let inbox: Attachment[] = []
const inboxListeners = new Set<() => void>()
api.onAttach((a) => {
  inbox = [...inbox, a]
  inboxListeners.forEach((l) => l())
})

const GENERAL = [
  'Qu’est-ce qui manque dans mon dossier pour que tu m’aides au mieux ?',
  'Fais le point sur mes échéances du mois.',
  'J’ai reçu un courrier de l’administration : aide-moi à y répondre.'
]

/** Starters for the screen the user is on. */
function startersFor(route: string): string[] {
  const path = route.split('#')[0]
  if (path.startsWith('domaine/')) return domainInfo(path.slice(8) as DomainId)?.starters ?? GENERAL
  if (path === 'agenda') return ['Qu’est-ce qui est urgent dans mon agenda ?', 'Quelles échéances ai-je pu oublier ?']
  if (path === 'documents') return ['Quels documents devrais-je garder, et combien de temps ?']
  if (path === 'entites') return ['Quelles sont les obligations de mes entreprises ce trimestre ?']
  return GENERAL
}

export function ChatPanel() {
  const { config, asked, consumeAsk, route, dossier } = useApp()
  const [list, setList] = useState<ConversationSummary[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [showList, setShowList] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const input = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    void api.listConversations().then(setList)
    return api.onConversations(setList)
  }, [])
  useEffect(() => {
    const take = () => {
      if (!inbox.length) return
      setAttachments((a) => [...a, ...inbox])
      inbox = []
      input.current?.focus()
    }
    take()
    inboxListeners.add(take)
    return () => void inboxListeners.delete(take)
  }, [])
  useEffect(() => {
    if (!currentId) return setConversation(null)
    void api.getConversation(currentId).then(setConversation)
    return api.onConversation((c) => c.id === currentId && setConversation(c))
  }, [currentId])

  const running = conversation?.messages.some((m) => m.status === 'running') ?? false
  const lastAnswer = conversation?.messages[conversation.messages.length - 1]

  useEffect(() => {
    if (!running || !lastAnswer) return setElapsed(0)
    const started = Date.parse(lastAnswer.at)
    const id = setInterval(() => setElapsed(Date.now() - started), 1000)
    return () => clearInterval(id)
  }, [running, lastAnswer?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [conversation])
  const onScroll = () => {
    const el = scroller.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  const focus = () => setTimeout(() => input.current?.focus(), 0)

  const send = useCallback(
    async (text: string, extra: Attachment[] = [], fresh = false) => {
      const message = text.trim()
      const all = [...attachments, ...extra]
      if ((!message && !all.length) || (running && !fresh)) return
      setError('')
      stick.current = true
      try {
        const id = await api.send({
          conversationId: fresh ? undefined : (currentId ?? undefined),
          text: message,
          attachments: all,
          page: { route, title: routeTitle(route) }
        })
        setDraft('')
        setAttachments([])
        setCurrentId(id)
        setShowList(false)
      } catch (e) {
        setError(ipcError(e as Error))
      }
      focus()
    },
    [attachments, currentId, running, route]
  )

  // Questions asked from the pages.
  useEffect(() => {
    if (!asked) return
    consumeAsk()
    if (asked.fresh) setCurrentId(null)
    if (asked.send) void send(asked.text, asked.attachments ?? [], !!asked.fresh)
    else {
      setDraft(asked.text)
      if (asked.attachments) setAttachments((a) => [...a, ...asked.attachments!])
      focus()
    }
  }, [asked]) // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = () => {
    setCurrentId(null)
    setDraft('')
    setShowList(false)
    focus()
  }
  const cancel = () => currentId && running && api.cancel(currentId)
  const regenerate = () => currentId && !running && void api.regenerate(currentId)
  const correct = () => {
    const lastUser = [...(conversation?.messages ?? [])].reverse().find((m) => m.role === 'user')
    const text = lastUser?.parts.map((p) => (p.type === 'text' ? p.text : '')).join('') ?? ''
    if (text) {
      setDraft(text)
      focus()
    }
  }
  // Documents attached from a domain page are filed in that domain of the vault.
  const routeDomain = route.match(/^domaine\/([a-z]+)/)?.[1] as DomainId | undefined
  const attach = () =>
    void api
      .pickFiles(routeDomain)
      .then((files) => setAttachments((a) => [...a, ...files]))
      .catch((e: Error) => setError(ipcError(e)))

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && running) cancel()
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r' && conversation) regenerate()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onComposerKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send(draft)
    } else if (e.key === 'ArrowUp' && !draft) {
      e.preventDefault()
      correct()
    }
  }

  const timer = `${Math.floor(elapsed / 60000)}'${String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0')}`
  const agentName = config.agent.provider === 'claude-code' ? 'claude code' : 'codex'
  const docs = dossier.documents

  return (
    <aside className="chat-panel">
      <div className="chat-head">
        <button className="conv-switch" onClick={() => setShowList((s) => !s)} title="conversations">
          <span className="acc">{showList ? '▾' : '▸'}</span> <span className="t">{conversation?.title ?? 'nouvelle conversation'}</span>
        </button>
        <Action onClick={fresh}>nouvelle</Action>
      </div>

      {showList ? (
        <div className="conv-list">
          {list.length === 0 && <p className="empty">aucune conversation</p>}
          {list.map((c) =>
            renaming !== null && c.id === currentId ? (
              <div key={c.id} className="conv-item on">
                <input
                  autoFocus
                  value={renaming}
                  onChange={(e) => setRenaming(e.target.value)}
                  onBlur={() => setRenaming(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void api.renameConversation(c.id, renaming).then(() => setRenaming(null))
                    else if (e.key === 'Escape') setRenaming(null)
                  }}
                />
              </div>
            ) : (
              <button
                key={c.id}
                className={`conv-item ${c.id === currentId ? 'on' : ''}`}
                onClick={() => {
                  setCurrentId(c.id)
                  setShowList(false)
                }}
              >
                <span className="t">
                  <span>{c.title}</span>
                  <span className="dim">{c.running ? <span className="acc blink">■</span> : when(c.updatedAt)}</span>
                </span>
                <span className="d">{c.preview}</span>
              </button>
            )
          )}
          {conversation && (
            <p className="line">
              <Action onClick={() => setRenaming(conversation.title)}>renommer</Action>{' '}
              <Action
                danger
                onClick={() => confirm('Supprimer cette conversation et ses fichiers joints ?') && void api.deleteConversation(conversation.id).then(fresh)}
              >
                supprimer
              </Action>
            </p>
          )}
        </div>
      ) : (
        <div className="messages" ref={scroller} onScroll={onScroll}>
          {!conversation ? (
            <div className="chat-empty">
              <p className="dim">Marianne voit l’écran affiché ({routeTitle(route)}) et votre dossier, sans vos identifiants.</p>
              {startersFor(route).map((s) => (
                <button key={s} className="starter" onClick={() => void send(s)}>
                  › {s}
                </button>
              ))}
            </div>
          ) : (
            conversation.messages.map((m) => <Message key={m.id} message={m} />)
          )}
        </div>
      )}

      <div className="composer">
        {attachments.length > 0 && (
          <div className="chips">
            {attachments.map((a, i) => (
              <AttachmentChip key={i} a={a} onRemove={() => setAttachments((l) => l.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}
        <div className="composer-line">
          <span className="prompt">&gt;</span>
          <textarea
            ref={input}
            value={draft}
            rows={Math.min(8, Math.max(1, draft.split('\n').length))}
            placeholder={currentId ? 'votre message…' : 'votre question…'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onComposerKey}
          />
        </div>
        <div className="composer-actions">
          <Action onClick={attach}>joindre</Action>
          {docs.length > 0 && (
            <Dropdown
              value=""
              onChange={(id) => {
                const d = docs.find((x) => x.id === id)
                if (d) setAttachments((a) => [...a, { type: 'document', id: d.id, title: d.title }])
              }}
              options={[{ value: '', label: 'document du coffre…' }, ...docs.map((d) => ({ value: d.id, label: d.title }))]}
            />
          )}
          <span className="sp" />
          {error ? <span className="error">✗ {error}</span> : <span className="dim">{running ? `${agentName} · ${timer}` : agentName}</span>}
        </div>
        <div className="chat-keys">
          <FKey k="échap" onClick={cancel} disabled={!running} danger={running}>
            annulation
          </FKey>
          <FKey k="↑" onClick={correct} disabled={!conversation || running}>
            correction
          </FKey>
          <FKey k="ctrl+r" onClick={regenerate} disabled={!conversation || running}>
            répétition
          </FKey>
          <FKey k="↵" primary onClick={() => void send(draft)} disabled={running || (!draft.trim() && !attachments.length)}>
            envoi
          </FKey>
        </div>
      </div>
    </aside>
  )
}
