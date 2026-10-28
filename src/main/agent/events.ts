/**
 * The agent CLIs stream JSON lines in their own formats; these parsers turn them into one event
 * vocabulary for the chat. Pure functions of the lines, tested in test/agent-events.test.ts.
 */

export type AgentEvent =
  | { type: 'session'; id: string }
  | { type: 'model'; model: string }
  /** Text appended to the text part `key`. */
  | { type: 'text-delta'; key: string; delta: string }
  /** The whole text of the part `key` (replaces what streamed). */
  | { type: 'text'; key: string; text: string }
  | { type: 'tool'; id: string; name: string; input: unknown }
  | { type: 'tool-result'; id: string; output: string; isError: boolean }
  | { type: 'done'; error?: string }

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

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
 * Claude Code: `claude -p --output-format stream-json --verbose --include-partial-messages`.
 * Text streams as `stream_event` deltas; complete `assistant` messages carry tool calls (and the
 * text again, used only when it didn't stream); `user` messages carry tool results.
 */
export class ClaudeStream {
  private message = ''
  private streamed = new Set<string>()
  private extra = 0

  push(line: string): AgentEvent[] {
    const e = parse(line)
    if (!e) return []
    switch (e.type) {
      case 'system':
        if (e.subtype !== 'init') return []
        return [{ type: 'session', id: String(e.session_id) }, ...(e.model ? [{ type: 'model', model: String(e.model) } as AgentEvent] : [])]
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
        const id = String(e.message?.id ?? '')
        const out: AgentEvent[] = []
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
          .map((b: Json) => ({ type: 'tool-result', id: String(b.tool_use_id), output: resultText(b.content), isError: !!b.is_error }) as AgentEvent)
      }
      case 'result':
        return [{ type: 'done', error: e.is_error ? String(e.result || e.subtype || 'Claude Code a échoué') : undefined }]
      default:
        return []
    }
  }
}

/**
 * Codex: `codex exec --json`. Items (agent messages, MCP tool calls, web searches, commands)
 * start, update and complete; the turn completes or fails.
 */
export class CodexStream {
  push(line: string): AgentEvent[] {
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
        return [{ type: 'done', error: String(e.error?.message ?? 'Codex a échoué') }]
      case 'error':
        return [{ type: 'done', error: String(e.message ?? 'Codex a échoué') }]
      default:
        return []
    }
  }

  private item(item: Json, completed: boolean): AgentEvent[] {
    const id = String(item.id ?? '')
    switch (item.type) {
      case 'agent_message':
        return item.text ? [{ type: 'text', key: id, text: String(item.text) }] : []
      case 'mcp_tool_call': {
        const out: AgentEvent[] = [{ type: 'tool', id, name: `mcp__${item.server}__${item.tool}`, input: item.arguments ?? {} }]
        if (completed) {
          const error = item.error?.message
          out.push({ type: 'tool-result', id, output: error ? String(error) : resultText(item.result?.content), isError: !!error || item.status === 'failed' })
        }
        return out
      }
      case 'web_search': {
        const out: AgentEvent[] = [{ type: 'tool', id, name: 'WebSearch', input: { query: item.query ?? '' } }]
        if (completed) out.push({ type: 'tool-result', id, output: '', isError: false })
        return out
      }
      case 'command_execution': {
        const out: AgentEvent[] = [{ type: 'tool', id, name: 'Shell', input: { command: item.command ?? '' } }]
        if (completed)
          out.push({ type: 'tool-result', id, output: String(item.aggregated_output ?? ''), isError: item.status === 'failed' || (item.exit_code ?? 0) !== 0 })
        return out
      }
      default:
        return []
    }
  }
}
