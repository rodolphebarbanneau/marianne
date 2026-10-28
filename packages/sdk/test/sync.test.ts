import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execute, type SyncJob, type SyncMessage } from '../src/sync'

let dir: string
let job: SyncJob

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'marianne-sync-'))
  job = { dataDir: join(dir, 'data'), tmpDir: join(dir, 'tmp'), hosts: ['data.example.fr'], userAgent: 'Marianne/test', etags: {} }
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(dir, { recursive: true, force: true })
})

const run = async (fn: Parameters<typeof execute>[1], input = job) => {
  const messages: SyncMessage[] = []
  await execute(input, fn, (m) => messages.push(m))
  return messages
}

describe('execute', () => {
  it('downloads, keeps the ETag, removes temporary files and reports the summary', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response('dump', { status: 200, headers: { etag: '"v2"' } }))
    vi.stubGlobal('fetch', fetch)
    let path = ''
    const messages = await run(async (ctx) => {
      path = (await ctx.download('https://data.example.fr/dump.zip'))!
      expect(readFileSync(path, 'utf8')).toBe('dump')
      return { summary: '3 items' }
    })
    expect(messages.at(-1)).toEqual({ type: 'done', summary: '3 items', etags: { 'https://data.example.fr/dump.zip': '"v2"' } })
    expect(existsSync(path)).toBe(false)
    expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { 'User-Agent': 'Marianne/test' } })
  })

  it('asks conditionally and returns null when nothing changed', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 304 }))
    vi.stubGlobal('fetch', fetch)
    const messages = await run(async (ctx) => ((await ctx.download('https://data.example.fr/dump.zip')) === null ? null : { summary: 'changed' }), {
      ...job,
      etags: { 'https://data.example.fr/dump.zip': '"v1"' }
    })
    expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { 'If-None-Match': '"v1"' } })
    expect(messages.at(-1)).toMatchObject({ type: 'done', summary: null })
  })

  it('refuses hosts the service has not declared, and plain http', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const messages = await run(async (ctx) => {
      await ctx.download('https://elsewhere.fr/dump.zip')
      return { summary: '' }
    })
    expect(messages.at(-1)).toMatchObject({ type: 'error', message: expect.stringMatching(/elsewhere\.fr/) })
    const plain = await run(async (ctx) => {
      await ctx.download('http://data.example.fr/dump.zip')
      return { summary: '' }
    })
    expect(plain.at(-1)).toMatchObject({ type: 'error' })
  })
})
