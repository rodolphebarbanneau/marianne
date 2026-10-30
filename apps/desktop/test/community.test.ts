import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { format } from 'node:util'
import { strToU8, zipSync, type Zippable } from 'fflate'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { CommunityPackages, INSTALLED_FILE, type CommunityOptions } from '../src/main/community/install'
import { MAX_SERVICE_FILE_BYTES, NO_SYNC, PackageRefused, sha256, unpackService } from '../src/main/community/package'
import type { CatalogueEntry, CatalogueState, Withdrawal } from '../src/shared/catalogue'

const root = mkdtempSync(join(tmpdir(), 'marianne-community-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const RESERVED = new Set(['meteo', 'parlement'])
const ICON = { palette: { v: 'vert', w: 'blanc' }, pixels: ['..vvvv..', '..vwwv..', 'vvvwwvvv', 'vwwwwwwv', 'vvvwwvvv', '..vwwv..', '..vvvv..', '........'] }

/** A service's package.json, as a community author writes it. */
function manifest(patch: Record<string, unknown> = {}, version = '1.3.0', code = 'pharmagarde') {
  return JSON.stringify({
    name: `@marianne/service-${code}`,
    version,
    author: 'Collectif Santé libre',
    marianne: {
      code,
      name: 'Pharmacies de garde',
      description: 'la pharmacie de garde la plus proche, ce soir et ce week-end',
      category: 'health',
      hosts: ['www.data.gouv.fr'],
      icon: ICON,
      tools: [{ name: 'nearest', label: 'trouver la pharmacie de garde' }],
      ...patch
    }
  })
}

/** A .3615 file's bytes: a zip of these entries (deflated; `level: 0` stores them). */
function service(entries: Record<string, string> = {}, level: 0 | 6 = 6): Uint8Array {
  const files: Zippable = {}
  for (const [name, text] of Object.entries({
    'package.json': manifest(),
    'main.js': 'export const service = {}',
    'view.js': 'export default () => null',
    ...entries
  }))
    files[name] = strToU8(text)
  return zipSync(files, { level })
}

/** The zip without one of its entries. */
function without(name: string, entries: Record<string, string> = {}): Uint8Array {
  const files: Zippable = {}
  for (const [n, text] of Object.entries({
    'package.json': manifest(),
    'main.js': 'export const service = {}',
    'view.js': 'export default () => null',
    ...entries
  }))
    if (n !== name) files[n] = strToU8(text)
  return zipSync(files)
}

/** Where each entry's central directory record is, by name. */
function records(zip: Uint8Array): Map<string, number> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const end = zip.length - 22
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const found = new Map<string, number>()
  for (let i = 0; i < count; i++) {
    const nameLength = view.getUint16(at + 28, true)
    found.set(new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength)), at)
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
  }
  return found
}

/** Every occurrence of `from` in the bytes replaced by `to` (as long). */
function patch(zip: Uint8Array, from: string, to: string): Uint8Array {
  const out = zip.slice()
  const a = strToU8(from)
  const b = strToU8(to)
  for (let i = 0; i + a.length <= out.length; i++) if (a.every((x, j) => out[i + j] === x)) out.set(b, i)
  return out
}

const problems = (bytes: Uint8Array) => {
  try {
    unpackService(bytes, { reserved: RESERVED })
    return []
  } catch (err) {
    return (err as { problems: string[] }).problems
  }
}

function entryFor(bytes: Uint8Array, patch: Partial<CatalogueEntry> = {}): CatalogueEntry {
  return {
    code: 'pharmagarde',
    version: '1.3.0',
    name: 'Pharmacies de garde',
    description: 'la pharmacie de garde la plus proche',
    category: 'health',
    keywords: [],
    author: 'Collectif Santé libre',
    hosts: ['www.data.gouv.fr'],
    links: [],
    connections: [],
    reads: [],
    tools: ['trouver la pharmacie de garde'],
    sync: false,
    icon: null,
    status: 'validated',
    recommended: false,
    published: '2026-10-12',
    file: { url: 'https://services.example.test/pharmagarde.3615', size: bytes.length, sha256: sha256(bytes) },
    ...patch
  }
}

