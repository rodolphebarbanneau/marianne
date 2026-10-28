import type { MarianneApi } from '../shared/api'

declare global {
  interface Window {
    marianne: MarianneApi
  }
}

export {}
