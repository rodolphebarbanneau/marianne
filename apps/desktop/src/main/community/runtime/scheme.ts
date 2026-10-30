import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { allowedUrl, SERVICE_CODE, type ServiceManifest } from '@marianne/sdk'
import { SERVICE_SCHEME } from '../../../shared/community'

/**
 * The `marianne-service:` scheme: what a community service's pages load. For one service,
 * marianne-service://<code>/ serves its main.js, view.js and view.css (nothing else of its
 * folder: never installed.json), marianne-service://<code>/~runtime/… Marianne's runtime (the
 * two pages, the modules of their import maps, the stylesheet and the fonts: the files listed
 * when the app started, nothing else), and for its screen marianne-service://<code>/~picture/…
 * a picture of one of its declared hosts, fetched by the main process. Only while the service is
 * active: any other code is not found. Every answer says its type and may not be sniffed as
 * another; the pages carry the content policy that keeps them to their own scheme.
 */

/** What the scheme serves from: a service's package (while it is active), Marianne's runtime, its declared hosts' pictures. */
export interface SchemeSource {
  /** The folder and manifest of an active community service; null: none by that code. */
  packageOf(code: string): { dir: string; manifest: Pick<ServiceManifest, 'id' | 'hosts'> } | null
  /** Marianne's built runtime (out/runtime). */
  runtimeDir: string
  /** Its files, by their path inside it ('chunks/react-x.js'): the only ones served. */
  runtimeFiles: () => ReadonlySet<string>
  /** A picture of a declared host (checked again here), for a screen; absent: none served. */
  picture?: (manifest: Pick<ServiceManifest, 'id' | 'hosts'>, url: string) => Promise<{ type: string; body: Uint8Array } | null>
}

export interface SchemeAnswer {
  status: number
  headers: Record<string, string>
  body: Uint8Array | string
}

/** The service's files the scheme serves, at its root. */
export const SERVED_FILES: ReadonlySet<string> = new Set(['main.js', 'view.js', 'view.css'])

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
}

/** The two pages of the runtime: the screen and the main side's sandbox. */
const PAGES = { 'view.html': 'view', 'main.html': 'main' } as const

/** The worker the main side's code runs in (its sandbox page starts it). */
export const WORKER_FILE = 'main-worker.js'

/** What a service's main.js imports by name, pointed at Marianne's own modules (a worker has no import map). */
const WORKER_IMPORTS: Record<string, string> = {
  '@marianne/sdk': './~runtime/sdk.js',
  '@marianne/sdk/main': './~runtime/sdk-main.js',
  zod: './~runtime/zod.js'
}

/** A service's main.js with its imports of Marianne's modules pointed at the runtime's files; any other bare import stays, and fails. */
export function workerImports(code: string): string {
  return code.replace(
    /(\bfrom\s*|\bimport\s*\(?\s*)(["'])(zod|@marianne\/sdk(?:\/main)?)\2/g,
    (_all, lead: string, quote: string, spec: string) => `${lead}${quote}${WORKER_IMPORTS[spec]}${quote}`
  )
}

const extOf = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '')

const COMMON = {
  'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer'
}

const notFound = (): SchemeAnswer => ({ status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }, body: '' })

/** The files of the runtime's folder, by their path inside it: what may be served. */
export function listRuntime(dir: string): Set<string> {
  const files = new Set<string>()
  const walk = (at: string) => {
    let entries: import('node:fs').Dirent[] = []
    try {
      entries = readdirSync(at, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const path = join(at, e.name)
      if (e.isDirectory()) walk(path)
      else if (e.isFile() && MIME[extOf(e.name)]) files.add(relative(dir, path).split(sep).join('/'))
    }
  }
  walk(dir)
  return files
}

/** Where a screen gets a picture of its declared host: the scheme, which fetches it. */
export const pictureUrl = (code: string, url: string) => `${SERVICE_SCHEME}://${code}/~picture/${Buffer.from(url, 'utf8').toString('base64url')}`

/**
 * The content policy of a runtime page: scripts, styles and fonts from the service's own
 * address only (and the page's import map, by its hash), pictures from there and its declared
 * hosts (which its session turns into the scheme's), no connection, no frame, no form, no base;
 * the screen's page sandboxed (no dialog, popup nor download, in it or a frame it makes). The main
 * side's page needs even less.
 */
export function contentPolicy(page: 'view' | 'main' | 'worker', code: string, hosts: readonly string[], inlineHashes: readonly string[] = []): string {
  const self = `${SERVICE_SCHEME}://${code}`
  const scripts = [self, ...inlineHashes.map((h) => `'${h}'`)].join(' ')
  // The main side's page starts one worker, of its own address; the worker none.
  const common = [
    "default-src 'none'",
    `script-src ${scripts}`,
    "connect-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    `worker-src ${page === 'main' ? self : "'none'"}`
  ]
  const end = ["object-src 'none'", "base-uri 'none'", "form-action 'none'"]
  if (page === 'main' || page === 'worker') return [...common, "img-src 'none'", "style-src 'none'", "font-src 'none'", ...end].join('; ')
  const images = [self, 'data:', ...hosts.map((h) => `https://${h}`)].join(' ')
  // The screen's page and every frame it makes, sandboxed: no dialog (print, alert), no popup, no download.
  const sandbox = 'sandbox allow-scripts allow-same-origin allow-forms'
  return [
    ...common,
    `style-src ${self} 'unsafe-inline'`,
    `font-src ${self}`,
    `img-src ${images}`,
    "media-src 'none'",
    "manifest-src 'none'",
    ...end,
    sandbox
  ].join('; ')
}

/** The SHA-256 of each inline script of a page (its import map), as a content policy names them. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = []
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue
    hashes.push(`sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}`)
  }
  return hashes
}

type Target = { code: string; kind: 'package' | 'runtime'; file: string } | { code: string; kind: 'picture'; url: string }

/** What a URL of the scheme names: a file of the service, of the runtime, a picture; null: nothing served. */
export function resolveServiceUrl(url: string, source: SchemeSource, only?: string): Target | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== `${SERVICE_SCHEME}:` || u.username || u.password || u.port) return null
  const code = u.hostname
  if (!SERVICE_CODE.test(code) || (only !== undefined && code !== only)) return null
  const pkg = source.packageOf(code)
  if (!pkg) return null
  let segments: string[]
  try {
    segments = u.pathname.slice(1).split('/').map(decodeURIComponent)
  } catch {
    return null
  }
  if (segments.length === 1 && SERVED_FILES.has(segments[0])) return { code, file: segments[0], kind: 'package' }
  if (segments[0] === '~picture' && segments.length === 2 && source.picture) {
    const target = /^[A-Za-z0-9_-]{1,4000}$/.test(segments[1]) ? Buffer.from(segments[1], 'base64url').toString('utf8') : ''
    return target && allowedUrl(pkg.manifest, target) ? { code, kind: 'picture', url: target } : null
  }
  if (segments[0] !== '~runtime' || segments.length < 2) return null
  const file = segments.slice(1).join('/')
  // Only what the runtime's folder held at start: no other name (a device, a path out) is ever opened.
  if (!source.runtimeFiles().has(file)) return null
  if (extOf(file) === '.html' && !(file in PAGES)) return null
  return { code, file, kind: 'runtime' }
}