/** Community packages on their own folder, with a catalogue to set and a network serving `served`. */
function community(options: Partial<CommunityOptions> & { served?: () => Uint8Array | null } = {}) {
  const dir = mkdtempSync(join(root, 'community-'))
  const catalogue: Pick<CatalogueState, 'entries' | 'withdrawn'> = { entries: [], withdrawn: [] }
  const lines: string[] = []
  const log =
    (level: string) =>
    (...args: unknown[]) =>
      void lines.push(`${level} ${format(...args)}`)
  const fetch = vi.fn(async () => {
    const bytes = options.served?.()
    return bytes ? new Response(new Uint8Array(bytes)) : new Response('Not Found', { status: 404 })
  })
  const c = new CommunityPackages({
    dir,
    reserved: RESERVED,
    catalogue: () => catalogue,
    userAgent: () => 'Marianne/test',
    fetch: fetch as unknown as typeof globalThis.fetch,
    log: { info: log('info'), warn: log('warn'), error: log('error') },
    ...options
  })
  const events: unknown[] = []
  c.on('installed', (p) => events.push(['installed', p]))
  c.on('removed', (p) => events.push(['removed', p]))
  /** The bytes written as a .3615 file to review. */
  const file = (bytes: Uint8Array, name = 'pharmagarde.3615') => {
    const path = join(mkdtempSync(join(root, 'files-')), name)
    writeFileSync(path, bytes)
    return path
  }
  return { c, dir, catalogue, lines, events, file, fetch }
}

