import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { EngineModel } from '../../shared/types'
import { MCP_SERVER_NAME, mcp } from '../mcp'
import { runAside } from '../aside'
import { isMac, isWin } from '../util'
import { runStream } from './cli'
import { VibeStream } from './events'
import { vibeTranscript } from './transcripts'
import type { Engine, EngineTurn } from './types'

/**
 * Mistral Vibe (`vibe -p`), with the user's own Mistral account or API key.
 * Docs: https://docs.mistral.ai/vibe/code/cli/work-with-cli (programmatic mode),
 * …/cli/mcp-servers, …/cli/configuration, …/cli/agents, …/safety-approvals-permissions.
 *
 * Vibe takes no MCP server or system prompt on its command line. Marianne writes them, per run,
 * as project configuration in the scratch folder (`.vibe/config.toml`, an agent and its prompt)
 * and trusts that folder for the run only (`--trust`): the user's ~/.vibe is left as it is.
 * Their user-level settings (provider, ~/.vibe/AGENTS.md, hooks) still apply.
 */

const AGENT = 'marianne'
const KEY = 'MISTRAL_API_KEY'
/** The keyring service Vibe stores the key under (account: the variable's name). */
const KEYRING = 'ai.mistral.vibe'

/** Vibe's own default, when its model catalog hasn't been cached yet. */
const MODELS: EngineModel[] = [{ id: 'mistral-medium-3.5', label: 'Mistral Medium 3.5' }]

function candidates(): string[] {
  const h = homedir()
  // The installer uses `uv tool install`, which links into ~/.local/bin.
  if (isWin) return [join(h, '.local', 'bin', 'vibe.exe')]
  return [join(h, '.local', 'bin', 'vibe'), ...(isMac ? ['/opt/homebrew/bin/vibe'] : []), '/usr/local/bin/vibe', '/usr/bin/vibe']
}

/** A TOML basic string: JSON's escapes are valid TOML ones. */
const toml = (s: string) => JSON.stringify(s)

/** The run's project configuration, rewritten at each turn (the MCP address changes at each launch). */
export function projectFiles(t: Pick<EngineTurn, 'home' | 'system'>, url: string): Record<string, string> {
  return {
    'config.toml': `# Written by Marianne for its runs in this scratch folder.

[[mcp_servers]]
name = ${toml(MCP_SERVER_NAME)}
transport = "streamable-http"
url = ${toml(url)}
# A tool call can wait for the user's answer on a card.
tool_timeout_sec = 900

[mcp_servers.auth]
type = "static"
api_key_env = "MARIANNE_MCP_TOKEN"
api_key_header = "Authorization"
api_key_format = "Bearer {token}"

# Pinned where Marianne moves transcripts from and back (the default folder); no title requests.
[session_logging]
enabled = true
save_dir = ${toml(join(t.home, 'logs', 'session'))}
generate_titles = false
`,
    [`agents/${AGENT}.toml`]: `display_name = "Marianne"
description = "Marianne's citizen assistant, working through Marianne's tools only."
safety = "safe"
system_prompt_id = ${toml(AGENT)}
`,
    [`prompts/${AGENT}.md`]: t.system
  }
}

/**
 * One turn. Only Marianne's MCP tools and, if allowed, the web ones are enabled: no shell, no
 * file tools. They run without asking (nobody can answer in programmatic mode): Marianne's own
 * tools ask the user on cards. In "public" web mode, only search: Vibe documents no domain
 * restriction for web_fetch, so reading pages is left out.
 */
async function turn(t: EngineTurn): Promise<void> {
  for (const [name, content] of Object.entries(projectFiles(t, mcp.urlFor(t.folderId, t.tools)))) {
    const file = join(t.cwd, '.vibe', name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content, { encoding: 'utf8', mode: 0o600 })
  }
  const tools = [`${MCP_SERVER_NAME}_*`, ...(t.web !== 'off' ? ['web_search'] : []), ...(t.web === 'all' ? ['web_fetch'] : [])]
  const args = [
    ['--output', 'streaming'],
    ['--agent', AGENT],
    '--auto-approve',
    '--trust',
    tools.flatMap((tool) => ['--enabled-tools', tool]),
    t.resume && t.sessionId ? ['--resume', t.sessionId] : [],
    // Last, with no value: the prompt comes on stdin.
    '-p'
  ].flat()
  // The effort has no flag: Vibe sets a thinking level per model entry of its configuration.
  const env = { ...t.env, MARIANNE_MCP_TOKEN: mcp.token, ...(t.model ? { VIBE_ACTIVE_MODEL: t.model } : {}) }
  await runStream('Mistral Vibe', args, { ...t, env }, new VibeStream(MCP_SERVER_NAME))
}

