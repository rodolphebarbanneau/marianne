#!/usr/bin/env node
/**
 * marianne-pack: a community service's .3615 file, from its package folder.
 *
 *   node packages/sdk/scripts/pack.mjs <service folder> [--out <folder>]
 *
 * It checks the manifest as Marianne will (readManifest; `marianne.tools` listing every tool, by
 * name and label, which it checks by activating the main side with a fake context; none of what
 * only her own services declare: sites, news), refuses a sync job (a community service has none in
 * this version), builds `main.js` and `view.js` as ES
 * modules, each one file, their imports of Marianne's own modules left for her to resolve (see
 * MAIN_IMPORTS and VIEW_IMPORTS), extracts the view's styles to `view.css`, adds `help.md` and
 * `README.md`, and zips them into `<code>.3615` (dist/ by default). The same sources give the
 * same file, byte for byte: the catalogue validates a file by its SHA-256.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { zipSync } from 'fflate'
import { build, runnerImport } from 'vite'

const SDK = dirname(dirname(fileURLToPath(import.meta.url)))

/** What a service's main side may import of Marianne: her copies, in its sandbox. */
export const MAIN_IMPORTS = ['@marianne/sdk', '@marianne/sdk/main', 'zod']
/** What its view may import of Marianne, in its frame. */
export const VIEW_IMPORTS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@marianne/sdk',
  '@marianne/sdk/view',
  '@marianne/sdk/media',
  '@marianne/sdk/main',
  'zod'
]

/** As Marianne reads a .3615 (apps/desktop/src/main/community/package.ts). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
/** Every entry's date in the zip: the same sources, the same file. */
const STAMP = new Date('2026-01-01T00:00:00Z')

/** What keeps a folder from being packed: the reason, for its author. */
export class PackError extends Error {
  name = 'PackError'
}

/**
 * What a manifest may declare only for Marianne's own services, as she reads a .3615
 * (apps/desktop/src/main/community/package.ts): the sites she acts on for it, the headlines she
 * reads, the user's news sources. The first one found, or null.
 */
function builtInOnly(manifest) {
  if (manifest.sites.length) return '"marianne.sites" (the sites Marianne acts on for a service) is for her own services only'
  if (manifest.news) return '"marianne.news" (the headlines Marianne reads) is for her own services only'
  if (manifest.permissions.profile.includes('opinions.sources')) return '"opinions.sources" (the user\'s news sources) is for her own services only'
  return null
}

