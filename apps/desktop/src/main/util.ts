import { execFile, spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

export const isWin = process.platform === 'win32'
export const isMac = process.platform === 'darwin'
export const isLinux = process.platform === 'linux'

export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

interface RunOptions {
  timeoutMs?: number
  /** Time spent waiting for the user so far: added to the time limit. */
  waitedMs?: () => number
  input?: string
  cwd?: string
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
}

function start(cmd: string, args: string[], opts: RunOptions): ChildProcess {
  const spawnOpts: SpawnOptions = { cwd: opts.cwd, env: opts.env ?? shellEnv(), windowsHide: true }
  // .cmd/.bat shims need a shell on Windows.
  const viaShell = isWin && /\.(cmd|bat)$/i.test(cmd)
  return viaShell ? spawn(`"${cmd}"`, args.map(quoteCmdArg), { ...spawnOpts, shell: true }) : spawn(cmd, args, spawnOpts)
}

/** How long a stopped process may take to go before its caller is told anyway. */
const STOP_WAIT_MS = 5_000

/**
 * Run a command to completion; never throws for non-zero exit (check `code`). With `onLine`,
 * stdout is delivered line by line as it arrives instead of being collected. Stopped (cancelled,
 * timed out), it rejects once the process is gone, or STOP_WAIT_MS after: until then it may still
 * be writing (an engine its transcript, in clear), and what the caller cleans up must stay clean.
 */
export function run(cmd: string, args: string[], opts: RunOptions & { onLine?: (line: string) => void } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = start(cmd, args, opts)
    let stdout = ''
    let stderr = ''
    let pending = ''
    let settled = false
    let stopped: Error | null = null
    let granted = 0
    const arm = (ms: number): NodeJS.Timeout =>
      setTimeout(() => {
        // Time spent waiting for the user's answer extends the limit.
        const waited = opts.waitedMs?.() ?? 0
        if (waited > granted) {
          const more = waited - granted
          granted = waited
          timer = arm(Math.max(more, 5_000))
          return
        }
        stop(new Error(`${cmd} timed out after ${Math.round(opts.timeoutMs! / 1000)}s`))
      }, ms)
    let timer = opts.timeoutMs ? arm(opts.timeoutMs) : null
    let cap: NodeJS.Timeout | null = null
    const onAbort = () => stop(new Error('Cancelled'))
    function stop(err: Error): void {
      if (settled || stopped) return
      stopped = err
      if (timer) clearTimeout(timer)
      kill(child)
      cap = setTimeout(() => finish(err), STOP_WAIT_MS)
    }
    if (opts.signal?.aborted) onAbort()
    else opts.signal?.addEventListener('abort', onAbort, { once: true })
    function finish(err: Error | null, result?: RunResult) {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (cap) clearTimeout(cap)
      opts.signal?.removeEventListener('abort', onAbort)
      if (err) reject(err)
      else resolve(result!)
    }
    child.stdout?.setEncoding('utf8').on('data', (d: string) => {
      // Stopped: what it still says is nobody's to read.
      if (stopped) return
      if (!opts.onLine) return void (stdout += d)
      pending += d
      let nl: number
      while ((nl = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, nl).replace(/\r$/, '')
        pending = pending.slice(nl + 1)
        if (line.trim()) opts.onLine(line)
      }
    })
    child.stderr?.setEncoding('utf8').on('data', (d: string) => (stderr = (stderr + d).slice(-20_000)))
    child.on('error', (err) => finish(stopped ?? err))
    child.on('close', (code) => {
      if (stopped) return finish(stopped)
      if (opts.onLine && pending.trim()) opts.onLine(pending)
      finish(null, { code, stdout, stderr })
    })
    if (opts.input !== undefined) child.stdin?.end(opts.input, 'utf8')
    else child.stdin?.end()
  })
}

/** Stop a child process and, on Windows, the processes it started (cmd shims spawn node). */
function kill(child: ChildProcess): void {
  if (isWin && child.pid) execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => undefined)
  else child.kill()
}

function quoteCmdArg(arg: string): string {
  if (arg === '') return '""'
  return /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg
}

let cachedEnv: NodeJS.ProcessEnv | null = null

/**
 * Environment for child processes. GUI apps on macOS/Linux don't inherit the login
 * shell PATH, so tools like `claude` installed under ~/.local/bin wouldn't be found.
 */
export function shellEnv(): NodeJS.ProcessEnv {
  return cachedEnv ?? process.env
}

export async function loadShellEnv(): Promise<void> {
  const env = { ...process.env }
  delete env.CLAUDECODE // allow spawning claude when Marianne itself was started from Claude Code
  delete env.ELECTRON_RUN_AS_NODE // set when started from another Electron app's terminal
  if (!isWin) {
    const shell = process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash')
    try {
      const out = await new Promise<string>((resolve, reject) =>
        execFile(shell, ['-ilc', 'printf "__MARIANNE_PATH__%s__" "$PATH"'], { timeout: 5000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)))
      )
      const m = out.match(/__MARIANNE_PATH__(.*)__/)
      if (m?.[1]) env.PATH = m[1]
    } catch {
      // keep the inherited PATH
    }
    const extra = ['/opt/homebrew/bin', '/usr/local/bin', join(process.env.HOME ?? '', '.local/bin')]
    const parts = (env.PATH ?? '').split(delimiter)
    for (const p of extra) if (p && !parts.includes(p)) parts.push(p)
    env.PATH = parts.join(delimiter)
  }
  cachedEnv = env
}

/** Find an executable on PATH (plus Windows PATHEXT handling). */
export function which(name: string): string | null {
  const env = shellEnv()
  const exts = isWin ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase()) : ['']
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      const candidate = join(dir, name + ext)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}
