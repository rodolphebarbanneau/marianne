import { useSyncExternalStore } from 'react'
import type { TokenValue } from '@shared/api'
import { api } from './api'
import { TokenStore } from './token-store'

const store = new TokenStore(api)

/** The open account's values by token, to show the engine's [[tokens]] as the user's own values; none while locked. */
export function useTokens(): TokenValue[] {
  return useSyncExternalStore(store.subscribe, store.get)
}
