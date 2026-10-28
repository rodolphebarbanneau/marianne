import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CODEX_MODELS, MCP_SERVER_NAME } from '../../shared/constants'
import type { AgentConfig, AgentModel, AgentStatus } from '../../shared/types'
import { log } from '../log'
import { mcp } from '../mcp'
import { isMac, isWin, run, shellEnv } from '../util'
import { contentFile, errorDetail, findCli, looksLikeAuthError, openInTerminal } from './cli'
import { CodexStream } from './events'
import type { TurnOptions } from './types'

/** OpenAI Codex CLI (`codex exec`), with the user's own ChatGPT/OpenAI login. */

const codexHome = () => process.env.CODEX_HOME || join(homedir(), '.codex')

function candidates(): string[] {
  const h = homedir()
  if (isWin) {
    const appData = process.env.APPDATA ?? join(h, 'AppData', 'Roaming')
    const local = process.env.LOCALAPPDATA ?? join(h, 'AppData', 'Local')
    return [join(local, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'), join(appData, 'npm', 'codex.cmd'), join(h, '.local', 'bin', 'codex.exe')]
  }
  return [
    join(h, '.local', 'bin', 'codex'),
    ...(isMac ? ['/opt/homebrew/bin/codex', '/Applications/Codex.app/Contents/Resources/codex'] : []),
    '/usr/local/bin/codex',
    '/usr/bin/codex',
    join(h, '.npm-global', 'bin', 'codex')
  ]
}

const cliPath = (cfg: AgentConfig, refresh = false) => findCli('codex', cfg.path, candidates(), refresh)

export async function codexStatus(cfg: AgentConfig, refresh: boolean): Promise<AgentStatus> {
  const path = cliPath(cfg, refresh)
  if (!path) return { found: false, error: 'Codex introuvable. Installez-le depuis developers.openai.com/codex ou indiquez son chemin.' }
  const status: AgentStatus = { found: true, path }
  try {
    status.version = (await run(path, ['--version'], { timeoutMs: 15_000 })).stdout.trim().split('\n')[0]
    // e.g. "Logged in using ChatGPT" / "Not logged in"
    const a = await run(path, ['login', 'status'], { timeoutMs: 15_000 })
    const line =
      `${a.stdout}\n${a.stderr}`
        .trim()
        .split('\n')
        .find((l) => /logged in/i.test(l)) ?? ''
    status.loggedIn = a.code === 0 && /^logged in/i.test(line.trim())
    status.account = line
      .match(/using (.+)$/i)?.[1]
      ?.trim()
      .toLowerCase()
  } catch (err) {
    status.error = `Impossible de lire l’état de Codex : ${(err as Error).message}`
  }
  return status
}

export function codexLogin(cfg: AgentConfig): Promise<void> {
  const path = cliPath(cfg)
  if (!path) throw new Error('Codex introuvable')
  return openInTerminal(path, ['login'], 'Connexion à Codex')
}

/** Models from Codex's own catalog (kept up to date by the CLI), else a built-in list. */
export async function codexModels(): Promise<AgentModel[]> {
  try {
    const cache = JSON.parse(await readFile(join(codexHome(), 'models_cache.json'), 'utf8')) as { models?: Array<{ slug?: string; visibility?: string }> }
    const models = (cache.models ?? []).filter((m) => m.slug && m.visibility === 'list').map((m) => ({ id: m.slug!, label: m.slug! }))
    if (models.length) return models
  } catch {
    // no cache yet
  }
  return CODEX_MODELS
}

/**
 * One turn of a conversation. Marianne's instructions replace the coding-agent prompt; Marianne's
 * MCP server is the only one (no user config); the sandbox is read-only. The bearer token goes
 * through the environment, not the command line.
 */
export async function codexTurn(cfg: AgentConfig, t: TurnOptions): Promise<void> {
  const path = cliPath(cfg)
  if (!path) throw new Error('Codex introuvable. Installez-le ou choisissez Claude Code dans réglages → agent.')
  const instructions = await contentFile('codex-system', t.system)
  const args = [
    'exec',
    '--json',
    ['-m', t.model],
    ['-c', `model_reasoning_effort="${t.effort}"`],
    // TOML strings; forward slashes keep Windows paths free of escapes.
    ['-c', `model_instructions_file="${instructions.replace(/\\/g, '/')}"`],
    ['-c', `mcp_servers.${MCP_SERVER_NAME}.url="${mcp.urlFor(t.conversationId)}"`],
    // A tool call can wait for the user's answer on a card.
    ['-c', `mcp_servers.${MCP_SERVER_NAME}.tool_timeout_sec=900`],
    ['-c', `mcp_servers.${MCP_SERVER_NAME}.bearer_token_env_var="MARIANNE_MCP_TOKEN"`],
    // Without it, approval_policy="never" refuses every tool that isn't read-only (opening a page,
    // proposals, forms). The app asks the user itself, on a card, before anything is changed.
    ['-c', `mcp_servers.${MCP_SERVER_NAME}.default_tools_approval_mode="approve"`],
    ['-c', `web_search="${t.web === 'off' ? 'disabled' : 'live'}"`],
    ['-c', 'approval_policy="never"'],
    // No shell: a read-only sandbox still reads the whole disk on macOS and Linux, outside the
    // redaction of Marianne's tools. The agent works through those tools only.
    ['-c', 'features.shell_tool=false'],
    '--ignore-user-config',
    '--ignore-rules',
    ['--sandbox', 'read-only'],
    '--skip-git-repo-check',
    ['--color', 'never'],
    ...(t.resume && t.sessionId ? ['resume', t.sessionId] : []),
    '-'
  ].flat()
  const stream = new CodexStream()
  let done = false
  const r = await run(path, args, {
    input: t.message,
    cwd: t.cwd,
    env: { ...shellEnv(), MARIANNE_MCP_TOKEN: mcp.token },
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
    log.warn('codex exec failed:', detail)
    t.onEvent({ type: 'done', error: looksLikeAuthError(detail) ? `Codex n’est pas connecté. ${detail}` : `Codex a échoué : ${detail}` })
  }
}
