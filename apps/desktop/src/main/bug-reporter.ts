import { randomUUID } from 'node:crypto'
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { arch, homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import type { BugReport, BugReportRequest } from '../shared/bug-report'
import { ENGINE_LABELS } from '../shared/config'
import { ANALYSIS_PROMPT, analysisMessage, conversationCourse, diagnosticsText, logTail, parseAnalysis, scrub, titleFrom, type Machine } from './bug-report'
import { cards } from './cards'
import { configStore } from './config'
import { engineStatus, runTurn } from './engines'
import { folders } from './folders'
import { log } from './log'
import { paths } from './paths'
import { profile } from './profile/store'
import { session } from './session'

/**
 * « signaler un bug », run: the facts gathered and scrubbed, then the user's engine asked for the
 * report, with no tool and no web, in a session nobody resumes. It sees what the report will hold
 * and nothing more; its answer is scrubbed again. Nothing leaves the app here: the window opens the
 * report on GitHub, where the user reads it before publishing it.
 */

const ANALYSIS_MINUTES = 4
/** The log's end is what matters: no need to read 5 MB for 60 lines. */
const LOG_BYTES = 64 * 1024

let current: AbortController | null = null

function machine(): Machine {
  let user = ''
  try {
    user = userInfo().username
  } catch {
    // No account name on this system: only the home folder is scrubbed.
  }
  return { home: homedir(), user }
}

/** The system as GitHub's form asks it: its name, version and processor. */
function systemLine(): string {
  const version = process.getSystemVersion?.() ?? ''
  if (process.platform === 'darwin') return `macOS ${version} (${arch() === 'arm64' ? 'Apple silicon' : 'Intel'})`
  if (process.platform === 'win32') return `Windows ${version} (${arch()})`
  return `Linux ${version} (${arch()})`
}

function readLogEnd(): string {
  let fd: number | null = null
  try {
    fd = openSync(join(paths.logs, 'marianne.log'), 'r')
    const size = fstatSync(fd).size
    const length = Math.min(size, LOG_BYTES)
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, size - length)
    // The first line may start mid-way: dropped.
    const text = buffer.toString('utf8')
    return size > length ? text.slice(text.indexOf('\n') + 1) : text
  } catch {
    return ''
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

async function diagnostics(req: BugReportRequest): Promise<string> {
  const cfg = configStore.get()
  const id = cfg.engines.default
  const status = await engineStatus(id).catch(() => null)
  const others = (Object.keys(ENGINE_LABELS) as (keyof typeof ENGINE_LABELS)[]).filter((e) => e !== id && cfg.engines[e].enabled).map((e) => ENGINE_LABELS[e])
  // The engine's account (an email) is left out: only whether it was found and signed in.
  const engine = [
    `${ENGINE_LABELS[id]}${cfg.engines[id].enabled ? '' : ' (off)'}`,
    status
      ? `${status.found ? `found${status.version ? `, ${status.version}` : ''}` : 'not found'}${status.loggedIn === false ? ', signed out' : ''}`
      : 'status unknown',
    `model ${cfg.engines[id].model.trim() || 'default'}, effort ${cfg.engines[id].effort}`,
    others.length ? `also on: ${others.join(', ')}` : ''
  ]
  let conversation: string | null = null
  const folder = req.folderId && session.unlocked ? folders.get(req.folderId) : null
  if (folder) {
    const about = [folder.procedure && `procedure ${folder.procedure}`, folder.domain && `domain ${folder.domain}`].filter(Boolean).join(', ')
    conversation = `${about ? `${about}; ` : ''}${conversationCourse(folders.messages(folder.id))}`
  }
  return diagnosticsText({
    app: `Marianne ${app.getVersion()}${app.isPackaged ? '' : ' (development run)'}, Electron ${process.versions.electron}, Chromium ${process.versions.chrome}`,
    system: `${systemLine()}, language ${app.getLocale()}`,
    engine: engine.filter(Boolean).join('; '),
    settings: `web access ${cfg.web}`,
    screen: String(req.screen ?? '').slice(0, 120) || 'unknown',
    errors: (Array.isArray(req.errors) ? req.errors : []).slice(-10).map((e) => String(e).slice(0, 600)),
    conversation,
    log: logTail(readLogEnd())
  })
}

/** The report of what the user saw, analyzed by their engine if they asked and it is ready. */
export async function prepareBugReport(req: BugReportRequest): Promise<BugReport> {
  const tokens = session.unlocked ? profile.tokens() : []
  const numbers = cards.numbers()
  const who = machine()
  const clean = (text: string) => scrub(text, tokens, who, numbers)
  const words = clean(String(req.description ?? '').slice(0, 4000)).trim()
  const cfg = configStore.get().engines
  const id = cfg.default
  const base: BugReport = {
    title: titleFrom(words),
    what: words,
    steps: '',
    analysis: '',
    version: app.getVersion(),
    system: systemLine(),
    engine: cfg[id].enabled ? ENGINE_LABELS[id] : 'none',
    diagnostics: clean(await diagnostics(req)),
    analyzedBy: null
  }
  if (!req.analyze) return base
  const status = await engineStatus(id).catch(() => null)
  if (!cfg[id].enabled || !status?.found || status.loggedIn === false)
    return { ...base, problem: `${ENGINE_LABELS[id]} n’est pas prêt (Réglages › Moteurs) : le rapport est fait sans analyse.` }

  current?.abort()
  const controller = new AbortController()
  current = controller
  const parts = new Map<string, string>()
  let error: string | undefined
  try {
    await runTurn(id, {
      // A folder of its own that no list shows: a scratch folder, wiped at the next lock like the others.
      folderId: `bug-report-${randomUUID()}`,
      message: analysisMessage(words, base.diagnostics),
      system: ANALYSIS_PROMPT,
      resume: false,
      unattended: true,
      tools: 'none',
      web: 'off',
      signal: controller.signal,
      timeoutMs: ANALYSIS_MINUTES * 60_000,
      waitedMs: () => 0,
      onEvent: (e) => {
        if (e.type === 'text-delta') parts.set(e.key, (parts.get(e.key) ?? '') + e.delta)
        else if (e.type === 'text') parts.set(e.key, e.text)
        else if (e.type === 'done' && e.error) error = e.error
      }
    })
  } catch (err) {
    error = (err as Error).message
  } finally {
    if (current === controller) current = null
  }
  if (controller.signal.aborted) return { ...base, problem: 'Analyse arrêtée : le rapport est fait sans elle.' }
  const answer = [...parts.values()].join('\n').trim()
  if (!answer) {
    log.warn('Bug report: no analysis from', id, error ?? '')
    return { ...base, problem: `Analyse impossible${error ? ` : ${error}` : ''}. Le rapport est fait sans elle.` }
  }
  const found = parseAnalysis(answer)
  return {
    ...base,
    title: clean(found.title) || base.title,
    steps: clean(found.steps),
    analysis: clean(found.analysis),
    analyzedBy: ENGINE_LABELS[id]
  }
}

/** « arrêter », or the session locking: the analysis under way stops, and the report comes without it. */
export function cancelBugReport(): void {
  current?.abort()
}
