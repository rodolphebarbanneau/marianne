import type { ServiceManifest, ServiceTab } from '@marianne/sdk'

/**
 * How a community service runs: what crosses between its parts, and the checks each side makes
 * of what the other sends. A community service is untrusted code, so it runs in two sandboxes:
 *
 * - its main side in a hidden sandboxed renderer of its own (main/community/runtime), which
 *   reaches Marianne only through a narrow bridge (`window.__marianneService`, SandboxBridge);
 * - its screen in a view of its own over the window's content (main/community/runtime/screen.ts),
 *   which reaches Marianne only by messages through the main process (`window.__marianneScreen`,
 *   FromFrame, ToFrame); the window draws the frame around it (renderer/src/host/community-screen.tsx).
 *
 * Both load their pages from the `marianne-service:` scheme: the service's own files
 * (marianne-service://<code>/view.js) and Marianne's runtime (marianne-service://<code>/~runtime/…).
 */

/** The scheme a community service's pages and files are served from. */
export const SERVICE_SCHEME = 'marianne-service'

/** Where a community service's screen is: Marianne's view runtime, which loads its view.js. */
export const frameUrl = (code: string) => `${SERVICE_SCHEME}://${code}/~runtime/view.html`

/** Where its main side runs: Marianne's main runtime, which loads its main.js. */
export const sandboxUrl = (code: string) => `${SERVICE_SCHEME}://${code}/~runtime/main.html`

// ---------------------------------------------------------------- the main side's sandbox

export { SANDBOX_CHANNELS } from './sandbox-channels'

/** What the main process asks of a sandbox. */
export type SandboxKind = 'activate' | 'ping' | 'method' | 'tool' | 'tile' | 'summary' | 'today' | 'deadlines'

export interface SandboxInvoke {
  id: number
  kind: SandboxKind
  /** The method or tool, for those two kinds. */
  name: string
  args: unknown[]
}

/**
 * A sandbox's answer: its value as JSON (its length checked before it is read), or the error
 * thrown (by its name: a ToolError stays one).
 */
export type SandboxReply = { json: string } | { error: { name: string; message: string } }

/** The main process's answer to a sync call of the bridge. */
export type BridgeReply = { ok: unknown } | { error: { name: string; message: string } }

/** The context's calls answered later: the network (declared hosts only) and the communes. */
export const SANDBOX_ASYNC_CALLS = ['http.json', 'http.text', 'http.page', 'geo.findCommunes', 'geo.getCommune'] as const

/** The context's calls answered at once, as a service's main side expects them. */
export const SANDBOX_SYNC_CALLS = [
  'storage.get',
  'storage.set',
  'storage.remove',
  'home',
  'profile.granted',
  'profile.vehicles',
  'profile.leaning',
  'profile.themes'
] as const

/**
 * What a sandbox's page lets cross to the main process, whatever its worker (the service's code)
 * asks: JSON text within these lengths, so often. The main process checks the same again.
 */
export const SANDBOX_LIMITS = {
  /** A call's arguments, as JSON (a stored value is at most 1 MB). */
  args: 1_100_000,
  /** An answer, as JSON: a tool's, a tile's, any other. */
  toolReply: 256 * 1024,
  tileReply: 64 * 1024,
  reply: 1024 * 1024,
  callsPerSecond: 100,
  callsBurst: 400,
  /** Calls to the network and the communes waiting for their answer. */
  callsInFlight: 32
} as const

/** `window.__marianneService` in a sandbox: all its page gets of Marianne. Arguments cross as JSON text. */
export interface SandboxBridge {
  call(name: string, args: string): Promise<unknown>
  callSync(name: string, args: string): BridgeReply
  /** The main process's requests; one listener, the runtime's (the first to ask). */
  onInvoke(listener: (message: SandboxInvoke) => void): void
  reply(id: number, reply: SandboxReply): void
  log(level: 'info' | 'warn' | 'error', text: string): void
}

/** What a community service's main side says of itself once activated: its answer to 'activate'. */
export interface SandboxDescription {
  /** The methods its view may call. */
  methods: string[]
  /** Its tools, their arguments as JSON Schema (z.toJSONSchema). */
  tools: Array<{ name: string; label: string; description: string; readOnly: boolean; input: unknown }>
  skills: string[]
  instructions: string
  /** Which of the optional parts it has. */
  has: { today: boolean; summary: boolean; deadlines: boolean; tile: boolean }
  /** Its `tile.everyMinutes`, if it says. */
  tileEveryMinutes: number | null
}

// ---------------------------------------------------------------- the screen

export { SCREEN_CHANNELS } from './screen-channels'

/** `window.__marianneScreen` in a screen: all its page gets of Marianne. */
export interface ScreenBridge {
  post(message: FromFrame): void
  /** One listener, the runtime's (the first to ask). */
  onMessage(listener: (message: unknown) => void): void
}

/** A page handed to Marianne with a question (ShownPage in @marianne/sdk/view). */
export interface FramePage {
  url: string
  title: string
  text: string
}

/** What the frame's host carries (ServiceHost in @marianne/sdk/view, without its functions). */
export interface FrameHost {
  manifest: ServiceManifest
  params: Record<string, string | number>
  home: { code: string; name: string; postcode: string; latitude?: number; longitude?: number } | null
}

/** The window's look, which the frame follows. */
export interface FrameLook {
  theme: string
  crt: boolean
  fontSize: number
  platform: string
}