describe('a .3615 file', () => {
  it('holds a service: its manifest, checked, and its entries', () => {
    const { manifest: m, files } = unpackService(service({ 'view.css': '.x{}', 'help.md': '# Aide' }), { reserved: RESERVED })
    expect(m).toMatchObject({ id: 'pharmagarde', version: '1.3.0', author: 'Collectif Santé libre', icon: ICON })
    expect([...files.keys()].sort()).toEqual(['help.md', 'main.js', 'package.json', 'view.css', 'view.js'])
    expect(new TextDecoder().decode(files.get('main.js'))).toBe('export const service = {}')
    expect(problems(service({}, 0))).toEqual([])
  })

  it('may not lead a file out of its folder', () => {
    expect(problems(service({ '../main.js': 'x' }))).toContain('« ../main.js » sortirait du dossier du service.')
    expect(problems(service({ '/etc/main.js': 'x' }))[0]).toMatch(/est un chemin absolu/)
    expect(problems(service({ 'C:/main.js': 'x' }))[0]).toMatch(/est un chemin absolu/)
    expect(problems(service({ 'lib\\main.js': 'x' }))[0]).toMatch(/barre oblique inverse/)
  })

  it('holds the allowed entries only, at its root', () => {
    expect(problems(service({ 'install.exe': 'MZ' }))).toEqual([
      '« install.exe » n’a pas sa place dans un service.',
      'Un fichier .3615 contient package.json, main.js, view.js, et au besoin view.css, help.md, README.md : rien d’autre.'
    ])
    const nested = problems(zipSync({ pharmagarde: { 'package.json': strToU8(manifest()), 'main.js': strToU8('x'), 'view.js': strToU8('x') } }))
    expect(nested).toContain(
      'Un fichier .3615 n’a pas de dossier : ses fichiers sont à sa racine (package.json, main.js, view.js, view.css, help.md, README.md).'
    )
    expect(nested).toContain('Il y manque main.js.')
  })

  it('opens links only on its own hosts, never on a built-in service’s', () => {
    const protectedHosts = new Set(['videos.assemblee-nationale.fr'])
    const read = (marianne: Record<string, unknown>) => {
      try {
        unpackService(service({ 'package.json': manifest(marianne) }), { reserved: RESERVED, protectedHosts })
        return []
      } catch (err) {
        return (err as PackageRefused).problems
      }
    }
    expect(read({ links: ['https://www.data.gouv.fr/datasets/'] })).toEqual([])
    expect(read({ links: ['https://www.impots.gouv.fr/'] })).toEqual([
      'Le lien « https://www.impots.gouv.fr/ » n’est pas sur un site que 3615 PHARMAGARDE déclare.'
    ])
    expect(read({ hosts: ['www.data.gouv.fr', 'videos.assemblee-nationale.fr'], links: ['https://videos.assemblee-nationale.fr/'] })).toEqual([
      'Le lien « https://videos.assemblee-nationale.fr/ » est sur videos.assemblee-nationale.fr, un site que Marianne ouvre elle-même : un service de la communauté ne peut pas l’ouvrir à sa place.'
    ])
  })

  it('has no sync job: it would run with Node, out of any sandbox', () => {
    expect(problems(service({ 'sync.js': 'export default {}' }))).toEqual([NO_SYNC])
    expect(NO_SYNC).toMatch(/^Ce service a une tâche de synchronisation \(sync\.js\)/)
  })

  it('needs its manifest, its main side and its view', () => {
    expect(problems(without('main.js'))).toEqual(['Il y manque main.js.'])
    expect(problems(without('view.js'))).toEqual(['Il y manque view.js.'])
    expect(problems(without('package.json'))).toEqual(['Il y manque package.json.'])
  })

  it('holds each entry once', () => {
    const twice = patch(service({ mainXjs: 'export const other = 1' }), 'mainXjs', 'main.js')
    expect(problems(twice)).toEqual(['« main.js » y figure deux fois.'])
  })

  it('is refused when its manifest or its icon is not right', () => {
    expect(problems(service({ 'package.json': '{ "name": ' }))).toEqual(['Le manifeste (package.json) n’est pas un JSON lisible.'])
    expect(problems(service({ 'package.json': JSON.stringify({ name: '@marianne/service-x', version: '1.0.0' }) }))).toEqual([
      'Le manifeste est invalide : @marianne/service-x: no "marianne" field'
    ])
    const icon = problems(service({ 'package.json': manifest({ icon: { ...ICON, pixels: ICON.pixels.slice(1) } }) }))
    expect(icon[0]).toMatch(/^Le manifeste est invalide : .*"marianne\.icon": "pixels" has 7 rows/)
    expect(problems(service({ 'package.json': manifest({}, 'latest') }))).toEqual(['Sa version, « latest », ne se lit pas comme 1.2.3.'])
  })

  it('may not take the code of a service built into Marianne', () => {
    expect(problems(service({ 'package.json': manifest({}, '9.0.0', 'meteo') }))).toEqual([
      '3615 METEO est un service officiel de Marianne : un fichier ne peut pas le remplacer.'
    ])
  })

  it('may not ask for the headlines Marianne reads (ctx.news is for her own services)', () => {
    expect(problems(service({ 'package.json': manifest({ news: true }) }))).toEqual([
      '3615 PHARMAGARDE demande les titres de presse que lit Marianne (« news » dans son manifeste) : seuls ses services officiels les reçoivent.'
    ])
    expect(problems(service({ 'package.json': manifest({ search: { placeholder: 'chercher une pharmacie' } }) }))).toEqual([])
  })

  it('may not ask for the user’s news sources: they serve the headlines, which its sandbox never gets', () => {
    const asking = (profile: string[]) => manifest({ permissions: { profile, purpose: 'trier les titres' } })
    expect(problems(service({ 'package.json': asking(['opinions.themes', 'opinions.sources']) }))).toEqual([
      '3615 PHARMAGARDE demande vos sources d’information (« opinions.sources » dans son manifeste) : seuls les services officiels de Marianne les lisent.'
    ])
    expect(problems(service({ 'package.json': asking(['opinions.themes']) }))).toEqual([])
  })

  it('is refused when it is damaged, lies about a size, or is protected', () => {
    expect(problems(strToU8('not a zip at all, not even close to one'))).toEqual(['Ce fichier n’est pas une archive .3615 lisible.'])
    expect(problems(patch(service({ 'README.md': 'hello world' }, 0), 'hello world', 'jello world'))).toEqual(['« README.md » est endommagé.'])

    // main.js inflates to 20 000 bytes; its directory says 100.
    const big = service({ 'main.js': 'a'.repeat(20_000) })
    const view = new DataView(big.buffer)
    view.setUint32(records(big).get('main.js')! + 24, 100, true)
    expect(problems(big)).toEqual(['« main.js » est endommagé.'])

    const locked = service()
    const at = records(locked).get('view.js')!
    new DataView(locked.buffer).setUint16(at + 8, 1, true)
    expect(problems(locked)[0]).toMatch(/« view\.js » est chiffré/)

    // A Unix symbolic link named view.js.
    const link = zipSync({
      'package.json': strToU8(manifest()),
      'main.js': strToU8('x'),
      'view.js': [strToU8('/etc/passwd'), { os: 3, attrs: 0o120777 << 16 }]
    })
    expect(problems(link)).toEqual(['« view.js » est un lien, pas un fichier.'])
  })

  it('is refused when it is too big', () => {
    expect(problems(new Uint8Array(MAX_SERVICE_FILE_BYTES + 1))).toEqual(['Le fichier fait 5 Mo : un service fait au plus 5 Mo.'])
  })
})

