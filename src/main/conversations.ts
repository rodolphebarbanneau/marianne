import { EventEmitter } from 'node:events'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Conversation, ConversationSummary } from '../shared/types'
import { readSealed, writeSealed } from './crypto'
import { log } from './log'
import { paths } from './paths'

/**
 * Conversations, one encrypted file each in ~/.marianne/conversations: they hold pages of the
 * user's accounts and their own words, like the personal file.
 */

const file = (id: string) => join(paths.conversations, `${id}.enc`)
const safeId = (id: string) => /^[\w-]+$/.test(id)

/** One line of plain text from Markdown, for the conversation list. */
export function plainLine(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function preview(c: Conversation): string {
  for (const m of [...c.messages].reverse()) {
    const text = m.parts.find((p) => p.type === 'text')
    if (text && text.type === 'text' && text.text.trim()) return plainLine(text.text).slice(0, 140)
  }
  return ''
}

class Conversations extends EventEmitter {
  private cache = new Map<string, Conversation>()
  private loaded = false
  /** Deleted while an answer was being written: the end of the turn must not bring it back. */
  private deleted = new Set<string>()
  /** Whether a turn is running, per conversation (set by the chat runner). */
  isRunning: (id: string) => boolean = () => false

  private async loadAll(): Promise<void> {
    if (this.loaded) return
    for (const name of await readdir(paths.conversations).catch(() => [] as string[])) {
      const path = join(paths.conversations, name)
      try {
        if (name.endsWith('.enc')) {
          const c = JSON.parse(readSealed(path).toString('utf8')) as Conversation
          this.cache.set(c.id, c)
        } else if (name.endsWith('.json')) {
          // Written before conversations were encrypted: encrypt it now.
          const c = JSON.parse(await readFile(path, 'utf8')) as Conversation
          writeSealed(file(c.id), JSON.stringify(c))
          await rm(path, { force: true })
          this.cache.set(c.id, c)
        }
      } catch (err) {
        log.warn('Unreadable conversation', name, (err as Error).message)
      }
    }
    this.loaded = true
  }

  async list(): Promise<ConversationSummary[]> {
    await this.loadAll()
    return [...this.cache.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, preview: preview(c), running: this.isRunning(c.id) }))
  }

  async get(id: string): Promise<Conversation | null> {
    await this.loadAll()
    return this.cache.get(id) ?? null
  }

  /** Keep in memory and write to disk, encrypted (atomically). */
  async save(c: Conversation): Promise<void> {
    if (!safeId(c.id)) throw new Error('Invalid conversation id')
    if (this.deleted.has(c.id)) return
    this.cache.set(c.id, c)
    writeSealed(file(c.id), JSON.stringify(c))
    this.emit('changed')
  }

  async rename(id: string, title: string): Promise<void> {
    const c = await this.get(id)
    if (!c || !title.trim()) return
    // The cached object itself: a turn being written saves it again at its end.
    c.title = title.trim().slice(0, 120)
    await this.save(c)
  }

  /** Forget the cache (a backup was restored). */
  reload(): void {
    this.cache.clear()
    this.loaded = false
    this.emit('changed')
  }

  /** Delete a conversation and the files attached to it. */
  async delete(id: string): Promise<void> {
    const c = await this.get(id)
    if (!c || !safeId(id)) return
    const dirs = new Set(c.messages.flatMap((m) => m.parts.flatMap((p) => (p.type === 'file' ? [p.path.split('/').slice(0, 2).join('/')] : []))))
    for (const dir of dirs) if (/^files\/[\w-]+$/.test(dir)) await rm(join(paths.workspace, dir), { recursive: true, force: true })
    this.cache.delete(id)
    this.deleted.add(id)
    await rm(file(id), { force: true })
    this.emit('changed')
  }
}

export const conversations = new Conversations()
