/**
 * What a screen's calls answered, while the screen is open (`useCall`): a tab the user comes back
 * to shows what it showed at once, and asks again behind it. One per screen (ServiceHostProvider),
 * gone with it: nothing of the user's outlives the screen, nor goes from one service to another.
 */
export class CallCache {
  private readonly answers = new Map<string, unknown>()

  constructor(private readonly max = 64) {}

  /** The last answer to this call, if the screen had one. */
  get(key: string): { value: unknown } | null {
    if (!this.answers.has(key)) return null
    const value = this.answers.get(key)
    // The last asked goes to the end: the first ones are those let go.
    this.answers.delete(key)
    this.answers.set(key, value)
    return { value }
  }

  set(key: string, value: unknown): void {
    this.answers.delete(key)
    while (this.answers.size >= this.max) this.answers.delete(this.answers.keys().next().value!)
    this.answers.set(key, value)
  }

  get size(): number {
    return this.answers.size
  }
}

/** A call's key: its method and arguments, as `useCall` sends them. */
export const callKey = (method: string, args: string) => `${method} ${args}`
