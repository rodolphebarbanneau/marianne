import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readManifest, type ServiceManifest } from '@marianne/sdk'
import type { ServiceContext } from '@marianne/sdk/main'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import * as z from 'zod'
import { BridgeRefused, fromOwn, MAX_STORED_BYTES, sandboxBridge } from '../src/main/community/runtime/bridge'
import { askConsent, consentCard, type AskUser } from '../src/main/community/runtime/consent'
import { cleanSchema, DescriptionRefused, MAX_SCHEMA_BYTES, readDescription, shapeFromJsonSchema } from '../src/main/community/runtime/description'
import { MAX_TOOL_ARGUMENTS_BYTES } from '../src/main/community/runtime/limits'
import { SandboxRpc } from '../src/main/community/runtime/rpc'
import { answerServiceRequest, contentPolicy, listRuntime, pictureUrl, workerImports, type SchemeSource } from '../src/main/community/runtime/scheme'
import { ScreenRelay, type ScreenHost } from '../src/main/community/runtime/screen'
import { CommunityService, type SandboxEvents, type SandboxFactory } from '../src/main/community/runtime/service'
import { serviceStorage, type RecordStore } from '../src/main/host/storage'
import { frameMayOpen, readFromFrame, type SandboxDescription, type SandboxInvoke } from '../src/shared/community'

