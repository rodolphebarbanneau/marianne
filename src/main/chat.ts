import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { ActionPart, AgentId, ChatMessage, Conversation, SendRequest, SetupPart, TextPart, ToolPart } from '../shared/types'
import { actions } from './actions'
import { runTurn } from './agent'
import type { AgentEvent } from './agent/events'
import { userMessage } from './agent/prompt'
import { configStore } from './config'
import { conversations } from './conversations'
import { dossier } from './dossier/store'
import { redact } from './dossier/tokens'
import { log } from './log'
import { newId } from './util'

/**
 * Runs the turns of conversations: saves the user message, streams the agent's answer into an
 * assistant message (text, tool calls and their results, cards), and pushes updates to the
 * window. Everything sent to the agent is scrubbed of the user's identifiers first.
 */

const UPDATE_EVERY_MS = 60

function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 60 ? `${line.slice(0, 57).replace(/\s+\S*$/, '')}…` : line || 'Nouvelle conversation'
}

/** Applies agent events to the assistant message being written. */
class AnswerBuilder {
  private texts = new Map<string, TextPart>()
  private tools = new Map<string, ToolPart>()
  error?: string
  model?: string

  constructor(readonly message: ChatMessage) {}

  apply(e: AgentEvent): void {
    const parts = this.message.parts
    switch (e.type) {
      case 'text-delta':
      case 'text': {
        let part = this.texts.get(e.key)
        if (!part) {
          part = { type: 'text', text: '' }
          this.texts.set(e.key, part)
          parts.push(part)
        }
        part.text = e.type === 'text' ? e.text : part.text + e.delta
        break
      }
      case 'tool': {
        const existing = this.tools.get(e.id)
        if (existing) existing.input = e.input
        else {
          const part: ToolPart = { type: 'tool', id: e.id, name: e.name, input: e.input, status: 'running' }
          this.tools.set(e.id, part)
          parts.push(part)
        }
        break
      }
      case 'tool-result': {
        const part = this.tools.get(e.id)
        if (part) Object.assign(part, { output: e.output, isError: e.isError, status: 'done' })
        break
      }
      case 'model':
        this.model = e.model
        break
      case 'done':
        this.error = e.error
        break
    }
  }
}

class Chat extends EventEmitter {
  private active = new Map<string, AbortController>()
  /** The answer being written, per conversation: cards from tool calls go there. */
  private writing = new Map<string, { conv: Conversation; answer: ChatMessage }>()

  constructor() {
    super()
    conversations.isRunning = (id) => this.active.has(id)
    actions.canShow = (id) => this.writing.has(id)
    actions.on('part', (id: string, part: ActionPart | SetupPart) => {
      const w = this.writing.get(id)
      if (!w) return
      w.answer.parts.push(part)
      this.emit('update', w.conv)
    })
    actions.on('update', (id: string, part: ActionPart) => {
      const w = this.writing.get(id)
      const conv = w?.conv
      // The card may belong to an answer already saved (the turn ended meanwhile).
      const target = conv?.messages.flatMap((m) => m.parts).find((p): p is ActionPart => p.type === 'action' && p.id === part.id)
      if (!target || !conv) return
      target.status = part.status
      this.emit('update', conv)
    })
  }

  running(id: string): boolean {
    return this.active.has(id)
  }

