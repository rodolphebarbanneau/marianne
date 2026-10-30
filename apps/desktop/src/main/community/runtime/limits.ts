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

/** The most a community service's tool may be sent, as JSON: a request's few words, never a document or a conversation. */
export const MAX_TOOL_ARGUMENTS_BYTES = 1024

/** What a community service may keep for the user: its records, and their total size as JSON. */
export const STORAGE_QUOTA = { records: 1000, bytes: 16 * 1024 * 1024 } as const

const code = (n: number) => String.fromCharCode(n)
/** Control characters (C0, DEL, C1: NEL among them) and the line separators. */
const CONTROL_CHARS = `${code(0)}-${code(0x1f)}${code(0x7f)}-${code(0x9f)}${code(0x2028)}${code(0x2029)}`
const CONTROL = new RegExp(`[${CONTROL_CHARS}]+`, 'g')
// Apart, without the global flag: a global regex's test() remembers where it stopped.
const NOT_A_LINE = new RegExp(`[${CONTROL_CHARS}]`)

/**
 * A line of Marianne's log from what a service controls (its logs, its errors, its links): one
 * line, without control characters, within a length. It can't write lines of its own there.
 */
export const logLine = (text: string, max = 2000) => text.replace(CONTROL, ' ').slice(0, max)

/** Whether a service's text is one line, as a manifest's words are: no control character, no line break. */
export const isLine = (text: string) => !NOT_A_LINE.test(text)
