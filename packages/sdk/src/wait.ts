/**
 * What a screen is still waiting for. All a view loads through the SDK says so here (a `useCall`, a
 * `useStored`, a `Loading` on the screen), so that `LoadingGate` can hold the screen back until it
 * has all come, rather than show it in pieces.
 */

/** Nothing waited for, this long: what just came may start more (its children's calls). */
export const QUIET_MS = 60
/** Past this, the screen shows, its parts still waiting saying so: a site that doesn't answer doesn't hold a whole page. */
export const LONGEST_WAIT_MS = 10_000

/** Once what was just rendered is on the screen and its effects have run. */
const painted = (then: () => void) => requestAnimationFrame(() => requestAnimationFrame(then))

export class Waits {
  private readonly open = new Map<symbol, string | undefined>()
  private done: (() => void) | null = null
  private quiet: ReturnType<typeof setTimeout> | undefined
  private longest: ReturnType<typeof setTimeout> | undefined
  /** Changes whenever a quiet moment stops counting: a check already on its way then does nothing. */
  private round = 0

  constructor(
    /** What a `Loading` among those waited for says is coming. */
    private readonly said: (what: string) => void = () => {},
    private readonly afterPaint: (then: () => void) => void = painted
  ) {}

  /** One thing more to wait for, saying what if it can. The function it gives says it came, once. */
  hold(what?: string): () => void {
    const id = Symbol()
    this.open.set(id, what)
    this.moved()
    return () => {
      if (this.open.delete(id)) this.moved()
    }
  }

  /** `done`, once: at once if nothing is waited for, else when nothing has been for a moment, or at the longest. Gives a way to stop. */
  watch(done: () => void): () => void {
    this.done = done
    this.longest = setTimeout(() => this.finish(), LONGEST_WAIT_MS)
    if (this.open.size === 0) this.finish()
    return () => this.stop()
  }

  private moved(): void {
    const what = [...this.open.values()].find(Boolean)
    if (what) this.said(what)
    if (!this.done) return
    clearTimeout(this.quiet)
    const round = ++this.round
    if (this.open.size > 0) return
    this.quiet = setTimeout(() => this.afterPaint(() => round === this.round && this.finish()), QUIET_MS)
  }

  private finish(): void {
    const done = this.done
    this.stop()
    done?.()
  }

  private stop(): void {
    this.done = null
    this.round++
    clearTimeout(this.quiet)
    clearTimeout(this.longest)
  }
}
