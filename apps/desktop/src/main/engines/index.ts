import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ENGINE_HOMES, ENGINE_LABELS } from '../../shared/config'
import { publicHosts } from '../../shared/sites'
import type { EngineId, EngineLight, EngineModel, EngineStatus } from '../../shared/types'
import { session } from '../archive/session'
import { configStore } from '../config'
import { content } from '../content'
import { log } from '../log'
import { run, shellEnv } from '../util'
import { claude } from './claude'
import { expandHome, findCli, openInTerminal } from './cli'
import { codex } from './codex'
import { clearScratch, scratchDir } from './scratch'
import { captureTranscript, discardTranscript, restoreTranscript } from './transcripts'
import type { Engine, TranscriptFiles, Turn } from './types'
import { vibe } from './vibe'

export type { EngineEvent } from './events'
export type { Turn } from './types'
export { recap, systemPrompt, userMessage } from './prompt'
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
  for (const id of IDS) if (next.engines[id].home !== previous.engines[id].home) statusCache.delete(id)
})

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
      status.version = (await run(cli, ['--version'], { env, timeoutMs: 15_000 })).stdout.trim().split('\n')[0]
      Object.assign(status, await engine.account(cli, env, engineHome(id)))
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
  return enabled.map((id, i) => ({ id, ok: statuses[i].found && statuses[i].loggedIn !== false, busy: now.has(id), label: ENGINE_LABELS[id] }))
}

/**
 * Run one turn with an engine, in the folder's scratch folder. The session's transcript comes
 * back from the archive before resuming and goes back into it afterwards, whatever the outcome.
 */
export async function runTurn(id: EngineId, turn: Turn): Promise<void> {
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
      env: { ...shellEnv(), ...homeEnv(id) },
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
    if (sessionId) captureTranscript(turn.folderId, id, sessionId, engine.transcript(home, cwd, sessionId))
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

session.on('locked', wipeScratch)
