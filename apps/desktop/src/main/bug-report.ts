import { redact, type TokenDef } from '@marianne/profile'
import type { BugReport } from '../shared/bug-report'
import type { ChatMessage } from '../shared/types'

/**
 * The pure part of « signaler un bug » (main/bug-reporter.ts runs it): what is scrubbed out of a
 * report, the diagnostics it joins, and what the engine is asked. The report is public: every
 * field goes through `scrub`, the engine's answer too, and the user reads it all again on GitHub.
 */

/** Where the user's identity shows in technical text: their home folder, their account's name. */
export interface Machine {
  home: string
  user: string
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Patterns of what may be someone's, known to the profile or not, with what replaces them. */
const PERSONAL: [RegExp, string][] = [
  [/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, '<email>'],
  // A French phone number, national or international.
  [/(?<![\d+])(?:(?:\+|00)33[\s.-]?(?:\(0\)[\s.-]?)?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/g, '<phone>'],
  [/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g, '<iban>'],
  // A licence plate (AB-123-CD).
  [/\b[A-Z]{2}[- ]?\d{3}[- ]?[A-Z]{2}\b/g, '<plate>'],
  // Nine digits or more: a tax, social security or account number. Dates and times are shorter runs.
  [/(?<![\d.])\d(?:[ ]?\d){8,}(?![\d])/g, '<number>']
]

/**
 * `text` without what could identify someone: the profile's identifiers as [[tokens]] (they say
 * which kind was there, never its value), the home folder as ~, the account's name, then emails,
 * phone numbers, IBANs, plates, long numbers, and addresses past their site (a path may hold a
 * case number). Run on everything a report holds, the engine's answer included.
 */
export function scrub(text: string, tokens: TokenDef[], machine: Machine): string {
  if (!text) return text
  let out = redact(text, tokens)
  const home = machine.home.replace(/[\\/]+$/, '')
  if (home.length > 3) {
    // As Node, a file URL or JSON writes it: \, / or \\ between its parts.
    const parts = home.split(/[\\/]+/).map(escape)
    out = out.replace(new RegExp(parts.join('(?:\\\\{1,2}|/)'), 'gi'), '~')
  }
  if (machine.user.length >= 3) out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(machine.user)}(?![\\p{L}\\p{N}])`, 'giu'), '<user>')
  // An address keeps its site only.
  out = out.replace(/\b(https?:\/\/[^\s/"'<>)\]]+)\/[^\s"'<>)\]]+/gi, '$1/…')
  for (const [pattern, mark] of PERSONAL) out = out.replace(pattern, mark)
  return out
}

/** At most `lines` lines from the end of the log, each cut to `width` characters. */
export function logTail(text: string, lines = 60, width = 240): string {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(-lines)
    .map((l) => (l.length > width ? `${l.slice(0, width)}…` : l))
    .join('\n')
}

const seconds = (ms?: number) => (ms === undefined ? '' : ` · ${(ms / 1000).toFixed(1)} s`)
const oneLine = (s: string, width = 160) => {
  const line = s.replace(/\s+/g, ' ').trim()
  return line.length > width ? `${line.slice(0, width)}…` : line
}

/**
 * The course of a conversation, its last `last` messages: who, what became of each, the tools
 * used and how they ended, the errors. Never what was said, nor what a tool was given or found
 * (only an error's first line).
 */
export function conversationCourse(messages: ChatMessage[], last = 8): string {
  const shown = messages.slice(-last)
  const lines = [`${messages.length} message${messages.length > 1 ? 's' : ''}${messages.length > shown.length ? `, the last ${shown.length}` : ''}:`]
  for (const m of shown) {
    const kinds = [...new Set(m.parts.map((p) => p.type))].join(', ') || 'empty'
    const engine = m.engine ? ` · ${m.engine}${m.model ? `/${m.model}` : ''}` : ''
    lines.push(
      `- ${m.role}${m.note ? ` (${m.note}${m.outcome ? `: ${m.outcome}` : ''})` : ''}${m.status ? ` · ${m.status}` : ''}${engine}${seconds(m.ms)} · ${kinds}`
    )
    for (const p of m.parts) {
      if (p.type === 'tool') lines.push(`  tool ${p.name}: ${p.status}${p.isError ? `, failed: ${oneLine(p.output ?? '')}` : ''}`)
      else if (p.type === 'approval') lines.push(`  card ${p.kind}: ${p.status}`)
      else if (p.type === 'setup') lines.push(`  setup asked: ${p.page}`)
    }
    if (m.error) lines.push(`  error: ${oneLine(m.error, 240)}`)
  }
  return lines.join('\n')
}

/** The facts the diagnostics are written from. */
export interface Facts {
  app: string
  system: string
  engine: string
  screen: string
  settings: string
  errors: string[]
  conversation: string | null
  log: string
}

/** The diagnostics, in the order the report's address keeps them when it must shorten them: the environment first, the log's latest last. */
export function diagnosticsText(f: Facts): string {
  const errors = f.errors.length ? f.errors.slice(-10).map((e) => `- ${oneLine(e, 300)}`) : ['none']
  return [
    `App: ${f.app}`,
    `System: ${f.system}`,
    `Engine: ${f.engine}`,
    `Settings: ${f.settings}`,
    `Screen: ${f.screen}`,
    '',
    `Window errors:`,
    ...errors,
    ...(f.conversation ? ['', `Conversation: ${f.conversation}`] : []),
    '',
    'Log, the latest last:',
    f.log || '(empty)'
  ].join('\n')
}

/** What the engine is told: the report's instructions, in English as all an engine reads. */
export const ANALYSIS_PROMPT = `You help a user of Marianne, a desktop citizen assistant for people living in France (Electron, React, TypeScript), report a bug to its developers on GitHub. You receive the user's own words, in French, and the app's diagnostics: its version, the system, the engine, the screen the user was on, the window's last errors, the course of the open conversation (statuses, tools and errors, never what was said) and the end of the app's log.

Write what the developers need to reproduce the bug and find its cause. Answer with one JSON object and nothing else:
{"title": "...", "steps": "...", "analysis": "..."}

- title: one line under 80 characters saying what fails and where, e.g. "INFOS: the « fil » tab stays empty after a sync".
- steps: numbered steps to reproduce, from the user's words and the diagnostics; write "Unknown" for what they don't tell.
- analysis: Markdown under these headings: "#### Expected", "#### Actual", "#### Evidence" (the log lines or errors that bear on it, quoted in a code block, 15 lines at most; "None in the diagnostics" if there are none), "#### Likely cause" (the part of the app at fault and why, said as a hypothesis when it is one).

Write in English. The report is public: never write a name, an address, a number, an email, a date of birth or anything else personal, even if you see one; keep [[tokens]] and <marks> as they are and never guess what they stand for. Say what the diagnostics don't show rather than invent. You have no tools: answer from what you were given.`

/** The user's turn: their words, then the diagnostics. */
export const analysisMessage = (words: string, diagnostics: string) =>
  `What the user saw, in their words:\n\n${words.trim() || '(nothing written)'}\n\nThe app's diagnostics:\n\n${diagnostics}`

/** What an engine's answer gives the report: its JSON, fenced or not; anything else as the analysis. */
export function parseAnalysis(answer: string): Pick<BugReport, 'title' | 'steps' | 'analysis'> {
  const text = answer.trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const json = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
      const field = (k: string) => (typeof json[k] === 'string' ? (json[k] as string).trim() : '')
      if (field('analysis') || field('steps')) return { title: oneLine(field('title'), 120), steps: field('steps'), analysis: field('analysis') }
    } catch {
      // Not JSON after all: the text is the analysis.
    }
  }
  return { title: '', steps: '', analysis: text }
}

/** A title from the user's words when the engine gave none: their first line, short. */
export const titleFrom = (words: string): string => oneLine(words.split('\n').find((l) => l.trim()) ?? '', 80) || 'Bug report'
