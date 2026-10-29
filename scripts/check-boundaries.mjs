import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

/**
 * The rules of the repository's packages (docs/design.md, "The code"). Lists what breaks them and
 * fails, so `npm run check` and CI catch it:
 *
 * - a package imports another by its name, never by a path out of its own folder;
 * - only the apps run on Electron;
 * - in packages/, React only in the SDK's views (its .tsx files);
 * - of Marianne, each package imports only what ALLOWED gives it; the apps import any of it.
 */

/** What each package may import of Marianne, besides itself. A new package needs its line here. */
const ALLOWED = {
  '@marianne/sdk': [],
  '@marianne/archive': [],
  '@marianne/content': ['@marianne/sdk'],
  '@marianne/profile': ['@marianne/content', '@marianne/sdk'],
  // Every service: the SDK only (docs/services.md).
  '@marianne/service-*': ['@marianne/sdk']
}

const SKIP = new Set(['node_modules', '.git', 'out', 'dist', 'tmp'])
const SOURCE = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
const root = process.cwd()

/** The import specifiers of a file: static imports and re-exports, dynamic imports, requires. */
function specifiers(text) {
  const found = []
  for (const re of [
    /^\s*(?:import|export)\s(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g
  ])
    for (const m of text.matchAll(re)) found.push(m[1])
  return found
}

function sources(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const path = join(dir, e.name)
    if (e.isDirectory()) sources(path, out)
    else if (SOURCE.has(extname(e.name))) out.push(path)
  }
  return out
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const subfolders = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? [join(dir, e.name)] : []))

/** The workspace's packages, from the root package.json: their folder, name and kind (apps, packages, services). */
function workspaces() {
  return readJson(join(root, 'package.json'))
    .workspaces.flatMap((glob) => (glob.endsWith('/*') ? subfolders(glob.slice(0, -2)) : [glob]))
    .filter((dir) => existsSync(join(root, dir, 'package.json')))
    .map((dir) => ({ dir: join(root, dir), name: readJson(join(root, dir, 'package.json')).name, kind: dir.split(/[\\/]/)[0] }))
}

const allowedFor = (name) => ALLOWED[name] ?? (name.startsWith('@marianne/service-') ? ALLOWED['@marianne/service-*'] : undefined)
/** The package an import names: "@marianne/sdk" for "@marianne/sdk/main", "zod" for "zod". */
const packageOf = (spec) => spec.split('/', spec.startsWith('@') ? 2 : 1).join('/')

const problems = []
for (const pkg of workspaces()) {
  const app = pkg.kind === 'apps'
  const allowed = allowedFor(pkg.name)
  if (!app && !allowed) problems.push(`${pkg.name}: no rule in scripts/check-boundaries.mjs (ALLOWED): say what it may import of Marianne`)
  for (const file of sources(pkg.dir)) {
    const where = relative(root, file).split(sep).join('/')
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('.')) {
        const target = relative(pkg.dir, resolve(dirname(file), spec))
        if (target.startsWith('..')) problems.push(`${where}: imports '${spec}', out of ${pkg.name}: import a package by its name`)
        continue
      }
      if (app) continue
      const name = packageOf(spec)
      if (/^@?electron([-/]|$)/.test(name)) problems.push(`${where}: imports '${spec}': only the apps run on Electron`)
      else if ((name === 'react' || name === 'react-dom') && pkg.kind === 'packages' && !(pkg.name === '@marianne/sdk' && extname(file) === '.tsx'))
        problems.push(`${where}: imports '${spec}': in packages/, React is for the SDK's views only`)
      else if (name === 'marianne') problems.push(`${where}: imports the app ('${spec}'): a package never depends on an app`)
      else if (name.startsWith('@marianne/') && name !== pkg.name && allowed && !allowed.includes(name))
        problems.push(`${where}: imports '${spec}': ${pkg.name} may import ${allowed.length ? allowed.join(', ') : 'nothing'} of Marianne`)
    }
  }
}

if (problems.length) {
  console.error(`Package boundaries broken (see docs/design.md):\n${problems.map((p) => `  ${p}`).join('\n')}`)
  process.exit(1)
}
