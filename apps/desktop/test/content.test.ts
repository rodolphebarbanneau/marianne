import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { format } from 'node:util'
import { readContent, writeBundle } from '@marianne/content'
import { files } from '@marianne/content/files'
import { setupLabel } from '@marianne/profile'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { appProblems, ContentStore, publishedBundle } from '../src/main/content'

const RELEASES_URL = 'https://api.example.test/repos/x/marianne/releases?per_page=10'
const BUNDLE_URL = 'https://example.test/releases/download/v0.1.0-alpha.3/content.json'
const asset = (name: string, url = `https://example.test/releases/download/v0.1.0-alpha.3/${name}`) => ({ name, browser_download_url: url })

/** GitHub's list of releases, newest first: a draft, then a prerelease with the bundle when one is published, then an older one without. */
const releases = (published: boolean) => [
  { draft: true, prerelease: true, assets: [asset('content.json', 'https://example.test/draft/content.json'), asset('content.json.sig')] },
  {
    draft: false,
    prerelease: true,
    assets: [asset('Marianne-Setup-0.1.0-alpha.3.exe'), ...(published ? [asset('content.json'), asset('content.json.sig')] : [])]
  },
  { draft: false, prerelease: true, assets: [asset('Marianne-Setup-0.1.0-alpha.2.exe')] }
]
const root = mkdtempSync(join(tmpdir(), 'marianne-content-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const pem = (key: KeyObject) => key.export({ type: 'spki', format: 'pem' }).toString()

/** Content edited the way a bundle would bring it: the taxes skill retitled. */
const newer = () => ({ ...files, 'skills/taxes.md': files['skills/taxes.md'].replace('title: Impôts', 'title: Impôts des particuliers') })

interface Published {
  data: Buffer
  signature: Buffer
  etag: string
}

function publish(content: Record<string, string>, version: string, key: KeyObject): Published {
  const data = Buffer.from(writeBundle(content, version))
  return { data, signature: sign(null, data, key), etag: `"${version}"` }
}

/** A store on its own folder, with a fake network serving `remote` and a log to read. */
function store(options: { key?: KeyObject | null; dir?: string; remote?: () => Published | null; list?: () => Response } = {}) {
  const lines: string[] = []
  /** The bundle's and its signature's, not the list's. */
  const requests: Array<{ url: string; headers: Record<string, string> }> = []
  const lists: string[] = []
  const dir = options.dir ?? mkdtempSync(join(root, 'store-'))
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    const published = options.remote?.()
    if (String(url) === RELEASES_URL) {
      lists.push(headers['User-Agent'])
      return options.list?.() ?? Response.json(releases(!!published))
    }
    requests.push({ url: String(url), headers })
    if (!published) return new Response('Not Found', { status: 404 })
    if (String(url).endsWith('.sig')) return new Response(new Uint8Array(published.signature))
    if (headers['If-None-Match'] === published.etag) return new Response(null, { status: 304 })
    return new Response(new Uint8Array(published.data), { headers: { ETag: published.etag } })
  })
  const log =
    (level: string) =>
    (...args: unknown[]) =>
      void lines.push(`${level} ${format(...args)}`)
  const s = new ContentStore({
    files,
    signingKey: options.key ? pem(options.key) : null,
    dir,
    releases: RELEASES_URL,
    userAgent: () => 'Marianne/test',
    fetch: fetch as unknown as typeof globalThis.fetch,
    log: { info: log('info'), warn: log('warn'), error: log('error') }
  })
  vi.useFakeTimers()
  s.start()
  vi.useRealTimers()
  return { s, dir, lines, requests, lists, fetch }
}

const title = (s: ContentStore) => s.get().skills.find((x) => x.name === 'taxes')?.title

