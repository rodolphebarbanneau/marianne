/**
 * Whether a dialog's overlay (`.overlay`, whoever draws it: the settings, a dialog of the app or of
 * a service) is on screen. What the page can't cover follows it: the system's window buttons dim
 * with the title bar, and the browser panel, a native view drawn above the page, steps aside.
 */

let open = false
let observer: MutationObserver | null = null
const listeners = new Set<() => void>()

const check = () => {
  const now = !!document.querySelector('.overlay')
  if (now === open) return
  open = now
  for (const listener of listeners) listener()
}

export const overlay = {
  get: (): boolean => open,
  /** For useSyncExternalStore: the page is watched while someone listens. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    if (!observer) {
      observer = new MutationObserver(check)
      observer.observe(document.body, { childList: true, subtree: true })
      check()
    }
    return () => {
      listeners.delete(listener)
      if (listeners.size) return
      observer?.disconnect()
      observer = null
    }
  }
}
