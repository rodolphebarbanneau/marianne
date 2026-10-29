import { EventEmitter } from 'node:events'
import type { Archive } from './archive'

/**
 * The open account. Everything personal goes through `session.archive`, which throws once
 * locked: locking drops the data key and closes the file, and listeners (the engines' scratch
 * folders, the built-in browser's session, the stores' caches) clean up after it. The app holds
 * one session for its process (apps/desktop/src/main/session.ts).
 */

export class LockedError extends Error {
  constructor() {
    super('La session est verrouillée.')
  }
}

export type LockReason = 'user' | 'idle' | 'system' | 'quit' | 'switch'

export class Session extends EventEmitter {
  private current: Archive | null = null
  private idleTimer: NodeJS.Timeout | null = null
  private idleMinutes = 15

  get unlocked(): boolean {
    return this.current !== null
  }

  get archive(): Archive {
    if (!this.current) throw new LockedError()
    return this.current
  }

  /** The open archive, or null: for code that may run while locked. */
  get maybe(): Archive | null {
    return this.current
  }

  open(archive: Archive): void {
    if (this.current) this.lock('switch')
    this.current = archive
    this.touch()
    this.emit('unlocked', archive)
  }

  lock(reason: LockReason = 'user'): void {
    if (!this.current) return
    const archive = this.current
    this.current = null
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    this.emit('locked', reason)
    archive.close()
  }

  /** The user did something: postpone the automatic lock. */
  touch(): void {
    if (!this.current) return
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = this.idleMinutes > 0 ? setTimeout(() => this.lock('idle'), this.idleMinutes * 60_000) : null
    this.idleTimer?.unref?.()
  }

  /** 0 = never. */
  setIdleMinutes(minutes: number): void {
    this.idleMinutes = minutes
    this.touch()
  }
}