describe('reviewing a file', () => {
  it('reads it without running it, and gives its verdict by the catalogue', async () => {
    const { c, file, catalogue } = community()
    const bytes = service({ 'help.md': 'Les pharmacies de garde.' })
    const path = file(bytes)

    const outside = await c.review(path)
    expect(outside).toMatchObject({ fileName: 'pharmagarde.3615', size: bytes.length, sha256: sha256(bytes), verdict: 'outside', problems: [], sync: false })
    expect(outside.tools).toEqual(['trouver la pharmacie de garde'])
    expect(outside.manifest?.id).toBe('pharmagarde')
    expect(outside.ticket).toMatch(/^[0-9a-f-]{36}$/)
    expect(outside.entry).toBeUndefined()

    catalogue.entries = [entryFor(bytes)]
    expect(await c.review(path)).toMatchObject({ verdict: 'validated', entry: { code: 'pharmagarde' } })
    catalogue.entries = [entryFor(bytes, { status: 'unvalidated' })]
    expect((await c.review(path)).verdict).toBe('unvalidated')
    catalogue.entries = [entryFor(bytes, { code: 'velo' })]
    expect((await c.review(path)).verdict).toBe('outside')
    const withdrawal: Withdrawal = { code: 'pharmagarde', version: '1.3.0', sha256: sha256(bytes), reason: 'Cette version envoyait l’adresse.' }
    catalogue.withdrawn = [withdrawal]
    expect(await c.review(path)).toMatchObject({ verdict: 'withdrawn', withdrawnReason: 'Cette version envoyait l’adresse.' })
    await expect(c.install((await c.review(path)).ticket)).rejects.toThrow('La validation de 3615 PHARMAGARDE 1.3.0 a été retirée : Marianne ne l’ajoute pas.')
  })

  it('refuses what is not a service, saying why', async () => {
    const { c, file } = community()
    expect(await c.review(file(service({ '../main.js': 'x' })))).toMatchObject({
      verdict: 'refused',
      manifest: null,
      ticket: '',
      problems: ['« ../main.js » sortirait du dossier du service.']
    })
    expect(await c.review(file(service(), 'pharmagarde.zip'))).toMatchObject({
      verdict: 'refused',
      problems: ['Ce fichier n’est pas un service Marianne : un service est un fichier .3615.']
    })
    const big = await c.review(file(new Uint8Array(MAX_SERVICE_FILE_BYTES + 1024 * 1024)))
    expect(big).toMatchObject({ verdict: 'refused', sha256: '', problems: ['Le fichier fait 6 Mo : un service fait au plus 5 Mo.'] })
    await expect(c.review(join(root, 'nowhere.3615'))).rejects.toThrow('Ce fichier est introuvable.')
  })
})

