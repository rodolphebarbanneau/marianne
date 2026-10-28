import { memo, useState } from 'react'
import { shortModel } from '@shared/constants'
import type { ActionPart, Attachment, ChatMessage, SetupPart, ToolPart } from '@shared/types'
import { useApp } from '../app/context'
import { when } from '../app/hooks'
import { Markdown, resolveTokens } from '../components/markdown'
import { Action, Spinner } from '../components/ui'

const api = window.marianne

/** Labels of the tools, as the chat shows them. */
const TOOL_LABELS: Record<string, string> = {
  dossier: 'lecture du dossier',
  demander_configuration: 'configuration requise',
  afficher: 'affichage d’un écran',
  proposer: 'proposition',
  echeances: 'échéances',
  demarches: 'démarches guidées',
  demarche: 'démarche',
  etape_demarche: 'étape de démarche',
  documents: 'documents',
  lire_document: 'lecture d’un document',
  lire_formulaire: 'lecture du formulaire',
  remplir_formulaire: 'remplissage du formulaire',
  recherche_service_public: 'service-public · recherche',
  fiche_service_public: 'service-public · fiche',
  annuaire_administration: 'annuaire',
  code_du_travail: 'code du travail',
  recherche_legifrance: 'légifrance · recherche',
  article_legifrance: 'légifrance · article',
  calcul_delai: 'calcul de délai',
  jours_feries: 'jours fériés',
  estimation_aides: 'openfisca · estimation',
  simulation_openfisca: 'openfisca · simulation',
  variable_openfisca: 'openfisca · variable',
  communes: 'communes',
  adresses: 'adresses',
  recherche_datagouv: 'data.gouv · recherche',
  jeu_de_donnees: 'data.gouv · jeu',
  donnees_tabulaires: 'data.gouv · données',
  recherche_entreprises: 'entreprises',
  deputes: 'assemblée · députés',
  depute: 'assemblée · député',
  scrutins: 'assemblée · scrutins',
  scrutin: 'assemblée · scrutin',
  videos_assemblee: 'assemblée · vidéos',
  video_assemblee: 'assemblée · vidéo',
  direct_assemblee: 'assemblée · direct',
  sites_publics: 'sites publics',
  ouvrir_site: 'ouverture de page',
  competence: 'compétence',
  WebSearch: 'recherche web',
  WebFetch: 'lecture web',
  Read: 'lecture du fichier',
  Shell: 'commande'
}

export const toolLabel = (name: string) => {
  const short = name.replace(/^mcp__[^_]+__/, '')
  return TOOL_LABELS[short] ?? short
}

/** The most telling argument of a call: the query, the id, the url… */
function toolArg(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  for (const key of [
    'requete',
    'recherche',
    'query',
    'url',
    'ecran',
    'cible',
    'id',
    'nom',
    'depute',
    'numero',
    'adresse',
    'commune',
    'type',
    'domaine',
    'file_path',
    'command'
  ]) {
    if (typeof o[key] === 'string' || typeof o[key] === 'number') return String(o[key])
  }
  if (typeof o.depart === 'string') return `${o.depart} + ${o.duree} ${o.unite}`
  const first = Object.values(o).find((v) => typeof v === 'string')
  return typeof first === 'string' ? first : ''
}

function ToolLine({ part }: { part: ToolPart }) {
  const { dossier, tokens } = useApp()
  const [open, setOpen] = useState(false)
  // Shown as the user knows it: their own values, a document by its title.
  const raw = toolArg(part.input)
  const arg = dossier.documents.find((d) => d.id === raw)?.title ?? resolveTokens(raw, tokens)
  return (
    <div className="tool">
      <button onClick={() => setOpen((o) => !o)} title="voir l’appel et sa réponse (telle que l’assistant l’a reçue)">
        <span className="muted">{open ? '▾' : '▸'}</span>
        <span className="name">{toolLabel(part.name)}</span>
        {arg && <span className="arg">« {arg} »</span>}
        {part.status === 'running' ? <Spinner /> : <span className={`state ${part.isError ? 'ko' : 'ok'}`}>{part.isError ? '✗' : '✓'}</span>}
      </button>
      {open && (
        <pre>
          {JSON.stringify(part.input, null, 1)}
          {part.output !== undefined ? `\n\n${part.output || '(vide)'}` : ''}
        </pre>
      )}
    </div>
  )
}

