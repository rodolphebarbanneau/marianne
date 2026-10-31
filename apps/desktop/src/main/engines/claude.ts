import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { realpathSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Options, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk'
import { app } from 'electron'
import type { EngineModel } from '../../shared/types'
import { log } from '../log'
import { MCP_SERVER_NAME, mcp } from '../mcp'
import { paths } from '../paths'
import { runAside } from '../aside'
import { isMac, isWin, killTree, startProcess } from '../util'
import { contentFile, deadline, errorDetail } from './cli'
import { ClaudeStream, failed, type EngineEvent } from './events'
import { claudeLeftovers, claudeProject, claudeTranscript } from './transcripts'
import type { Engine, EngineTurn } from './types'

/** Claude Code, with the user's own Claude account, through Anthropic's Agent SDK. */

/** The SDK is an ES module: loaded on the first turn. */
const loadSdk = () => import('@anthropic-ai/claude-agent-sdk')

/** Aliases: each resolves to the latest model of its family. */
const MODELS: EngineModel[] = [
  { id: 'haiku', label: 'haiku' },
  { id: 'sonnet', label: 'sonnet' },
  { id: 'opus', label: 'opus' },
  { id: 'fable', label: 'fable' }
]

function candidates(): string[] {
  const h = homedir()
  if (isWin) {
    const appData = process.env.APPDATA ?? join(h, 'AppData', 'Roaming')
    const local = process.env.LOCALAPPDATA ?? join(h, 'AppData', 'Local')
    return [
      join(h, '.local', 'bin', 'claude.exe'),
      join(appData, 'npm', 'claude.cmd'),
      join(local, 'Programs', 'claude', 'claude.exe'),
      join(h, '.bun', 'bin', 'claude.exe')
    ]
  }
  return [
    join(h, '.local', 'bin', 'claude'),
    join(h, '.claude', 'local', 'claude'),
    ...(isMac ? ['/opt/homebrew/bin/claude'] : []),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
    join(h, '.npm-global', 'bin', 'claude'),
    join(h, '.bun', 'bin', 'claude')
  ]
}

/** Claude names its project folders after the real path of the working directory. */
const real = (path: string) => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/**
 * One turn, through Anthropic's Agent SDK. Marianne's system prompt replaces the coding one; the
 * only built-in tools are the web ones, if allowed: no file reading, no shell. Marianne's MCP server
 * is the only one, with no user or project settings, plugins or slash commands. Anything not
 * allowed is refused, never asked.
 *
 * The SDK runs the user's own `claude` (never a binary of its own: the app ships none) and builds
 * its command line, so that a change in how Claude Code is driven comes with the SDK. It sends the
 * system prompt and the message over the pipe; the MCP server's address and token stay in a file,
 * off the command line, where other programs could read them.
 */
async function turn(t: EngineTurn): Promise<void> {
  const web = t.web !== 'off'
  const allowed = [
    `mcp__${MCP_SERVER_NAME}`,
    ...(web ? ['WebSearch'] : []),
    ...(t.web === 'all' ? ['WebFetch'] : t.web === 'public' ? t.publicHosts.map((h) => `WebFetch(domain:${h})`) : [])
  ]
  const mcpConfig = await contentFile(
    'claude-mcp',
    JSON.stringify({
      mcpServers: { [MCP_SERVER_NAME]: { type: 'http', url: mcp.urlFor(t.folderId, t.tools), headers: { Authorization: `Bearer ${mcp.token}` } } }
    }),
    'json'
  )
  // Compaction threshold, as T3 Code sets it. A file: JSON on a Windows command line gets mangled.
  const settings = await contentFile('claude-settings', JSON.stringify({ autoCompactWindow: t.compactAt }), 'json')
  await runQuery(t, {
    pathToClaudeCodeExecutable: t.cli,
    cwd: t.cwd,
    env: {
      ...t.env,
      // A tool call can wait for the user's answer on a card.
      MCP_TOOL_TIMEOUT: String(15 * 60_000),
      // Says which app drives Claude Code, in its requests' User-Agent, as the SDK asks.
      CLAUDE_AGENT_SDK_CLIENT_APP: `marianne/${app.getVersion()}`
    },
    systemPrompt: t.system,
    ...(t.model ? { model: t.model } : {}),
    effort: t.effort,
    tools: web ? ['WebSearch', 'WebFetch'] : [],
    allowedTools: allowed,
    permissionMode: 'dontAsk',
    settingSources: [],
    settings,
    strictMcpConfig: true,
    includePartialMessages: true,
    extraArgs: { 'mcp-config': mcpConfig, 'disable-slash-commands': null },
    ...(t.resume && t.sessionId ? { resume: t.sessionId } : { sessionId: t.sessionId ?? randomUUID() })
  })
}

/** How long a stopped Claude may take to go before the turn is said over anyway, as run() (util) waits. */
const STOP_WAIT_MS = 5_000

/** Resolves once the process is gone, or after `ms`. */
function gone(child: ChildProcess | undefined, ms: number): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    child.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/**
 * Run the query to its end, its messages turned into events. Stopped (cancelled, timed out), it
 * waits for Claude to be gone before saying so, as run() does: until then it may still write its
 * transcript, in clear, and what the caller cleans up must stay clean.
 */
async function runQuery(t: EngineTurn, options: Options): Promise<void> {
  const stream = new ClaudeStream()
  let done = false
  const emit = (events: EngineEvent[]) => {
    for (const e of events) {
      if (e.type === 'done') done = true
      t.onEvent(e)
    }
  }
  const abort = new AbortController()
  const proc: { child?: ChildProcess; stderr: string } = { stderr: '' }
  let stopped: Error | null = null
  let failure: Error | null = null
  const stop = (err: Error) => {
    if (stopped) return
    stopped = err
    // The SDK closes Claude's input and gives it a moment to end cleanly; past that, its tree goes.
    abort.abort()
    setTimeout(() => proc.child && proc.child.exitCode === null && killTree(proc.child), 3_000).unref()
  }
  const onCancel = () => stop(new Error('Cancelled'))
  if (t.signal.aborted) onCancel()
  else t.signal.addEventListener('abort', onCancel, { once: true })
  const limit = deadline(t.timeoutMs, t.waitedMs, () => stop(new Error('timed out')))
  try {
    const { query } = await loadSdk()
    const messages = query({
      prompt: t.message,
      options: {
        ...options,
        abortController: abort,
        // Started as Marianne starts every engine: hidden, a .cmd shim through the shell, stopped with
        // the processes it started.
        spawnClaudeCodeProcess: (o) => {
          const child = startProcess(o.command, o.args, { cwd: o.cwd, env: o.env as NodeJS.ProcessEnv })
          proc.child = child
          child.stderr?.setEncoding('utf8').on('data', (d: string) => (proc.stderr = (proc.stderr + d).slice(-20_000)))
          o.signal?.addEventListener('abort', () => killTree(child), { once: true })
          return child as SpawnedProcess
        }
      }
    })
    for await (const message of messages) {
      // Stopped: what it still says is nobody's to read.
      if (stopped) break
      emit(stream.handle(message))
    }
  } catch (err) {
    if (!stopped) failure = err as Error
  } finally {
    limit.clear()
    t.signal.removeEventListener('abort', onCancel)
    await gone(proc.child, STOP_WAIT_MS)
  }
  if (stopped) {
    if (t.signal.aborted) throw stopped
    if (!done) emit([{ type: 'done', error: 'Claude Code n’a pas terminé dans le temps imparti.' }])
    return
  }
  if (done) return
  const detail = errorDetail(proc.stderr, failure?.message ?? '') || 'arrêt inattendu'
  log.warn('Claude Code failed:', detail)
  emit([proc.child ? failed('Claude Code', detail) : { type: 'done', error: `Claude Code n’a pas pu démarrer : ${detail}` }])
}

export const claude: Engine = {
  candidates,
  site: 'code.claude.com/docs/fr/setup',
  async account(cli, env) {
    const a = await runAside(cli, ['auth', 'status', '--json'], { env, timeoutMs: 15_000 })
    const json = JSON.parse(a.stdout.slice(a.stdout.indexOf('{')))
    return { loggedIn: !!json.loggedIn, account: [json.email, json.subscriptionType].filter(Boolean).join(' · ') || undefined }
  },
  login: ['auth', 'login'],
  // In a run, "the key is always used when present" (Claude Code's docs), ahead of the subscription.
  keyVars: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
  // A key's endpoint (a proxy, a gateway) isn't where the subscription signs in.
  keyCompanions: ['ANTHROPIC_BASE_URL'],
  models: async () => MODELS,
  turn,
  transcript: (home, cwd, sessionId) => claudeTranscript(home, real(cwd), sessionId),
  transcriptRoot: (home, cwd) => join(home, 'projects', claudeProject(real(cwd))),
  sweep(home) {
    for (const dir of claudeLeftovers(home, [paths.work, real(paths.work)])) rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  }
}