/** Packages a bundle may never hold: Node, Electron, the rest of Marianne, other copies of React or zod. */
function refused(id, allowed) {
  if (id.startsWith('node:') || builtinModules.includes(id) || builtinModules.includes(id.split('/')[0])) return 'Node is not available to a community service'
  if (id === 'electron' || id.startsWith('electron/')) return 'Electron is not available to a community service'
  if (/^@marianne\//.test(id)) return `only ${allowed.filter((a) => a.startsWith('@marianne/')).join(', ')} of Marianne`
  if (/^(react|react-dom|zod)(\/|$)/.test(id))
    return `only ${allowed.filter((a) => /^(react|zod)/.test(a)).join(', ') || 'none of React or zod'}, as Marianne gives them`
  return null
}

/** The import specifiers left in a built module. */
function importsOf(code) {
  const found = new Set()
  for (const re of [
    /\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?["']([^"']+)["']/g,
    /\bexport\s*[\w*{}\s,$]+\s*from\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
  ])
    for (const m of code.matchAll(re)) found.add(m[1])
  return [...found]
}

/** One side of the service, built into `outDir/<name>.js` (and its styles into `<name>.css`). */
async function bundle(root, entry, name, allowed, outDir) {
  await build({
    configFile: false,
    root,
    publicDir: false,
    logLevel: 'warn',
    mode: 'production',
    define: { 'process.env.NODE_ENV': '"production"' },
    oxc: { jsx: { runtime: 'automatic', importSource: 'react', development: false } },
    plugins: [
      {
        name: 'marianne-pack-imports',
        enforce: 'pre',
        resolveId(id) {
          if (allowed.includes(id)) return { id, external: true }
          if (id.startsWith('.') || id.startsWith('/') || id.startsWith('\0') || /^[a-zA-Z]:[\\/]/.test(id)) return null
          const why = refused(id, allowed)
          if (why) this.error(`${name}: imports "${id}": ${why}`)
          return null
        }
      }
    ],
    build: {
      outDir,
      emptyOutDir: false,
      copyPublicDir: false,
      minify: false,
      sourcemap: false,
      reportCompressedSize: false,
      cssCodeSplit: false,
      lib: { entry, formats: ['es'], fileName: () => `${name}.js`, cssFileName: name },
      // Paths in its comments are the service's own (src/greet.ts), wherever it is packed from.
      rollupOptions: { cwd: root, output: { codeSplitting: false } }
    }
  })
  const file = join(outDir, `${name}.js`)
  if (!existsSync(file)) throw new PackError(`${name}.js was not built`)
  const code = readFileSync(file, 'utf8')
  for (const spec of importsOf(code))
    if (!allowed.includes(spec)) throw new PackError(`${name}.js imports "${spec}": only ${allowed.join(', ')} are left to Marianne`)
  return file
}

/** The source of a side: its package's export, or the usual file. */
function sourceOf(dir, pkg, key, candidates) {
  const declared = pkg.exports?.[key]
  if (typeof declared === 'string') {
    const file = resolve(dir, declared)
    if (!existsSync(file)) throw new PackError(`package.json exports "${key}" as ${declared}, which does not exist`)
    return file
  }
  return candidates.map((c) => join(dir, c)).find((f) => existsSync(f)) ?? null
}

/** The manifest, as the .3615 carries it: what Marianne reads, nothing of the workspace. */
function packedManifest(pkg) {
  const out = { name: pkg.name, version: pkg.version }
  for (const key of ['description', 'license', 'author', 'homepage', 'repository']) if (pkg[key] !== undefined) out[key] = pkg[key]
  return { ...out, type: 'module', marianne: pkg.marianne }
}

/**
 * The .3615 of the service in `dir`. `out`: the folder it is written to (dir/dist by default).
 * Returns its path, its manifest, its size and its entries; throws PackError (or the SDK's
 * ManifestError) saying what is wrong.
 */
export async function pack(dir, { out } = {}) {
  const root = resolve(dir)
  const file = join(root, 'package.json')
  if (!existsSync(file)) throw new PackError(`${root} has no package.json`)
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  const { module: sdk } = await runnerImport(join(SDK, 'src/index.ts'))
  const manifest = sdk.readManifest(pkg)
  const reserved = builtInOnly(manifest)
  if (reserved) throw new PackError(`${reserved}: Marianne refuses it in a community service`)
  if (!Array.isArray(pkg.marianne?.tools)) throw new PackError('"marianne.tools" must list every tool the main side lends, by name and label ([] for none)')
  if (pkg.exports?.['./sync'] || ['src/sync.ts', 'src/sync.js'].some((f) => existsSync(join(root, f))))
    throw new PackError('a community service has no sync job in this version: Marianne would run it with Node, out of its sandbox')
  const main = sourceOf(root, pkg, './main', ['src/main.ts', 'src/main.js'])
  const view = sourceOf(root, pkg, './view', ['src/view.tsx', 'src/view.jsx', 'src/view.ts', 'src/view.js'])
  if (!main) throw new PackError('no main side: src/main.ts, or "exports": { "./main": … }')
  if (!view) throw new PackError('no view: src/view.tsx, or "exports": { "./view": … }')

  // The tools its main side lends, as Marianne will check them at activation: declared, by name and label.
  const { module: testing } = await runnerImport(join(SDK, 'src/testing.ts'))
  const { module: code } = await runnerImport(main)
  if (!code.service || typeof code.service.activate !== 'function')
    throw new PackError('the main side exports no `service` (export const service = defineService(…))')
  const runtime = code.service.activate(testing.fakeContext(pkg).ctx)
  for (const t of runtime?.tools ?? []) {
    const declared = manifest.tools.find((d) => d.name === t.name)
    if (!declared) throw new PackError(`the tool "${t.name}" is not declared in "marianne.tools"`)
    if (declared.label !== String(t.label).trim())
      throw new PackError(`the tool "${t.name}" is labelled "${t.label}", "marianne.tools" says "${declared.label}"`)
  }

  const work = mkdtempSync(join(tmpdir(), 'marianne-pack-'))
  try {
    await bundle(root, main, 'main', MAIN_IMPORTS, work)
    await bundle(root, view, 'view', VIEW_IMPORTS, work)
    const files = {
      'package.json': Buffer.from(`${JSON.stringify(packedManifest(pkg), null, 2)}\n`),
      'main.js': readFileSync(join(work, 'main.js')),
      'view.js': readFileSync(join(work, 'view.js'))
    }
    if (existsSync(join(work, 'view.css'))) files['view.css'] = readFileSync(join(work, 'view.css'))
    const help = sourceOf(root, pkg, './help', ['src/help.md', 'help.md'])
    if (help) files['help.md'] = readFileSync(help)
    if (existsSync(join(root, 'README.md'))) files['README.md'] = readFileSync(join(root, 'README.md'))
    const zip = zipSync(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, [new Uint8Array(bytes), { mtime: STAMP, level: 9 }]])))
    if (zip.length > MAX_FILE_BYTES) throw new PackError(`the file would be ${zip.length} bytes: a service is at most ${MAX_FILE_BYTES}`)
    const target = join(resolve(out ?? join(root, 'dist')), `${manifest.id}.3615`)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, zip)
    return { file: target, manifest, size: zip.length, entries: Object.keys(files) }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

// Run as a command (directly, or as the package's bin, through a link): pack the folder named.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--out')
  const out = at >= 0 ? args[at + 1] : undefined
  const dir = args.find((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1))
  if (!dir) {
    console.error('usage: marianne-pack <service folder> [--out <folder>]')
    process.exit(2)
  }
  try {
    const { file, manifest, size, entries } = await pack(dir, { out })
    console.log(`3615 ${manifest.id.toUpperCase()} ${manifest.version}: ${file} (${size} bytes: ${entries.join(', ')})`)
  } catch (err) {
    console.error(`marianne-pack: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
