import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { redact, resolveDeep } from '@marianne/profile'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { app } from 'electron'
import { log } from './log'
import { MCP_SERVER_NAME } from './mcp-name'
import { profile } from './profile/store'
import { ALL_TOOLS, activeTools } from './tools'
import { tasks } from './tasks'
import { ToolError, type Tool, type ToolContext } from './tools/tool'

/**
 * Marianne's tools, served to the engines over MCP (streamable HTTP, stateless) from the main
 * process. It listens on the loopback interface only, on a random port, and every request must
 * carry a token generated at each launch: other programs on the computer can't use it.
 *
 * It is also where the privacy boundary holds: [[tokens]] in tool arguments are replaced by the
 * user's values here, and every result is scrubbed of them before it goes back to the engine.
 */

export { MCP_SERVER_NAME }
const MAX_BODY = 4 * 1024 * 1024

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('Request too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined)
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

/** One MCP server per request (stateless mode), with the tools enabled right now. */
function buildServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, title: 'Marianne', version: app.getVersion() }, { capabilities: { tools: {} } })
  const names = new Set<string>()
  for (const t of activeTools()) {
    // One tool by a name; one that can't be registered is left out, the others are served.
    if (names.has(t.name)) {
      log.warn(`MCP: two tools named ${t.name}; the second left out`)
      continue
    }
    names.add(t.name)
    try {
      register(server, t, ctx)
    } catch (err) {
      log.warn(`MCP: tool ${t.name} left out:`, (err as Error).message)
    }
  }
  return server
}

/**
 * One call of a tool, as an engine makes it: the planned task's run gate, [[tokens]] resolved in
 * its arguments (refused for a service's), its result scrubbed of them.
 */
export async function callTool(t: Tool, args: unknown, ctx: ToolContext): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  const started = Date.now()
  const tokens = profile.tokens()
  try {
    // Nobody watches a run: this is what holds it to reading and reporting, whatever a page told the engine.
    // Read once: the call keeps to the run it started in, even if the run ends meanwhile (tools/browser.ts).
    const run = tasks.runningIn(ctx.folderId)
    if (!tasks.mayUse(ctx.folderId, t, ALL_TOOLS.includes(t)))
      throw new ToolError(`A planned task's run cannot use ${t.name}. Stop here and report "waiting" with task_report, saying what the user should do.`)
    const raw = JSON.stringify(args ?? {})
    if (t.tokens === false && /\[\[[a-z0-9_.]+\]\]/i.test(raw))
      throw new ToolError('Tokens [[…]] are not accepted here: the user’s identifiers never leave the app through an address.')
    const resolved = resolveDeep(args, tokens)
    const replaced = JSON.stringify(resolved ?? {}) !== raw
    // A run's one identifier, its entity's, goes through type_text only, which checks it is exactly that one.
    if (run && replaced && t.name !== 'type_text')
      throw new ToolError(`A planned task's run cannot send the user's identifiers through ${t.name}. Stop here and report "waiting" with task_report.`)
    const text = await t.run(resolved as never, { ...ctx, run, resolved: replaced })
    log.info(`tool ${t.name} ok in ${Date.now() - started}ms`)
    return { content: [{ type: 'text' as const, text: redact(text, profile.tokens()) }] }
  } catch (err) {
    // Messages may quote the resolved arguments: scrubbed for the log as for the engine.
    const message = redact((err as Error).message ?? String(err), tokens)
    // By name: a service's ToolError may come from its own copy of the SDK.
    if ((err as Error).name === 'ToolError') log.info(`tool ${t.name}: ${message.slice(0, 120)}`)
    else log.warn(`tool ${t.name} failed: ${message}`)
    return { content: [{ type: 'text' as const, text: message }], isError: true }
  }
}

/** One tool on the server. */
function register(server: McpServer, t: Tool, ctx: ToolContext): void {
  server.registerTool(
    t.name,
    { title: t.title, description: t.description, inputSchema: t.input, annotations: { readOnlyHint: t.readOnly ?? false, openWorldHint: true } },
    (args: unknown) => callTool(t, args, ctx)
  )
}

class McpHost {
  private server: Server | null = null
  readonly token = randomBytes(32).toString('hex')
  url = ''

  async start(): Promise<void> {
    if (this.server) return
    const server = createServer((req, res) => void this.handle(req, res))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    this.server = server
    const { port } = server.address() as AddressInfo
    this.url = `http://127.0.0.1:${port}/mcp`
    log.info(`MCP server on ${this.url}`)
  }

  private authorized(req: IncomingMessage): boolean {
    // Loopback only, and no DNS-rebinding: the Host must be our own address.
    const { port } = this.server!.address() as AddressInfo
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return false
    const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''))
    const expected = Buffer.from(this.token)
    return given.length === expected.length && timingSafeEqual(given, expected)
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const send = (status: number, message: string) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }))
    }
    if (!req.url?.startsWith('/mcp')) return send(404, 'Not found')
    if (!this.authorized(req)) return send(401, 'Unauthorized')
    // Stateless: no server-initiated stream (GET) and no session to close (DELETE).
    if (req.method !== 'POST') return send(405, 'Method not allowed')
    let body: unknown
    try {
      body = await readBody(req)
    } catch {
      return send(400, 'Invalid JSON body')
    }
    // Each turn's MCP address names its folder (?f=…), where cards are shown.
    const folderId = new URL(req.url, 'http://localhost').searchParams.get('f') ?? undefined
    const server = buildServer({ folderId })
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
    } catch (err) {
      log.error('MCP request failed:', err)
      if (!res.headersSent) send(500, 'Internal error')
    }
  }

  /** The address a turn's engine connects to: cards of its tool calls go to `folderId`. */
  urlFor(folderId?: string): string {
    return folderId ? `${this.url}?f=${encodeURIComponent(folderId)}` : this.url
  }

  stop(): void {
    this.server?.close()
    this.server = null
  }
}

export const mcp = new McpHost()
