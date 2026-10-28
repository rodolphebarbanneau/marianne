import { CLAUDE_CODE_MODELS, publicHosts } from '../../shared/constants'
import type { AgentConfig, AgentId, AgentModel, AgentStatus } from '../../shared/types'
import { actions } from '../actions'
import { configStore } from '../config'
import { dossier } from '../dossier/store'
import { redact } from '../dossier/tokens'
import { paths } from '../paths'
import { skills } from '../skills'
import { legifranceReady } from '../tools'
import { claudeLogin, claudeStatus, claudeTurn } from './claude-code'
import { codexLogin, codexModels, codexStatus, codexTurn } from './codex'
import type { AgentEvent } from './events'
import { systemPrompt } from './prompt'
import type { TurnOptions } from './types'

interface Agent {
  config: () => AgentConfig
  status: (cfg: AgentConfig, refresh: boolean) => Promise<AgentStatus>
  login: (cfg: AgentConfig) => Promise<void>
  models: () => Promise<AgentModel[]>
  turn: (cfg: AgentConfig, t: TurnOptions) => Promise<void>
}

const AGENTS: Record<AgentId, Agent> = {
  'claude-code': {
    config: () => configStore.get().agent.claudeCode,
    status: claudeStatus,
    login: claudeLogin,
    models: async () => CLAUDE_CODE_MODELS,
    turn: claudeTurn
  },
  codex: {
    config: () => configStore.get().agent.codex,
    status: codexStatus,
    login: codexLogin,
    models: codexModels,
    turn: codexTurn
  }
}

const statusCache = new Map<AgentId, { at: number; status: AgentStatus }>()

export async function agentStatus(id: AgentId, refresh = false): Promise<AgentStatus> {
  const cached = statusCache.get(id)
  if (!refresh && cached && Date.now() - cached.at < 60_000) return cached.status
  const agent = AGENTS[id]
  const status = await agent.status(agent.config(), refresh)
  statusCache.set(id, { at: Date.now(), status })
  return status
}

export async function agentLogin(id: AgentId): Promise<void> {
  statusCache.delete(id)
  await AGENTS[id].login(AGENTS[id].config())
}

export const agentModels = (id: AgentId) => AGENTS[id].models()

export interface TurnRequest {
  message: string
  conversationId?: string
  sessionId?: string
  resume: boolean
  signal: AbortSignal
  onEvent: (e: AgentEvent) => void
}

/** Run one turn with the configured agent, Marianne's prompt and tools. */
export async function runTurn(provider: AgentId, req: TurnRequest): Promise<void> {
  const cfg = configStore.get()
  const agent = AGENTS[provider]
  const agentCfg = agent.config()
  await agent.turn(agentCfg, {
    ...req,
    system: systemPrompt({
      skills: skills.enabled(),
      // The notes and instructions are the user's own words: scrub them like everything else sent to the agent.
      notes: redact(dossier.get().notes, dossier.tokens()),
      custom: redact(cfg.agent.customInstructions, dossier.tokens()),
      web: cfg.agent.web,
      legifrance: legifranceReady()
    }),
    model: agentCfg.model,
    effort: agentCfg.effort,
    web: cfg.agent.web,
    publicHosts: publicHosts(cfg.services.custom),
    cwd: paths.workspace,
    timeoutMs: Math.max(1, cfg.agent.maxMinutes) * 60_000,
    waitedMs: () => actions.waitedMs(req.conversationId)
  })
}