const root = mkdtempSync(join(tmpdir(), 'marianne-runtime-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** A community service's manifest, as its package.json says it. */
function manifestOf(code = 'bonjour', patch: Record<string, unknown> = {}): ServiceManifest {
  return readManifest({
    name: `@marianne/service-${code}`,
    version: '1.0.0',
    marianne: {
      code,
      name: 'Bonjour',
      description: 'un salut du jour',
      category: 'culture',
      hosts: ['api.example.fr'],
      links: ['https://www.example.fr/videos/'],
      tools: [{ name: 'greet', label: 'saluer' }],
      ...patch
    }
  })
}

// ---------------------------------------------------------------- the scheme

const IMPORT_MAP = '{ "imports": { "react": "./react.js" } }'

function schemeSource(active: string[] = ['bonjour']): SchemeSource & { dir: string } {
  const dir = mkdtempSync(join(root, 'scheme-'))
  const pkg = join(dir, 'packages', 'bonjour')
  const runtime = join(dir, 'runtime')
  mkdirSync(pkg, { recursive: true })
  mkdirSync(join(runtime, 'assets'), { recursive: true })
  for (const [name, text] of Object.entries({
    'main.js': 'export const service = {}',
    'view.js': 'export function View() {}',
    'package.json': '{}',
    'installed.json': '{}'
  }))
    writeFileSync(join(pkg, name), text)
  writeFileSync(
    join(runtime, 'view.html'),
    `<!doctype html><script type="importmap">${IMPORT_MAP}</script><script type="module" src="./view-runtime.js"></script>`
  )
  writeFileSync(join(runtime, 'main.html'), `<!doctype html><script type="importmap">${IMPORT_MAP}</script>`)
  writeFileSync(join(runtime, 'index.html'), '<!doctype html>')
  writeFileSync(join(runtime, 'react.js'), 'export default {}')
  writeFileSync(join(runtime, 'notes.txt'), 'not served')
  writeFileSync(join(runtime, 'assets', 'font.woff2'), 'woff2')
  writeFileSync(join(runtime, 'main-worker.js'), 'import "./react.js"')
  writeFileSync(join(dir, 'secret.txt'), 'secret')
  const files = listRuntime(runtime)
  return {
    dir,
    runtimeDir: runtime,
    runtimeFiles: () => files,
    packageOf: (code) => (active.includes(code) ? { dir: pkg, manifest: { id: code, hosts: ['api.example.fr'] } } : null),
    picture: async (_m, url) => (url.endsWith('.png') ? { type: 'image/png', body: new Uint8Array([137, 80, 78, 71]) } : null)
  }
}

const get = (url: string, source: SchemeSource, only?: string) => answerServiceRequest({ url, method: 'GET' }, source, only)

describe('the marianne-service: scheme', () => {
  it('serves a screen the pictures of its declared hosts, fetched for it, and no other', async () => {
    const source = schemeSource()
    const png = await get(pictureUrl('bonjour', 'https://api.example.fr/photo.png'), source)
    expect(png).toMatchObject({ status: 200, headers: { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff' } })
    expect(png.headers['Content-Security-Policy']).toContain("default-src 'none'")
    expect((await get(pictureUrl('bonjour', 'https://evil.example.com/photo.png'), source)).status).toBe(404)
    expect((await get(pictureUrl('bonjour', 'http://api.example.fr/photo.png'), source)).status).toBe(404)
    expect((await get(pictureUrl('bonjour', 'https://api.example.fr/page.html'), source)).status).toBe(404)
    // A sandbox's session has no pictures to serve.
    expect((await get(pictureUrl('bonjour', 'https://api.example.fr/photo.png'), { ...source, picture: undefined })).status).toBe(404)
  })

  it('points a main side’s imports of Marianne at the runtime’s files (its worker has no import map)', () => {
    const code = [
      'import { defineService } from "@marianne/sdk/main";',
      'import * as z from "zod";',
      "import { foldText } from '@marianne/sdk';",
      'export * from "zod";',
      'const lazy = () => import("zod");',
      'import other from "left-pad";',
      'const text = "from the zod docs";'
    ].join('\n')
    expect(workerImports(code).split('\n')).toEqual([
      'import { defineService } from "./~runtime/sdk-main.js";',
      'import * as z from "./~runtime/zod.js";',
      "import { foldText } from './~runtime/sdk.js';",
      'export * from "./~runtime/zod.js";',
      'const lazy = () => import("./~runtime/zod.js");',
      'import other from "left-pad";',
      'const text = "from the zod docs";'
    ])
  })

  it('serves a service’s files and Marianne’s runtime, with their types, never sniffed, open to its frame', async () => {
    const source = schemeSource()
    const view = await get('marianne-service://bonjour/view.js', source)
    expect(view.status).toBe(200)
    expect(view.headers).toMatchObject({
      'Content-Type': 'text/javascript; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*'
    })
    expect(Buffer.from(view.body).toString()).toBe('export function View() {}')
    expect((await get('marianne-service://bonjour/~runtime/react.js', source)).headers['Content-Type']).toBe('text/javascript; charset=utf-8')
    expect((await get('marianne-service://bonjour/~runtime/assets/font.woff2', source)).headers['Content-Type']).toBe('font/woff2')
    // No view.css of its own: an empty stylesheet, so that its frame links one without a failure.
    expect(await get('marianne-service://bonjour/view.css', source)).toMatchObject({
      status: 200,
      body: '',
      headers: { 'Content-Type': 'text/css; charset=utf-8' }
    })
  })

  it('serves nothing else: no other file of its folder, no way out of it, no other code', async () => {
    const source = schemeSource()
    for (const url of [
      'marianne-service://bonjour/installed.json',
      'marianne-service://bonjour/package.json',
      'marianne-service://bonjour/../secret.txt',
      'marianne-service://bonjour/%2e%2e/secret.txt',
      'marianne-service://bonjour/~runtime/..%2f..%2fsecret.txt',
      'marianne-service://bonjour/~runtime/%2e%2e/%2e%2e/secret.txt',
      'marianne-service://bonjour/~runtime/..%5c..%5csecret.txt',
      'marianne-service://bonjour/~runtime/notes.txt',
      // A name Windows reads as a device is never opened: only the files listed at start are.
      'marianne-service://bonjour/~runtime/COM1.js',
      'marianne-service://bonjour/~runtime/nul.js',
      'marianne-service://bonjour/~runtime/added-later.js',
      'marianne-service://bonjour/~runtime/index.html',
      'marianne-service://bonjour/~runtime/missing.js',
      'marianne-service://bonjour/~runtime/',
      'marianne-service://bonjour/main.js/x',
      'marianne-service://other/main.js',
      'marianne-service://BONJOUR/main.js',
      'marianne-service://user:pass@bonjour/main.js',
      'https://bonjour/main.js'
    ])
      expect((await get(url, source)).status, url).toBe(404)
    // A service that isn't active is not served at all.
    expect((await get('marianne-service://bonjour/main.js', schemeSource([]))).status).toBe(404)
    // A sandbox's session serves its own code only.
    expect((await get('marianne-service://bonjour/main.js', source, 'other')).status).toBe(404)
    expect((await get('marianne-service://bonjour/main.js', source, 'bonjour')).status).toBe(200)
    expect((await answerServiceRequest({ url: 'marianne-service://bonjour/main.js', method: 'POST' }, source)).status).toBe(405)
  })

  it('gives its pages the content policy that keeps them to their own files', async () => {
    const source = schemeSource()
    const hash = `sha256-${createHash('sha256').update(IMPORT_MAP).digest('base64')}`
    const view = await get('marianne-service://bonjour/~runtime/view.html', source)
    expect(view.headers['Content-Type']).toBe('text/html; charset=utf-8')
    expect(view.headers['X-DNS-Prefetch-Control']).toBe('off')
    const policy = view.headers['Content-Security-Policy']
    expect(policy).toBe(contentPolicy('view', 'bonjour', ['api.example.fr'], [hash]))
    expect(policy).toContain(`script-src marianne-service://bonjour '${hash}'`)
    for (const part of [
      "default-src 'none'",
      "connect-src 'none'",
      "frame-src 'none'",
      "worker-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
      "object-src 'none'",
      'img-src marianne-service://bonjour data: https://api.example.fr',
      "style-src marianne-service://bonjour 'unsafe-inline'",
      'font-src marianne-service://bonjour',
      // No dialog, popup nor download, from it or a frame it makes (print from a child frame).
      'sandbox allow-scripts allow-same-origin allow-forms'
    ])
      expect(policy).toContain(part)
    const mainPage = await get('marianne-service://bonjour/~runtime/main.html', source)
    const main = mainPage.headers['Content-Security-Policy']
    expect(main).toContain("img-src 'none'")
    expect(main).toContain("style-src 'none'")
    expect(main).toContain(`script-src marianne-service://bonjour '${hash}'`)
    // The main side's page starts its worker, isolated (they share memory); the worker starts nothing.
    expect(main).toContain('worker-src marianne-service://bonjour')
    expect(mainPage.headers).toMatchObject({ 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' })
    const worker = await get('marianne-service://bonjour/~runtime/main-worker.js', source)
    expect(worker.headers['Content-Security-Policy']).toContain("connect-src 'none'")
    expect(worker.headers['Content-Security-Policy']).toContain("worker-src 'none'")
    expect(worker.headers['Cross-Origin-Embedder-Policy']).toBe('require-corp')
    // Scripts and files carry no policy of their own.
    expect((await get('marianne-service://bonjour/main.js', source)).headers['Content-Security-Policy']).toBeUndefined()
  })
})

// ---------------------------------------------------------------- the bridge

/** A call's arguments, as the sandbox's page sends them: JSON text. */
const j = (args: unknown[]) => JSON.stringify(args)

/** The archive's records, in memory, by kind. */
function memoryStore(): RecordStore & { kinds: Map<string, Map<string, unknown>> } {
  const kinds = new Map<string, Map<string, unknown>>()
  const of = (kind: string) => kinds.get(kind) ?? kinds.set(kind, new Map()).get(kind)!
  return {
    kinds,
    get: <T>(kind: string, id: string) => (of(kind).has(id) ? (structuredClone(of(kind).get(id)) as T) : null),
    put: (kind, id, value) => void of(kind).set(id, structuredClone(value)),
    remove: (kind, id) => void of(kind).delete(id)
  }
}

/** A service's context as the host builds it, the network faked: its storage the real one, over `store`. */
function contextOf(m: ServiceManifest, store: RecordStore) {
  const json = vi.fn(async (url: string, options?: unknown) => ({ url, options }))
  const ctx: ServiceContext = {
    manifest: m,
    http: { json: json as never, text: vi.fn(async () => 'text'), page: vi.fn(async () => 'page') },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    storage: serviceStorage(m.id, () => store),
    dataDir: '',
    geo: { findCommunes: vi.fn(async () => []), getCommune: vi.fn(async () => null) },
    home: () => ({ code: '35238', name: 'Rennes', postcode: '35000' }),
    profile: { granted: () => [], vehicles: () => [], leaning: () => null, themes: () => [] },
    sync: { status: () => ({}), run: async () => {} }
  }
  return { ctx, json }
}

describe('the bridge', () => {
  it('answers its own sandbox’s main frame only', () => {
    const own = { id: 1 }
    expect(fromOwn(own, { sender: own, senderFrame: { parent: null } })).toBe(true)
    expect(fromOwn(own, { sender: { id: 2 }, senderFrame: { parent: null } })).toBe(false)
    expect(fromOwn(own, { sender: own, senderFrame: { parent: {} } })).toBe(false)
    expect(fromOwn(own, { sender: own, senderFrame: null })).toBe(false)
  })

  it('keeps each service’s storage to its own records', () => {
    const store = memoryStore()
    const a = sandboxBridge(manifestOf('bonjour'), contextOf(manifestOf('bonjour'), store).ctx)
    const b = sandboxBridge(manifestOf('autre'), contextOf(manifestOf('autre'), store).ctx)
    expect(a.callSync('storage.set', j(['visits', 3]))).toEqual({ ok: null })
    expect(a.callSync('storage.get', j(['visits']))).toEqual({ ok: 3 })
    expect(b.callSync('storage.get', j(['visits']))).toEqual({ ok: null })
    expect([...store.kinds.keys()]).toEqual(['service:bonjour', 'service:autre'])
    expect(a.callSync('storage.remove', j(['visits']))).toEqual({ ok: null })
    expect(a.callSync('storage.get', j(['visits']))).toEqual({ ok: null })
  })

  it('stores plain data within a size, by a readable key', () => {
    const a = sandboxBridge(manifestOf(), contextOf(manifestOf(), memoryStore()).ctx)
    expect(a.callSync('storage.set', j(['', 1]))).toMatchObject({ error: { name: 'BridgeRefused' } })
    expect(a.callSync('storage.set', j(['k'.repeat(201), 1]))).toMatchObject({ error: { name: 'BridgeRefused' } })
    expect(a.callSync('storage.set', j(['big', 'x'.repeat(MAX_STORED_BYTES)]))).toMatchObject({ error: { message: expect.stringContaining('1 Mo') } })
    // Only JSON text within its length crosses: anything else is refused before it is read.
    expect(a.callSync('storage.set', ['n', 1] as never)).toMatchObject({ error: { message: expect.stringContaining('arguments illisibles ou trop longs') } })
    expect(a.callSync('storage.set', `["k","${'x'.repeat(1_200_000)}"]`)).toMatchObject({ error: { message: expect.stringContaining('trop longs') } })
    expect(a.callSync('storage.set', '{ not json')).toMatchObject({ error: { message: expect.stringContaining('arguments illisibles') } })
    expect(a.callSync('home', j([]))).toEqual({ ok: { code: '35238', name: 'Rennes', postcode: '35000' } })
  })

  it('reaches its declared hosts only, with options it may give', async () => {
    const m = manifestOf()
    const { ctx, json } = contextOf(m, memoryStore())
    const a = sandboxBridge(m, ctx)
    await expect(a.call('http.json', j(['https://evil.example.com/steal?x=1']))).rejects.toThrow(BridgeRefused)
    await expect(a.call('http.json', j(['https://evil.example.com/']))).rejects.toThrow('3615 BONJOUR n’a pas déclaré evil.example.com')
    await expect(a.call('http.json', j(['http://api.example.fr/plain']))).rejects.toThrow(BridgeRefused)
    await expect(a.call('http.text', j(['file:///etc/passwd']))).rejects.toThrow(BridgeRefused)
    expect(json).not.toHaveBeenCalled()
    await a.call('http.json', j(['https://api.example.fr/v1', { method: 'POST', json: { q: 1 }, headers: { Accept: 'x' }, timeoutMs: 999_999, agent: 'nope' }]))
    expect(json).toHaveBeenCalledWith('https://api.example.fr/v1', { method: 'POST', json: { q: 1 }, headers: { Accept: 'x' }, timeoutMs: 60_000 })
    await expect(a.call('http.json', j(['https://api.example.fr/v1', { method: 'DELETE' }]))).rejects.toThrow('méthode HTTP refusée')
  })

  it('refuses what isn’t one of its capabilities', async () => {
    const a = sandboxBridge(manifestOf(), contextOf(manifestOf(), memoryStore()).ctx)
    await expect(a.call('fs.readFile', j(['/etc/passwd']))).rejects.toThrow('capacité inconnue')
    await expect(a.call('http.json', 'https://api.example.fr/')).rejects.toThrow('arguments illisibles')
    expect(a.callSync('storage.list', j([]))).toMatchObject({ error: { name: 'BridgeRefused' } })
    expect(a.callSync('profile.tokens', j([]))).toMatchObject({ error: { name: 'BridgeRefused' } })
  })
})

// ---------------------------------------------------------------- the calls into a sandbox

describe('calls into a sandbox', () => {
  afterEach(() => vi.useRealTimers())

  it('answers each request by its id, a ToolError staying one', async () => {
    const sent: SandboxInvoke[] = []
    const rpc = new SandboxRpc({ send: (m) => sent.push(m), label: '3615 BONJOUR' })
    const a = rpc.invoke('method', 'greet', ['Camille'])
    const b = rpc.invoke('tool', 'greet', [{}])
    expect(sent.map((m) => [m.kind, m.name])).toEqual([
      ['method', 'greet'],
      ['tool', 'greet']
    ])
    rpc.settle(sent[1].id, { error: { name: 'ToolError', message: 'Nobody to greet.' } })
    rpc.settle(sent[0].id, { json: JSON.stringify({ text: 'Bonjour Camille' }) })
    rpc.settle(999, { json: '"unasked"' })
    rpc.settle(sent[0].id, 'not a reply')
    await expect(a).resolves.toEqual({ text: 'Bonjour Camille' })
    await expect(b).rejects.toMatchObject({ name: 'ToolError', message: 'Nobody to greet.' })
    expect(rpc.pending).toBe(0)
  })

  it('reads an answer only within its size, as JSON', async () => {
    const sent: SandboxInvoke[] = []
    const rpc = new SandboxRpc({ send: (m) => sent.push(m), label: '3615 BONJOUR' })
    const tool = rpc.invoke('tool', 'greet', [])
    const tile = rpc.invoke('tile', '', [])
    const method = rpc.invoke('method', 'greet', [])
    rpc.settle(sent[0].id, { json: JSON.stringify('x'.repeat(256 * 1024)) })
    rpc.settle(sent[1].id, { json: JSON.stringify({ title: 'x'.repeat(70 * 1024) }) })
    rpc.settle(sent[2].id, { json: '{ not json' })
    await expect(tool).rejects.toThrow('3615 BONJOUR : sa réponse est trop longue (256 ko au plus).')
    await expect(tile).rejects.toThrow('sa réponse est trop longue (64 ko au plus)')
    await expect(method).rejects.toThrow('3615 BONJOUR : sa réponse est illisible.')
  })

  it('gives up on a request not answered in time, and tells', async () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const rpc = new SandboxRpc({ send: () => {}, label: '3615 BONJOUR', onTimeout })
    const tile = rpc.invoke('tile', '', [])
    const method = rpc.invoke('method', 'greet', [])
    vi.advanceTimersByTime(10_000)
    await expect(tile).rejects.toThrow('3615 BONJOUR n’a pas répondu à temps.')
    expect(onTimeout).toHaveBeenCalledWith('tile')
    expect(rpc.pending).toBe(1)
    vi.advanceTimersByTime(20_000)
    await expect(method).rejects.toThrow('n’a pas répondu à temps')
  })

  it('fails what waits when the sandbox is gone, and what comes after', async () => {
    const rpc = new SandboxRpc({ send: () => {}, label: '3615 BONJOUR' })
    const waiting = rpc.invoke('method', 'greet', [])
    rpc.close('3615 BONJOUR est arrêté.')
    await expect(waiting).rejects.toThrow('3615 BONJOUR est arrêté.')
    await expect(rpc.invoke('method', 'greet', [])).rejects.toThrow('3615 BONJOUR est arrêté.')
  })
})

// ---------------------------------------------------------------- what the sandbox says of itself

const schemaOf = (shape: z.ZodRawShape) => z.toJSONSchema(z.object(shape), { io: 'input', unrepresentable: 'any' })

function described(patch: Partial<SandboxDescription> = {}): SandboxDescription {
  return {
    methods: ['greet', 'visits'],
    tools: [
      {
        name: 'greet',
        label: 'saluer',
        description: 'A greeting.',
        readOnly: true,
        input: schemaOf({ name: z.string().min(1).max(40), times: z.number().int().min(1).max(3).optional() })
      }
    ],
    skills: [],
    instructions: 'Greets.',
    has: { today: false, summary: false, deadlines: true, tile: true },
    tileEveryMinutes: 60,
    ...patch
  }
}

describe('what a community service says of itself', () => {
  it('never compiles its schemas as given: patterns, references and combinations are left out, depth and size bounded', () => {
    // A pattern that would take seconds on 30 characters (catastrophic backtracking), and a tree of references.
    const evil = { type: 'object', properties: { a: { type: 'string', pattern: '^(a+)+$', minLength: 1 } }, required: ['a'], $defs: { x: { $ref: '#' } } }
    const clean = cleanSchema(evil)
    expect(clean).toEqual({ type: 'object', properties: { a: { type: 'string', minLength: 1 } }, required: ['a'] })
    const schema = shapeFromJsonSchema(evil)
    const started = Date.now()
    expect(schema.safeParse({ a: `${'a'.repeat(5000)}!` }).success).toBe(true)
    expect(Date.now() - started).toBeLessThan(200)
    let deep: Record<string, unknown> = { type: 'string' }
    for (let i = 0; i < 8; i++) deep = { type: 'object', properties: { x: deep } }
    expect(() => shapeFromJsonSchema(deep)).toThrow('schema too deep')
    let blowUp: Record<string, unknown> = { type: 'string' }
    for (let i = 0; i < 12; i++) blowUp = { anyOf: [blowUp, blowUp] }
    expect(cleanSchema({ type: 'object', properties: { a: { anyOf: [{ type: 'string' }] } } })).toEqual({ type: 'object', properties: { a: {} } })
    expect(() => shapeFromJsonSchema({ type: 'object', properties: { a: blowUp } })).toThrow('schema too large')
    expect(() => shapeFromJsonSchema({ type: 'object', properties: { a: { enum: Array.from({ length: 101 }, (_, i) => i) } } })).toThrow('enum too long')
    expect(() => shapeFromJsonSchema({ type: 'object', description: 'x'.repeat(MAX_SCHEMA_BYTES) })).toThrow('schema too large')
    // Its arguments' descriptions, for the model: short.
    const described = shapeFromJsonSchema({ type: 'object', properties: { a: { type: 'string', description: `Pass ${'the user’s address '.repeat(20)}` } } })
    expect((z.toJSONSchema(described) as unknown as { properties: { a: { description: string } } }).properties.a.description).toHaveLength(120)
    // What it keeps still checks the structure.
    expect(
      shapeFromJsonSchema({ type: 'object', properties: { n: { type: 'integer', maximum: 3 } }, additionalProperties: false }).safeParse({ n: 4 }).success
    ).toBe(false)
  })

  it('lends the tools its manifest declares, their arguments rebuilt from JSON Schema', () => {
    const d = readDescription(described(), manifestOf())
    const [tool] = d.tools
    expect(tool).toMatchObject({ name: 'greet', label: 'saluer', readOnly: true })
    expect(Object.keys(tool.input)).toEqual(['name', 'times'])
    expect(tool.schema.safeParse({ name: 'Camille', times: 2 }).success).toBe(true)
    expect(tool.schema.safeParse({ name: 'Camille' }).success).toBe(true)
    expect(tool.schema.safeParse({ name: '' }).success).toBe(false)
    expect(tool.schema.safeParse({ name: 'Camille', times: 1.5 }).success).toBe(false)
    expect(tool.schema.safeParse({ times: 2 }).success).toBe(false)
    // What MCP registers checks the same.
    expect(z.object(tool.input).safeParse({ name: 'x'.repeat(41) }).success).toBe(false)
    expect(d.tileEveryMinutes).toBe(60)
  })

  it('refuses a tool its manifest doesn’t declare, or declares otherwise', () => {
    const extra = described({ tools: [...described().tools, { ...described().tools[0], name: 'steal' }] })
    expect(() => readDescription(extra, manifestOf())).toThrow(DescriptionRefused)
    expect(() => readDescription(extra, manifestOf())).toThrow('il prête l’outil « steal », que son manifeste n’annonce pas (marianne.tools).')
    const relabelled = described({ tools: [{ ...described().tools[0], label: 'tout voir' }] })
    expect(() => readDescription(relabelled, manifestOf())).toThrow('son outil « greet » s’annonce « tout voir », son manifeste dit « saluer ».')
    const unreadable = described({ tools: [{ ...described().tools[0], input: { type: 'string' } }] })
    expect(() => readDescription(unreadable, manifestOf())).toThrow('décrit ses arguments d’une façon que Marianne ne lit pas')
    expect(() => readDescription({ methods: 'all' }, manifestOf())).toThrow(DescriptionRefused)
  })
})

// ---------------------------------------------------------------- a community service, run

/** A sandbox that answers as `answers` says, recorded. */
function fakeSandboxes(answers: (m: SandboxInvoke) => unknown | Promise<unknown>) {
  const made: Array<{ events: SandboxEvents; sent: SandboxInvoke[]; destroyed: boolean; silent: boolean }> = []
  const factory: SandboxFactory = (_code, events) => {
    const box = { events, sent: [] as SandboxInvoke[], destroyed: false, silent: false }
    made.push(box)
    return {
      send: (m) => {
        box.sent.push(m)
        if (box.silent) return
        void Promise.resolve()
          .then(() => answers(m))
          .then(
            (ok) => !box.destroyed && events.reply(m.id, { json: JSON.stringify(ok ?? null) }),
            (err: Error) => !box.destroyed && events.reply(m.id, { error: { name: err.name, message: err.message } })
          )
      },
      destroy: () => void (box.destroyed = true)
    }
  }
  return { factory, made }
}

const quiet = { info: () => {}, warn: () => {}, error: () => {} }

function runService(
  answers: (m: SandboxInvoke) => unknown,
  manifest = manifestOf(),
  beforeTool?: ConstructorParameters<typeof CommunityService>[0]['beforeTool']
) {
  const sandboxes = fakeSandboxes(answers)
  const bridge = sandboxBridge(manifest, contextOf(manifest, memoryStore()).ctx)
  const service = new CommunityService({ manifest, bridge, factory: sandboxes.factory, log: quiet, restartMs: 10, everyMs: 60_000, beforeTool })
  return { service, ...sandboxes }
}

const answering = (m: SandboxInvoke): unknown => {
  if (m.kind === 'activate') return described()
  if (m.kind === 'ping') return 'pong'
  if (m.kind === 'method') return `${m.name}:${JSON.stringify(m.args)}`
  if (m.kind === 'tool') return `greeted ${(m.args[0] as { name: string }).name}`
  if (m.kind === 'deadlines')
    return [
      { id: 'a', domain: 'family', title: 'Fête', due: '2026-11-01' },
      { id: 'b', domain: 'nowhere', title: 'x', due: 'y' }
    ]
  return null
}

const settle = () => new Promise((r) => setTimeout(r, 20))

describe('a community service, run', () => {
  it('starts, says what it lends, and answers as a built-in service would', async () => {
    const { service, made } = runService(answering)
    service.start()
    expect(service.status).toBe('starting')
    // A call made while it starts waits for it.
    const early = service.runtime.methods.greet('Camille')
    made[0].events.loaded()
    await expect(early).resolves.toBe('greet:["Camille"]')
    expect(service.status).toBe('ready')
    expect(made[0].sent[0]).toMatchObject({ kind: 'activate', args: [expect.objectContaining({ id: 'bonjour' })] })
    expect(service.runtime.tools!.map((t) => [t.name, t.label])).toEqual([['greet', 'saluer']])
    expect(await service.runtime.tools![0].run({ name: 'Camille' }, {})).toBe('greeted Camille')
    expect(service.module.tile).toEqual({ everyMinutes: 60 })
    await expect(service.runtime.methods.steal()).rejects.toThrow('Bonjour : méthode inconnue (steal)')
    expect(await service.runtime.today!('2026-10-30')).toEqual([])
    await settle()
    // Deadlines kept, the ones that read as such.
    expect(service.runtime.deadlines!()).toEqual([{ id: 'a', domain: 'family', title: 'Fête', due: '2026-11-01' }])
    service.stop()
    expect(service.status).toBe('stopped')
    expect(made[0].destroyed).toBe(true)
    await expect(service.runtime.methods.greet('x')).rejects.toThrow('3615 BONJOUR est arrêté.')
  })

  it('checks a tool’s arguments before they cross', async () => {
    const { service, made } = runService(answering)
    service.start()
    made[0].events.loaded()
    await settle()
    await expect(service.runtime.tools![0].run({ name: '' }, {})).rejects.toMatchObject({ name: 'ToolError' })
    expect(made[0].sent.some((m) => m.kind === 'tool')).toBe(false)
  })

  describe('what a tool is sent', () => {
    /** A tool whose schema lets a long text through, so that only the size stops it. */
    const anyText = (m: SandboxInvoke): unknown =>
      m.kind === 'activate'
        ? described({ tools: [{ name: 'greet', label: 'saluer', description: 'A greeting.', readOnly: true, input: schemaOf({ name: z.string() }) }] })
        : answering(m)
    const started = async (beforeTool?: ConstructorParameters<typeof CommunityService>[0]['beforeTool']) => {
      const run = runService(anyText, manifestOf(), beforeTool)
      run.service.start()
      run.made[0].events.loaded()
      await settle()
      return run
    }
    const toolsSent = (box: { sent: SandboxInvoke[] }) => box.sent.filter((m) => m.kind === 'tool')
    /** A name that makes the arguments, as JSON, exactly so many bytes. */
    const sized = (bytes: number) => ({ name: 'x'.repeat(bytes - JSON.stringify({ name: '' }).length) })

    it('stops more than 1 KB before it crosses, and says so to the model', async () => {
      const { service, made } = await started()
      await expect(service.runtime.tools![0].run(sized(MAX_TOOL_ARGUMENTS_BYTES + 1), {})).rejects.toMatchObject({
        name: 'ToolError',
        message: expect.stringContaining('Nothing was sent')
      })
      expect(toolsSent(made[0])).toEqual([])
      expect(await service.runtime.tools![0].run(sized(MAX_TOOL_ARGUMENTS_BYTES), {})).toContain('greeted')
    })

    it('counts bytes, not characters', async () => {
      const { service, made } = await started()
      await expect(service.runtime.tools![0].run({ name: 'é'.repeat(MAX_TOOL_ARGUMENTS_BYTES - 20) }, {})).rejects.toMatchObject({ name: 'ToolError' })
      expect(toolsSent(made[0])).toEqual([])
    })

    it('asks the host first, the folder going no further', async () => {
      const asked = vi.fn(async () => {})
      const { service, made } = await started(asked)
      expect(await service.runtime.tools![0].run({ name: 'Camille' }, { folderId: 'folder-1' })).toBe('greeted Camille')
      expect(asked).toHaveBeenCalledWith(expect.objectContaining({ label: 'saluer' }), { name: 'Camille' }, { folderId: 'folder-1' })
      expect(toolsSent(made[0])).toHaveLength(1)
      expect(JSON.stringify(made[0].sent)).not.toContain('folder-1')
    })

    it('sends nothing when the host says no', async () => {
      const { service, made } = await started(async () => {
        throw Object.assign(new Error('The user refused'), { name: 'ToolError' })
      })
      await expect(service.runtime.tools![0].run({ name: 'Camille' }, {})).rejects.toThrow('The user refused')
      expect(toolsSent(made[0])).toEqual([])
    })

    it('never asks the user about what would be refused anyway', async () => {
      const asked = vi.fn(async () => {})
      const { service } = await started(asked)
      await expect(service.runtime.tools![0].run({ name: 3 } as never, {})).rejects.toMatchObject({ name: 'ToolError' })
      await expect(service.runtime.tools![0].run(sized(MAX_TOOL_ARGUMENTS_BYTES + 1), {})).rejects.toMatchObject({ name: 'ToolError' })
      expect(asked).not.toHaveBeenCalled()
    })
  })

  it('is refused when it lends a tool it didn’t declare', async () => {
    const { service, made } = runService((m) =>
      m.kind === 'activate' ? described({ tools: [{ ...described().tools[0], name: 'everything', label: 'tout' }] }) : null
    )
    service.start()
    made[0].events.loaded()
    await settle()
    expect(service.status).toBe('failed')
    expect(service.error).toBe('il prête l’outil « everything », que son manifeste n’annonce pas (marianne.tools).')
    expect(service.runtime.tools).toEqual([])
    expect(made[0].destroyed).toBe(true)
  })

  it('is started again once after a crash, then stays off saying why, its tools withdrawn', async () => {
    const { service, made } = runService(answering)
    service.start()
    made[0].events.loaded()
    await settle()
    expect(service.runtime.tools).toHaveLength(1)
    made[0].events.gone('crashed')
    expect(service.status).toBe('starting')
    expect(service.runtime.tools).toEqual([])
    await settle()
    expect(made).toHaveLength(2)
    made[1].events.loaded()
    await settle()
    expect(service.status).toBe('ready')
    // What an ended sandbox says is not heard.
    made[0].events.gone('crashed')
    expect(service.status).toBe('ready')
    made[1].events.gone('crashed')
    expect(service.status).toBe('failed')
    expect(service.error).toBe('il s’est arrêté de façon inattendue ; Marianne ne le relance pas une deuxième fois.')
    expect(service.runtime.tools).toEqual([])
    await expect(service.runtime.methods.greet('x')).rejects.toThrow('n’a pas pu démarrer')
    // Stopped (the lock), it may start afresh.
    service.stop()
    service.start()
    expect(made).toHaveLength(3)
  })

  it('ends a sandbox that hangs: a call not answered, a ping neither', async () => {
    vi.useFakeTimers()
    const { service, made } = runService(answering)
    service.start()
    made[0].events.loaded()
    await vi.advanceTimersByTimeAsync(5)
    expect(service.status).toBe('ready')
    made[0].silent = true
    const call = service.runtime.methods.greet('x')
    const failed = expect(call).rejects.toThrow('n’a pas répondu à temps')
    await vi.advanceTimersByTimeAsync(30_000)
    await failed
    await vi.advanceTimersByTimeAsync(5_000)
    expect(made[0].sent.some((m) => m.kind === 'ping')).toBe(true)
    expect(made[0].destroyed).toBe(true)
    expect(service.status).toBe('starting')
    vi.useRealTimers()
    service.stop()
  })
})

// ---------------------------------------------------------------- the window's frame

describe('a community screen’s relay', () => {
  /** A relay for 3615 BONJOUR, the app faked: what the screen gets, what the window gets, what the app was asked. */
  function relayOf() {
    let now = 1_000_000
    const toScreen: unknown[] = []
    const toWindow: unknown[] = []
    const asked = { calls: [] as unknown[][], saved: [] as unknown[][], copied: [] as string[], touched: 0, locked: 0 }
    const host: ScreenHost = {
      manifestOf: (code) => (code === 'bonjour' ? manifestOf() : null),
      home: () => ({ code: '35238', name: 'Rennes', postcode: '35000', latitude: 48.11, longitude: -1.68 }),
      call: async (code, method, args) => (asked.calls.push([code, method, args]), `${method}!`),
      load: () => ({ visits: 2 }),
      save: (code, key, value) => void asked.saved.push([code, key, value]),
      copy: (text) => void asked.copied.push(text),
      touch: () => void asked.touched++,
      lockShortcut: () => 'CommandOrControl+L',
      lock: () => void asked.locked++,
      log: quiet,
      now: () => now
    }
    const relay = new ScreenRelay('bonjour', host, (m) => toScreen.push(m))
    relay.on('window', (m) => toWindow.push(m))
    return { relay, toScreen, toWindow, asked, later: (ms: number) => (now += ms) }
  }
  const init = (home: unknown) => ({
    type: 'init',
    host: { manifest: manifestOf(), params: {}, home },
    tabs: [],
    tab: '',
    barred: false,
    look: { theme: 'minitel', crt: false, fontSize: 14, platform: 'win32' }
  })

  it('gives the screen the commune of the address, never its place, once it says hello', () => {
    const { relay, toScreen } = relayOf()
    relay.fromWindow(init({ code: '35238', name: 'Rennes', postcode: '35000', latitude: 48.1173, longitude: -1.6778 }))
    expect(toScreen).toEqual([])
    relay.fromScreen({ type: 'hello' })
    expect(toScreen).toEqual([
      expect.objectContaining({
        type: 'init',
        host: expect.objectContaining({ home: { code: '35238', name: 'Rennes', postcode: '35000', latitude: 48.11, longitude: -1.68 } })
      })
    ])
  })

  it('answers its calls and data itself', async () => {
    const { relay, toScreen, asked } = relayOf()
    relay.fromScreen({ type: 'call', id: 1, method: 'greet', args: ['Camille'] })
    relay.fromScreen({ type: 'save', id: 2, key: 'prefs', value: { name: 'Camille' } })
    relay.fromScreen({ type: 'load', id: 3, key: 'prefs' })
    await settle()
    expect(asked.calls).toEqual([['bonjour', 'greet', ['Camille']]])
    expect(asked.saved).toEqual([['bonjour', 'prefs', { name: 'Camille' }]])
    expect(toScreen).toEqual(
      expect.arrayContaining([
        { type: 'reply', id: 1, ok: 'greet!' },
        { type: 'reply', id: 3, ok: { visits: 2 } }
      ])
    )
  })

  it('takes the user’s presence and their keys from the screen’s input, never from its page', () => {
    const { relay, toWindow, asked, later } = relayOf()
    relay.fromScreen({ type: 'activity' })
    expect(asked.touched).toBe(0)
    // An échap the page hands back counts only after a real one.
    relay.fromScreen({ type: 'key', key: 'Escape' })
    expect(toWindow).toEqual([])
    expect(relay.input('key', 'Escape')).toBeNull()
    expect(asked.touched).toBe(1)
    relay.fromScreen({ type: 'key', key: 'Escape' })
    expect(toWindow).toEqual([{ type: 'key', key: 'Escape' }])
    later(2000)
    relay.fromScreen({ type: 'key', key: 'Escape' })
    expect(toWindow).toHaveLength(1)
    // F1 to F9 go to the window from the input itself (and the page never gets them).
    expect(relay.input('key', 'F3')).toBe('F3')
    expect(toWindow.at(-1)).toEqual({ type: 'key', key: 'F3' })
  })

  it('opens a link or copies only right after the user’s click, and labels what it shows as its own', () => {
    const { relay, toWindow, asked, later } = relayOf()
    relay.fromScreen({ type: 'url', url: 'https://api.example.fr/a' })
    relay.fromScreen({ type: 'copy', text: 'secret' })
    expect(toWindow).toEqual([])
    expect(asked.copied).toEqual([])
    // A scroll or a key that isn't Enter nor Space is no go-ahead.
    relay.input('wheel')
    relay.input('key', 'a', { ctrlKey: false, altKey: false, metaKey: false, shiftKey: false })
    relay.fromScreen({ type: 'url', url: 'https://api.example.fr/a' })
    expect(toWindow).toEqual([])
    relay.input('click')
    relay.fromScreen({ type: 'url', url: 'https://evil.example.com/' })
    relay.fromScreen({ type: 'url', url: 'https://api.example.fr/a' })
    relay.fromScreen({ type: 'copy', text: 'Bonjour Camille', done: 'salut copié' })
    expect(asked.copied).toEqual(['Bonjour Camille'])
    expect(toWindow).toEqual([
      { type: 'url', url: 'https://api.example.fr/a' },
      { type: 'toast', text: '3615 BONJOUR · salut copié' }
    ])
    later(6000)
    relay.fromScreen({ type: 'url', url: 'https://api.example.fr/a' })
    expect(toWindow).toHaveLength(2)
    relay.fromScreen({ type: 'toast', text: 'Votre compte est bloqué' })
    expect(toWindow.at(-1)).toEqual({ type: 'toast', text: '3615 BONJOUR · Votre compte est bloqué' })
    relay.fromScreen({ type: 'ask', text: 'Une question', page: { url: 'https://www.impots.gouv.fr/', title: 'Impôts', text: '…' } })
    expect(toWindow.at(-1)).toEqual({ type: 'ask', text: 'Une question', page: { url: '', title: '3615 BONJOUR · Impôts', text: '…' } })
  })

  it('locks the account with the user’s shortcut, the focus in the screen', () => {
    const { relay, asked } = relayOf()
    const none = { ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }
    expect(relay.input('key', 'l', { ...none, code: 'KeyL' })).toBeNull()
    expect(asked.locked).toBe(0)
    const ctrl = process.platform === 'darwin' ? { ...none, metaKey: true } : { ...none, ctrlKey: true }
    expect(relay.input('key', 'l', { ...ctrl, code: 'KeyL' })).toBe('lock')
    expect(asked.locked).toBe(1)
    // With a modifier, no F key goes to the window.
    expect(relay.input('key', 'F3', { ...none, shiftKey: true })).toBeNull()
  })

  it('drops what a screen sends past its rate', () => {
    const { relay, asked } = relayOf()
    for (let i = 0; i < 1000; i++) relay.fromScreen({ type: 'call', id: i + 1, method: 'greet', args: [] })
    return settle().then(() => expect(asked.calls.length).toBeLessThan(400))
  })
})

describe('a community screen’s messages', () => {
  it('reads the frame’s messages as data, within their limits', () => {
    expect(readFromFrame({ type: 'call', id: 1, method: 'greet', args: ['x'] })).toEqual({ type: 'call', id: 1, method: 'greet', args: ['x'] })
    expect(readFromFrame({ type: 'call', id: 1, method: 'constructor.prototype', args: [] })).toBeNull()
    expect(readFromFrame({ type: 'call', id: 0, method: 'greet', args: [] })).toBeNull()
    expect(readFromFrame({ type: 'eval', code: 'x' })).toBeNull()
    expect(readFromFrame('hello')).toBeNull()
    expect(readFromFrame({ type: 'route', route: 'settings/identity' })).toEqual({ type: 'route', route: 'settings/identity' })
    expect(readFromFrame({ type: 'route', route: 'folder:abc' })).toBeNull()
    expect(readFromFrame({ type: 'key', key: 'F3' })).toEqual({ type: 'key', key: 'F3' })
    expect(readFromFrame({ type: 'key', key: 'Control' })).toBeNull()
    expect(readFromFrame({ type: 'badges', badges: { a: '1'.repeat(25) } })).toBeNull()
    expect(readFromFrame({ type: 'ask', text: 'Une question', page: { url: 'javascript:alert(1)', title: '', text: '' } })).toBeNull()
  })

  it('opens pages of its declared hosts and links only', () => {
    const m = manifestOf()
    expect(frameMayOpen(m, 'https://api.example.fr/a')).toBe(true)
    expect(frameMayOpen(m, 'https://www.example.fr/videos/12')).toBe(true)
    expect(frameMayOpen(m, 'https://www.example.fr/other')).toBe(false)
    expect(frameMayOpen(m, 'http://api.example.fr/a')).toBe(false)
    expect(frameMayOpen(m, 'https://evil.example.com/')).toBe(false)
    expect(frameMayOpen(m, 'file:///etc/passwd')).toBe(false)
  })
})

describe('the user’s yes, before a service nobody reviewed receives anything', () => {
  const manifest = manifestOf()
  const tool = { label: 'saluer' }
  const answering = (decision: 'accepted' | 'refused' | 'expired') => vi.fn<AskUser>(async () => decision)

  it('shows the service, why, and every argument as it would be sent', () => {
    const card = consentCard(manifest, tool, 'outside', { name: 'Zoé', times: 2, tags: ['a', 'b'] })
    expect(card).toMatchObject({ kind: 'service', title: 'Envoyer à 3615 BONJOUR ?' })
    expect(card.reason).toContain('hors catalogue')
    expect(card.fields).toEqual([
      { label: 'outil', value: 'saluer' },
      { label: 'name', value: 'Zoé' },
      { label: 'times', value: '2' },
      { label: 'tags', value: '["a","b"]' }
    ])
    expect(consentCard(manifest, tool, 'unvalidated', {}).reason).toContain('non validé')
    expect(consentCard(manifest, tool, 'withdrawn', {}).reason).toContain('retiré du catalogue')
  })

  it.each(['unvalidated', 'outside', 'withdrawn'] as const)('asks, in the folder of the call, for a service %s', async (trust) => {
    const ask = answering('accepted')
    await expect(askConsent(ask, 'folder-1', manifest, tool, trust, { name: 'Zoé' })).resolves.toBeUndefined()
    expect(ask).toHaveBeenCalledWith('folder-1', expect.objectContaining({ kind: 'service' }))
  })

  it('doesn’t ask for a validated service', async () => {
    const ask = answering('refused')
    await expect(askConsent(ask, 'folder-1', manifest, tool, 'validated', { name: 'Zoé' })).resolves.toBeUndefined()
    expect(ask).not.toHaveBeenCalled()
  })

  it('doesn’t ask when there is nothing to send', async () => {
    const ask = answering('refused')
    await expect(askConsent(ask, 'folder-1', manifest, tool, 'outside', {})).resolves.toBeUndefined()
    expect(ask).not.toHaveBeenCalled()
  })

  it('takes a refusal, or no answer, as a no the model can read', async () => {
    await expect(askConsent(answering('refused'), 'folder-1', manifest, tool, 'outside', { name: 'Zoé' })).rejects.toMatchObject({
      name: 'ToolError',
      message: expect.stringContaining('nothing was sent to 3615 BONJOUR')
    })
    await expect(askConsent(answering('expired'), undefined, manifest, tool, 'outside', { name: 'Zoé' })).rejects.toMatchObject({
      name: 'ToolError',
      message: expect.stringContaining('No answer from the user')
    })
  })
})