/**
 * Where the API key is, never reading it out: the environment, then <home>/.env, then the
 * system keyring, the order Vibe looks in (a browser sign-in stores a key the same way).
 * Undefined: not checkable (on Linux, the Secret Service would hand over the key itself).
 */
async function keySource(env: NodeJS.ProcessEnv, home: string): Promise<string | null | undefined> {
  if (env[KEY]?.trim()) return `variable ${KEY}`
  try {
    if (new RegExp(`^\\s*(export\\s+)?${KEY}\\s*=\\s*['"]?[^\\s'"#]`, 'm').test(readFileSync(join(home, '.env'), 'utf8'))) return 'fichier .env'
  } catch {
    // no .env
  }
  if (isMac) {
    // Without -w or -g, `security` prints the item's attributes, not the secret.
    const r = await runAside('security', ['find-generic-password', '-s', KEYRING, '-a', KEY], { timeoutMs: 10_000 })
    return r.code === 0 ? 'trousseau macOS' : null
  }
  if (isWin) {
    // `cmdkey /list` shows targets, never secrets. Vibe uses the service, or `<account>@<service>`.
    for (const target of [KEYRING, `${KEY}@${KEYRING}`]) {
      const r = await runAside('cmdkey', [`/list:${target}`], { timeoutMs: 10_000 })
      if (new RegExp(`[:=]\\s*${target.replace(/[.@]/g, '\\$&')}\\s*$`, 'im').test(r.stdout)) return 'gestionnaire d’identification Windows'
    }
    return null
  }
  return undefined
}

/** The plan of the latest account Vibe looked up (whoami_cache.json, keyed by a hash of the key). */
async function plan(home: string): Promise<string | undefined> {
  try {
    const entries = Object.values(JSON.parse(await readFile(join(home, 'whoami_cache.json'), 'utf8')) as Record<string, any>) // eslint-disable-line @typescript-eslint/no-explicit-any
    const latest = entries.filter((e) => e?.payload?.plan_name).sort((a, b) => (b.stored_at_timestamp ?? 0) - (a.stored_at_timestamp ?? 0))[0]
    const name = String(latest?.payload.plan_name ?? '')
    return name && name !== 'NO_PLAN_DATA' ? name : undefined
  } catch {
    return undefined
  }
}

export const vibe: Engine = {
  candidates,
  site: 'docs.mistral.ai/vibe/code/cli/install-setup',
  async account(_cli, env, home) {
    const source = await keySource(env, home)
    if (source === undefined) return {}
    return { loggedIn: !!source, account: source ? [source, await plan(home)].filter(Boolean).join(' · ') : undefined }
  },
  login: ['--setup'],
  /** Vibe's model catalog, cached per key (model_catalog_cache.json), else its default. */
  async models(home) {
    try {
      const entries = Object.values(JSON.parse(await readFile(join(home, 'model_catalog_cache.json'), 'utf8')) as Record<string, any>) // eslint-disable-line @typescript-eslint/no-explicit-any
      const latest = entries.sort((a, b) => (b?.stored_at_timestamp ?? 0) - (a?.stored_at_timestamp ?? 0))[0]
      const models = ((latest?.payload?.models ?? []) as Array<{ id?: string; label?: string }>)
        .filter((m) => m.id)
        .map((m) => ({ id: m.id!, label: m.label || m.id! }))
      if (models.length) return models
    } catch {
      // no catalog yet
    }
    return MODELS
  },
  turn,
  transcript: (home, _cwd, sessionId) => vibeTranscript(home, sessionId),
  transcriptRoot: (home) => join(home, 'logs', 'session')
}
