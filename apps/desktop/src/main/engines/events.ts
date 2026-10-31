/**
 * The engines stream JSON lines in their own formats; these parsers turn them into one event
 * vocabulary for the chat. Pure functions of the lines, tested in test/engines.test.ts.
 */

export type EngineEvent =
  | { type: 'session'; id: string }
  | { type: 'model'; model: string }
  /** Text appended to the text part `key`. */
  | { type: 'text-delta'; key: string; delta: string }
  /** The whole text of the part `key` (replaces what streamed). */
  | { type: 'text'; key: string; text: string }
  | { type: 'tool'; id: string; name: string; input: unknown }
  | { type: 'tool-result'; id: string; output: string; isError: boolean }
  /** The turn is over; `signIn`: it failed because the engine isn't signed in. */
  | { type: 'done'; error?: string; signIn?: boolean }

/** A parser of one turn's output; `end` runs once the CLI exits, for formats without a final line. */
export interface EngineStream {
  push(line: string): EngineEvent[]
  end?(code: number | null): EngineEvent[]
}

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** An engine's failure that says it isn't signed in, or its key was refused. */
export const looksLikeAuthError = (detail: string) => /log ?in|sign ?in|auth|credential|unauthori|api.?key|401/i.test(detail)

/** A turn that failed for want of a sign-in: the engine's own words in brackets, the chat says what to do. */
const notSignedIn = (label: string, detail: string): EngineEvent => ({
  type: 'done',
  error: detail ? `${label} n’est pas connecté (${detail}).` : `${label} n’est pas connecté.`,
  signIn: true
})

/** The end of a failed turn: in French when it is about signing in, the engine's words as detail. */
export function failed(label: string, detail: string): EngineEvent {
  return looksLikeAuthError(detail) ? notSignedIn(label, detail) : { type: 'done', error: `${label} a échoué : ${detail}` }
}

function parse(line: string): Json | null {
  try {
    const v = JSON.parse(line)
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

/** Tool results come as a string or as content blocks. */
export function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content))
    return content
      .map((c) => (typeof c === 'string' ? c : c?.type === 'text' ? c.text : c?.type ? `[${c.type}]` : ''))
      .filter(Boolean)
      .join('\n')
  return content === undefined || content === null ? '' : JSON.stringify(content)
}

/**
 * Claude Code, through the Agent SDK: its messages are those of `--output-format stream-json
 * --verbose --include-partial-messages`. Text streams as `stream_event` deltas; complete `assistant`
 * messages carry tool calls (and the text again, used only when it didn't stream); `user` messages
 * carry tool results. An API error comes as an `assistant` message with an `error` and its words as
 * text, then as the result: those words are the turn's error, not the answer.
 */
export class ClaudeStream implements EngineStream {
  private message = ''
  private streamed = new Set<string>()
  private extra = 0
  /** Claude Code said its sign-in or key was refused (`authentication_failed`). */
  private refused = false

  push(line: string): EngineEvent[] {
    return this.handle(parse(line))
  }

  /** One message, as the Agent SDK hands it over: the same objects as the lines of stream-json. */
  handle(e: Json | null): EngineEvent[] {
    if (!e) return []
    switch (e.type) {
      case 'system':
        if (e.subtype !== 'init') return []
        return [{ type: 'session', id: String(e.session_id) }, ...(e.model ? [{ type: 'model', model: String(e.model) } as EngineEvent] : [])]
      case 'stream_event': {
        const ev = e.event ?? {}
        if (e.parent_tool_use_id) return []
        if (ev.type === 'message_start') this.message = String(ev.message?.id ?? e.api_message_id ?? '')
        const id = String(e.api_message_id ?? this.message)
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          this.streamed.add(id)
          return [{ type: 'text-delta', key: `${id}:${ev.index}`, delta: String(ev.delta.text ?? '') }]
        }
        return []
      }
      case 'assistant': {
        if (e.parent_tool_use_id) return []
        if (e.error) {
          if (e.error === 'authentication_failed') this.refused = true
          return []
        }
        const id = String(e.message?.id ?? '')
        const out: EngineEvent[] = []
        for (const block of e.message?.content ?? []) {
          if (block.type === 'tool_use') out.push({ type: 'tool', id: String(block.id), name: String(block.name), input: block.input ?? {} })
          else if (block.type === 'text' && !this.streamed.has(id) && block.text)
            out.push({ type: 'text', key: `${id}:full${this.extra++}`, text: String(block.text) })
        }
        return out
      }
      case 'user': {
        if (e.parent_tool_use_id) return []
        const content = e.message?.content
        if (!Array.isArray(content)) return []
        return content
          .filter((b: Json) => b?.type === 'tool_result')
          .map((b: Json) => ({ type: 'tool-result', id: String(b.tool_use_id), output: resultText(b.content), isError: !!b.is_error }) as EngineEvent)
      }
      case 'result': {
        if (!e.is_error) return [{ type: 'done' }]
        const detail = String(e.result || e.subtype || '')
        // Claude Code's words end with what to type in its own window (« · Please run /login »): not here.
        return [this.refused ? notSignedIn('Claude Code', detail.split(' · ')[0]) : failed('Claude Code', detail)]
      }
      default:
        return []
    }
  }
}

