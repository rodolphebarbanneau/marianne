import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import type { EngineId } from '../../shared/types'
import { session } from '../archive/session'
import { log } from '../log'
import type { TranscriptFiles } from './types'

/**
 * The CLIs keep a plaintext copy of each session in their configuration folder. After each turn
 * Marianne moves it into the account archive, sealed like everything else, and deletes it from
 * disk; it goes back just before the session is resumed. A conversation is on disk in clear only
 * while an engine works on it.
 */

export interface TranscriptMeta {
  engine: EngineId
  sessionId: string
  files: string[]
}

const ENGINES: EngineId[] = ['claude', 'codex', 'vibe']

export const transcriptId = (folderId: string, engine: EngineId) => `transcript:${folderId}:${engine}`

/** Session ids become file names: nothing that could climb out of the folder. */
const plainId = (id: string) => /^[\w-]+$/.test(id)
const safePath = (rel: string) => !!rel && !/^([a-z]:|[\\/])/i.test(rel) && !rel.split(/[\\/]/).includes('..')

/** Files under `root/dir` (all of `root` when empty), relative to `root`, with forward slashes. */
export function filesUnder(root: string, dir = ''): string[] {
  let entries
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap((e) => {
    const rel = dir ? `${dir}/${e.name}` : e.name
    return e.isDirectory() ? filesUnder(root, rel) : e.isFile() ? [rel] : []
  })
}

/** The first file `match` accepts, newest names first (dated folders and files). */
function newest(root: string, dir: string, match: (name: string) => boolean): string | null {
  let entries
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true })
  } catch {
    return null
  }
  for (const e of entries.sort((a, b) => b.name.localeCompare(a.name))) {
    const rel = dir ? `${dir}/${e.name}` : e.name
    if (e.isFile() && match(e.name)) return rel
    const found = e.isDirectory() ? newest(root, rel, match) : null
    if (found) return found
  }
  return null
}

// ---------------------------------------------------------------- where each CLI keeps a session

/** Claude Code names a project folder after its working directory: every non-alphanumeric character becomes "-". */
export const claudeProject = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, '-')

/** Claude Code: `<home>/projects/<project>/<session>.jsonl`, and the session's own folder beside it. */
export function claudeTranscript(home: string, cwd: string, sessionId: string): TranscriptFiles | null {
  if (!plainId(sessionId)) return null
  const projects = join(home, 'projects')
  let dirs: string[] = []
  try {
    dirs = readdirSync(projects)
  } catch {
    return null
  }
  // The expected folder first, then any other, should Claude spell the path differently.
  const expected = claudeProject(cwd)
  for (const dir of [expected, ...dirs.filter((d) => d !== expected)]) {
    const root = join(projects, dir)
    if (existsSync(join(root, `${sessionId}.jsonl`))) return { root, files: [`${sessionId}.jsonl`, ...filesUnder(root, sessionId)] }
  }
  return null
}

/** Claude project folders of Marianne's scratch folders: they are named after the work folder. */
export function claudeLeftovers(home: string, work: string[]): string[] {
  const prefixes = work.map((w) => `${claudeProject(w)}-`)
  try {
    return readdirSync(join(home, 'projects'))
      .filter((d) => prefixes.some((p) => d.startsWith(p)))
      .map((d) => join(home, 'projects', d))
  } catch {
    return []
  }
}

/** Codex: `<home>/sessions/YYYY/MM/DD/rollout-<time>-<session>.jsonl`. */
export function codexTranscript(home: string, sessionId: string): TranscriptFiles | null {
  if (!plainId(sessionId)) return null
  const root = join(home, 'sessions')
  const file = newest(root, '', (name) => name.startsWith('rollout-') && name.includes(sessionId))
  return file ? { root, files: [file] } : null
}

/**
 * Mistral Vibe (3.x): one folder per session, `<home>/logs/session/unified/<session>/` (the
 * `CURRENT` pointer, journals, snapshots). `logs/session` is the default `session_logging.save_dir`,
 * which Marianne pins in its runs. The `.session-index.json` beside it is a rebuildable cache.
 */
export function vibeTranscript(home: string, sessionId: string): TranscriptFiles | null {
  if (!plainId(sessionId)) return null
  const root = join(home, 'logs', 'session')
  const files = filesUnder(root, `unified/${sessionId}`)
  return files.length ? { root, files } : null
}

// ---------------------------------------------------------------- archive

/** Delete the files, then the folders they leave empty (never `root` itself). Already gone is fine. */
export function discardTranscript({ root, files }: TranscriptFiles): void {
  const dirs = new Set<string>()
  for (const f of files.filter(safePath)) {
    try {
      rmSync(join(root, f), { force: true, maxRetries: 3 })
    } catch (err) {
      log.warn('Could not delete a transcript file:', (err as Error).message)
    }
    for (let d = dirname(f); d !== '.' && d !== ''; d = dirname(d)) dirs.add(d)
  }
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    try {
      rmdirSync(join(root, d))
    } catch {
      // not empty
    }
  }
}

/** Move the session's files into the archive. They leave the disk even if the archive refuses them. */
export function captureTranscript(folderId: string, engine: EngineId, sessionId: string, found: TranscriptFiles | null): void {
  if (!found?.files.length) return
  try {
    const data = zipSync(Object.fromEntries(found.files.filter(safePath).map((f) => [f, readFileSync(join(found.root, f))])))
    session.archive.writeFile<TranscriptMeta>(transcriptId(folderId, engine), data, { engine, sessionId, files: found.files })
  } catch (err) {
    log.warn(`Could not archive the ${engine} transcript of ${folderId}:`, (err as Error).message)
  } finally {
    discardTranscript(found)
  }
}

/**
 * Put the archived transcript of `sessionId` back under `root`, for the CLI to resume it. Returns
 * what was written, to take it off the disk again after the turn (a CLI may fork a new session).
 */
export function restoreTranscript(folderId: string, engine: EngineId, sessionId: string, root: string): TranscriptFiles | null {
  const id = transcriptId(folderId, engine)
  const stored = session.archive.fileMeta<TranscriptMeta>(id)
  if (!stored || stored.meta.sessionId !== sessionId) return null
  const files: string[] = []
  for (const [name, data] of Object.entries(unzipSync(session.archive.readFile(id)))) {
    if (!safePath(name)) continue
    const file = join(root, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data, { mode: 0o600 })
    files.push(name)
  }
  return { root, files }
}

/** A deleted folder takes its transcripts with it. */
export function forgetTranscripts(folderId: string): void {
  for (const engine of ENGINES) session.archive.removeFile(transcriptId(folderId, engine))
}
