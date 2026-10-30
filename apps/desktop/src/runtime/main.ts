import { SANDBOX_LIMITS, type SandboxBridge, type SandboxKind, type SandboxReply } from '../shared/community'
import { SHARED_BYTES, type FromWorker, type ToWorker } from './worker-messages'

/**
 * A community service's sandbox page (main.html): it holds the bridge (`window.__marianneService`,
 * from its preload) and runs nothing of the service. The service's code runs in a worker of this
 * page (main-worker.ts), without a document: nothing it does can prefetch a name, print or draw.
 * The page relays between the two: the main process's requests to the worker, the worker's
 * answers and calls to the bridge; the sync calls' answers go through a shared buffer the worker
 * waits on. The worker can't reach this page: here is where what it sends is bounded before it
 * crosses (only JSON text within SANDBOX_LIMITS, so often), and the main process checks it again.
 */

const bridge = (window as unknown as { __marianneService?: SandboxBridge }).__marianneService

/** An error that came over IPC: its message, without Electron's wrapping. */
const plain = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (?:[A-Za-z]*(?:Error|Refused): )?/, '')

/** A token bucket: `perSecond` on average, `burst` at once. */
function limiter(perSecond: number, burst: number) {
  let tokens = burst
  let at = performance.now()
  return () => {
    const now = performance.now()
    tokens = Math.min(burst, tokens + ((now - at) / 1000) * perSecond)
    at = now
    if (tokens < 1) return false
    tokens -= 1
    return true
  }
}

/** What crosses: JSON text within `max`, or null (too long, not plain data). */
const asJson = (value: unknown, max: number): string | null => {
  try {
    const json = JSON.stringify(value ?? null)
    return typeof json === 'string' && json.length <= max ? json : null
  } catch {
    return null
  }
}

const refused = (message: string): SandboxReply => ({ error: { name: 'Error', message } })

if (bridge) {
  const b = bridge
  const shared = new SharedArrayBuffer(SHARED_BYTES)
  const flag = new Int32Array(shared, 0, 2)
  const bytes = new Uint8Array(shared, 8)
  const encoder = new TextEncoder()
  const worker = new Worker(new URL('main-worker.js', location.href).href, { type: 'module', name: 'service' })
  const post = (m: ToWorker) => worker.postMessage(m)
  post({ kind: 'init', shared })
  const calls = limiter(SANDBOX_LIMITS.callsPerSecond, SANDBOX_LIMITS.callsBurst)
  const logs = limiter(20, 100)
  /** The kind of each request of the main process the worker hasn't answered: its answer's size depends on it. */
  const asked = new Map<number, SandboxKind>()
  let inFlight = 0

  /** A sync answer into the shared buffer, then the worker woken. */
  const answer = (reply: unknown) => {
    let encoded = encoder.encode(asJson(reply, SHARED_BYTES) ?? JSON.stringify(refused('une donnée trop longue pour passer')))
    if (encoded.length > bytes.length) encoded = encoder.encode(JSON.stringify(refused('une donnée trop longue pour passer')))
    bytes.set(encoded)
    Atomics.store(flag, 1, encoded.length)
    Atomics.store(flag, 0, 1)
    Atomics.notify(flag, 0)
  }

  b.onInvoke((message) => {
    asked.set(message.id, message.kind)
    post({ kind: 'invoke', message })
  })
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data
    if (!m || typeof m !== 'object') return
    switch (m.kind) {
      case 'reply': {
        const kind = asked.get(m.id)
        if (kind === undefined) return
        asked.delete(m.id)
        const max = kind === 'tool' ? SANDBOX_LIMITS.toolReply : kind === 'tile' ? SANDBOX_LIMITS.tileReply : SANDBOX_LIMITS.reply
        const r = m.reply as { json?: unknown; error?: { name?: unknown; message?: unknown } } | null
        if (r && typeof r.json === 'string')
          return b.reply(m.id, r.json.length <= max ? { json: r.json } : refused(`sa réponse est trop longue (${Math.round(max / 1024)} ko au plus)`))
        const name = r?.error?.name === 'ToolError' ? 'ToolError' : 'Error'
        return b.reply(m.id, { error: { name, message: typeof r?.error?.message === 'string' ? r.error.message.slice(0, 2000) : 'son code a échoué' } })
      }
      case 'call': {
        const args = typeof m.name === 'string' && m.name.length <= 64 ? asJson(m.args, SANDBOX_LIMITS.args) : null
        if (!args || !calls() || inFlight >= SANDBOX_LIMITS.callsInFlight)
          return post({ kind: 'result', id: m.id, error: args ? 'trop de demandes à la fois' : 'demande trop longue ou illisible' })
        inFlight++
        return void b
          .call(m.name, args)
          .then(
            (ok) => post({ kind: 'result', id: m.id, ok }),
            (err: unknown) => post({ kind: 'result', id: m.id, error: plain(err) })
          )
          .finally(() => inFlight--)
      }
      case 'sync': {
        const args = typeof m.name === 'string' && m.name.length <= 64 ? asJson(m.args, SANDBOX_LIMITS.args) : null
        if (!args) return answer(refused('demande trop longue ou illisible'))
        if (!calls()) return answer(refused('trop de demandes à la fois'))
        let reply: unknown
        try {
          reply = b.callSync(m.name, args)
        } catch (err) {
          reply = refused(plain(err))
        }
        return answer(reply)
      }
      case 'log':
        if (logs()) b.log(m.level === 'error' || m.level === 'warn' ? m.level : 'info', String(m.text).slice(0, 2000))
    }
  }
  worker.onerror = (e) => logs() && b.log('error', `main.js: ${String(e.message).slice(0, 500)}`)
}
