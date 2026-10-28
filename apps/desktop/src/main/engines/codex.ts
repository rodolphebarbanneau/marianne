import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { EngineModel } from '../../shared/types'
import { MCP_SERVER_NAME, mcp } from '../mcp'
import { isMac, isWin, run } from '../util'
import { contentFile, runStream } from './cli'
import { CodexStream } from './events'
import { codexTranscript } from './transcripts'
import type { Engine, EngineTurn } from './types'

/** OpenAI Codex CLI (`codex exec`), with the user's own ChatGPT/OpenAI login. */

/** When Codex's own catalog (models_cache.json) can't be read. */
const MODELS: EngineModel[] = [
  { id: 'gpt-6-luna', label: 'gpt-6-luna' },
  { id: 'gpt-6.1-terra', label: 'gpt-6.1-terra' },
  { id: 'gpt-6.1-sol', label: 'gpt-6.1-sol' }
]

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

/**
 * One turn. Marianne's instructions replace the coding-agent prompt; Marianne's MCP server is the
 * only one (no user config); the sandbox is read-only. The bearer token goes through the
 * environment, not the command line.
 */
async function turn(t: EngineTurn): Promise<void> {
  const instructions = await contentFile('codex-system', t.system, 'md')
  const server = `mcp_servers.${MCP_SERVER_NAME}`
  const args = [
    'exec',
    '--json',
    t.model ? ['-m', t.model] : [],
    ['-c', `model_reasoning_effort="${t.effort}"`],
    // TOML strings; forward slashes keep Windows paths free of escapes.
    ['-c', `model_instructions_file="${instructions.replace(/\\/g, '/')}"`],
    ['-c', `${server}.url="${mcp.urlFor(t.folderId)}"`],
    // A tool call can wait for the user's answer on a card.
    ['-c', `${server}.tool_timeout_sec=900`],
    ['-c', `${server}.bearer_token_env_var="MARIANNE_MCP_TOKEN"`],
    // Without it, approval_policy="never" refuses every tool that isn't read-only (opening a page,
    // proposals, forms). The app asks the user itself, on a card, before anything is changed.
    ['-c', `${server}.default_tools_approval_mode="approve"`],
    ['-c', `web_search="${t.web === 'off' ? 'disabled' : 'live'}"`],
    ['-c', 'approval_policy="never"'],
    // No shell and no image viewer: a read-only sandbox still reads the whole disk on macOS and
    // Linux, outside the redaction of Marianne's tools. The engine works through those tools only.
    ['-c', 'features.shell_tool=false'],
    ['-c', 'features.unified_exec=false'],
    ['-c', 'features.view_image=false'],
    // The messages stay out of history.jsonl: the transcript alone is kept, in the archive.
    ['-c', 'history.persistence="none"'],
    '--ignore-user-config',
    '--ignore-rules',
    ['--sandbox', 'read-only'],
    '--skip-git-repo-check',
    ['--color', 'never'],
    t.resume && t.sessionId ? ['resume', t.sessionId] : [],
    '-'
  ].flat()
  await runStream('Codex', args, { ...t, env: { ...t.env, MARIANNE_MCP_TOKEN: mcp.token } }, new CodexStream())
}

export const codex: Engine = {
  candidates,
  site: 'developers.openai.com/codex',
  async account(cli, env) {
    // e.g. "Logged in using ChatGPT" / "Not logged in"
    const a = await run(cli, ['login', 'status'], { env, timeoutMs: 15_000 })
    const line =
      `${a.stdout}\n${a.stderr}`
        .trim()
        .split('\n')
        .find((l) => /logged in/i.test(l)) ?? ''
    return {
      loggedIn: a.code === 0 && /^logged in/i.test(line.trim()),
      account: line
        .match(/using (.+)$/i)?.[1]
        ?.trim()
        .toLowerCase()
    }
  },
  login: ['login'],
  /** Codex's own catalog, kept up to date by the CLI, else a built-in list. */
  async models(home) {
    try {
      const cache = JSON.parse(await readFile(join(home, 'models_cache.json'), 'utf8')) as { models?: Array<{ slug?: string; visibility?: string }> }
      const models = (cache.models ?? []).filter((m) => m.slug && m.visibility === 'list').map((m) => ({ id: m.slug!, label: m.slug! }))
      if (models.length) return models
    } catch {
      // no cache yet
    }
    return MODELS
  },
  turn,
  transcript: (home, _cwd, sessionId) => codexTranscript(home, sessionId),
  transcriptRoot: (home) => join(home, 'sessions')
}