/** From the window to the frame. */
export type ToFrame =
  | { type: 'init'; host: FrameHost; tabs: ServiceTab[]; tab: string; barred: boolean; look: FrameLook }
  | { type: 'host'; host: FrameHost }
  /** The tab shown; `picked`: the user picked it (a click, its key), the one shown included. */
  | { type: 'tab'; tab: string; picked: boolean }
  | { type: 'look'; look: FrameLook }
  | { type: 'reply'; id: number; ok?: unknown; error?: string }

/** From the frame to the window. */
export type FromFrame =
  | { type: 'hello' }
  | { type: 'call'; id: number; method: string; args: unknown[] }
  | { type: 'load'; id: number; key: string }
  | { type: 'save'; id: number; key: string; value: unknown }
  | { type: 'ask'; text: string; page?: FramePage }
  | { type: 'route'; route: string }
  | { type: 'url'; url: string }
  | { type: 'copy'; text: string; done?: string }
  | { type: 'toast'; text: string }
  | { type: 'open'; tab: string }
  | { type: 'badges'; badges: Record<string, string> }
  | { type: 'key'; key: string }
  | { type: 'activity' }

/** The keys a frame hands to the window: the guide, the tabs, the way back. */
export const FRAME_KEYS: ReadonlySet<string> = new Set(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'Escape'])

const IDENT = /^[A-Za-z_$][\w$]{0,63}$/
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const id = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0

/**
 * A frame's message, when it is one of FromFrame and within its limits; null otherwise (the
 * window ignores it). The frame is the service's code: nothing it sends is taken as it comes.
 */
export function readFromFrame(data: unknown): FromFrame | null {
  if (!isRecord(data) || typeof data.type !== 'string') return null
  const d = data
  switch (d.type) {
    case 'hello':
    case 'activity':
      return { type: d.type }
    case 'call':
      return id(d.id) && typeof d.method === 'string' && IDENT.test(d.method) && Array.isArray(d.args) && d.args.length <= 16
        ? { type: 'call', id: d.id, method: d.method, args: d.args }
        : null
    case 'load':
      return id(d.id) && text(d.key, 200) && d.key ? { type: 'load', id: d.id, key: d.key } : null
    case 'save':
      return id(d.id) && text(d.key, 200) && d.key ? { type: 'save', id: d.id, key: d.key, value: d.value } : null
    case 'ask': {
      if (!text(d.text, 8000) || !d.text.trim()) return null
      if (d.page === undefined) return { type: 'ask', text: d.text }
      const p = d.page
      if (!isRecord(p) || !text(p.url, 2000) || !/^https:\/\//.test(p.url) || !text(p.title, 300) || !text(p.text, 100_000)) return null
      return { type: 'ask', text: d.text, page: { url: p.url, title: p.title, text: p.text } }
    }
    // Another screen of the app (settings/identity, service/carte, news), never one of the user's folders.
    case 'route':
      return text(d.route, 200) && /^[a-z]+(?:[:/][a-z0-9-]+)?$/.test(d.route) && !/^folder\b/.test(d.route) ? { type: 'route', route: d.route } : null
    case 'url':
      return text(d.url, 2000) ? { type: 'url', url: d.url } : null
    case 'copy':
      return text(d.text, 100_000) && (d.done === undefined || text(d.done, 80)) ? { type: 'copy', text: d.text, ...(d.done ? { done: d.done } : {}) } : null
    case 'toast':
      return text(d.text, 200) && d.text.trim() ? { type: 'toast', text: d.text } : null
    case 'open':
      return text(d.tab, 40) ? { type: 'open', tab: d.tab } : null
    case 'badges': {
      if (!isRecord(d.badges)) return null
      const entries = Object.entries(d.badges)
      if (entries.length > 16 || !entries.every(([k, v]) => text(k, 40) && text(v, 24))) return null
      return { type: 'badges', badges: Object.fromEntries(entries) as Record<string, string> }
    }
    case 'key':
      return typeof d.key === 'string' && FRAME_KEYS.has(d.key) ? { type: 'key', key: d.key } : null
    default:
      return null
  }
}

/** The window's message, as the frame reads it; null: not one of ToFrame. */
export function readToFrame(data: unknown): ToFrame | null {
  if (!isRecord(data) || typeof data.type !== 'string') return null
  const d = data
  switch (d.type) {
    case 'init':
      return isRecord(d.host) && Array.isArray(d.tabs) && typeof d.tab === 'string' && typeof d.barred === 'boolean' && isRecord(d.look)
        ? (d as unknown as ToFrame)
        : null
    case 'host':
      return isRecord(d.host) ? (d as unknown as ToFrame) : null
    case 'tab':
      return typeof d.tab === 'string' && typeof d.picked === 'boolean' ? { type: 'tab', tab: d.tab, picked: d.picked } : null
    case 'look':
      return isRecord(d.look) ? (d as unknown as ToFrame) : null
    case 'reply':
      return id(d.id) ? { type: 'reply', id: d.id, ...('error' in d ? { error: String(d.error) } : { ok: d.ok }) } : null
    default:
      return null
  }
}

/**
 * Whether a community service's screen may open a page in the system's browser: https, on one
 * of its declared hosts or under one of the links it handles. Anything else stays closed.
 */
export function frameMayOpen(m: Pick<ServiceManifest, 'hosts' | 'links'>, url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.username || u.password) return false
  return m.hosts.includes(u.hostname) || m.links.some((prefix) => u.href.startsWith(prefix))
}
