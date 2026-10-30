import { DOMAINS } from '@marianne/profile'
import type * as z from 'zod'
import { PUBLIC_SOURCES } from '../../shared/public'
import type { DomainId, PlannedTask, PublicSourceId } from '../../shared/types'
import { configStore } from '../config'

/**
 * A tool the engines can call through Marianne's MCP server. Names, descriptions and results
 * are written for the model, in English: compact Markdown, with the identifiers and links it
 * needs to cite sources or dig further. The model answers the user in French.
 */
export interface Tool<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string
  /** Short label for logs. */
  title: string
  description: string
  /** The public source the tool draws on: disabled sources hide their tools. */
  source?: PublicSourceId
  input: S
  /** Read-only tools only fetch data; the others act in the app. */
  readOnly?: boolean
  /** False: [[tokens]] are refused in the arguments (a URL would carry the values to any site). */
  tokens?: boolean
  run: (args: z.output<z.ZodObject<S>>, ctx: ToolContext) => Promise<string>
}

export interface ToolContext {
  /** The folder the call comes from (cards are shown there); none for the engine test. */
  folderId?: string
  /** The arguments held [[tokens]], replaced by the user's values: keep the result coarse. */
  resolved?: boolean
  /**
   * The planned task's run the call started in, if any (mcp.ts): it holds the call to the run's
   * rules to its end, and a call that outlives its run stops rather than act as a conversation's.
   */
  run?: PlannedTask | null
}

/** Typed tool definition (infers `run`'s arguments from `input`). */
export function tool<S extends z.ZodRawShape>(t: Tool<S>): Tool {
  return t as unknown as Tool
}

/** The configured base URL of a public source, without a trailing slash. */
export function base(id: PublicSourceId): string {
  const fallback = PUBLIC_SOURCES.find((s) => s.id === id)?.defaultUrl ?? ''
  return (configStore.get().sources[id].url.trim() || fallback).replace(/\/+$/, '')
}

// The same helpers as the services' tools, and the same error: what the model should read rather than a crash.
export { clip, plural, table, ToolError } from '@marianne/sdk/main'

/** Lower case, without accents: for loose matching of names and titles. */
export { foldText as fold } from '@marianne/sdk'

/** The domain ids, for zod enums. */
export const DOMAIN_IDS = DOMAINS.map((d) => d.id) as [DomainId, ...DomainId[]]

/** [[tokens]] left in an argument once resolved: the profile has no value for them. */
export const TOKEN = /\[\[[a-z0-9_.]+\]\]/i
