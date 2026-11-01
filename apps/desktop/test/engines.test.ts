import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Archive } from '@marianne/archive'
import { readManifest } from '@marianne/sdk'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { ClaudeStream, CodexStream, resultText, VibeStream, type EngineEvent } from '../src/main/engines/events'
import { carryOnMessage, recap, systemPrompt, userMessage } from '../src/main/engines/prompt'
import { BUILTIN_SERVICES } from '../src/main/host/registry'
import { MCP_SERVER_NAME } from '../src/main/mcp-name'
import { clearScratch, scratchDir, scratchName } from '../src/main/engines/scratch'
import { parseSkill } from '../src/main/engines/skills'
import {
  captureTranscript,
  claudeLeftovers,
  claudeProject,
  claudeTranscript,
  codexTranscript,
  discardTranscript,
  restoreTranscript,
  transcriptId,
  vibeTranscript
} from '../src/main/engines/transcripts'
import { projectFiles } from '../src/main/engines/vibe'
import { paths } from '../src/main/paths'
import { session } from '../src/main/session'
import { run } from '../src/main/util'
import type { ChatMessage } from '../src/shared/types'

// ~/.marianne points at a temporary folder, before paths.ts reads it.
const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-engines-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
// The MCP server pulls in Electron and the whole app: only its names are needed here.
vi.mock('../src/main/mcp', () => ({ MCP_SERVER_NAME: 'marianne', mcp: { token: 'secret', urlFor: (f: string) => `http://127.0.0.1:1234/mcp?f=${f}` } }))

afterAll(() => rmSync(root, { recursive: true, force: true }))

const feed = (parser: { push: (l: string) => EngineEvent[] }, lines: unknown[]) =>
  lines.flatMap((l) => parser.push(typeof l === 'string' ? l : JSON.stringify(l)))

/** Write files under `base` (relative paths with "/"). */
function files(base: string, entries: Record<string, string>): void {
  for (const [rel, content] of Object.entries(entries)) {
    mkdirSync(dirname(join(base, rel)), { recursive: true })
    writeFileSync(join(base, rel), content)
  }
}

