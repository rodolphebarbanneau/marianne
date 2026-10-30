import { memo, useMemo, useState, type ReactNode } from 'react'
import { serviceCode, type ServiceState } from '@marianne/sdk'
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TokenValue } from '@shared/api'
import { useApp } from '../app/context'
import { serviceForLink, useServices } from '../host'
import { webHost } from '../lib/address'
import { useTokens } from '../lib/tokens'
import { api } from '../lib/api'
import { Modal } from './ui'

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

/** Replace tokens by their values (copying an answer, a letter). */
export function resolveTokens(text: string, tokens: TokenValue[]): string {
  return text.replace(TOKEN, (all, token: string) => tokens.find((x) => x.token === token.toLowerCase())?.value ?? all)
}

/**
 * Tokens shown as their values, in the text only, after parsing: never in a link or an image
 * address, where a value would leave the computer with the request.
 */
function remarkTokens(tokens: TokenValue[]) {
  const shown = (token: string): MdNode => {
    const t = tokens.find((x) => x.token === token)
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

const text = (children: ReactNode): string =>
  Array.isArray(children) ? children.map(text).join('') : typeof children === 'string' || typeof children === 'number' ? String(children) : ''

function Link({ href, children }: { href: string; children: ReactNode }) {
  const app = useApp()
  const tokens = useTokens()
  const services = useServices()
  // A community service that claims the link: the user chooses where it opens.
  const [claimed, setClaimed] = useState<ServiceState | null>(null)
  if (href.startsWith('token:')) {
    const t = tokens.find((x) => x.token === href.slice(6))
    return (
      <span className="token" title={`${t?.label ?? 'donnée'} de votre profil : affichée ici seulement, jamais envoyée au moteur`}>
        {children}
      </span>
    )
  }
  if (href.startsWith('missing:')) {
    return (
      <button className="token link" onClick={() => app.openSettings('identity')} title="information absente de votre profil : la renseigner">
        {children}
      </button>
    )
  }
  const browse = (external: boolean) => {
    if (!/^https?:\/\//i.test(href)) return
    // In a folder, pages open in its built-in browser; elsewhere in the system's.
    if (app.view.kind === 'folder' && !external) {
      api.browserOpen(href, app.view.id)
      app.setBrowserOpen(true)
    } else api.openExternal(href)
  }
  const inService = (service: ServiceState) => app.go({ kind: 'service', id: service.manifest.id, params: { url: href } })
  const open = (e: React.MouseEvent) => {
    e.preventDefault()
    if (href.startsWith('marianne:')) return app.openRoute(href.slice(9))
    // A service that handles the link opens it in its screen (a video of the Assemblée…); a community service only if the user says so.
    const service = serviceForLink(services, href)
    if (service && !e.shiftKey) return service.builtIn ? inService(service) : setClaimed(service)
    browse(e.shiftKey)
  }
  return (
    <>
      <a href={href} onClick={open} title={href}>
        {children}
      </a>
      {claimed && (
        <Modal onClose={() => setClaimed(null)} label="ouvrir un lien">
          <div className="in">
            <p>
              Ce lien peut s’ouvrir dans <span className="inv">3615</span> {serviceCode(claimed.manifest)}, un service de la communauté, ou dans votre
              navigateur.
            </p>
            <p className="small dim selectable" style={{ wordBreak: 'break-all' }}>
              {href}
            </p>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => (setClaimed(null), browse(true))}>
              ouvrir dans votre navigateur
            </button>
            <button className="btn" onClick={() => (setClaimed(null), inService(claimed))}>
              ouvrir dans 3615 {serviceCode(claimed.manifest)}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

const components: Components = {
  a({ href, children }) {
    return <Link href={href ?? ''}>{children}</Link>
  },
  // No remote image: loading it would tell its server when the answer is read, and what its URL carries.
  // Its host only, when it has one: an address that doesn't parse (« http:// ») must not blank the answer.
  img({ alt, src }) {
    const host = webHost(src)
    return (
      <span className="dim">
        [image{alt ? ` : ${alt}` : ''}
        {host ? ` · ${host}` : ''}]
      </span>
    )
  },
  code({ children, className }) {
    return <code className={className}>{text(children)}</code>
  }
}

const urlTransform = (url: string) => (/^(token|missing|marianne):/.test(url) ? url : defaultUrlTransform(url))

/**
 * Markdown (GitHub flavor: tables, lists), without raw HTML, with the profile's tokens shown
 * locally. `plain`: a text Marianne didn't write (a community service's help): no token is ever
 * shown in it, and its links are plain links.
 */
export const Markdown = memo(function Markdown({ source, plain }: { source: string; plain?: boolean }) {
  const tokens = useTokens()
  const plugins = useMemo(() => (plain ? [remarkGfm] : [remarkGfm, remarkTokens(tokens)]), [tokens, plain])
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={plugins} components={components} urlTransform={plain ? defaultUrlTransform : urlTransform}>
        {source}
      </ReactMarkdown>
    </div>
  )
})
