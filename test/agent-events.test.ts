import { describe, expect, it } from 'vitest'
import { ClaudeStream, CodexStream, resultText, type AgentEvent } from '../src/main/agent/events'

const feed = (parser: { push: (l: string) => AgentEvent[] }, lines: unknown[]) =>
  lines.flatMap((l) => parser.push(typeof l === 'string' ? l : JSON.stringify(l)))

describe('ClaudeStream', () => {
  it('turns a stream-json turn into events', () => {
    const events = feed(new ClaudeStream(), [
      { type: 'system', subtype: 'init', session_id: 'sess-1', model: 'claude-sonnet-5-5' },
      { type: 'stream_event', event: { type: 'message_start', message: { id: 'msg_1' } } },
      { type: 'stream_event', api_message_id: 'msg_1', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Je ' } } },
      { type: 'stream_event', api_message_id: 'msg_1', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'cherche.' } } },
      // The complete message repeats the streamed text (ignored) and carries the tool call.
      { type: 'assistant', message: { id: 'msg_1', content: [{ type: 'text', text: 'Je cherche.' }] } },
      { type: 'assistant', message: { id: 'msg_1', content: [{ type: 'tool_use', id: 'tu_1', name: 'mcp__marianne__calcul_delai', input: { duree: 2 } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: [{ type: 'text', text: 'Date limite' }] }] } },
      'not json',
      { type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: 'sess-1' }
    ])
    expect(events).toEqual([
      { type: 'session', id: 'sess-1' },
      { type: 'model', model: 'claude-sonnet-5-5' },
      { type: 'text-delta', key: 'msg_1:0', delta: 'Je ' },
      { type: 'text-delta', key: 'msg_1:0', delta: 'cherche.' },
      { type: 'tool', id: 'tu_1', name: 'mcp__marianne__calcul_delai', input: { duree: 2 } },
      { type: 'tool-result', id: 'tu_1', output: 'Date limite', isError: false },
      { type: 'done', error: undefined }
    ])
  })

  it('keeps text that did not stream, and reports errors', () => {
    const events = feed(new ClaudeStream(), [
      { type: 'assistant', message: { id: 'msg_2', content: [{ type: 'text', text: 'Bonjour' }] } },
      { type: 'result', subtype: 'error_during_execution', is_error: true, result: '' }
    ])
    expect(events[0]).toMatchObject({ type: 'text', text: 'Bonjour' })
    expect(events[1]).toEqual({ type: 'done', error: 'error_during_execution' })
  })

  it('ignores the inner messages of subagents', () => {
    expect(
      feed(new ClaudeStream(), [{ type: 'assistant', parent_tool_use_id: 'x', message: { id: 'm', content: [{ type: 'text', text: 'hidden' }] } }])
    ).toEqual([])
  })
})

describe('CodexStream', () => {
  it('turns an exec --json turn into events', () => {
    const events = feed(new CodexStream(), [
      { type: 'thread.started', thread_id: 'th-1' },
      { type: 'turn.started' },
      {
        type: 'item.started',
        item: { id: 'item_0', type: 'mcp_tool_call', server: 'marianne', tool: 'communes', arguments: { recherche: 'Nantes' }, status: 'in_progress' }
      },
      {
        type: 'item.completed',
        item: {
          id: 'item_0',
          type: 'mcp_tool_call',
          server: 'marianne',
          tool: 'communes',
          arguments: { recherche: 'Nantes' },
          result: { content: [{ type: 'text', text: '1 commune' }] },
          status: 'completed'
        }
      },
      { type: 'item.completed', item: { id: 'item_1', type: 'reasoning', text: 'thinking' } },
      { type: 'item.completed', item: { id: 'item_2', type: 'agent_message', text: 'Nantes : 44109' } },
      { type: 'turn.completed', usage: {} }
    ])
    expect(events).toEqual([
      { type: 'session', id: 'th-1' },
      { type: 'tool', id: 'item_0', name: 'mcp__marianne__communes', input: { recherche: 'Nantes' } },
      { type: 'tool', id: 'item_0', name: 'mcp__marianne__communes', input: { recherche: 'Nantes' } },
      { type: 'tool-result', id: 'item_0', output: '1 commune', isError: false },
      { type: 'text', key: 'item_2', text: 'Nantes : 44109' },
      { type: 'done' }
    ])
  })

  it('reports failed turns and tool errors', () => {
    const events = feed(new CodexStream(), [
      {
        type: 'item.completed',
        item: { id: 'i', type: 'mcp_tool_call', server: 'marianne', tool: 'x', arguments: {}, error: { message: 'boom' }, status: 'failed' }
      },
      { type: 'turn.failed', error: { message: 'quota' } }
    ])
    expect(events.at(-2)).toEqual({ type: 'tool-result', id: 'i', output: 'boom', isError: true })
    expect(events.at(-1)).toEqual({ type: 'done', error: 'quota' })
  })
})

describe('resultText', () => {
  it('flattens content blocks', () => {
    expect(resultText('a')).toBe('a')
    expect(resultText([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }])).toBe('a\n[image]\nb')
    expect(resultText(undefined)).toBe('')
  })
})
