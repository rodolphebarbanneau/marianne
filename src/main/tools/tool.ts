import type * as z from 'zod'
import { sourceInfo } from '../../shared/constants'
import type { SourceId } from '../../shared/types'
import { configStore } from '../config'

/**
 * A tool the agents can call through Marianne's MCP server. Results are Markdown written for the
 * model: compact, with the identifiers and links it needs to cite sources or dig further.
 */
export interface Tool<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string
  /** Short label for the chat ("Service-Public · recherche"). */
  title: string
  description: string
  /** The source the tool draws on: disabled sources hide their tools. */
  source?: SourceId
  input: S
  /** Read-only tools only fetch data; the others act in the app (open a page). */
  readOnly?: boolean
  /** False: [[tokens]] are refused in the arguments (a URL would carry the values to any site). */
  tokens?: boolean
  run: (args: z.output<z.ZodObject<S>>, ctx: ToolContext) => Promise<string>
}

export interface ToolContext {
  /** The conversation the call comes from (cards are shown there); none for the agent test. */
  conversationId?: string
  /** The arguments held [[tokens]], replaced by the user's values: keep the result coarse. */
  resolved?: boolean
}

/** Typed tool definition (infers `run`'s arguments from `input`). */
export function tool<S extends z.ZodRawShape>(t: Tool<S>): Tool {
  return t as unknown as Tool
}

/** The configured base URL of a source, without a trailing slash. */
export function base(id: SourceId): string {
  return (configStore.get().sources[id].url.trim() || sourceInfo(id).defaultUrl).replace(/\/+$/, '')
}

/** Cut long text at a paragraph boundary, saying so. */
export function clip(text: string, max: number, hint = ''): string {
  if (text.length <= max) return text
  const cut = text.lastIndexOf('\n', max)
  return `${text.slice(0, cut > max * 0.6 ? cut : max)}\n\n[… tronqué : ${text.length - max} caractères de plus${hint ? `. ${hint}` : ''}]`
}

/** A Markdown table from rows of cells. */
export function table(head: string[], rows: Array<Array<string | number>>): string {
  const cell = (v: string | number) =>
    String(v ?? '')
      .replace(/\|/g, '/')
      .replace(/\n/g, ' ')
  return [`| ${head.join(' | ')} |`, `|${' --- |'.repeat(head.length)}`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n')
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`

/** Error reported to the model as a tool result rather than thrown (it can then try something else). */
export class ToolError extends Error {}
