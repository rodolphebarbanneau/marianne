import { useEffect, useState } from 'react'

export const api = window.marianne
export const isMac = api.platform === 'darwin'

/** A value from the main process, kept up to date by its event. */
export function useLive<T>(load: () => Promise<T>, subscribe: (cb: (value: T) => void) => () => void, deps: unknown[] = []): T | null {
  const [value, setValue] = useState<T | null>(null)
  useEffect(() => {
    let alive = true
    void load().then((v) => alive && setValue(v))
    const off = subscribe((v) => alive && setValue(v))
    return () => {
      alive = false
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}

export { errorText } from '@marianne/sdk/view'
