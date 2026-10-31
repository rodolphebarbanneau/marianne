import { REPO_URL } from './project'

/**
 * « signaler un bug »: the user's words and the app's diagnostics, put in shape by their own engine,
 * then opened on GitHub's bug form (.github/ISSUE_TEMPLATE/bug.yml) for them to read again and
 * publish. Nothing is sent from the app: the report travels in the form's address.
 */

/** What the window asks for. */
export interface BugReportRequest {
  /** What the user saw, in their words. */
  description: string
  /** Where they were: "page procedures", "service infos", "domain mobilite", "folder"… */
  screen: string
  /** The open folder: its conversation's course is joined (statuses, tools, errors), never its words. */
  folderId?: string
  /** The window's last errors, kept in memory only (renderer lib/errors.ts). */
  errors: string[]
  /** Have the engine analyze; false: the report holds the user's words and the diagnostics alone. */
  analyze: boolean
}

/** A report for GitHub's bug form, each field scrubbed of anything personal the app knows of. */
export interface BugReport {
  title: string
  /** The user's own words. */
  what: string
  steps: string
  /** The engine's analysis (Markdown): expected, actual, evidence, likely cause. */
  analysis: string
  version: string
  system: string
  engine: string
  /** The environment, the screen, the window's errors, the conversation's course, the log's end. */
  diagnostics: string
  /** The engine that wrote the analysis, or null. */
  analyzedBy: string | null
  /** Why there is no analysis, when one was asked for. */
  problem?: string
}

/** The fields of the form the report fills, by their ids in bug.yml: text fields all, which GitHub fills from the address. */
export const BUG_FORM_FIELDS = ['what', 'steps', 'analysis', 'version', 'system', 'engine', 'diagnostics'] as const

/** GitHub answers « 414 URI Too Long » past about 8 KB of address: under it, with room to spare. */
export const MAX_URL_LENGTH = 7500

const address = (r: BugReport): string => {
  const query = new URLSearchParams({ template: 'bug.yml', title: r.title })
  for (const field of BUG_FORM_FIELDS) if (r[field].trim()) query.set(field, r[field])
  return `${REPO_URL}/issues/new?${query.toString()}`
}

/** `text` cut to `chars`, a mark where it was. */
const cut = (text: string, chars: number): string => (text.length <= chars ? text : `${text.slice(0, Math.max(0, chars)).trimEnd()}\n[…]`)

/** The diagnostics' first lines (the environment) and their last `tail` (the log's latest), the middle left out. */
function shorten(diagnostics: string, tail: number): string {
  const lines = diagnostics.split('\n')
  const head = 12
  if (lines.length <= head + tail) return diagnostics
  const left = lines.length - head - tail
  return [...lines.slice(0, head), `[… ${left} line${left > 1 ? 's' : ''} left out …]`, ...(tail ? lines.slice(-tail) : [])].join('\n')
}

/**
 * The address of the bug form filled with `report`. Too long for GitHub, the diagnostics give way
 * first, from the middle of the log, then the analysis, then the user's words: `shortened` says so,
 * and the full report is the app's to copy.
 */
export function bugReportUrl(report: BugReport): { url: string; shortened: boolean } {
  let r = report
  let url = address(r)
  if (url.length <= MAX_URL_LENGTH) return { url, shortened: false }
  const lines = r.diagnostics.split('\n').length
  for (let tail = lines; tail >= 0 && url.length > MAX_URL_LENGTH; tail -= 4) url = address((r = { ...report, diagnostics: shorten(report.diagnostics, tail) }))
  for (const field of ['analysis', 'what', 'steps'] as const) {
    while (url.length > MAX_URL_LENGTH && r[field].length > 200) {
      // An encoded character can take up to nine: cut by what is over, at least a tenth.
      const over = Math.max(Math.ceil((url.length - MAX_URL_LENGTH) / 3), Math.ceil(r[field].length / 10))
      url = address((r = { ...r, [field]: cut(r[field], r[field].length - over) }))
    }
  }
  return { url, shortened: true }
}

/** The whole report as GitHub's form shows it once sent, to copy and paste. */
export function bugReportMarkdown(r: BugReport): string {
  const sections: [string, string][] = [
    ['What happened', r.what],
    ['Steps to reproduce', r.steps],
    ['Analysis', r.analysis],
    ['Version', r.version],
    ['Operating system', r.system],
    ['Engine', r.engine],
    ['Diagnostics', r.diagnostics ? '```text\n' + r.diagnostics + '\n```' : '']
  ]
  return [`# ${r.title}`, ...sections.filter(([, text]) => text.trim()).map(([heading, text]) => `### ${heading}\n\n${text.trim()}`)].join('\n\n') + '\n'
}
