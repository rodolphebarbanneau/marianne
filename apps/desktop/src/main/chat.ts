import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { ApprovalPart, ChatMessage, EngineId, Folder, ProgressPart, SendRequest, SetupPart, TextPart, ToolPart } from '../shared/types'
import { approvals } from './approvals'
import { configStore } from './config'
import { content } from './content'
import { listSkills, runTurn, systemPrompt, userMessage, type EngineEvent } from './engines'
import { folders, titleFrom } from './folders'
import { log } from './log'
import { profile } from './profile/store'
import { redact } from './profile/tokens'
import { services } from './host'
import { legifranceReady } from './tools'

/**
 * Runs the turns of folders: saves the user message, streams the engine's answer into an
 * assistant message (text, tool calls and their results, cards), and pushes updates to the
 * window. Everything sent to an engine is scrubbed of the user's identifiers first.
 */

const UPDATE_EVERY_MS = 60
const TURN_MINUTES = 30

/** Applies engine events to the assistant message being written. */
class AnswerBuilder {
  private texts = new Map<string, TextPart>()
  private tools = new Map<string, ToolPart>()
  error?: string
  model?: string

  constructor(readonly message: ChatMessage) {}

  apply(e: EngineEvent): void {
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

interface Writing {
  folder: Folder
  messages: ChatMessage[]
  answer: ChatMessage
}

class Chat extends EventEmitter {
  private active = new Map<string, AbortController>()
  /** The answer being written, per folder: cards from tool calls go there. */
  private writing = new Map<string, Writing>()

  constructor() {
    super()
    folders.isRunning = (id) => this.active.has(id)
    approvals.canShow = (id) => this.writing.has(id)
    approvals.on('part', (id: string, part: ApprovalPart | SetupPart) => {
      const w = this.writing.get(id)
      if (!w) return
      w.answer.parts.push(part)
      this.push(w)
    })
    approvals.on('progress', (id: string, part: ProgressPart) => {
      const w = this.writing.get(id)
      if (!w) return
      const existing = w.answer.parts.find((p): p is ProgressPart => p.type === 'progress' && p.id === part.id)
      if (existing) existing.steps = part.steps
      else w.answer.parts.push(part)
      this.push(w)
    })
    approvals.on('update', (id: string, part: ApprovalPart) => {
      const w = this.writing.get(id)
      // The card may belong to an answer already saved (the turn ended meanwhile).
      const target = w?.messages.flatMap((m) => m.parts).find((p): p is ApprovalPart => p.type === 'approval' && p.id === part.id)
      if (!target || !w) return
      target.status = part.status
      this.push(w)
    })
  }

  running(id: string): boolean {
    return this.active.has(id)
  }

  /** The folder as the window shows it. */
  view(id: string) {
    const folder = folders.get(id)
    if (!folder) return null
    const w = this.writing.get(id)
    return { folder: w?.folder ?? folder, messages: w?.messages ?? folders.messages(id), running: this.active.has(id) }
  }

  private push(w: Writing): void {
    this.emit('folder', { folder: w.folder, messages: w.messages, running: this.active.has(w.folder.id) })
  }

  /** Save the user message and start the turn; resolves with the folder id. */
  async send(req: SendRequest): Promise<string> {
    const text = req.text.trim()
    if (!text && !req.attachments.length) throw new Error('Message vide')
    let folder = req.folderId ? folders.get(req.folderId) : null
    if (req.folderId && !folder) throw new Error('Dossier introuvable.')
    if (folder && this.active.has(folder.id)) throw new Error('Marianne répond déjà dans ce dossier.')
    const engine: EngineId = req.engine ?? folder?.engine ?? configStore.get().engines.default
    if (!folder) {
      const followed = req.procedure ? content.procedure(req.procedure) : null
      folder = folders.create({
        title: titleFrom(followed && !req.text ? followed.title : text || req.attachments.map((a) => a.title).join(', ')),
        engine,
        procedure: followed?.id,
        domain: followed?.domain ?? req.domain
      })
    } else if (engine !== folder.engine) folder = folders.update(folder.id, { engine })
    const messages = folders.messages(folder.id)
    const user: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      at: new Date().toISOString(),
      parts: [...req.attachments, ...(text ? [{ type: 'text' as const, text }] : [])]
    }
    messages.push(user)
    folders.saveMessages(folder.id, messages, { touched: true })
    void this.turn(folders.get(folder.id)!, messages, user)
    return folder.id
  }

  /** Answer the last user message again, dropping the answer that followed it. */
  async regenerate(id: string): Promise<void> {
    const folder = folders.get(id)
    if (!folder || this.active.has(id)) return
    const messages = folders.messages(id)
    const lastUser = messages.map((m) => m.role).lastIndexOf('user')
    if (lastUser < 0) return
    const kept = messages.slice(0, lastUser + 1)
    // The engine's session still holds the dropped answer: start a fresh one with a recap.
    const updated = folders.update(id, { sessions: { ...folder.sessions, [folder.engine]: undefined } })
    folders.saveMessages(id, kept)
    void this.turn(updated, kept, kept[lastUser])
  }

  cancel(id: string): void {
    this.active.get(id)?.abort()
  }

  /** Stop every turn: the session is locking. */
  cancelAll(): void {
    for (const controller of this.active.values()) controller.abort()
  }

  private async turn(folder: Folder, messages: ChatMessage[], user: ChatMessage): Promise<void> {
    const engine = folder.engine
    const cfg = configStore.get()
    const answer: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      at: new Date().toISOString(),
      parts: [],
      status: 'running',
      engine,
      model: cfg.engines[engine].model
    }
    messages.push(answer)
    const controller = new AbortController()
    const w: Writing = { folder, messages, answer }
    this.active.set(folder.id, controller)
    this.writing.set(folder.id, w)
    this.push(w)
    folders.emit('list')
    const started = Date.now()
    const builder = new AnswerBuilder(answer)
    let timer: NodeJS.Timeout | null = null
    const tick = () => {
      timer ??= setTimeout(() => {
        timer = null
        this.push(w)
      }, UPDATE_EVERY_MS)
    }

    const attempt = async (resume: boolean) => {
      const earlier = messages.slice(0, messages.indexOf(user))
      const attachments = user.parts.filter((p) => p.type === 'page' || p.type === 'document')
      const text = user.parts.map((p) => (p.type === 'text' ? p.text : '')).join('\n')
      const tokens = profile.tokens()
      // Claude names its session up front; the others give theirs in their first event.
      const sessionId = resume ? w.folder.sessions[engine] : engine === 'claude' ? randomUUID() : undefined
      const screen = { route: w.folder.procedure ? `procedure/${w.folder.procedure}` : 'folder', title: w.folder.title }
      await runTurn(engine, {
        folderId: folder.id,
        // The user may type an identifier, a page may show one: the engine only ever sees tokens.
        message: redact(userMessage(text, attachments, resume ? [] : earlier, new Date(), screen), tokens),
        system: systemPrompt({
          skills: listSkills(),
          services: services.instructions(),
          notes: redact(profile.get().notes, tokens),
          web: cfg.web,
          legifrance: legifranceReady()
        }),
        sessionId,
        resume,
        web: cfg.web,
        signal: controller.signal,
        timeoutMs: TURN_MINUTES * 60_000,
        waitedMs: () => approvals.waitedMs(folder.id),
        onEvent: (e) => {
          if (e.type === 'session') w.folder = folders.update(folder.id, { sessions: { ...w.folder.sessions, [engine]: e.id } })
          builder.apply(e)
          tick()
        }
      })
    }

    try {
      const resume = !!w.folder.sessions[engine]
      await attempt(resume)
      // A session the CLI no longer knows (another computer, cleaned up): start over with a recap.
      if (resume && builder.error && !answer.parts.length && /session|conversation|thread/i.test(builder.error)) {
        log.warn('Resume failed, starting a new session:', builder.error)
        builder.error = undefined
        w.folder = folders.update(folder.id, { sessions: { ...w.folder.sessions, [engine]: undefined } })
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
      approvals.expire(folder.id)
      for (const p of answer.parts) if (p.type === 'tool' && p.status === 'running') p.status = 'done'
      answer.ms = Date.now() - started
      answer.model = builder.model ?? answer.model
      this.active.delete(folder.id)
      this.writing.delete(folder.id)
      try {
        folders.saveMessages(folder.id, messages)
        folders.update(folder.id, { updatedAt: new Date().toISOString(), seen: false })
      } catch (err) {
        // Locked meanwhile: the answer is lost with the session, never written in clear.
        log.warn('Could not save the answer of', folder.id, (err as Error).message)
      }
      this.emit('folder', { folder: w.folder, messages, running: false })
      log.info(`Turn ${folder.id} ${answer.status} in ${answer.ms}ms (${engine}/${answer.model})`)
    }
  }
}

export const chat = new Chat()