describe('adding a service', () => {
  it('writes it whole into its own folder, and says so', async () => {
    const { c, dir, file, events } = community({ now: () => Date.parse('2026-10-30T10:00:00Z') })
    const bytes = service({ 'help.md': 'Les pharmacies de garde.' })
    const review = await c.review(file(bytes))
    const added = await c.install(review.ticket)
    const folder = join(dir, 'packages', 'pharmagarde')
    expect(added).toEqual({
      code: 'pharmagarde',
      version: '1.3.0',
      dir: folder,
      sha256: sha256(bytes),
      verdict: 'outside',
      installedAt: '2026-10-30T10:00:00.000Z',
      // Each file's SHA-256: checked again before it runs.
      files: Object.fromEntries(['help.md', 'main.js', 'package.json', 'view.js'].map((name) => [name, sha256(readFileSync(join(folder, name)))]))
    })
    expect(events).toEqual([['installed', added]])
    expect(readdirSync(folder).sort()).toEqual(['help.md', INSTALLED_FILE, 'main.js', 'package.json', 'view.js'])
    expect(readFileSync(join(folder, 'main.js'), 'utf8')).toBe('export const service = {}')
    expect(JSON.parse(readFileSync(join(folder, INSTALLED_FILE), 'utf8'))).toMatchObject({
      code: 'pharmagarde',
      version: '1.3.0',
      sha256: sha256(bytes),
      verdict: 'outside'
    })
    expect(readdirSync(join(dir, 'staging'))).toEqual([])
    expect(c.installed()).toEqual([added])
    expect((await c.review(file(bytes))).installed).toBe('1.3.0')
    // A ticket adds once.
    await expect(c.install(review.ticket)).rejects.toThrow('Ce fichier n’est plus en attente : choisissez-le à nouveau.')
  })

  it('replaces an older version only once the new one is complete', async () => {
    const { c, dir, file } = community()
    await c.install((await c.review(file(service({ 'help.md': 'Les pharmacies de garde.' })))).ticket)
    const next = await c.install((await c.review(file(service({ 'package.json': manifest({}, '1.4.0'), 'view.css': '.x{}' })))).ticket)
    expect(next.version).toBe('1.4.0')
    expect(readdirSync(next.dir).sort()).toEqual([INSTALLED_FILE, 'main.js', 'package.json', 'view.css', 'view.js'])
    expect(readdirSync(join(dir, 'staging'))).toEqual([])

    // Staging can't be written: the new version fails, the one in place stays.
    rmSync(join(dir, 'staging'), { recursive: true })
    writeFileSync(join(dir, 'staging'), 'in the way')
    const ticket = (await c.review(file(service({ 'package.json': manifest({}, '2.0.0') })))).ticket
    await expect(c.install(ticket)).rejects.toThrow('3615 PHARMAGARDE n’a pas pu être enregistré sur cet ordinateur.')
    expect(c.installed().map((p) => p.version)).toEqual(['1.4.0'])
  })

  it('refuses a file changed since it was reviewed', async () => {
    const { c, file, events } = community()
    const path = file(service())
    const { ticket } = await c.review(path)
    writeFileSync(path, service({ 'main.js': 'export const service = { evil: true }' }))
    await expect(c.install(ticket)).rejects.toThrow('Ce fichier a changé depuis qu’il a été lu : choisissez-le à nouveau.')
    expect(events).toEqual([])
    expect(c.installed()).toEqual([])
  })

  it('forgets the files reviewed at the lock, and after a while', async () => {
    let now = Date.parse('2026-10-30T10:00:00Z')
    const { c, file } = community({ now: () => now })
    const first = await c.review(file(service()))
    c.forget()
    await expect(c.install(first.ticket)).rejects.toThrow('Ce fichier n’est plus en attente')
    const second = await c.review(file(service()))
    now += 31 * 60_000
    await expect(c.install(second.ticket)).rejects.toThrow('Ce fichier n’est plus en attente')
  })

  it('puts back a version moved aside by an update cut short, and tidies the rest', async () => {
    const { c, dir, file } = community()
    const added = await c.install((await c.review(file(service()))).ticket)
    mkdirSync(join(dir, 'staging'), { recursive: true })
    renameSync(added.dir, join(dir, 'staging', 'pharmagarde-0a1b2c.old'))
    mkdirSync(join(dir, 'staging', 'velo-3d4e5f'))
    c.start()
    expect(c.installed().map((p) => p.code)).toEqual(['pharmagarde'])
    expect(readdirSync(join(dir, 'staging'))).toEqual([])
  })

  it('removes a service from this computer', async () => {
    const { c, file, events } = community()
    const added = await c.install((await c.review(file(service()))).ticket)
    await c.remove('pharmagarde')
    expect(existsSync(added.dir)).toBe(false)
    expect(c.installed()).toEqual([])
    expect(events.at(-1)).toEqual(['removed', { code: 'pharmagarde' }])
  })
})