describe('the built-in content', () => {
  const builtIn = readContent(files)

  it('is something this version of Marianne can honor', () => {
    expect(appProblems(builtIn)).toEqual([])
    for (const p of builtIn.procedures)
      for (const step of p.steps)
        for (const a of step.actions) if (a.kind === 'setup') expect(setupLabel(a.target, builtIn.sites), `${p.id}: setup ${a.target}`).not.toBeNull()
  })

  it('has the démarches the deadlines link to', () => {
    for (const id of ['renew-id-documents', 'declare-micro-turnover', 'declare-income']) expect(builtIn.procedures.map((p) => p.id)).toContain(id)
  })

  it('names the settings and document types it can’t honor', () => {
    const odd = structuredClone(builtIn)
    odd.procedures[0].steps[0].actions.push({ kind: 'setup', target: 'garage', label: 'x' }, { kind: 'document', target: 'receipt', label: 'y' })
    const where = `procedures/${odd.procedures[0].domain}/${odd.procedures[0].id}.md: step 1 "${odd.procedures[0].steps[0].title}"`
    expect(appProblems(odd)).toEqual([
      expect.stringContaining(`${where}: setup: "garage" is not a setting of Marianne (identity, address,`),
      expect.stringContaining(`${where}: document: "receipt" is not a document type of Marianne (tax_notice,`)
    ])
  })
})

