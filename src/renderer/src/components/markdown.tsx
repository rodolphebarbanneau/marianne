import { memo, useMemo, type ReactNode } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TokenValue } from '@shared/api'
import { setupRoute } from '@shared/setup'
import type { Service } from '@shared/types'
import { useApp } from '../app/context'
import { VideoCard } from './video'

const api = window.marianne

/** "https://videos.assemblee-nationale.fr/video.19632460_6ae0ce76adf9c?timecode=848880" → id and timecode. */
export function videoLink(href: string): { id: string; timecode?: number } | null {
  const m = href.match(/^https?:\/\/videos\.assemblee-nationale\.fr\/video\.(\d+_[0-9a-f]+)(?:[.?#/][^\s]*)?$/i)
  if (!m) return null
  const t = href.match(/[?&]timecode=(\d+)/)
  return { id: m[1], timecode: t ? Number(t[1]) : undefined }
}

/** The screen where a token's value is set ("numero_fiscal" → the impôts account). */
export function tokenTarget(token: string, services: Service[]): string {
  const [head] = token.split('.')
  if (['nom', 'nom_naissance', 'prenoms', 'prenom', 'date_naissance', 'lieu_naissance', 'nir', 'telephone', 'email'].includes(token)) return 'identite'
  if (token === 'adresse') return 'adresse'
  if (head === 'foyer') return 'foyer'
  if (head === 'piece') return 'pieces'
  if (head === 'entreprise') return 'entreprises'
  if (head === 'employeur') return 'employeurs'
  if (head === 'vehicule') return 'vehicules'
  if (head === 'logement') return 'logements'
  const service = services.find((s) => s.fields?.some((f) => f.key === token))
  return service ? `compte:${service.id}` : 'identite'
}

interface MdNode {
  type: string
  value?: string
  url?: string
  children?: MdNode[]
}

const TOKEN = /\[\[([a-z0-9_.]+)\]\]/gi

/** Line breaks kept as written: an address block, the header of a letter. */
function withBreaks(nodes: MdNode[]): MdNode[] {
  return nodes.flatMap((n) =>
    n.type === 'text' && n.value?.includes('\n')
      ? n.value.split('\n').flatMap((line, i): MdNode[] => [...(i ? [{ type: 'break' }] : []), ...(line ? [{ type: 'text', value: line }] : [])])
      : [n]
  )
}

/**
 * Tokens shown as their values, in the text only, after parsing: never in a link or an image
 * address, where a value would leave the computer with the request.
 */
function remarkTokens(tokens: TokenValue[]) {
  const shown = (token: string): MdNode => {
    const t = tokens.find((x) => x.token === token)
    // Someone else's number spotted in a document: masked, nothing to fill in.
    if (!t && token.endsWith('.autre')) return { type: 'text', value: '(numéro masqué)' }
    return {
      type: 'link',
      url: `${t ? 'token' : 'missing'}:${token}`,
      children: [{ type: 'text', value: t ? t.value : `${token.replace(/[_.]/g, ' ')} : à renseigner` }]
    }
  }
  const walk = (node: MdNode, inLink: boolean) => {
    if (!node.children) return
    node.children = withBreaks(node.children).flatMap((child): MdNode[] => {
      if ((child.type === 'inlineCode' || child.type === 'code') && child.value) return [{ ...child, value: resolveTokens(child.value, tokens) }]
      if (child.type !== 'text' || !child.value?.includes('[[')) {
        walk(child, inLink || child.type === 'link' || child.type === 'linkReference')
        return [child]
      }
      if (inLink) return [{ ...child, value: resolveTokens(child.value, tokens) }]
      const out: MdNode[] = []
      let last = 0
      for (const m of child.value.matchAll(TOKEN)) {
        if (m.index > last) out.push({ type: 'text', value: child.value.slice(last, m.index) })
        out.push(shown(m[1].toLowerCase()))
        last = m.index + m[0].length
      }
      if (last < child.value.length) out.push({ type: 'text', value: child.value.slice(last) })
      return out
    })
  }
  return () => (tree: MdNode) => walk(tree, false)
}

/** Replace tokens by their values (copying an answer, a letter). */
export function resolveTokens(text: string, tokens: TokenValue[]): string {
  return text.replace(/\[\[([a-z0-9_.]+)\]\]/gi, (all, token: string) => tokens.find((x) => x.token === token.toLowerCase())?.value ?? all)
}

const text = (children: ReactNode): string =>
  Array.isArray(children) ? children.map(text).join('') : typeof children === 'string' || typeof children === 'number' ? String(children) : ''

const SP_FICHE = /^https?:\/\/(?:www\.)?service-public\.(?:gouv\.)?fr\/particuliers\/vosdroits\/([FNR]\d+)(?:[#?].*)?$/

function Link({ href, children }: { href: string; children: ReactNode }) {
  const { go, services, tokens } = useApp()
  if (href.startsWith('token:')) {
    const t = tokens.find((x) => x.token === href.slice(6))
    return (
      <span className="token" title={`${t?.label ?? 'donnée'} de votre dossier : affichée ici seulement, jamais envoyée à l’assistant`}>
        {children}
      </span>
    )
  }
  if (href.startsWith('missing:')) {
    const target = setupRoute(tokenTarget(href.slice(8), services), services)
    return (
      <button className="token missing" onClick={() => target && go(target.route)} title="information absente de votre dossier : la renseigner">
        {children}
      </button>
    )
  }
  const open = (e: React.MouseEvent) => {
    e.preventDefault()
    const fiche = href.match(SP_FICHE)
    // Service-Public fiches open in the reader (offline); everything else in the built-in browser.
    if (fiche && !e.shiftKey) go(`fiche/${fiche[1]}`)
    else if (/^https?:\/\//i.test(href)) api.openBrowser(href)
  }
  return (
    <a href={href} onClick={open} title={href}>
      {children}
    </a>
  )
}

const components: Components = {
  a({ href, children }) {
    return <Link href={href ?? ''}>{children}</Link>
  },
  // No remote image: loading it would tell its server when the answer is read, and what its URL carries.
  img({ alt, src }) {
    return (
      <span className="dim">
        [image{alt ? ` : ${alt}` : ''}
        {typeof src === 'string' && /^https?:/.test(src) ? ` · ${new URL(src).hostname}` : ''}]
      </span>
    )
  },
  // A paragraph made of a single video link becomes a player.
  p({ children, node }) {
    const only = node?.children.length === 1 && node.children[0].type === 'element' && node.children[0].tagName === 'a' ? node.children[0] : null
    const href = only && typeof only.properties.href === 'string' ? only.properties.href : ''
    const video = href ? videoLink(href) : null
    if (video) return <VideoCard id={video.id} timecode={video.timecode} />
    return <p>{children}</p>
  },
  code({ children, className }) {
    return <code className={className}>{text(children)}</code>
  }
}

const urlTransform = (url: string) => (/^(token|missing):/.test(url) ? url : defaultUrlTransform(url))

/** Markdown (GitHub flavor: tables, lists), without raw HTML, with the file's tokens shown locally. */
export const Markdown = memo(function Markdown({ source }: { source: string }) {
  const { tokens } = useApp()
  const plugins = useMemo(() => [remarkGfm, remarkTokens(tokens)], [tokens])
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={plugins} components={components} urlTransform={urlTransform}>
        {source}
      </ReactMarkdown>
    </div>
  )
})