/** A proposal of the agent: the exact values, and the user's decision. */
function ActionCard({ part }: { part: ActionPart }) {
  const pending = part.status === 'pending'
  const status = { pending: '', accepted: 'accepté', refused: 'refusé', expired: 'sans suite' }[part.status]
  return (
    <div className={`action-card ${part.status}`}>
      <div className="t">
        <span className="upper">{part.kind === 'form' ? 'formulaire' : 'proposition'}</span>
        <span>{part.title}</span>
        {status && <span className="st">{status}</span>}
      </div>
      {part.reason && <p className="reason">{part.reason}</p>}
      {part.fields.length > 0 && (
        <div className="f">
          {part.fields.map((f, i) => (
            <span key={i} className="kv-row">
              <span className="k">{f.label}</span>
              <span className="v">{f.value || <span className="muted">(vide)</span>}</span>
            </span>
          ))}
        </div>
      )}
      {pending && (
        <p className="choices">
          <button className="fkey primary" onClick={() => api.respondAction(part.id, true)}>
            accepter
          </button>
          <button className="fkey danger" onClick={() => api.respondAction(part.id, false)}>
            refuser
          </button>
          <span className="dim">
            {part.kind === 'form' ? 'rien n’est envoyé : vous vérifierez la page avant de valider' : 'rien n’est modifié sans votre accord'}
          </span>
        </p>
      )}
    </div>
  )
}

function SetupCard({ part }: { part: SetupPart }) {
  const { go } = useApp()
  return (
    <div className="setup-card">
      <span className="yellow upper">configuration requise</span>
      <span className="reason">{part.reason}</span>
      <button className="fkey primary" onClick={() => go(part.route)}>
        configurer {part.label} →
      </button>
    </div>
  )
}

export function AttachmentChip({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  const { go } = useApp()
  const open = () => (a.type === 'page' ? api.openBrowser(a.url) : a.type === 'document' ? go('documents') : undefined)
  const label = a.type === 'page' ? a.title || a.url : a.type === 'document' ? a.title : a.name
  return (
    <span className="chip" title={a.type === 'page' ? a.url : a.type === 'file' ? a.path : 'document du coffre'}>
      <span className="kind">{a.type === 'page' ? 'page' : a.type === 'document' ? 'coffre' : 'fichier'}</span>
      <span onClick={open} style={{ cursor: a.type === 'file' ? 'default' : 'pointer' }}>
        {label}
      </span>
      {a.type === 'file' && <span className="dim">{Math.max(1, Math.round(a.size / 1024))} ko</span>}
      {onRemove && <button onClick={onRemove}>✕</button>}
    </span>
  )
}

const plainText = (m: ChatMessage) =>
  m.parts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .filter(Boolean)
    .join('\n\n')

export const Message = memo(function Message({ message }: { message: ChatMessage }) {
  const { tokens } = useApp()
  const user = message.role === 'user'
  const running = message.status === 'running'
  const attachments = message.parts.filter((p): p is Attachment => p.type === 'page' || p.type === 'file' || p.type === 'document')
  const last = message.parts[message.parts.length - 1]
  const waiting = message.parts.some((p) => p.type === 'action' && p.status === 'pending')
  return (
    <div className={`msg ${message.role}`}>
      <div className="msg-head">
        <span className="who">{user ? 'vous' : 'marianne'}</span>
        <span>{when(message.at)}</span>
        {!user && message.model && <span className="muted">{shortModel(message.model)}</span>}
        {user && message.screen && <span className="muted">· {message.screen.title}</span>}
      </div>
      <div className="msg-body">
        {attachments.length > 0 && (
          <div className="chips">
            {attachments.map((a, i) => (
              <AttachmentChip key={i} a={a} />
            ))}
          </div>
        )}
        {user ? (
          <div className="selectable">{plainText(message)}</div>
        ) : (
          <>
            {message.parts.map((p, i) =>
              p.type === 'text' ? (
                <Markdown key={i} source={p.text} />
              ) : p.type === 'tool' ? (
                <ToolLine key={p.id} part={p} />
              ) : p.type === 'action' ? (
                <ActionCard key={p.id} part={p} />
              ) : p.type === 'setup' ? (
                <SetupCard key={i} part={p} />
              ) : null
            )}
            {running && !waiting && (!last || last.type !== 'text') && (
              <p className="dim">
                <Spinner /> {message.parts.length ? 'consultation des sources…' : 'connexion au service…'}
              </p>
            )}
            {running && last?.type === 'text' && <span className="cursor" />}
          </>
        )}
        {message.status === 'error' && <p className="msg-error selectable">✗ {message.error ?? 'la réponse a échoué'}</p>}
        {message.status === 'cancelled' && <p className="msg-error">— annulé —</p>}
        {!user && message.status === 'done' && (
          <p className="msg-foot">
            {message.ms ? `${(message.ms / 1000).toFixed(0)} s · ` : ''}
            <Action onClick={() => void navigator.clipboard.writeText(resolveTokens(plainText(message), tokens))}>copier</Action>
          </p>
        )}
      </div>
    </div>
  )
})