describe('the content store', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')

  it('uses the built-in content and never looks for updates without a signing key', async () => {
    const { s, lines, fetch } = store({ key: null, remote: () => publish(newer(), '2026-11-02T10:00:00.000Z', privateKey) })
    await s.check()
    expect(fetch).not.toHaveBeenCalled()
    expect(s.origin).toBe('built-in')
    expect(s.version).toBe(`${readContent(files).updated}T23:59:59.999Z`)
    expect(lines).toEqual([expect.stringMatching(/^info Content updates are off: no signing key/)])
  })

  it('takes a newer signed bundle, keeps it, and asks again conditionally', async () => {
    const published = publish(newer(), '2026-11-02T10:00:00.000Z', privateKey)
    const { s, dir, requests, lists } = store({ key: publicKey, remote: () => published })
    const changed = vi.fn()
    s.on('change', changed)
    await s.check()
    expect(s.origin).toBe('bundle')
    expect(s.version).toBe('2026-11-02T10:00:00.000Z')
    expect(title(s)).toBe('Impôts des particuliers')
    expect(changed).toHaveBeenCalledTimes(1)
    expect(requests.map((r) => r.url)).toEqual([BUNDLE_URL, `${BUNDLE_URL}.sig`])
    expect(requests[0].headers['User-Agent']).toBe('Marianne/test')
    expect(lists).toEqual(['Marianne/test'])
    expect(readFileSync(join(dir, 'content.json'))).toEqual(published.data)
    expect(readFileSync(join(dir, 'content.json.sig'))).toEqual(published.signature)

    await s.check()
    expect(requests[2].headers['If-None-Match']).toBe(published.etag)
    expect(requests).toHaveLength(3)
    expect(changed).toHaveBeenCalledTimes(1)

    // The next start begins with it.
    const next = store({ key: publicKey, dir })
    expect(next.s.origin).toBe('bundle')
    expect(title(next.s)).toBe('Impôts des particuliers')
  })

  it('refuses a bundle whose signature does not match, and tries it again next time', async () => {
    const other = generateKeyPairSync('ed25519').privateKey
    const { s, dir, lines, requests } = store({ key: publicKey, remote: () => publish(newer(), '2026-11-02T10:00:00.000Z', other) })
    await s.check()
    await s.check()
    expect(s.origin).toBe('built-in')
    expect(lines.filter((l) => l.startsWith('warn'))).toEqual([
      expect.stringMatching(/refused: its signature does not match the project’s key; trying again next time$/),
      expect.stringMatching(/refused: its signature does not match/)
    ])
    expect(requests.filter((r) => r.url === BUNDLE_URL).every((r) => !r.headers['If-None-Match'])).toBe(true)
    expect(existsSync(join(dir, 'content.json'))).toBe(false)
  })

  it('refuses a bundle that is not newer than the content in use, and doesn’t download it again', async () => {
    const { s, lines, requests } = store({ key: publicKey, remote: () => publish(newer(), `${readContent(files).updated}T12:00:00.000Z`, privateKey) })
    await s.check()
    await s.check()
    expect(s.origin).toBe('built-in')
    expect(lines).toContainEqual(expect.stringMatching(/^info Content bundle .* refused: its version .* is not newer than the content in use/))
    expect(requests.map((r) => r.url)).toEqual([BUNDLE_URL, `${BUNDLE_URL}.sig`, BUNDLE_URL])
  })

  it('refuses a signed bundle it can’t use, saying what is wrong', async () => {
    const broken = {
      ...files,
      'procedures/taxes/declare-income.md': files['procedures/taxes/declare-income.md'].replace('> setup: account:impots', '> setup: garage')
    }
    const { s, lines } = store({ key: publicKey, remote: () => publish(broken, '2026-11-02T10:00:00.000Z', privateKey) })
    await s.check()
    expect(s.origin).toBe('built-in')
    expect(lines).toContainEqual(
      expect.stringMatching(
        /^warn Content bundle .* refused: version 2026-11-02T10:00:00\.000Z: 1 problem in the content:\n- procedures\/taxes\/declare-income\.md: .*setup: "garage" is not a setting of Marianne/
      )
    )
  })

  it('removes a kept bundle that no longer checks out, and downloads the published one again', async () => {
    const published = publish(newer(), '2026-11-02T10:00:00.000Z', privateKey)
    const first = store({ key: publicKey, remote: () => published })
    await first.s.check()
    writeFileSync(join(first.dir, 'content.json'), Buffer.from(published.data.toString('utf8').replace('Impôts des particuliers', 'Impôts des contribuables')))
    const next = store({ key: publicKey, dir: first.dir, remote: () => published })
    expect(next.s.origin).toBe('built-in')
    expect(next.lines).toContainEqual(
      expect.stringMatching(/^warn Content bundle .*content\.json refused: its signature does not match the project’s key; removed$/)
    )
    expect(existsSync(join(first.dir, 'content.json'))).toBe(false)
    await next.s.check()
    expect(next.requests[0].headers['If-None-Match']).toBeUndefined()
    expect(title(next.s)).toBe('Impôts des particuliers')
  })

  it('says when nothing is published', async () => {
    const { s, lines, requests } = store({ key: publicKey, remote: () => null })
    await s.check()
    expect(s.origin).toBe('built-in')
    expect(requests).toEqual([])
    expect(lines).toEqual([`info Content: no bundle published in the releases of ${RELEASES_URL}`])
  })

  it('tries again next time when the list of releases can’t be read', async () => {
    const published = publish(newer(), '2026-11-02T10:00:00.000Z', privateKey)
    let answer = () => new Response('rate limit exceeded', { status: 403 })
    const { s, lines } = store({ key: publicKey, remote: () => published, list: () => answer() })
    await s.check()
    expect(lines).toEqual([`warn Content: HTTP 403 from ${RELEASES_URL}`])
    answer = () => new Response('<html>', { status: 200 })
    await s.check()
    expect(lines[1]).toMatch(/^warn Content: update check failed:/)
    expect(s.origin).toBe('built-in')
  })
})

describe('the published bundle', () => {
  it('is the newest release’s that carries a bundle and its signature, prereleases included and drafts skipped', () => {
    expect(publishedBundle(releases(true))).toEqual({ bundle: BUNDLE_URL, signature: `${BUNDLE_URL}.sig` })
    const older = asset('content.json', 'https://example.test/releases/download/v0.1.0-alpha.2/content.json')
    const olderSig = asset('content.json.sig', 'https://example.test/releases/download/v0.1.0-alpha.2/content.json.sig')
    // A release with its bundle and not yet its signature is passed over for an older one with both.
    expect(publishedBundle([{ assets: [asset('content.json')] }, { assets: [older, olderSig] }])).toEqual({
      bundle: older.browser_download_url,
      signature: olderSig.browser_download_url
    })
  })

  it('is none when no release has one, or the list is not a list', () => {
    expect(publishedBundle(releases(false))).toBeNull()
    expect(publishedBundle([])).toBeNull()
    expect(publishedBundle({ message: 'API rate limit exceeded' })).toBeNull()
    expect(publishedBundle([null, { assets: null }])).toBeNull()
  })
})