  /** Save the user message and start the turn; resolves with the conversation id. */
  async send(req: SendRequest): Promise<string> {
    const text = req.text.trim()
    if (!text && !req.attachments.length) throw new Error('Message vide')
    const now = new Date().toISOString()
    let conv = req.conversationId ? await conversations.get(req.conversationId) : null
    if (conv && this.active.has(conv.id)) throw new Error('Une réponse est déjà en cours dans cette conversation.')
    conv ??= {
      id: newId(),
      title: titleFrom(text || req.attachments.map((a) => (a.type === 'file' ? a.name : a.title)).join(', ')),
      createdAt: now,
      updatedAt: now,
      messages: []
    }
    const user: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      at: now,
      parts: [...req.attachments, ...(text ? [{ type: 'text' as const, text }] : [])],
      screen: req.page
    }
    conv.messages.push(user)
    conv.updatedAt = now
    await conversations.save(conv)
    void this.turn(conv, user)
    return conv.id
  }

  /** Answer the last user message again, dropping the answer that followed it. */
  async regenerate(id: string): Promise<void> {
    const conv = await conversations.get(id)
    if (!conv || this.active.has(id)) return
    const lastUser = conv.messages.map((m) => m.role).lastIndexOf('user')
    if (lastUser < 0) return
    conv.messages = conv.messages.slice(0, lastUser + 1)
    // The agent's session still holds the dropped answer: start a fresh one with a recap.
    conv.sessionId = undefined
    await conversations.save(conv)
    void this.turn(conv, conv.messages[lastUser])
  }

  cancel(id: string): void {
    this.active.get(id)?.abort()
  }

  private async turn(conv: Conversation, user: ChatMessage): Promise<void> {
    const cfg = configStore.get().agent
    const provider: AgentId = cfg.provider
    const answer: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      at: new Date().toISOString(),
      parts: [],
      status: 'running',
      agent: provider,
      model: (provider === 'claude-code' ? cfg.claudeCode : cfg.codex).model
    }
    conv.messages.push(answer)
    const controller = new AbortController()
    this.active.set(conv.id, controller)
    this.writing.set(conv.id, { conv, answer })
    this.emit('update', conv)
    this.emit('list')
    const started = Date.now()
    const builder = new AnswerBuilder(answer)
    let timer: NodeJS.Timeout | null = null
    const push = () => {
      timer ??= setTimeout(() => {
        timer = null
        this.emit('update', conv)
      }, UPDATE_EVERY_MS)
    }

    const attempt = async (resume: boolean) => {
      const earlier = conv.messages.slice(0, conv.messages.indexOf(user))
      const attachments = user.parts.filter((p) => p.type === 'page' || p.type === 'file' || p.type === 'document')
      const text = user.parts.map((p) => (p.type === 'text' ? p.text : '')).join('\n')
      const sessionId = resume ? conv.sessionId : provider === 'claude-code' ? randomUUID() : undefined
      await runTurn(provider, {
        // The user may type an identifier, a page may show one: the agent only ever sees tokens.
        message: redact(userMessage(text, attachments, resume ? [] : earlier, new Date(), user.screen), dossier.tokens()),
        conversationId: conv.id,
        sessionId,
        resume,
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === 'session') {
            conv.agent = provider
            conv.sessionId = e.id
          }
          builder.apply(e)
          push()
        }
      })
    }

    try {
      const resume = conv.agent === provider && !!conv.sessionId
      await attempt(resume)
      // A session the CLI no longer knows (deleted, another computer): start over with a recap.
      if (resume && builder.error && !answer.parts.length && /session|conversation/i.test(builder.error)) {
        log.warn('Resume failed, starting a new session:', builder.error)
        builder.error = undefined
        await attempt(false)
      }
      answer.status = builder.error ? 'error' : 'done'
      answer.error = builder.error
    } catch (err) {
      const cancelled = controller.signal.aborted
      answer.status = cancelled ? 'cancelled' : 'error'
      if (!cancelled) answer.error = (err as Error).message
    } finally {
      if (timer) clearTimeout(timer)
      actions.expire(conv.id)
      this.writing.delete(conv.id)
      for (const p of answer.parts) if (p.type === 'tool' && p.status === 'running') p.status = 'done'
      answer.ms = Date.now() - started
      answer.model = builder.model ?? answer.model
      conv.updatedAt = new Date().toISOString()
      this.active.delete(conv.id)
      await conversations.save(conv).catch((err) => log.error('Could not save conversation', conv.id, err))
      this.emit('update', conv)
      this.emit('list')
      log.info(`Turn ${conv.id} ${answer.status} in ${answer.ms}ms (${provider}/${answer.model})`)
    }
  }
}

export const chat = new Chat()
