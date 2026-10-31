/**
 * The window's last errors, for « signaler un bug »: kept in memory only, never written to disk (an
 * error's message may quote what was on screen), and gone when the window reloads. The report
 * scrubs them before anyone sees them, the engine included.
 */

const KEPT = 10
const errors: string[] = []

/** An error's message and where it was thrown: the first lines of its stack. */
export function describeError(error: unknown, fallback = ''): string {
  if (error instanceof Error) {
    const at = (error.stack ?? '')
      .split('\n')
      .slice(1, 4)
      .map((l) => l.trim())
      .filter(Boolean)
    return [`${error.name}: ${error.message}`, ...at].join(' | ')
  }
  return String(error ?? fallback)
}

/** Keep an error: those of the window, and those a part of it caught (components/ui.tsx Boundary). */
export function noteError(line: string): void {
  errors.push(`${new Date().toISOString()} ${line}`)
  if (errors.length > KEPT) errors.shift()
}

/** Listen to the window's uncaught errors and rejected promises. */
export function watchErrors(): void {
  window.addEventListener('error', (e) => noteError(describeError(e.error, `${e.message} (${e.filename}:${e.lineno})`)))
  window.addEventListener('unhandledrejection', (e) => noteError(`unhandled rejection: ${describeError(e.reason)}`))
}

/** The errors kept, the oldest first. */
export const recentErrors = (): string[] => [...errors]
