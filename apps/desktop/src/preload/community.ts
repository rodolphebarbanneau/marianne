import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { BridgeReply, SandboxBridge, SandboxInvoke, SandboxReply } from '../shared/community'
import { SANDBOX_CHANNELS } from '../shared/sandbox-channels'

/**
 * A community service's sandbox: `window.__marianneService`, the narrow bridge its page gets
 * (and nothing else of Electron, Node or Marianne). It asks for the context's capabilities by
 * name, hears what the main process asks it to run, and answers. The main process checks every
 * message comes from this sandbox's main frame, and every argument (main/community/runtime/bridge.ts).
 */

let listening = false

const bridge: SandboxBridge = {
  // Only text crosses (the page made it, within its limits): the main process measures it before reading it.
  call: (name: string, args: string) => ipcRenderer.invoke(SANDBOX_CHANNELS.call, String(name), String(args)),
  callSync: (name: string, args: string) => ipcRenderer.sendSync(SANDBOX_CHANNELS.callSync, String(name), String(args)) as BridgeReply,
  // The runtime listens first, before the service's code runs: one listener, never a second.
  onInvoke: (listener: (message: SandboxInvoke) => void) => {
    if (listening) return
    listening = true
    ipcRenderer.on(SANDBOX_CHANNELS.invoke, (_e: IpcRendererEvent, message: SandboxInvoke) => listener(message))
  },
  reply: (id: number, reply: SandboxReply) => ipcRenderer.send(SANDBOX_CHANNELS.reply, id, reply),
  log: (level: 'info' | 'warn' | 'error', text: string) => ipcRenderer.send(SANDBOX_CHANNELS.log, level, String(text))
}

contextBridge.exposeInMainWorld('__marianneService', bridge)