/**
 * The answer to a request of the scheme. `only`: the code the asking session may load (a
 * service's sandbox and its screen load their own files only). GET only; the service's view.css,
 * when it has none, is an empty stylesheet (its view runtime always links one).
 */
export async function answerServiceRequest(request: { url: string; method: string }, source: SchemeSource, only?: string): Promise<SchemeAnswer> {
  if (request.method !== 'GET') return { ...notFound(), status: 405 }
  const target = resolveServiceUrl(request.url, source, only)
  if (!target) return notFound()
  const pkg = source.packageOf(target.code)!
  if (target.kind === 'picture') {
    const got = await source.picture!(pkg.manifest, target.url).catch(() => null)
    if (!got) return notFound()
    // A picture, never a page: an SVG's scripts don't run as an image, nor here.
    return {
      status: 200,
      headers: { ...COMMON, 'Content-Type': got.type, 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" },
      body: got.body
    }
  }
  const path = target.kind === 'package' ? join(pkg.dir, target.file) : join(source.runtimeDir, ...target.file.split('/'))
  const type = MIME[extOf(target.file)]
  let body: Uint8Array
  try {
    body = await readFile(path)
  } catch {
    if (target.kind === 'package' && target.file === 'view.css') return { status: 200, headers: { ...COMMON, 'Content-Type': type }, body: '' }
    return notFound()
  }
  const headers: Record<string, string> = { ...COMMON, 'Content-Type': type }
  const page = target.kind === 'runtime' ? PAGES[target.file as keyof typeof PAGES] : undefined
  if (page) {
    headers['Content-Security-Policy'] = contentPolicy(page, target.code, pkg.manifest.hosts, inlineScriptHashes(Buffer.from(body).toString('utf8')))
    headers['X-DNS-Prefetch-Control'] = 'off'
  }
  // The main side's page and its worker share memory (the worker waits on it for the context's sync answers): isolated.
  if (page === 'main' || (target.kind === 'runtime' && target.file === WORKER_FILE)) {
    headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
  }
  if (target.kind === 'runtime' && target.file === WORKER_FILE) headers['Content-Security-Policy'] = contentPolicy('worker', target.code, [])
  if (target.kind === 'package' && target.file === 'main.js') body = Buffer.from(workerImports(Buffer.from(body).toString('utf8')), 'utf8')
  return { status: 200, headers, body }
}

/** A session's `marianne-service:` handler (`protocol.handle`), restricted to one code when `only` says. */
export function schemeHandler(source: SchemeSource, only?: string) {
  return async (request: Request): Promise<Response> => {
    const a = await answerServiceRequest(request, source, only)
    return new Response(a.status === 200 ? (a.body as ConstructorParameters<typeof Response>[0]) : null, { status: a.status, headers: a.headers })
  }
}
