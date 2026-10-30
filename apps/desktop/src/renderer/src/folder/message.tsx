import { memo, useState } from 'react'
import { ENGINE_LABELS } from '@shared/config'
import type { ServiceState } from '@marianne/sdk'
import type { ApprovalPart, Attachment, ChatMessage, ProgressPart, SetupPart, ToolPart } from '@shared/types'
import { useApp } from '../app/context'
import { Markdown, resolveTokens } from '../components/markdown'
import { Spinner } from '../components/ui'
import { api } from '../lib/api'
import { clock } from '../lib/format'
import { useTokens } from '../lib/tokens'
import { serviceToolLabel, useServices } from '../host'

/** Labels of the app's own tools, as the conversation shows them; services label theirs. */
const TOOL_LABELS: Record<string, string> = {
  profile: 'lecture du profil',
  propose: 'proposition',
  request_setup: 'réglage nécessaire',
  deadlines: 'échéances',
  procedures: 'démarches guidées',
  procedure: 'démarche',
  complete_step: 'étape de démarche',
  documents: 'pièces',
  read_document: 'lecture d’une pièce',
  folder: 'dossier',
  public_sites: 'sites publics',
  open_site: 'ouverture de page',
  read_page: 'lecture de la page',
  click: 'clic',
  type_text: 'saisie',
  sign_in: 'connexion',
  hand_over: 'à vous la main',
  task_progress: 'avancement',
  read_form: 'lecture du formulaire',
  fill_form: 'remplissage du formulaire',
  search_service_public: 'service public · recherche',
  read_service_public: 'service public · fiche',
  find_office: 'annuaire',
  labour_code: 'code du travail',
  search_legifrance: 'légifrance · recherche',
  read_article: 'légifrance · article',
  compute_deadline: 'calcul de délai',
  public_holidays: 'jours fériés',
  estimate_benefits: 'openfisca · estimation',
  openfisca_simulation: 'openfisca · simulation',
  openfisca_variable: 'openfisca · variable',
  communes: 'communes',
  addresses: 'adresses',
  search_datasets: 'données ouvertes · recherche',
  dataset: 'données ouvertes · jeu de données',
  tabular_data: 'données ouvertes · lecture',
  search_companies: 'entreprises',
  skill: 'compétence',
  WebSearch: 'recherche web',
  WebFetch: 'lecture web',
  web_search: 'recherche web',
  web_fetch: 'lecture web'
}

/** The conversation's name for a tool: the app's own, or as its service names it. */
export function toolLabel(name: string, services: ServiceState[]): string {
  const short = name.replace(/^mcp__[^_]+__/, '').replace(/^marianne[_.-]/, '')
  return TOOL_LABELS[short] ?? serviceToolLabel(services, short) ?? short.replace(/_/g, ' ')
}

/** The most telling argument of a call: the query, the id, the url… */
function toolArg(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  for (const key of ['query', 'url', 'id', 'name', 'number', 'address', 'commune', 'kind', 'domain', 'label']) {
    if (typeof o[key] === 'string' || typeof o[key] === 'number') return String(o[key])
  }
  const first = Object.values(o).find((v) => typeof v === 'string')
  return typeof first === 'string' ? first : ''
}

