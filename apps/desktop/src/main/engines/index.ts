import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ENGINE_HOMES, ENGINE_LABELS } from '../../shared/config'
import { publicHosts } from '../../shared/sites'
import type { EngineId, EngineLight, EngineModel, EngineStatus } from '../../shared/types'
import { configStore } from '../config'
import { content } from '../content'
import { log } from '../log'
import { runAside } from '../aside'
import { session } from '../session'
import { isWin, shellEnv } from '../util'
import { claude } from './claude'
import { expandHome, findCli, openInTerminal } from './cli'
import { codex } from './codex'
import { clearScratch, scratchDir } from './scratch'
import { captureTranscript, discardTranscript, restoreTranscript } from './transcripts'
import type { Engine, TranscriptFiles, Turn } from './types'
import { vibe } from './vibe'

export type { EngineEvent } from './events'
export type { Turn } from './types'
export { carryOnMessage, followUpMessage, recap, runsSince, systemPrompt, taskMessage, userMessage } from './prompt'
export { listSkills, readSkill } from './skills'
export { forgetTranscripts } from './transcripts'

/**
 * The engines: the coding-agent CLIs Marianne drives with the user's own login (Claude Code,
 * Codex, Mistral Vibe). A turn runs in its folder's empty scratch folder, with the configuration
 * folder the user chose, if any, and Marianne's MCP tools only (plus the web, if allowed).
 */

const ENGINES: Record<EngineId, Engine> = { claude, codex, vibe }
const IDS = Object.keys(ENGINES) as EngineId[]

const chosenHome = (id: EngineId) => expandHome(configStore.get().engines[id].home.trim())

/** The engine's configuration folder: the chosen one, else where its variable points, else ~/.claude… */
function engineHome(id: EngineId): string {
  const { env, folder } = ENGINE_HOMES[id]
  return chosenHome(id) || shellEnv()[env] || join(homedir(), folder)
}

/** The variable that points the CLI at the chosen configuration folder; none when it wasn't chosen. */
function homeEnv(id: EngineId): Record<string, string> {
  const home = chosenHome(id)
  return home ? { [ENGINE_HOMES[id].env]: home } : {}
}

/** The executable is named like the engine. */
const cliPath = (id: EngineId, refresh = false) => findCli(id, ENGINES[id].candidates(), refresh)

const statusCache = new Map<EngineId, { at: number; status: EngineStatus }>()

configStore.on('change', (next, previous) => {
  for (const id of IDS) {
    const [a, b] = [next.engines[id], previous.engines[id]]
    if (a.home !== b.home || a.useEnvKey !== b.useEnvKey) statusCache.delete(id)
  }
})

/** The variables of `names` that `env` sets, as written there: on Windows, their names have no case. */
function setNames(env: NodeJS.ProcessEnv, names: string[]): string[] {
  const wanted = new Set(names)
  return Object.keys(env).filter((k) => wanted.has(isWin ? k.toUpperCase() : k) && !!env[k]?.trim())
}

/** The first of the engine's key variables that the environment sets, by its usual name. */
export function envKeyName(id: EngineId, env: NodeJS.ProcessEnv): string | undefined {
  const set = new Set(setNames(env, ENGINES[id].keyVars).map((k) => (isWin ? k.toUpperCase() : k)))
  return ENGINES[id].keyVars.find((name) => set.has(name))
}

/** The environment without the engine's key variables and what goes with them. */
export function withoutEnvKey(id: EngineId, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env }
  for (const k of setNames(env, [...ENGINES[id].keyVars, ...(ENGINES[id].keyCompanions ?? [])])) delete out[k]
  return out
}

/** The environment of the engine's runs: its key left out, unless the runs use it (see engineStatus). */
async function runEnv(id: EngineId): Promise<NodeJS.ProcessEnv> {
  const env = { ...shellEnv(), ...homeEnv(id) }
  if (!envKeyName(id, env)) return env
  const key = (await engineStatus(id)).envKey
  return key && !key.used ? withoutEnvKey(id, env) : env
}

export async function engineStatus(id: EngineId, refresh = false): Promise<EngineStatus> {
  const cached = statusCache.get(id)
  if (!refresh && cached && Date.now() - cached.at < 60_000) return cached.status
  const engine = ENGINES[id]
  const label = ENGINE_LABELS[id]
  const cli = cliPath(id, refresh)
  const status: EngineStatus = cli ? { found: true, path: cli } : { found: false, error: `${label} introuvable. Installez-le depuis ${engine.site}.` }
  if (cli) {
    const env = { ...shellEnv(), ...homeEnv(id) }
    try {
      status.version = (await runAside(cli, ['--version'], { env, timeoutMs: 15_000 })).stdout.trim().split('\n')[0]
      Object.assign(status, await engine.account(cli, withoutEnvKey(id, env), engineHome(id)))
      const key = envKeyName(id, env)
      if (key) {
        // With a sign-in of its own, the CLI would still take the key, billed apart: Marianne leaves
        // it out, unless the user chose it. With nothing else, the key is how the engine works at all.
        const login = status.loggedIn === true
        const used = !login || configStore.get().engines[id].useEnvKey
        status.envKey = { name: key, login, used }
        if (used) Object.assign(status, { loggedIn: true, account: `clé de la variable ${key}` })
      }
    } catch (err) {
      status.error = `Impossible de lire l’état de ${label} : ${(err as Error).message}`
    }
  }
  statusCache.set(id, { at: Date.now(), status })
  return status
}

