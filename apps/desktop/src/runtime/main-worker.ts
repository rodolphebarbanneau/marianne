import type { ServiceContext, ServiceManifest, ServiceModule, ServiceRuntime } from '@marianne/sdk/main'
import * as z from 'zod'
import type { BridgeReply, SandboxDescription, SandboxInvoke } from '../shared/community'
import type { FromWorker, ToWorker, WorkerBridge } from './worker-messages'

/**
 * Marianne's main runtime, in a community service's sandbox: a worker of its page (main.html), so
 * that the service's code has no document at all (nothing to prefetch, nothing to print). It loads
 * the service's main.js, activates it with a context made of requests to its page, which relays
 * them over the bridge (main.ts), says what it got (its methods, its tools with their arguments as
 * JSON Schema…), then runs what the main process asks: a method for its screen, a tool for an
 * engine, its tile, its lines of "Aujourd'hui"… The context's synchronous parts (the storage, the
 * commune, the profile) wait on a shared buffer the page fills. The service's `zod` and
 * `@marianne/sdk/main` are this runtime's own (the scheme points its main.js's imports at them):
 * one zod, so its tools' arguments convert as they are.
 */

// No JIT: the worker's content policy forbids eval, and zod would try it.
z.config({ jitless: true })

const scope = self as unknown as { postMessage(m: FromWorker): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null }
let shared: { flag: Int32Array; bytes: Uint8Array } | null = null
let nextCall = 1
const calls = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
let onInvoke: ((m: SandboxInvoke) => void) | null = null
const decoder = new TextDecoder()

/** The bridge, as the worker has it: messages to its page, a wait on the shared buffer for the sync ones. */
const bridge: WorkerBridge = {
  call: (name, args) =>
    new Promise((resolve, reject) => {
      const id = nextCall++
      calls.set(id, { resolve, reject })
      scope.postMessage({ kind: 'call', id, name, args })
    }),
  callSync: (name, args): BridgeReply => {
    if (!shared) return { error: { name: 'Error', message: 'le bac à sable n’est pas prêt' } }
    Atomics.store(shared.flag, 0, 0)
    scope.postMessage({ kind: 'sync', name, args })
    Atomics.wait(shared.flag, 0, 0, 30_000)
    if (Atomics.load(shared.flag, 0) !== 1) return { error: { name: 'Error', message: 'Marianne n’a pas répondu à temps' } }
    const length = Atomics.load(shared.flag, 1)
    // A copy: text is never decoded from shared memory.
    return JSON.parse(decoder.decode(shared.bytes.slice(0, length))) as BridgeReply
  },
  onInvoke: (listener) => {
    onInvoke ??= listener
  },
  reply: (id, reply) => scope.postMessage({ kind: 'reply', id, reply }),
  log: (level, text) => scope.postMessage({ kind: 'log', level, text: String(text) })
}

scope.onmessage = (e) => {
  const m = e.data
  if (m.kind === 'init') {
    shared = { flag: new Int32Array(m.shared, 0, 2), bytes: new Uint8Array(m.shared, 8) }
  } else if (m.kind === 'invoke') onInvoke?.(m.message)
  else if (m.kind === 'result') {
    const c = calls.get(m.id)
    if (!c) return
    calls.delete(m.id)
    if (m.error !== undefined) c.reject(new Error(m.error))
    else c.resolve(m.ok)
  }
}

/** An error that came over IPC: its message, without Electron's wrapping. */
const plain = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (?:[A-Za-z]*(?:Error|Refused): )?/, '')

const unwrap = (reply: BridgeReply): unknown => {
  if ('error' in reply) throw new Error(reply.error.message)
  return reply.ok
}

let module: ServiceModule | null = null
let runtime: ServiceRuntime | null = null

/** The context the service's main side gets: every capability a request over the bridge. */
function context(manifest: ServiceManifest, b: WorkerBridge): ServiceContext {
  const call = (name: string, ...args: unknown[]) => b.call(name, args).catch((err: unknown) => Promise.reject(new Error(plain(err))))
  const sync = (name: string, ...args: unknown[]) => unwrap(b.callSync(name, args))
  const text = (args: unknown[]) => args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : JSON.stringify(a))).join(' ')
  return {
    manifest,
    http: {
      json: <T>(url: string, options?: unknown) => call('http.json', url, options) as Promise<T>,
      text: (url, options) => call('http.text', url, options) as Promise<string>,
      page: (url, options) => call('http.page', url, options) as Promise<string>
    },
    log: {
      info: (...args) => b.log('info', text(args)),
      warn: (...args) => b.log('warn', text(args)),
      error: (...args) => b.log('error', text(args))
    },
    storage: {
      get: <T>(key: string) => sync('storage.get', key) as T | null,
      set: (key, value) => void sync('storage.set', key, value),
      remove: (key) => void sync('storage.remove', key)
    },
    // A community service has no folder of its own on this computer (no sync job, in this version).
    dataDir: '',
    geo: {
      findCommunes: (q, limit) => call('geo.findCommunes', q, limit) as never,
      getCommune: (code) => call('geo.getCommune', code) as never
    },
    home: () => sync('home') as ReturnType<ServiceContext['home']>,
    profile: {
      granted: () => sync('profile.granted') as never,
      vehicles: () => sync('profile.vehicles') as never,
      leaning: () => sync('profile.leaning') as never,
      themes: () => sync('profile.themes') as never
    },
    sync: { status: () => ({}), run: async () => {} }
  }
}

