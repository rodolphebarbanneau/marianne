import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAIN_IMPORTS, VIEW_IMPORTS } from '@marianne/sdk/pack'
import { describe, expect, it } from 'vitest'
import { workerImports } from '../src/main/community/runtime/scheme'

/**
 * The modules a community service imports of Marianne, written in several places that move
 * together (AGENTS.md): what the packer lets a view import (VIEW_IMPORTS), the files the build
 * makes of them (RUNTIME_MODULES), the screen's import map that resolves them (runtime/view.html),
 * and the SDK's exports they are.
 */

const app = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (file: string) => readFileSync(join(app, file), 'utf8')

/**
 * RUNTIME_MODULES, as electron.vite.config.ts writes it: the output's name for each module. Read,
 * not imported: the config reads the app's package.json from where it runs, and brings the build.
 */
function runtimeModules(): Record<string, string> {
  const body = /const RUNTIME_MODULES: Record<string, string> = \{([^}]*)\}/.exec(read('electron.vite.config.ts'))?.[1]
  if (!body) throw new Error('RUNTIME_MODULES not found in electron.vite.config.ts')
  return Object.fromEntries([...body.matchAll(/(?:'([^']+)'|([\w$]+)):\s*'([^']+)'/g)].map((m) => [m[1] ?? m[2], m[3]]))
}

/** The screen page's import map. */
function importMap(): Record<string, string> {
  const json = /<script type="importmap">([\s\S]*?)<\/script>/.exec(read('src/runtime/view.html'))?.[1]
  if (!json) throw new Error('no import map in src/runtime/view.html')
  return (JSON.parse(json) as { imports: Record<string, string> }).imports
}

const sorted = (list: Iterable<string>) => [...list].sort()

describe('the modules a community service imports of Marianne', () => {
  it('are the same in the packer, the build, the screen’s import map and the SDK’s exports', () => {
    const modules = runtimeModules()
    const map = importMap()
    expect(VIEW_IMPORTS.length).toBeGreaterThan(5)
    // Each one the packer lets a view import is built once, and the import map resolves it.
    expect(sorted(Object.values(modules))).toEqual(sorted(VIEW_IMPORTS))
    expect(sorted(Object.keys(map))).toEqual(sorted(VIEW_IMPORTS))
    // To the file built for it.
    for (const [name, spec] of Object.entries(modules)) expect(map[spec], spec).toBe(`./${name}.js`)
    // Marianne's own are modules her SDK exports.
    const sdk = JSON.parse(readFileSync(join(app, '../../packages/sdk/package.json'), 'utf8')) as { exports: Record<string, string> }
    for (const spec of VIEW_IMPORTS.filter((s) => s.startsWith('@marianne/')))
      expect(Object.keys(sdk.exports), spec).toContain(spec.replace('@marianne/sdk', '.'))
  })

  it('give a main side, whose worker has no import map, the same files', () => {
    const files = Object.fromEntries(Object.entries(runtimeModules()).map(([name, spec]) => [spec, name]))
    expect(VIEW_IMPORTS).toEqual(expect.arrayContaining(MAIN_IMPORTS))
    for (const spec of MAIN_IMPORTS) expect(workerImports(`import x from '${spec}'`)).toBe(`import x from './~runtime/${files[spec]}.js'`)
  })
})
