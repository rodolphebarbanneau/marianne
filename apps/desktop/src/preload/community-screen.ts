import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { FromFrame, ScreenBridge } from '../shared/community'
import { SCREEN_CHANNELS, SCREEN_LIMITS } from '../shared/screen-channels'

/**
 * A community service's screen: `window.__marianneScreen`, the narrow bridge its page gets (and
 * nothing else of Electron, Node or Marianne). Its messages go to the main process, which checks
 * each one comes from this screen and answers or hands it on (main/community/runtime/screen.ts).
 * The page is the service's code; this preload's world is out of its reach: here a message becomes
 * JSON text within SCREEN_LIMITS, so often, or doesn't cross at all.
 */

let listening = false
let tokens: number = SCREEN_LIMITS.burst
let at = Date.now()

const bridge: ScreenBridge = {
  post: (message: FromFrame) => {
    const now = Date.now()
    tokens = Math.min(SCREEN_LIMITS.burst, tokens + ((now - at) / 1000) * SCREEN_LIMITS.perSecond)
    at = now
    if (tokens < 1) return
    tokens -= 1
    let json: string | undefined
    try {
      json = JSON.stringify(message)
    } catch {
      return
    }
    if (typeof json === 'string' && json.length <= SCREEN_LIMITS.chars) ipcRenderer.send(SCREEN_CHANNELS.post, json)
  },
  // The runtime listens first, before the service's view runs: one listener, never a second.
  onMessage: (listener: (message: unknown) => void) => {
    if (listening) return
    listening = true
    ipcRenderer.on(SCREEN_CHANNELS.message, (_e: IpcRendererEvent, message: unknown) => listener(message))
  }
}

contextBridge.exposeInMainWorld('__marianneScreen', bridge)

// No print dialog from a service's screen (it would hang the screen, and may not be Marianne's to show).
contextBridge.executeInMainWorld({
  func: () => Object.defineProperty(globalThis, 'print', { value: () => undefined, writable: false, configurable: false })
})
