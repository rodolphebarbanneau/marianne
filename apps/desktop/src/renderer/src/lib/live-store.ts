/**
 * A value of the main process's, kept up to date by its event, with one copy for the whole window:
 * its event is heard once, from the first listener on, however many components show it. Each one
 * subscribing on its own went past Electron's ten listeners in a conversation, where every tool line
 * names its service. Loaded at the first listener, and again at each change it is told to reload on
 * (the session: the window outlives its accounts); an answer asked for before the last event or load
 * is dropped.
 */
export class LiveStore<T> {
  private value: T | null = null
  private started = false
  /** Bumped at each event and each load asked for: an older answer is not taken. */
  private version = 0
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly load: () => Promise<T>,
    private readonly listen: (cb: (value: T) => void) => () => void,
    private readonly reloadOn: Array<(cb: () => void) => () => void> = []
  ) {}

  /** For useSyncExternalStore: the same value until it changes; null until the first answer. */
  get = (): T | null => this.value

  /** For useSyncExternalStore. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (!this.started) {
      this.started = true
      this.listen((value) => {
        this.version++
        this.set(value)
      })
      for (const on of this.reloadOn) on(() => this.reload())
      this.reload()
    }
    return () => void this.listeners.delete(listener)
  }

  private reload(): void {
    const asked = ++this.version
    this.load().then(
      (value) => asked === this.version && this.set(value),
      () => undefined
    )
  }

  private set(value: T): void {
    this.value = value
    for (const listener of this.listeners) listener()
  }
}