describe('adding a service of the catalogue', () => {
  it('downloads its file, checks it against the signed index, and adds it', async () => {
    const bytes = service()
    const { c, catalogue, fetch } = community({ served: () => bytes })
    catalogue.entries = [entryFor(bytes)]
    const added = await c.addFromCatalogue('pharmagarde')
    expect(added).toMatchObject({ code: 'pharmagarde', version: '1.3.0', verdict: 'validated', sha256: sha256(bytes) })
    expect(fetch).toHaveBeenCalledWith(
      'https://services.example.test/pharmagarde.3615',
      expect.objectContaining({ headers: { 'User-Agent': 'Marianne/test' } })
    )
  })

  it('refuses a file whose manifest says otherwise than the entry the user reviewed', async () => {
    const bytes = service({ 'package.json': manifest({ hosts: ['www.data.gouv.fr', 'tracker.example.com'] }) })
    const { c, catalogue } = community({ served: () => bytes })
    catalogue.entries = [entryFor(bytes)]
    await expect(c.addFromCatalogue('pharmagarde')).rejects.toThrow('Le fichier téléchargé ne correspond pas à celui que le catalogue a vérifié')
    expect(c.installed()).toEqual([])
  })

  it('refuses a file that is not the one the index lists', async () => {
    const bytes = service()
    const other = service({ 'main.js': 'export const service = { other: true }' })
    const { c, catalogue } = community({ served: () => other })
    const mismatch = 'Le fichier téléchargé ne correspond pas à celui que le catalogue a vérifié : Marianne ne l’a pas ajouté.'
    catalogue.entries = [entryFor(bytes, { file: { url: 'https://services.example.test/p.3615', size: other.length, sha256: sha256(bytes) } })]
    await expect(c.addFromCatalogue('pharmagarde')).rejects.toThrow(mismatch)
    // Larger than the index says: not even read whole.
    catalogue.entries = [entryFor(bytes, { file: { url: 'https://services.example.test/p.3615', size: 100, sha256: sha256(bytes) } })]
    await expect(c.addFromCatalogue('pharmagarde')).rejects.toThrow(mismatch)
    // The right file, but the index announces another version.
    catalogue.entries = [entryFor(other, { version: '1.2.0' })]
    await expect(c.addFromCatalogue('pharmagarde')).rejects.toThrow(mismatch)
    await expect(c.addFromCatalogue('velo')).rejects.toThrow('Ce service n’est pas (ou plus) dans le catalogue.')
    expect(c.installed()).toEqual([])
  })

  it('says when the file can’t be downloaded', async () => {
    const bytes = service()
    const { c, catalogue } = community({ served: () => null })
    catalogue.entries = [entryFor(bytes)]
    await expect(c.addFromCatalogue('pharmagarde')).rejects.toThrow('Le fichier du service n’a pas pu être téléchargé : réessayez plus tard.')
  })
})
