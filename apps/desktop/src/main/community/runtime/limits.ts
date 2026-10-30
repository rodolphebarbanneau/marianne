/**
 * The bounds a community service is held to, whatever its code does: how often it may ask (its
 * calls, its logs, its screen's messages), how much an answer may weigh, how much it may keep.
 */

/** A token bucket: `perSecond` on average, `burst` at once. */
export class RateLimit {
  private tokens: number
  private at = -1

  constructor(
    private readonly perSecond: number,
    private readonly burst: number
  ) {
    this.tokens = burst
  }

  /** Whether one more may go now. */
  take(now: number): boolean {
    if (this.at >= 0) this.tokens = Math.min(this.burst, this.tokens + ((now - this.at) / 1000) * this.perSecond)
    this.at = now
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }
}

/** The largest answer, as JSON, a sandbox may give for each kind of request. */
export const MAX_REPLY_BYTES = { tool: 256 * 1024, tile: 64 * 1024, other: 1024 * 1024 } as const

/** What a community service may keep for the user: its records, and their total size as JSON. */
export const STORAGE_QUOTA = { records: 1000, bytes: 16 * 1024 * 1024 } as const

const code = (n: number) => String.fromCharCode(n)
/** Control characters and the line separators: a log line holds none. */
const CONTROL = new RegExp(`[${code(0)}-${code(0x1f)}${code(0x7f)}${code(0x2028)}${code(0x2029)}]+`, 'g')

/** A line of a service's log: one line, without control characters, within a length. */
export const logLine = (text: string, max = 2000) => text.replace(CONTROL, ' ').slice(0, max)
