import type { MarianneApi, TokenValue } from '@shared/api'
import type { SessionState } from '@shared/types'

/** What the store needs of window.marianne. */
export type TokenSource = Pick<MarianneApi, 'getSession' | 'onSession' | 'onProfile' | 'tokenValues'>

/**
 * The open account's values by token, which show the engine's [[tokens]] as the user's own values:
 * one copy for the whole window, loaded when first needed and again when the profile changes.
 *
 * The window outlives its accounts: locking reloads nothing, and the next account may open in the
 * same window. So the values are the open account's only: a lock empties them at once (nothing of
 * the account stays in memory while it is locked), another account loads its own, and a load asked
 * for before the change is dropped when it answers.
 */
export class TokenStore {
  private values: TokenValue[] = []
  /** The account whose values these are; null while locked, undefined until the session is known. */
  private account: string | null | undefined = undefined
  /** Bumped at each change of account: what was asked for the previous one is not taken. */
  private generation = 0
  private started = false
  private readonly listeners = new Set<() => void>()

  constructor(private readonly source: TokenSource) {}

  /** For useSyncExternalStore: the same array until the values change. */
  get = (): TokenValue[] => this.values

  /** For useSyncExternalStore: the session and the profile are heard from the first listener on. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (!this.started) {
      this.started = true
      this.source.onSession((s) => this.session(s))
      this.source.onProfile(() => this.load())
      void this.source.getSession().then(
        (s) => this.session(s),
        () => undefined
      )
    }
    return () => void this.listeners.delete(listener)
  }

  private session(s: SessionState): void {
    const account = s.unlocked ? (s.account?.id ?? null) : null
    if (account === this.account) return
    this.account = account
    this.generation++
    this.set([])
    if (account) this.load()
  }

  private load(): void {
    if (!this.account) return
    const generation = this.generation
    this.source.tokenValues().then(
      (values) => generation === this.generation && this.set(values),
      // Locked meanwhile: the session's event empties them.
      () => undefined
    )
  }

  private set(values: TokenValue[]): void {
    if (!values.length && !this.values.length) return
    this.values = values
    for (const listener of this.listeners) listener()
  }
}
