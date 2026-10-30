import { TOOL_NAME, type ServiceManifest } from '@marianne/sdk'
import * as z from 'zod'

/**
 * What a community service's main side says of itself once activated (SandboxDescription),
 * read as the data of untrusted code: its methods, its tools, its guides and instructions, which
 * optional parts it has. Its tools must be the ones its manifest declares, by name and label
 * (« avant d’ajouter » listed those): a tool it didn't declare refuses the whole service. Their
 * arguments come as JSON Schema (z.toJSONSchema in the sandbox). Never compiled as given (a
 * pattern or a tree of references can freeze the main process): rebuilt from a short list of
 * keywords, within a depth and a size, then made a zod schema with z.fromJSONSchema, for the MCP
 * server and for checking the arguments' structure before they cross over; the sandbox checks
 * them again with the service's own schema.
 */

/** Why a service's description is refused: a French sentence, after « n’a pas pu démarrer : ». */
export class DescriptionRefused extends Error {
  override name = 'DescriptionRefused'
}

/** A tool of a community service, as the host lends it to the engines. */
export interface CommunityTool {
  name: string
  label: string
  description: string
  readOnly: boolean
  /** Its arguments, rebuilt from the sandbox's JSON Schema: what MCP registers. */
  input: z.ZodRawShape
  /** The same, as one object: what the arguments are checked against. */
  schema: z.ZodObject
}

export interface ServiceDescription {
  methods: string[]
  tools: CommunityTool[]
  skills: string[]
  instructions: string
  has: { today: boolean; summary: boolean; deadlines: boolean; tile: boolean }
  tileEveryMinutes: number | null
}

const IDENT = /^[A-Za-z_$][\w$]{0,63}$/
const MAX_TOOLS = 32
const MAX_METHODS = 200
const MAX_SKILLS = 8
const MAX_SKILL = 32 * 1024
const MAX_INSTRUCTIONS = 4000
const MAX_TOOL_DESCRIPTION = 4000
/** A tool's schema, as the sandbox sends it, is at most this big (JSON). */
export const MAX_SCHEMA_BYTES = 16 * 1024
/** How deep a schema may nest (the arguments' object is the first level). */
export const MAX_SCHEMA_DEPTH = 6
const MAX_ENUM = 100
const MAX_PROPERTIES = 64
const MAX_DESCRIPTION = 1000

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const TYPES = new Set(['object', 'string', 'number', 'integer', 'boolean', 'array', 'null'])
const isPrimitive = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v)
const count = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined)
const bound = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/**
 * A schema rebuilt from the keywords Marianne reads, nothing else: type, properties, required,
 * items, enum, const, minimum and maximum, the lengths and counts, description, default, and
 * additionalProperties when it is false. Every other keyword is left out (a pattern, references,
 * combinations: the sandbox's own schema still checks them); deeper than MAX_SCHEMA_DEPTH, an
 * enum too long or too many properties refuse the schema.
 */
export function cleanSchema(schema: unknown, depth = 1, describe = MAX_DESCRIPTION): Record<string, unknown> {
  if (depth > MAX_SCHEMA_DEPTH) throw new Error('schema too deep')
  if (!isRecord(schema)) return {}
  const out: Record<string, unknown> = {}
  const type = schema.type
  if (typeof type === 'string' && TYPES.has(type)) out.type = type
  else if (Array.isArray(type) && type.length <= TYPES.size && type.every((t) => typeof t === 'string' && TYPES.has(t))) out.type = [...new Set(type)]
  if (typeof schema.description === 'string' && describe > 0) out.description = schema.description.slice(0, describe)
  if (isRecord(schema.properties)) {
    const entries = Object.entries(schema.properties)
    if (entries.length > MAX_PROPERTIES) throw new Error('too many properties')
    out.properties = Object.fromEntries(
      entries.map(([name, sub]) => {
        if (name.length > 64 || name === '__proto__') throw new Error('unreadable property name')
        return [name, cleanSchema(sub, depth + 1, describe)]
      })
    )
    if (Array.isArray(schema.required)) out.required = schema.required.filter((r): r is string => typeof r === 'string' && r in (out.properties as object))
    if (schema.additionalProperties === false) out.additionalProperties = false
  }
  if (isRecord(schema.items)) out.items = cleanSchema(schema.items, depth + 1, describe)
  if (Array.isArray(schema.enum)) {
    if (schema.enum.length > MAX_ENUM || !schema.enum.every(isPrimitive)) throw new Error('enum too long')
    out.enum = [...schema.enum]
  }
  if ('const' in schema && isPrimitive(schema.const)) out.const = schema.const
  for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'] as const) if (bound(schema[key]) !== undefined) out[key] = schema[key]
  for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems'] as const) if (count(schema[key]) !== undefined) out[key] = schema[key]
  if (
    'default' in schema &&
    (isPrimitive(schema.default) || (Array.isArray(schema.default) && schema.default.length <= MAX_ENUM && schema.default.every(isPrimitive)))
  )
    out.default = schema.default
  return out
}

