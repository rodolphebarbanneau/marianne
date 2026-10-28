import { useEffect, useState } from 'react'
import type { TokenValue } from '@shared/api'
import { api } from './api'

let cache: TokenValue[] = []
const listeners = new Set<(t: TokenValue[]) => void>()
let loaded = false

function refresh(): void {
  void api.tokenValues().then((t) => {
    cache = t
    for (const l of listeners) l(t)
  })
}

/** The profile's values by token, to show the engine's [[tokens]] as the user's own values. */
export function useTokens(): TokenValue[] {
  const [tokens, setTokens] = useState(cache)
  useEffect(() => {
    listeners.add(setTokens)
    if (!loaded) {
      loaded = true
      refresh()
      api.onProfile(() => refresh())
    }
    return () => void listeners.delete(setTokens)
  }, [])
  return tokens
}