describe('ClaudeStream', () => {
  it('turns a stream-json turn into events', () => {
    const events = feed(new ClaudeStream(), [
      { type: 'system', subtype: 'init', session_id: 'sess-1', model: 'claude-sonnet-5-5' },
      { type: 'stream_event', event: { type: 'message_start', message: { id: 'msg_1' } } },
      { type: 'stream_event', api_message_id: 'msg_1', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Je ' } } },
      { type: 'stream_event', api_message_id: 'msg_1', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'cherche.' } } },
      // The complete message repeats the streamed text (ignored) and carries the tool call.
      { type: 'assistant', message: { id: 'msg_1', content: [{ type: 'text', text: 'Je cherche.' }] } },
      { type: 'assistant', message: { id: 'msg_1', content: [{ type: 'tool_use', id: 'tu_1', name: 'mcp__marianne__compute_deadline', input: { days: 2 } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: [{ type: 'text', text: 'Date limite' }] }] } },
      'not json',
      { type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: 'sess-1' }
    ])
    expect(events).toEqual([
      { type: 'session', id: 'sess-1' },
      { type: 'model', model: 'claude-sonnet-5-5' },
      { type: 'text-delta', key: 'msg_1:0', delta: 'Je ' },
      { type: 'text-delta', key: 'msg_1:0', delta: 'cherche.' },
      { type: 'tool', id: 'tu_1', name: 'mcp__marianne__compute_deadline', input: { days: 2 } },
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
    expect(events[1]).toEqual({ type: 'done', error: 'Claude Code a échoué : error_during_execution' })
  })

  it('says when Claude Code is not signed in, so the chat can lead the user to « se connecter »', () => {
    const [done] = feed(new ClaudeStream(), [{ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' }])
    expect(done).toEqual({ type: 'done', error: 'Claude Code n’est pas connecté (Not logged in · Please run /login).', signIn: true })
  })

  it('keeps a refused key’s words out of the answer: they are the turn’s error', () => {
    // As Claude Code 2.1.316 says it, with a key the API refuses.
    const stream = new ClaudeStream()
    const events = [
      { type: 'assistant', error: 'authentication_failed', message: { id: 'm', content: [{ type: 'text', text: 'Invalid API key · Fix external API key' }] } },
      { type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · Fix external API key' }
    ].flatMap((m) => stream.handle(m))
    expect(events).toEqual([{ type: 'done', error: 'Claude Code n’est pas connecté (Invalid API key).', signIn: true }])
  })

  it('reads the Agent SDK’s messages as it reads the lines of stream-json', () => {
    const stream = new ClaudeStream()
    expect(stream.handle({ type: 'system', subtype: 'init', session_id: 's1', model: 'claude-sonnet' })).toEqual([
      { type: 'session', id: 's1' },
      { type: 'model', model: 'claude-sonnet' }
    ])
    expect(stream.handle({ type: 'result', subtype: 'success', is_error: false, result: 'ok' })).toEqual([{ type: 'done' }])
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
        item: { id: 'item_0', type: 'mcp_tool_call', server: 'marianne', tool: 'communes', arguments: { search: 'Nantes' }, status: 'in_progress' }
      },
      {
        type: 'item.completed',
        item: {
          id: 'item_0',
          type: 'mcp_tool_call',
          server: 'marianne',
          tool: 'communes',
          arguments: { search: 'Nantes' },
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
      { type: 'tool', id: 'item_0', name: 'mcp__marianne__communes', input: { search: 'Nantes' } },
      { type: 'tool', id: 'item_0', name: 'mcp__marianne__communes', input: { search: 'Nantes' } },
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
    expect(events.at(-1)).toEqual({ type: 'done', error: 'Codex a échoué : quota' })
  })

  it('says when Codex is not signed in, or its key was refused', () => {
    expect(feed(new CodexStream(), [{ type: 'error', message: 'unexpected status 401 Unauthorized' }])).toEqual([
      { type: 'done', error: 'Codex n’est pas connecté (unexpected status 401 Unauthorized).', signIn: true }
    ])
  })
})

describe('VibeStream', () => {
  // History entries as `vibe -p --output streaming` prints them (vibe/app_server/models.py, camelCase).
  const SESSION = '3f2a9c1e-7b4d-4e0a-9c8b-1d2e3f4a5b6c'
  const entry = (id: string, fields: Record<string, unknown>) => ({
    id,
    sessionId: SESSION,
    turnId: 'turn-1',
    createdAt: 1761650000000,
    updatedAt: 1761650000000,
    generationStatus: 'completed',
    relatedEntryId: null,
    ...fields
  })

  it('turns streamed history entries into events', () => {
    const events = feed(new VibeStream('marianne'), [
      entry('msg-user', { type: 'message', role: 'user', content: [{ type: 'text', text: 'Code de Nantes ?' }], source: 'turn_start' }),
      entry('rsn-1', { type: 'reasoning', text: 'Je cherche la commune.', summary: [], outcome: { type: 'committed' } }),
      entry('call_1', {
        type: 'effect',
        title: 'marianne_communes',
        detail: {
          toolName: 'marianne_communes',
          kind: 'tool',
          input: { search: 'Nantes' },
          display: { summary: "marianne_communes(search='Nantes')", verb: 'Running', statusText: 'Running marianne_communes' }
        },
        state: { status: 'completed', output: null, outputText: '1 commune : Nantes (44109)', durationMs: 42, display: { success: true, message: 'ok' } }
      }),
      entry('call_2', {
        type: 'effect',
        title: 'web_search',
        detail: { toolName: 'web_search', kind: 'web_search', input: { query: 'code insee Nantes' } },
        state: { status: 'failed', error: { message: 'Recherche indisponible' }, outputText: '', display: { success: false, message: 'failed' } }
      }),
      entry('msg-draft', {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'brouillon' }],
        outcome: { type: 'discarded', cause: 'retry' }
      }),
      entry('msg-1', {
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Nantes :' },
          { type: 'text', text: '44109' }
        ],
        source: 'harness',
        outcome: { type: 'committed' }
      }),
      entry('chk-1', { type: 'checkpoint', kind: 'compaction', message: 'Context compacted', details: {} }),
      'Warning: not json'
    ])
    expect(events).toEqual([
      { type: 'session', id: SESSION },
      { type: 'tool', id: 'call_1', name: 'mcp__marianne__communes', input: { search: 'Nantes' } },
      { type: 'tool-result', id: 'call_1', output: '1 commune : Nantes (44109)', isError: false },
      { type: 'tool', id: 'call_2', name: 'WebSearch', input: { query: 'code insee Nantes' } },
      { type: 'tool-result', id: 'call_2', output: 'Recherche indisponible', isError: true },
      { type: 'text', key: 'msg-1', text: 'Nantes :\n\n44109' }
    ])
  })

  it('reports denied tools and ends the turn on the exit code', () => {
    const stream = new VibeStream('marianne')
    const events = feed(stream, [
      entry('call_3', {
        type: 'effect',
        title: 'bash',
        detail: { toolName: 'bash', kind: 'shell', input: { command: 'ls' } },
        state: { status: 'skipped', reason: 'Tool disabled', display: { success: false, message: 'skipped' } }
      })
    ])
    expect(events.slice(1)).toEqual([
      { type: 'tool', id: 'call_3', name: 'bash', input: { command: 'ls' } },
      { type: 'tool-result', id: 'call_3', output: 'Tool disabled', isError: true }
    ])
    expect(stream.end(0)).toEqual([{ type: 'done' }])
    expect(stream.end(3)[0]).toMatchObject({ type: 'done', error: expect.stringContaining('avant la fin') })
    // Other failures are reported from stderr by the runner.
    expect(stream.end(2)).toEqual([])
  })
})

describe('resultText', () => {
  it('flattens content blocks', () => {
    expect(resultText('a')).toBe('a')
    expect(resultText([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }])).toBe('a\n[image]\nb')
    expect(resultText(undefined)).toBe('')
  })
})

describe('Vibe project files', () => {
  it('declares Marianne’s MCP server, the session log folder and the agent with its prompt', () => {
    const out = projectFiles({ home: 'C:\\Users\\me\\.vibe', system: 'You are Marianne.' }, 'http://127.0.0.1:1234/mcp?f=abc')
    expect(out['config.toml']).toContain('[[mcp_servers]]\nname = "marianne"\ntransport = "streamable-http"\nurl = "http://127.0.0.1:1234/mcp?f=abc"')
    expect(out['config.toml']).toContain('tool_timeout_sec = 900')
    expect(out['config.toml']).toContain('api_key_env = "MARIANNE_MCP_TOKEN"')
    // The token itself never goes in a file.
    expect(out['config.toml']).not.toContain('secret')
    // TOML escapes for Windows paths.
    expect(out['config.toml']).toContain(`save_dir = "C:\\\\Users\\\\me\\\\.vibe${process.platform === 'win32' ? '\\\\' : '/'}logs`)
    expect(out['agents/marianne.toml']).toContain('system_prompt_id = "marianne"')
    expect(out['prompts/marianne.md']).toBe('You are Marianne.')
  })
})

describe('skills', () => {
  it('reads the front matter, or falls back to the file', () => {
    expect(parseSkill('---\nname: x\ntitle: Titre\ndescription: Une description\n---\n# Corps\n\nTexte', 'x.md')).toEqual({
      name: 'x',
      title: 'Titre',
      description: 'Une description',
      body: '# Corps\n\nTexte'
    })
    expect(parseSkill('# Mon guide\n\nPremier paragraphe.\n\nSuite.', 'mon-guide.md')).toMatchObject({
      name: 'mon-guide',
      title: 'Mon guide',
      description: 'Premier paragraphe.'
    })
  })
})

describe('prompt', () => {
  const base = { skills: [], web: 'public' as const }

  it('is in English and has the engine answer in French', () => {
    const p = systemPrompt({ ...base, legifrance: true })
    expect(p).toMatch(/^You are Marianne/)
    expect(p).toContain('Always answer the user in French')
  })

  it('tells the engine its tools may be listed with the server’s prefix, so it calls them by those names', () => {
    // Claude Code called read_service_public by its short name, which it doesn't list, then again by its own.
    expect(systemPrompt({ ...base, legifrance: true })).toContain(`mcp__${MCP_SERVER_NAME}__read_service_public`)
  })

  it('tells the engine how to cite laws, with or without Légifrance', () => {
    expect(systemPrompt({ ...base, legifrance: true })).toContain('use the Légifrance tools')
    const without = systemPrompt({ ...base, legifrance: false })
    expect(without).toContain('are not configured')
    expect(without).not.toContain('use the Légifrance tools')
  })

  it('lists the skills and adds the user’s notes', () => {
    const p = systemPrompt({
      ...base,
      legifrance: false,
      skills: [{ name: 'taxes', title: 'Impôts', description: 'déclaration de revenus', builtin: true, path: '' }],
      notes: 'Je suis apprenti.'
    })
    expect(p).toContain('- taxes: déclaration de revenus')
    expect(p).toContain('# What the user says about themselves\n\nJe suis apprenti.')
  })

  it('acts: a concrete thing gets done, a situation gets mapped out, and a card asks what needs the user’s yes', () => {
    const p = systemPrompt({ ...base, legifrance: true })
    expect(p).toContain('you carry out what they decided, through your tools, and every step that commits them waits for their yes')
    expect(p).not.toContain('the user decides and sends')
    expect(p).toContain('# Acting')
    expect(p).toMatch(/concrete thing to do[\s\S]*situation to navigate/)
    for (const tool of ['services', 'procedures', 'service_propose', 'request_setup', 'task_propose']) expect(p).toContain(`(${tool})`)
    expect(p).toContain('Create nothing (no task, no service, no procedure followed) until the user picks')
    expect(p).toContain('Never ask in the conversation for what a tool asks on a card')
    expect(p).toContain('never work around it')
  })

  it('pays by card through its tool, never asking for a card in the conversation', () => {
    const p = systemPrompt({ ...base, legifrance: true })
    expect(p).toContain('Paying by card goes through pay_by_card')
    expect(p).toContain('Never ask for card details in the conversation, nor type them')
    expect(p).toContain('(request_setup, target payment)')
    expect(p).toMatch(/3-D Secure[^\n]*hand_over/)
    expect(p).toContain('documents, payment, space')
  })

  it('stays generic: no service, no domain’s scenario; the services say theirs', () => {
    const p = systemPrompt({ ...base, legifrance: true })
    for (const { pkg } of BUILTIN_SERVICES) {
      const m = readManifest(pkg)
      expect(p, m.id).not.toMatch(new RegExp(`\\b${m.id}\\b`, 'i'))
      expect(p, m.id).not.toContain(m.name)
    }
    expect(p).not.toMatch(/toll|péage|taxe foncière|avis de taxe/i)
    // Examples that only show a format stay.
    expect(p).toContain('[[nir]]')
    expect(p).toContain('[vos démarches](marianne:procedures)')
  })

  it('names Marianne’s services that aren’t on, in a line each, after those that are', () => {
    const idle = [
      {
        manifest: { id: 'vignette', name: 'Vignette', description: 'la vignette de vos véhicules', domains: ['mobility' as const] },
        added: false,
        available: true
      },
      { manifest: { id: 'ciel', name: 'Ciel', description: 'le temps qu’il fait', domains: [] }, added: true, available: true },
      { manifest: { id: 'carte2', name: 'Cartes', description: 'des cartes', domains: [] }, added: true, available: false }
    ]
    const p = systemPrompt({ ...base, legifrance: true, services: '## 3615 ANNUAIRE · Annuaire (code annuaire)\n\nFinds offices.', idle })
    expect(p).toContain('# Services\n\nThe services that are on (3615 codes) lend you their tools (named <code>_<tool>):\n\n## 3615 ANNUAIRE')
    expect(p).toContain('## Not on')
    expect(p).toContain('- vignette · Vignette: la vignette de vos véhicules (mobility) · not added')
    expect(p).toContain('- ciel · Ciel: le temps qu’il fait (no domain) · switched off')
    expect(p).toContain('- carte2 · Cartes: des cartes (no domain) · unavailable for now')
    expect(p.indexOf('## 3615 ANNUAIRE')).toBeLessThan(p.indexOf('## Not on'))
    // None on: said, and the others still listed.
    expect(systemPrompt({ ...base, legifrance: true, idle })).toContain('# Services\n\nNo service is on.\n\n## Not on')
    expect(systemPrompt({ ...base, legifrance: true })).not.toContain('# Services')
  })

  it('tells the engine, in the turn Marianne starts herself, that the services added are on and to carry on', () => {
    expect(carryOnMessage(['3615 VIGNETTE (Vignette)'])).toMatch(
      /^The user just added 3615 VIGNETTE \(Vignette\) from your card: it is on now, and its tools are in your tool list/
    )
    expect(carryOnMessage(['3615 A (a)', '3615 B (b)'])).toContain('3615 A (a) and 3615 B (b) from your cards: they are on now')
    expect(carryOnMessage(['3615 A (a)'])).toContain("This message is Marianne's, not the user's: carry on with the user's request")
  })

  it('puts the date, attachments and text in the user message', () => {
    const m = userMessage('Mon loyer ?', [{ type: 'page', url: 'https://caf.fr/x', title: 'Mon "compte"', text: 'Solde' }], [], new Date(2026, 9, 27))
    expect(m).toBe('<context date="2026-10-27" weekday="tuesday" />\n\n<page url="https://caf.fr/x" title="Mon \'compte\'">\nSolde\n</page>\n\nMon loyer ?')
  })

  it('tells the engine the screen the user is on, and its archive documents', () => {
    const m = userMessage('Et ici ?', [{ type: 'document', id: 'd1', title: 'Avis 2026' }], [], new Date(2026, 9, 27), {
      route: 'domain/taxes',
      title: 'impôts & finances'
    })
    expect(m).toContain('<screen route="domain/taxes" title="impôts & finances" />')
    expect(m).toContain('<document id="d1" title="Avis 2026" />')
  })

  it('recaps earlier turns for a new session, newest kept first when long', () => {
    const msg = (role: 'user' | 'assistant', text: string): ChatMessage => ({ id: text, role, at: '', parts: [{ type: 'text', text }] })
    expect(recap([msg('user', 'Bonjour'), msg('assistant', 'Salut')])).toContain('(user) Bonjour\n\n(marianne) Salut')
    const long = Array.from({ length: 30 }, (_, i) => msg('user', `${i} ${'x'.repeat(2400)}`))
    const r = recap(long)
    expect(r).toContain('(user) 29 ')
    expect(r).not.toContain('(user) 0 ')
  })
})

describe('scratch folders', () => {
  it('gives each folder its own random, empty folder under work', () => {
    expect(scratchName()).toMatch(/^[0-9a-f]{16}$/)
    expect(scratchName()).not.toBe(scratchName())
    const a = scratchDir('20261028-101500-ab12')
    expect(dirname(a)).toBe(paths.work)
    expect(a).not.toContain('20261028')
    expect(readdirSync(a)).toEqual([])
    expect(scratchDir('20261028-101500-ab12')).toBe(a)
    expect(scratchDir('other')).not.toBe(a)
  })

  it('wipes everything under work, and draws new names after', () => {
    const a = scratchDir('f1')
    writeFileSync(join(a, 'left.txt'), 'x')
    mkdirSync(join(paths.work, '.files'), { recursive: true })
    clearScratch()
    expect(readdirSync(paths.work)).toEqual([])
    const b = scratchDir('f1')
    expect(b).not.toBe(a)
    expect(existsSync(b)).toBe(true)
  })
})

describe('a CLI stopped', () => {
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  it('is said stopped once it is gone: until then it may still write its transcript', async () => {
    const controller = new AbortController()
    let pid = 0
    const running = run(process.execPath, ['-e', 'console.log(process.pid); setInterval(() => {}, 1000)'], {
      signal: controller.signal,
      onLine: (line) => {
        pid = Number(line)
        controller.abort()
      }
    })
    await expect(running).rejects.toThrow('Cancelled')
    expect(pid).toBeGreaterThan(0)
    expect(alive(pid)).toBe(false)
  })

  it('stopped before it started, still waits for it to go', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal })).rejects.toThrow('Cancelled')
  })
})