/** Open the CLI's own sign-in in a terminal, on the chosen configuration folder. */
export async function openLogin(id: EngineId): Promise<void> {
  statusCache.delete(id)
  const cli = cliPath(id)
  if (!cli) throw new Error(`${ENGINE_LABELS[id]} introuvable`)
  await openInTerminal(cli, ENGINES[id].login, `Connexion à ${ENGINE_LABELS[id]}`, homeEnv(id))
}

export const listModels = (id: EngineId): Promise<EngineModel[]> => ENGINES[id].models(engineHome(id))

const running = new Map<EngineId, number>()

/** Emits 'busy' with `busy()` when a turn starts or ends. */
export const engineEvents = new EventEmitter()

/** The engines with a turn running. */
export const busy = (): Set<EngineId> => new Set(IDS.filter((id) => (running.get(id) ?? 0) > 0))

function setRunning(id: EngineId, delta: number): void {
  running.set(id, (running.get(id) ?? 0) + delta)
  engineEvents.emit('busy', busy())
}

/** The bottom bar: enabled engines, greyed when not found or signed out, working while a turn runs. */
export async function engineLights(): Promise<EngineLight[]> {
  const cfg = configStore.get().engines
  const enabled = IDS.filter((id) => cfg[id].enabled)
  const statuses = await Promise.all(enabled.map((id) => engineStatus(id)))
  const now = busy()
  return enabled.map((id, i) => ({
    id,
    ok: statuses[i].found && statuses[i].loggedIn !== false,
    busy: now.has(id),
    label: ENGINE_LABELS[id],
    envKey: !!statuses[i].envKey?.used
  }))
}

/** The turns under way: a lock wipes again once they are over (below). */
const turns = new Set<Promise<void>>()

/**
 * Run one turn with an engine, in the folder's scratch folder. The session's transcript comes
 * back from the archive before resuming and goes back into it afterwards, whatever the outcome.
 */
export function runTurn(id: EngineId, turn: Turn): Promise<void> {
  const job = engineTurn(id, turn)
  turns.add(job)
  void job.catch(() => undefined).finally(() => turns.delete(job))
  return job
}

async function engineTurn(id: EngineId, turn: Turn): Promise<void> {
  const engine = ENGINES[id]
  const cli = cliPath(id)
  if (!cli) throw new Error(`${ENGINE_LABELS[id]} introuvable. Installez-le depuis ${engine.site}, ou choisissez un autre moteur.`)
  const cfg = configStore.get().engines
  const home = engineHome(id)
  const cwd = scratchDir(turn.folderId)
  let sessionId = turn.sessionId
  let restored: TranscriptFiles | null = null
  if (turn.resume && sessionId) {
    try {
      restored = restoreTranscript(turn.folderId, id, sessionId, engine.transcriptRoot(home, cwd))
    } catch (err) {
      if (!session.unlocked) throw err
      // The CLI then won't find the session: the chat starts a new one with a recap.
      log.warn(`Could not restore the ${id} transcript of ${turn.folderId}:`, (err as Error).message)
    }
  }
  setRunning(id, 1)
  try {
    await engine.turn({
      ...turn,
      cli,
      cwd,
      home,
      env: await runEnv(id),
      model: cfg[id].model.trim(),
      effort: cfg[id].effort,
      compactAt: cfg.compactAt,
      publicHosts: publicHosts(content.get().sites),
      onEvent: (e) => {
        if (e.type === 'session') sessionId = e.id
        turn.onEvent(e)
      }
    })
  } finally {
    setRunning(id, -1)
    if (sessionId) {
      const found = engine.transcript(home, cwd, sessionId)
      // A run's session is nobody's to resume: what it read of the pages leaves the disk with it,
      // and the folder's own transcript stays the user's.
      if (turn.unattended) {
        if (found) discardTranscript(found)
      } else captureTranscript(turn.folderId, id, sessionId, found)
    }
    // What came back from the archive leaves too, should the CLI have forked a new session.
    if (restored) discardTranscript(restored)
  }
}

/**
 * Remove the scratch folders and what the engines keep of Marianne's runs. The app calls it at
 * start; it also runs when the session locks.
 */
export function wipeScratch(): void {
  clearScratch()
  for (const id of IDS) {
    try {
      ENGINES[id].sweep?.(engineHome(id))
    } catch (err) {
      log.warn(`Could not clean ${id}'s leftovers:`, err)
    }
  }
}

// The turns running at the lock are being stopped (chat.ts): until their CLI is gone it may write
// its transcript, in clear, and Windows won't remove the folder it works in. So once they are over,
// everything is wiped again; unless the account was opened meanwhile, whose turns have folders there.
session.on('locked', () => {
  wipeScratch()
  if (!turns.size) return
  void Promise.allSettled([...turns]).then(() => {
    if (!session.unlocked) wipeScratch()
  })
})
