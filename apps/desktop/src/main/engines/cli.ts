import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { log } from '../log'
import { paths } from '../paths'
import { isMac, isWin, run, shellEnv, which, type RunResult } from '../util'
import { failed, type EngineEvent, type EngineStream } from './events'
import type { EngineTurn } from './types'

/**
 * Helpers shared by the engines. Marianne always runs the user's own, unmodified CLI with their
 * own login, and never reads or stores their credentials.
 */

const resolved = new Map<string, string | null>()

/** The CLI on PATH, else at its usual install locations. */
export function findCli(name: string, candidates: string[], refresh = false): string | null {
  if (!refresh && resolved.has(name)) return resolved.get(name)!
  const found = which(name) ?? candidates.find((c) => existsSync(c)) ?? null
  resolved.set(name, found)
  return found
}

/** `~/x` → the user's home + x. */
export function expandHome(path: string): string {
  return path === '~' || path.startsWith('~/') || path.startsWith('~\\') ? join(homedir(), path.slice(1)) : path
}

/**
 * Write a file once per content hash and return its path (system prompts, MCP config). They
 * live with the scratch folders, wiped on lock and at start.
 */
export async function contentFile(prefix: string, content: string, ext = 'txt'): Promise<string> {
  const dir = join(paths.work, '.files')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${prefix}-${createHash('sha1').update(content).digest('hex').slice(0, 12)}.${ext}`)
  if (!existsSync(file)) await writeFile(file, content, { encoding: 'utf8', mode: 0o600 })
  return file
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

/**
 * Open a terminal running `<cli> <args>`, so sign-in happens in the vendor's own flow. `env`:
 * the configuration folder's variable, so the login lands where Marianne will look.
 */
export async function openInTerminal(cli: string, args: string[], title: string, env: Record<string, string> = {}): Promise<void> {
  const fullEnv = { ...shellEnv(), ...env }
  const line = [`"${cli}"`, ...args].join(' ')
  if (isWin) {
    // `start` hands the new console our environment.
    spawn('cmd.exe', ['/d', '/s', '/c', `"start "${title}" cmd.exe /k "${line}""`], {
      env: fullEnv,
      windowsVerbatimArguments: true,
      detached: true,
      stdio: 'ignore'
    }).unref()
    return
  }
  if (isMac) {
    // Terminal.app doesn't inherit our environment: set the variables on the command line.
    const command = Object.entries(env)
      .map(([k, v]) => `${k}=${shellQuote(v)} `)
      .join('')
      .concat(line)
    const script = `tell application "Terminal" to do script "${command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"\ntell application "Terminal" to activate`
    await run('osascript', ['-e', script])
    return
  }
  const plain = [cli, ...args].join(' ')
  const terminals: Array<[string, string[]]> = [
    ['x-terminal-emulator', ['-e', plain]],
    ['gnome-terminal', ['--', cli, ...args]],
    ['konsole', ['-e', cli, ...args]],
    ['xfce4-terminal', ['-e', plain]],
    ['kitty', [cli, ...args]],
    ['alacritty', ['-e', cli, ...args]],
    ['xterm', ['-e', plain]]
  ]
  const found = terminals.find(([t]) => which(t))
  if (!found) throw new Error(`Aucun terminal trouvé. Lancez « ${plain} » dans un terminal.`)
  void run(found[0], found[1], { env: fullEnv }).catch(() => undefined)
}

/**
 * A turn's time limit, which the time spent waiting for the user's answer on cards extends, as
 * run() (util) does for the engines it starts itself. `clear` once the turn is over.
 */
export function deadline(ms: number, waitedMs: () => number, onExpire: () => void): { clear(): void } {
  let granted = 0
  let timer: NodeJS.Timeout | null = null
  const arm = (delay: number) => {
    timer = setTimeout(() => {
      const waited = waitedMs()
      if (waited > granted) {
        const more = waited - granted
        granted = waited
        return arm(Math.max(more, 5_000))
      }
      onExpire()
    }, delay)
  }
  if (ms) arm(ms)
  return { clear: () => timer && clearTimeout(timer) }
}

/** Short, single-line error detail from a CLI's output. */
export function errorDetail(...outputs: string[]): string {
  const text = outputs.find((o) => o.trim()) ?? ''
  return text.trim().split('\n').slice(-6).join(' ').slice(0, 400)
}

/**
 * Run one turn: the message on stdin, stdout parsed line by line into events. When the output
 * didn't end the turn itself, the failure is reported from stderr, in French.
 */
export async function runStream(label: string, args: string[], t: EngineTurn, stream: EngineStream): Promise<void> {
  let done = false
  const emit = (events: EngineEvent[]) => {
    for (const e of events) {
      if (e.type === 'done') done = true
      t.onEvent(e)
    }
  }
  let r: RunResult
  try {
    r = await run(t.cli, args, {
      input: t.message,
      cwd: t.cwd,
      env: t.env,
      timeoutMs: t.timeoutMs,
      waitedMs: t.waitedMs,
      signal: t.signal,
      onLine: (line) => emit(stream.push(line))
    })
  } catch (err) {
    if (t.signal.aborted) throw err
    const message = (err as Error).message
    log.warn(`${label} failed:`, message)
    emit([{ type: 'done', error: /timed out/.test(message) ? `${label} n’a pas terminé dans le temps imparti.` : `${label} n’a pas pu démarrer : ${message}` }])
    return
  }
  if (!done) emit(stream.end?.(r.code) ?? [])
  if (!done) {
    const detail = errorDetail(r.stderr) || `code de sortie ${r.code}`
    log.warn(`${label} failed:`, detail)
    emit([failed(label, detail)])
  }
}