describe('transcripts', () => {
  const id = '6b1f0f7e-2c3d-4e5f-8a9b-0c1d2e3f4a5b'

  it('names Claude project folders after the working directory', () => {
    expect(claudeProject('C:\\Users\\me\\.marianne\\work\\0a1b2c3d4e5f6a7b')).toBe('C--Users-me--marianne-work-0a1b2c3d4e5f6a7b')
    expect(claudeProject('/home/me/.marianne/work/0a1b2c3d4e5f6a7b')).toBe('-home-me--marianne-work-0a1b2c3d4e5f6a7b')
  })

  it('finds Claude sessions in their project folder, or any other', () => {
    const home = mkdtempSync(join(tmpdir(), 'claude-'))
    const cwd = '/home/me/.marianne/work/0a1b2c3d4e5f6a7b'
    files(join(home, 'projects', claudeProject(cwd)), { [`${id}.jsonl`]: '{}', [`${id}/subagents/a.jsonl`]: '{}', 'other.jsonl': '{}' })
    expect(claudeTranscript(home, cwd, id)).toEqual({
      root: join(home, 'projects', '-home-me--marianne-work-0a1b2c3d4e5f6a7b'),
      files: [`${id}.jsonl`, `${id}/subagents/a.jsonl`]
    })
    expect(claudeTranscript(home, '/elsewhere', id)?.root).toBe(join(home, 'projects', '-home-me--marianne-work-0a1b2c3d4e5f6a7b'))
    expect(claudeTranscript(home, cwd, 'missing')).toBeNull()
    expect(claudeTranscript(home, cwd, '../projects')).toBeNull()
    files(join(home, 'projects'), { 'C--Users-me--marianne-work-ffff/x.jsonl': '', 'C--Users-me-code/x.jsonl': '' })
    expect(claudeLeftovers(home, ['C:\\Users\\me\\.marianne\\work'])).toEqual([join(home, 'projects', 'C--Users-me--marianne-work-ffff')])
    rmSync(home, { recursive: true, force: true })
  })

  it('finds the Codex rollout of a session, newest first', () => {
    const home = mkdtempSync(join(tmpdir(), 'codex-'))
    files(join(home, 'sessions'), {
      '2026/10/27/rollout-2026-10-27T09-00-00-00000000-0000-0000-0000-000000000000.jsonl': '{}',
      [`2026/10/28/rollout-2026-10-28T10-15-00-${id}.jsonl`]: '{}'
    })
    expect(codexTranscript(home, id)).toEqual({ root: join(home, 'sessions'), files: [`2026/10/28/rollout-2026-10-28T10-15-00-${id}.jsonl`] })
    expect(codexTranscript(home, 'missing')).toBeNull()
    rmSync(home, { recursive: true, force: true })
  })

  it('lists the files of a Vibe session folder', () => {
    const home = mkdtempSync(join(tmpdir(), 'vibe-'))
    files(join(home, 'logs', 'session'), {
      'unified/.session-index.json': '{}',
      [`unified/${id}/CURRENT`]: '{}',
      [`unified/${id}/journal/0000000000000001.jsonl`]: '{}'
    })
    expect(vibeTranscript(home, id)).toEqual({
      root: join(home, 'logs', 'session'),
      files: [`unified/${id}/CURRENT`, `unified/${id}/journal/0000000000000001.jsonl`]
    })
    expect(vibeTranscript(home, 'missing')).toBeNull()
    rmSync(home, { recursive: true, force: true })
  })

  it('moves a transcript into the archive and back, and off the disk even when locked', () => {
    const stored = new Map<string, { data: Buffer; meta: unknown }>()
    const archive = {
      writeFile: (fid: string, data: Uint8Array, meta: unknown) => stored.set(fid, { data: Buffer.from(data), meta }),
      readFile: (fid: string) => stored.get(fid)!.data,
      fileMeta: (fid: string) => (stored.has(fid) ? { id: fid, size: stored.get(fid)!.data.length, meta: stored.get(fid)!.meta } : null),
      removeFile: (fid: string) => stored.delete(fid),
      close: () => undefined
    } as unknown as Archive
    session.open(archive)

    const home = mkdtempSync(join(tmpdir(), 'vibe-'))
    const sessions = join(home, 'logs', 'session')
    files(sessions, { 'unified/.session-index.json': '{}', [`unified/${id}/CURRENT`]: 'current', [`unified/${id}/journal/1.jsonl`]: 'line' })
    captureTranscript('folder-1', 'vibe', id, vibeTranscript(home, id))
    expect(existsSync(join(sessions, 'unified', id))).toBe(false)
    expect(existsSync(join(sessions, 'unified', '.session-index.json'))).toBe(true)
    expect(stored.get(transcriptId('folder-1', 'vibe'))?.meta).toMatchObject({ engine: 'vibe', sessionId: id })

    // Another session id: not this transcript.
    expect(restoreTranscript('folder-1', 'vibe', 'other', sessions)).toBeNull()
    const restored = restoreTranscript('folder-1', 'vibe', id, sessions)
    expect(restored).toEqual({ root: sessions, files: [`unified/${id}/CURRENT`, `unified/${id}/journal/1.jsonl`] })
    expect(readFileSync(join(sessions, 'unified', id, 'journal', '1.jsonl'), 'utf8')).toBe('line')
    // Taken off the disk again after the turn, whatever the CLI did with it.
    discardTranscript(restored!)
    expect(existsSync(join(sessions, 'unified', id))).toBe(false)
    discardTranscript(restored!)

    restoreTranscript('folder-1', 'vibe', id, sessions)
    session.lock()
    captureTranscript('folder-1', 'vibe', id, vibeTranscript(home, id))
    expect(existsSync(join(sessions, 'unified', id))).toBe(false)
    rmSync(home, { recursive: true, force: true })
  })
})