/** What the service's main side has, for the main process. */
function describe(m: ServiceModule, r: ServiceRuntime): SandboxDescription {
  return {
    methods: Object.keys(r.methods ?? {}).filter((k) => typeof (r.methods as Record<string, unknown>)[k] === 'function'),
    tools: (r.tools ?? []).map((t) => ({
      name: t.name,
      label: t.label,
      description: t.description,
      readOnly: t.readOnly === true,
      // Arguments the schema can't say (a transform) are left open here; the service's own schema checks them before `run`.
      input: z.toJSONSchema(z.object(t.input), { io: 'input', unrepresentable: 'any' })
    })),
    skills: r.skills ?? [],
    instructions: r.instructions ?? '',
    has: { today: !!r.today, summary: !!r.summary, deadlines: !!r.deadlines, tile: !!r.tile },
    tileEveryMinutes: m.tile?.everyMinutes ?? null
  }
}

async function activate(b: WorkerBridge, manifest: ServiceManifest): Promise<SandboxDescription> {
  if (module) throw new Error('already activated')
  const loaded = (await import(/* @vite-ignore */ new URL('../main.js', self.location.href).href)) as { service?: ServiceModule }
  if (!loaded.service || typeof loaded.service.activate !== 'function')
    throw new Error('main.js n’exporte pas de service (export const service = defineService(…))')
  module = loaded.service
  runtime = module.activate(context(manifest, b))
  if (!runtime || typeof runtime !== 'object') throw new Error('activate() n’a rien rendu')
  return describe(module, runtime)
}

async function run(b: WorkerBridge, m: SandboxInvoke): Promise<unknown> {
  if (m.kind === 'ping') return 'pong'
  if (m.kind === 'activate') return activate(b, m.args[0] as ServiceManifest)
  if (!runtime) throw new Error('not activated')
  switch (m.kind) {
    case 'method': {
      const fn = (runtime.methods as Record<string, (...a: unknown[]) => unknown>)[m.name]
      if (typeof fn !== 'function') throw new Error(`méthode inconnue (${m.name})`)
      return fn(...m.args)
    }
    case 'tool': {
      const tool = (runtime.tools ?? []).find((t) => t.name === m.name)
      if (!tool) throw new Error(`unknown tool ${m.name}`)
      // The service's own schema: its defaults and transforms, as in Marianne's process.
      const args = z.object(tool.input).safeParse(m.args[0] ?? {})
      if (!args.success) throw Object.assign(new Error(`Invalid arguments: ${z.prettifyError(args.error)}`), { name: 'ToolError' })
      return tool.run(args.data, (m.args[1] ?? {}) as { folderId?: string })
    }
    case 'tile':
      return runtime.tile ? runtime.tile() : null
    case 'summary':
      return runtime.summary ? runtime.summary(m.args[0] as never) : null
    case 'today':
      return runtime.today ? runtime.today(String(m.args[0])) : []
    case 'deadlines':
      return runtime.deadlines ? runtime.deadlines() : []
  }
  throw new Error(`unknown request ${String(m.kind)}`)
}

{
  const b = bridge
  b.onInvoke((m) => {
    void Promise.resolve()
      .then(() => run(b, m))
      .then(
        (ok) => {
          let json: string | undefined
          try {
            json = JSON.stringify(ok ?? null)
          } catch {
            // a cycle, a BigInt: not plain data
          }
          // As JSON, which the main process measures before it reads it.
          if (json === undefined) b.reply(m.id, { error: { name: 'Error', message: 'son résultat n’est pas fait de données simples' } })
          else b.reply(m.id, { json })
        },
        (err: unknown) => {
          const e = err instanceof Error ? err : new Error(String(err))
          b.reply(m.id, { error: { name: e.name === 'ToolError' ? 'ToolError' : 'Error', message: plain(e).slice(0, 2000) } })
        }
      )
  })
}