/**
 * Codex: `codex exec --json`. Items (agent messages, MCP tool calls, web searches, commands)
 * start, update and complete; the turn completes or fails.
 */
export class CodexStream implements EngineStream {
  push(line: string): EngineEvent[] {
    const e = parse(line)
    if (!e) return []
    switch (e.type) {
      case 'thread.started':
        return [{ type: 'session', id: String(e.thread_id) }]
      case 'item.started':
      case 'item.updated':
      case 'item.completed':
        return this.item(e.item ?? {}, e.type === 'item.completed')
      case 'turn.completed':
        return [{ type: 'done' }]
      case 'turn.failed':
        return [failed('Codex', String(e.error?.message ?? ''))]
      case 'error':
        return [failed('Codex', String(e.message ?? ''))]
      default:
        return []
    }
  }

  private item(item: Json, completed: boolean): EngineEvent[] {
    const id = String(item.id ?? '')
    switch (item.type) {
      case 'agent_message':
        return item.text ? [{ type: 'text', key: id, text: String(item.text) }] : []
      case 'mcp_tool_call': {
        const out: EngineEvent[] = [{ type: 'tool', id, name: `mcp__${item.server}__${item.tool}`, input: item.arguments ?? {} }]
        if (completed) {
          const error = item.error?.message
          out.push({ type: 'tool-result', id, output: error ? String(error) : resultText(item.result?.content), isError: !!error || item.status === 'failed' })
        }
        return out
      }
      case 'web_search': {
        const out: EngineEvent[] = [{ type: 'tool', id, name: 'WebSearch', input: { query: item.query ?? '' } }]
        if (completed) out.push({ type: 'tool-result', id, output: '', isError: false })
        return out
      }
      case 'command_execution': {
        const out: EngineEvent[] = [{ type: 'tool', id, name: 'Shell', input: { command: item.command ?? '' } }]
        if (completed)
          out.push({ type: 'tool-result', id, output: String(item.aggregated_output ?? ''), isError: item.status === 'failed' || (item.exit_code ?? 0) !== 0 })
        return out
      }
      default:
        return []
    }
  }
}

const VIBE_WEB_TOOLS: Record<string, string> = { web_search: 'WebSearch', web_fetch: 'WebFetch' }

/**
 * Mistral Vibe: `vibe -p --output streaming`. One line per history entry of the turn, printed
 * once completed (camelCase, `generationStatus: "completed"`): the user message, assistant
 * messages, reasoning, and effects (tool calls with their final state). Every entry carries the
 * session id. No line ends the turn: the exit code does (0 done, 3 stopped early).
 */
export class VibeStream implements EngineStream {
  private session = ''

  /** `server`: Marianne's MCP server name; Vibe names its tools `<server>_<tool>`. */
  constructor(private readonly server: string) {}

  push(line: string): EngineEvent[] {
    const e = parse(line)
    if (!e) return []
    const out: EngineEvent[] = []
    if (!this.session && e.sessionId) {
      this.session = String(e.sessionId)
      out.push({ type: 'session', id: this.session })
    }
    if (e.generationStatus && e.generationStatus !== 'completed') return out
    if (e.type === 'message') {
      // A draft a hook sent back for a retry was never the answer.
      if (e.role !== 'assistant' || e.outcome?.type === 'discarded') return out
      const text = (Array.isArray(e.content) ? e.content : [])
        .filter((b: Json) => b?.type === 'text' && b.text)
        .map((b: Json) => String(b.text))
        .join('\n\n')
      if (text) out.push({ type: 'text', key: String(e.id), text })
    } else if (e.type === 'effect') {
      const id = String(e.id)
      const detail = e.detail ?? {}
      const state = e.state ?? {}
      out.push({ type: 'tool', id, name: this.toolName(String(detail.toolName ?? e.title ?? '')), input: detail.input ?? {} })
      if (['completed', 'failed', 'cancelled', 'skipped'].includes(state.status)) {
        const output = state.status === 'failed' ? (state.error?.message ?? state.outputText) : (state.outputText ?? state.reason)
        out.push({ type: 'tool-result', id, output: String(output ?? ''), isError: state.status !== 'completed' })
      }
    }
    return out
  }

  end(code: number | null): EngineEvent[] {
    if (code === 0) return [{ type: 'done' }]
    if (code === 3) return [{ type: 'done', error: 'Mistral Vibe s’est arrêté avant la fin (limite atteinte, arrêt ou réponse refusée).' }]
    return []
  }

  /** The same names as the other engines: `mcp__marianne__<tool>`, WebSearch, WebFetch. */
  private toolName(name: string): string {
    if (VIBE_WEB_TOOLS[name]) return VIBE_WEB_TOOLS[name]
    const prefix = `${this.server}_`
    return name.startsWith(prefix) ? `mcp__${this.server}__${name.slice(prefix.length)}` : name
  }
}
