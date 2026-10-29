import { join } from 'node:path'
import type { UtilityProcess } from 'electron'
import { shellEnv, type RunResult } from './util'

/**
 * Short commands run off the main process, by a utility process of its own (main/runner.ts). On
 * Windows, starting a process blocks its caller for a moment (a .cmd shim goes through cmd.exe):
 * checking the assistants starts six of them, and froze the whole app for seconds after unlocking.
 */

interface AsideOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  input?: string
}

let runner: UtilityProcess | null = null
const calls = new Map<number, { resolve: (result: RunResult) => void; reject: (err: Error) => void }>()
let last = 0

function start(): UtilityProcess {
  // Lazy: tests import the engines without Electron.
  const { utilityProcess } = require('electron') as typeof import('electron')
  const child = utilityProcess.fork(join(__dirname, 'runner.js'), [], { serviceName: 'Marianne · commandes', stdio: 'inherit' })
  child.on('message', ({ id, result, error }: { id: number; result?: RunResult; error?: string }) => {
    const call = calls.get(id)
    calls.delete(id)
    if (error === undefined) call?.resolve(result!)
    else call?.reject(new Error(error))
  })
  child.on('exit', () => {
    runner = null
    for (const call of calls.values()) call.reject(new Error('Commande interrompue'))
    calls.clear()
  })
  return child
}

/** `run` from the runner process: to completion, without streaming or cancelling. */
export function runAside(cmd: string, args: string[], opts: AsideOptions = {}): Promise<RunResult> {
  runner ??= start()
  const id = ++last
  return new Promise((resolve, reject) => {
    calls.set(id, { resolve, reject })
    runner!.postMessage({ id, cmd, args, opts: { ...opts, env: opts.env ?? shellEnv() } })
  })
}
