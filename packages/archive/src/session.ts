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

/** What opened the archive: some acts are allowed only after one of them (a new password after the recovery key). */
export type UnlockedWith = 'password' | 'recovery' | 'pin' | 'created'

export class Session extends EventEmitter {
  private current: Archive | null = null
  private via: UnlockedWith | null = null
  private idleTimer: NodeJS.Timeout | null = null
  private idleMinutes = 15

  get unlocked(): boolean {
    return this.current !== null
  }

  /** How the open archive was unlocked; null while locked. */
  get unlockedWith(): UnlockedWith | null {
    return this.via
  }

  get archive(): Archive {
    if (!this.current) throw new LockedError()
    return this.current
  }

  /** The open archive, or null: for code that may run while locked. */
  get maybe(): Archive | null {
    return this.current
  }

  open(archive: Archive, via: UnlockedWith = 'password'): void {
    if (this.current) {
      try {
        this.lock('switch')
      } catch (err) {
        // The previous one is closed, but not cleaned up after: this one isn't opened over it, nor left open.
        archive.close()
        throw err
      }
    }
    this.current = archive
    this.via = via
    this.touch()
    this.emit('unlocked', archive)
  }

  /** The recovery key did what it opened the session for: from now on, it counts as opened by the new password. */
  passwordReset(): void {
    if (this.via === 'recovery') this.via = 'password'
  }

  /**
   * Drop the data key and close the file, whatever the listeners do: each is called on its own, so
   * one that throws neither stops the others nor leaves the key in memory and the file locked. Their
   * errors come out afterwards.
   */
  lock(reason: LockReason = 'user'): void {
    if (!this.current) return
    const archive = this.current
    this.current = null
    this.via = null
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    const errors: unknown[] = []
    try {
      // The raw listeners, so that a `once` one is removed as `emit` would.
      for (const listener of this.rawListeners('locked')) {
        try {
          ;(listener as (reason: LockReason) => void).call(this, reason)
        } catch (err) {
          errors.push(err)
        }
      }
    } finally {
      archive.close()
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length) throw new AggregateError(errors, 'Several listeners failed while locking.')
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