function ToolLine({ part }: { part: ToolPart }) {
  const tokens = useTokens()
  const services = useServices()
  const [open, setOpen] = useState(false)
  const arg = resolveTokens(toolArg(part.input), tokens)
  return (
    <div className={`tool-line${part.isError ? ' err' : ''}`}>
      <button onClick={() => setOpen(!open)} title="voir l’appel et sa réponse (telle que le moteur l’a reçue)">
        {open ? '▾' : '▸'} {toolLabel(part.name, services)}
        {arg && <> « {arg.slice(0, 80)} »</>} {part.status === 'running' ? <Spinner /> : part.isError ? '✗' : '✓'}
      </button>
      {open && (
        <pre className="selectable small" style={{ whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(part.input, null, 1)}
          {part.output !== undefined ? `\n\n${part.output || '(vide)'}` : ''}
        </pre>
      )}
    </div>
  )
}

/** Something that needs the user's yes: the exact values, and the decision. */
function ApprovalCard({ part }: { part: ApprovalPart }) {
  const { setBrowserOpen } = useApp()
  const pending = part.status === 'pending'
  const sending = part.kind === 'service'
  const status = { pending: '', accepted: sending ? 'envoyé' : 'accepté', refused: 'refusé', expired: 'sans suite' }[part.status]
  const kind = { proposal: 'proposition', form: 'formulaire', online: 'votre accord', service: 'votre accord' }[part.kind]
  return (
    <div className={`inline-card${pending ? ' ask' : ''}`}>
      <span className="h">
        {kind} · {part.title}
        {status && ` · ${status}`}
      </span>
      <div className="in">
        {part.reason && <p className="dim">{part.reason}</p>}
        {part.fields.length > 0 && (
          <table>
            <tbody>
              {part.fields.map((f, i) => (
                <tr key={i}>
                  <td>{f.label}</td>
                  <td className="hi selectable">{f.value || <span className="muted">(vide)</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pending && (
          <div className="acts">
            <button className="btn primary" onClick={() => api.respondApproval(part.id, true)}>
              {sending ? 'envoyer' : 'approuver'}
            </button>
            <button className="btn" onClick={() => api.respondApproval(part.id, false)}>
              refuser
            </button>
            {(part.kind === 'form' || part.kind === 'online') && (
              <button className="btn" onClick={() => setBrowserOpen(true)}>
                voir la page ◨
              </button>
            )}
            <span className="small dim">
              {part.kind === 'online'
                ? 'cela vous engage : Marianne ne le fait jamais sans vous'
                : part.kind === 'form' || sending
                  ? 'rien n’est envoyé sans votre accord'
                  : 'rien n’est modifié sans votre accord'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function SetupCard({ part }: { part: SetupPart }) {
  const { openSettings } = useApp()
  return (
    <div className="inline-card">
      <span className="h">réglage nécessaire</span>
      <div className="in">
        <p>{part.reason}</p>
        <div className="acts">
          <button className="btn primary" onClick={() => openSettings(part.page)}>
            renseigner {part.label} →
          </button>
        </div>
      </div>
    </div>
  )
}

function ProgressCard({ part }: { part: ProgressPart }) {
  const { setBrowserOpen } = useApp()
  return (
    <div className="inline-card">
      <span className="h">en ligne · {part.site}</span>
      <div className="in">
        <span className="small">
          {part.steps.map((s, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {s.done ? '✓' : <Spinner />} {s.label}
            </span>
          ))}
        </span>
        <div className="acts">
          <button className="btn small" onClick={() => setBrowserOpen(true)}>
            regarder ◨
          </button>
        </div>
      </div>
    </div>
  )
}

export function AttachmentChip({ a }: { a: Attachment }) {
  return (
    <span className="chip" title={a.type === 'page' ? a.url : 'pièce de l’archive'}>
      {a.type === 'page' ? `page : ${a.title || a.url}` : `pièce : ${a.title}`}
    </span>
  )
}

const plainText = (m: ChatMessage) =>
  m.parts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .filter(Boolean)
    .join('\n\n')

export const Message = memo(function Message({ message }: { message: ChatMessage }) {
  const tokens = useTokens()
  if (message.role === 'system')
    return (
      <div className="compacted">
        {message.note === 'compacted'
          ? `conversation résumée le ${new Date(message.at).toLocaleDateString('fr-FR')} · l’historique complet reste dans l’archive`
          : plainText(message)}
      </div>
    )
  const user = message.role === 'user'
  const running = message.status === 'running'
  const attachments = message.parts.filter((p): p is Attachment => p.type === 'page' || p.type === 'document')
  const waiting = message.parts.some((p) => p.type === 'approval' && p.status === 'pending')
  const last = message.parts[message.parts.length - 1]
  if (user)
    return (
      <div className="msg me selectable">
        {attachments.length > 0 && (
          <div className="attachments" style={{ marginBottom: 6 }}>
            {attachments.map((a, i) => (
              <AttachmentChip key={i} a={a} />
            ))}
          </div>
        )}
        {plainText(message)}
      </div>
    )
  return (
    <div className="msg">
      <span className="who">MARIANNE</span>
      {message.parts.map((p, i) =>
        p.type === 'text' ? (
          <Markdown key={i} source={p.text} />
        ) : p.type === 'tool' ? (
          <ToolLine key={p.id} part={p} />
        ) : p.type === 'approval' ? (
          <ApprovalCard key={p.id} part={p} />
        ) : p.type === 'setup' ? (
          <SetupCard key={i} part={p} />
        ) : p.type === 'progress' ? (
          <ProgressCard key={p.id} part={p} />
        ) : null
      )}
      {running && !waiting && (!last || last.type !== 'text') && (
        <p className="dim">
          <Spinner /> {message.parts.length ? 'Marianne consulte ses sources…' : 'Marianne réfléchit…'}
        </p>
      )}
      {message.status === 'error' && <p className="bad selectable">✗ {message.error ?? 'la réponse a échoué'}</p>}
      {message.status === 'cancelled' && <p className="dim">— arrêté —</p>}
      {message.status === 'done' && (
        <p className="meta">
          {clock(message.at)}
          {message.engine && ` · ${ENGINE_LABELS[message.engine]}`}
          {message.ms ? ` · ${Math.round(message.ms / 1000)} s` : ''} ·{' '}
          <button className="link" onClick={() => void navigator.clipboard.writeText(resolveTokens(plainText(message), tokens))}>
            copier
          </button>
        </p>
      )}
    </div>
  )
})
