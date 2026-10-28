import { homedir } from 'node:os'
import { join } from 'node:path'
import { MCP_SERVER_NAME } from '../../shared/constants'
import type { AgentConfig, AgentStatus } from '../../shared/types'
import { log } from '../log'
import { mcp } from '../mcp'
import { isMac, isWin, run, shellEnv } from '../util'
import { contentFile, errorDetail, findCli, looksLikeAuthError, openInTerminal } from './cli'
import { ClaudeStream } from './events'
import type { TurnOptions } from './types'

/** Claude Code (`claude -p`), with the user's own Claude account. */

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

const cliPath = (cfg: AgentConfig, refresh = false) => findCli('claude', cfg.path, candidates(), refresh)

export async function claudeStatus(cfg: AgentConfig, refresh: boolean): Promise<AgentStatus> {
  const path = cliPath(cfg, refresh)
  if (!path) return { found: false, error: 'Claude Code introuvable. Installez-le depuis claude.com/claude-code ou indiquez son chemin.' }
  const status: AgentStatus = { found: true, path }
  try {
    status.version = (await run(path, ['--version'], { timeoutMs: 15_000 })).stdout.trim().split('\n')[0]
    const a = await run(path, ['auth', 'status', '--json'], { timeoutMs: 15_000 })
    const json = JSON.parse(a.stdout.slice(a.stdout.indexOf('{')))
    status.loggedIn = !!json.loggedIn
    status.account = [json.email, json.subscriptionType].filter(Boolean).join(' · ') || undefined
  } catch (err) {
    status.error = `Impossible de lire l’état de Claude Code : ${(err as Error).message}`
  }
  return status
}

export function claudeLogin(cfg: AgentConfig): Promise<void> {
  const path = cliPath(cfg)
  if (!path) throw new Error('Claude Code introuvable')
  return openInTerminal(path, ['auth', 'login'], 'Connexion à Claude Code')
}

/**
 * One turn of a conversation. Marianne's system prompt replaces the coding one; the only
 * built-in tools are reading attached files and, if allowed, the web; no user or project
 * settings, plugins or other MCP servers. Anything not allowed is refused, never asked.
 */
export async function claudeTurn(cfg: AgentConfig, t: TurnOptions): Promise<void> {
  const path = cliPath(cfg)
  if (!path) throw new Error('Claude Code introuvable. Installez-le ou choisissez Codex dans réglages → agent.')
  const web = t.web !== 'off'
  const allowed = [
    `mcp__${MCP_SERVER_NAME}`,
    'Read(./files/**)',
    ...(web ? ['WebSearch'] : []),
    ...(t.web === 'all' ? ['WebFetch'] : t.web === 'public' ? t.publicHosts.map((h) => `WebFetch(domain:${h})`) : [])
  ]
  const mcpConfig = await contentFile(
    'mcp',
    JSON.stringify({
      mcpServers: { [MCP_SERVER_NAME]: { type: 'http', url: mcp.urlFor(t.conversationId), headers: { Authorization: `Bearer ${mcp.token}` } } }
    }),
    'json'
  )
  const args = [
    '-p',
    ['--output-format', 'stream-json'],
    '--verbose',
    '--include-partial-messages',
    ['--model', t.model],
    ['--effort', t.effort],
    ['--system-prompt-file', await contentFile('claude-system', t.system)],
    ['--tools', ['Read', ...(web ? ['WebSearch', 'WebFetch'] : [])].join(',')],
    ['--mcp-config', mcpConfig],
    '--strict-mcp-config',
    ['--allowedTools', allowed.join(',')],
    ['--permission-mode', 'dontAsk'],
    ['--setting-sources', ''],
    '--disable-slash-commands',
    t.resume ? ['--resume', t.sessionId!] : ['--session-id', t.sessionId!]
  ].flat()
  const stream = new ClaudeStream()
  let done = false
  const r = await run(path, args, {
    input: t.message,
    cwd: t.cwd,
    // A tool call can wait for the user's answer on a card.
    env: { ...shellEnv(), MCP_TOOL_TIMEOUT: String(15 * 60_000) },
    timeoutMs: t.timeoutMs,
    waitedMs: t.waitedMs,
    signal: t.signal,
    onLine: (line) => {
      for (const e of stream.push(line)) {
        if (e.type === 'done') done = true
        t.onEvent(e)
      }
    }
  })
  if (!done) {
    const detail = errorDetail(r.stderr) || `code de sortie ${r.code}`
    log.warn('claude -p failed:', detail)
    t.onEvent({ type: 'done', error: looksLikeAuthError(detail) ? `Claude Code n’est pas connecté. ${detail}` : `Claude Code a échoué : ${detail}` })
  }
}
