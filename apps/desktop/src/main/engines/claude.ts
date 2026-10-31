import { randomUUID } from 'node:crypto'
import { realpathSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { EngineModel } from '../../shared/types'
import { MCP_SERVER_NAME, mcp } from '../mcp'
import { paths } from '../paths'
import { runAside } from '../aside'
import { isMac, isWin } from '../util'
import { contentFile, runStream } from './cli'
import { ClaudeStream } from './events'
import { claudeLeftovers, claudeProject, claudeTranscript } from './transcripts'
import type { Engine, EngineTurn } from './types'

/** Claude Code (`claude -p`), with the user's own Claude account. */

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
 * One turn. Marianne's system prompt replaces the coding one; the only built-in tools are the
 * web ones, if allowed: no file reading, no shell. Marianne's MCP server is the only one, with
 * no user or project settings, plugins or slash commands. Anything not allowed is refused, never
 * asked.
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
  const args = [
    '-p',
    ['--output-format', 'stream-json'],
    '--verbose',
    '--include-partial-messages',
    t.model ? ['--model', t.model] : [],
    ['--effort', t.effort],
    ['--system-prompt-file', await contentFile('claude-system', t.system, 'md')],
    ['--tools', web ? 'WebSearch,WebFetch' : ''],
    ['--mcp-config', mcpConfig],
    '--strict-mcp-config',
    ['--allowedTools', allowed.join(',')],
    ['--permission-mode', 'dontAsk'],
    ['--setting-sources', ''],
    ['--settings', settings],
    '--disable-slash-commands',
    t.resume && t.sessionId ? ['--resume', t.sessionId] : ['--session-id', t.sessionId ?? randomUUID()]
  ].flat()
  // A tool call can wait for the user's answer on a card.
  await runStream('Claude Code', args, { ...t, env: { ...t.env, MCP_TOOL_TIMEOUT: String(15 * 60_000) } }, new ClaudeStream())
}

export const claude: Engine = {
  candidates,
  site: 'claude.com/product/claude-code',
  async account(cli, env) {
    const a = await runAside(cli, ['auth', 'status', '--json'], { env, timeoutMs: 15_000 })
    const json = JSON.parse(a.stdout.slice(a.stdout.indexOf('{')))
    return { loggedIn: !!json.loggedIn, account: [json.email, json.subscriptionType].filter(Boolean).join(' · ') || undefined }
  },
  login: ['auth', 'login'],
  models: async () => MODELS,
  turn,
  transcript: (home, cwd, sessionId) => claudeTranscript(home, real(cwd), sessionId),
  transcriptRoot: (home, cwd) => join(home, 'projects', claudeProject(real(cwd))),
  sweep(home) {
    for (const dir of claudeLeftovers(home, [paths.work, real(paths.work)])) rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  }
}