/** How long each description of a community tool's arguments may be (they go to the model). */
export const ARGUMENT_DESCRIPTION = 120

/** A tool's arguments from its JSON Schema, cleaned first: an object of named arguments, their descriptions within `describe` characters. */
export function shapeFromJsonSchema(schema: unknown, describe = ARGUMENT_DESCRIPTION): z.ZodObject {
  if (!isRecord(schema) || schema.type !== 'object') throw new Error('not an object schema')
  if (Buffer.byteLength(JSON.stringify(schema)) > MAX_SCHEMA_BYTES) throw new Error('schema too large')
  const rebuilt = z.fromJSONSchema(cleanSchema(schema, 1, describe) as Parameters<typeof z.fromJSONSchema>[0])
  if (!(rebuilt instanceof z.ZodObject)) throw new Error('not an object')
  return rebuilt
}

/** The description of a service's main side, checked against its manifest; throws DescriptionRefused. */
export function readDescription(raw: unknown, manifest: Pick<ServiceManifest, 'tools'>): ServiceDescription {
  const refuse = (why: string): never => {
    throw new DescriptionRefused(why)
  }
  if (!isRecord(raw)) return refuse('son code ne s’est pas présenté à Marianne.')
  const methods = Array.isArray(raw.methods) ? raw.methods : refuse('son code ne dit pas ce que son écran peut appeler.')
  if (methods.length > MAX_METHODS || !methods.every((m) => typeof m === 'string' && IDENT.test(m)))
    refuse('son code nomme ses méthodes d’une façon que Marianne ne lit pas.')
  const tools = Array.isArray(raw.tools) ? raw.tools : refuse('son code ne dit pas quels outils il prête.')
  if (tools.length > MAX_TOOLS) refuse(`il prête plus de ${MAX_TOOLS} outils.`)
  const seen = new Set<string>()
  const read: CommunityTool[] = tools.map((t): CommunityTool => {
    if (!isRecord(t) || typeof t.name !== 'string' || !TOOL_NAME.test(t.name)) return refuse('il prête un outil sans nom lisible.')
    const name = t.name
    if (seen.has(name)) refuse(`il prête deux outils nommés « ${name} ».`)
    seen.add(name)
    const declared = manifest.tools.find((d) => d.name === name)
    if (!declared) return refuse(`il prête l’outil « ${name} », que son manifeste n’annonce pas (marianne.tools).`)
    const label = typeof t.label === 'string' ? t.label.trim() : ''
    if (label !== declared.label) refuse(`son outil « ${name} » s’annonce « ${label.slice(0, 60)} », son manifeste dit « ${declared.label} ».`)
    if (typeof t.description !== 'string' || !t.description.trim() || t.description.length > MAX_TOOL_DESCRIPTION)
      refuse(`son outil « ${name} » n’a pas de description lisible.`)
    let schema: z.ZodObject
    try {
      schema = shapeFromJsonSchema(t.input)
    } catch {
      return refuse(`son outil « ${name} » décrit ses arguments d’une façon que Marianne ne lit pas.`)
    }
    return { name, label, description: t.description as string, readOnly: t.readOnly === true, input: schema.shape, schema }
  })
  const skills = raw.skills === undefined ? [] : Array.isArray(raw.skills) ? raw.skills : refuse('ses guides sont illisibles.')
  if (skills.length > MAX_SKILLS || !skills.every((s) => typeof s === 'string' && s.length <= MAX_SKILL)) refuse('ses guides sont illisibles ou trop longs.')
  const instructions = raw.instructions === undefined ? '' : raw.instructions
  if (typeof instructions !== 'string' || instructions.length > MAX_INSTRUCTIONS) refuse('ses instructions sont illisibles ou trop longues.')
  const has = isRecord(raw.has) ? raw.has : {}
  const minutes = raw.tileEveryMinutes
  return {
    methods: methods as string[],
    tools: read,
    skills: skills as string[],
    instructions: instructions as string,
    has: { today: has.today === true, summary: has.summary === true, deadlines: has.deadlines === true, tile: has.tile === true },
    tileEveryMinutes: typeof minutes === 'number' && Number.isFinite(minutes) ? Math.min(1440, Math.max(5, minutes)) : null
  }
}
