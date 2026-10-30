import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pack } from '@marianne/sdk/pack'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { afterAll, describe, expect, it } from 'vitest'
import { NO_SYNC, PackageRefused, sha256, unpackService } from '../src/main/community/package'

/** marianne-pack (packages/sdk/scripts/pack.mjs) on the example community service, and Marianne reading what it makes. */

const EXAMPLE = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/sdk/examples/bonjour')
const root = mkdtempSync(join(tmpdir(), 'marianne-pack-test-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** A copy of the example to change, in the repository's tmp/ (its imports resolve from the workspace, as the example's do). */
function copyOfExample(name: string): string {
  const dir = join(EXAMPLE, '../../../../tmp', `pack-test-${name}-${process.pid}`)
  mkdirSync(dirname(dir), { recursive: true })
  cpSync(EXAMPLE, dir, { recursive: true, filter: (src) => !/[\\/](dist|test)$/.test(src) })
  // Its tsconfig extends the workspace's, from where the copy is.
  const tsconfig = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8'))
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ ...tsconfig, extends: '../../tsconfig.base.json' }))
  copies.push(dir)
  return dir
}
const copies: string[] = []
afterAll(() => copies.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

describe('marianne-pack', () => {
  it('packs the example into a .3615 that Marianne accepts, the same file each time', { timeout: 60_000 }, async () => {
    const out = join(root, 'out')
    const packed = await pack(EXAMPLE, { out })
    expect(packed.file).toBe(join(out, 'bonjour.3615'))
    expect(packed.entries.sort()).toEqual(['README.md', 'help.md', 'main.js', 'package.json', 'view.css', 'view.js'])
    const bytes = readFileSync(packed.file)
    const { manifest, files } = unpackService(bytes, { reserved: new Set(['meteo']) })
    expect(manifest).toMatchObject({ id: 'bonjour', version: '1.0.0', tools: [{ name: 'greet', label: 'saluer' }], hosts: [] })
    // ES modules whose only imports are Marianne's own modules, left for her import maps.
    const main = new TextDecoder().decode(files.get('main.js'))
    const view = new TextDecoder().decode(files.get('view.js'))
    expect(main).toMatch(/^import \{ defineService, defineTool \} from "@marianne\/sdk\/main";/)
    expect(main).toContain('import * as z from "zod"')
    expect(main).toContain('export { service }')
    expect(view).toContain('from "@marianne/sdk/view"')
    expect(view).toContain('from "react/jsx-runtime"')
    expect(view).toContain('export { View }')
    expect(view).not.toContain('view.css')
    expect(new TextDecoder().decode(files.get('view.css'))).toContain('.bonjour-card')
    // The manifest as Marianne reads it, nothing of the workspace.
    expect(Object.keys(JSON.parse(new TextDecoder().decode(files.get('package.json'))))).toEqual([
      'name',
      'version',
      'description',
      'license',
      'author',
      'type',
      'marianne'
    ])
    const again = await pack(EXAMPLE, { out: join(root, 'again') })
    expect(sha256(readFileSync(again.file))).toBe(sha256(bytes))
  })

  it('refuses a sync job, which Marianne would refuse too', { timeout: 60_000 }, async () => {
    const dir = copyOfExample('sync')
    writeFileSync(join(dir, 'src/sync.ts'), 'export {}\n')
    await expect(pack(dir, { out: join(root, 'sync') })).rejects.toThrow('a community service has no sync job in this version')
    // A .3615 made by hand with one is refused when read.
    const files = unzipSync(readFileSync((await pack(EXAMPLE, { out: join(root, 'hand') })).file))
    const withSync = zipSync({ ...files, 'sync.js': strToU8('export default {}') })
    expect(() => unpackService(withSync, { reserved: new Set() })).toThrow(PackageRefused)
    try {
      unpackService(withSync, { reserved: new Set() })
    } catch (err) {
      expect((err as PackageRefused).problems).toEqual([NO_SYNC])
    }
  })

  it('refuses a tool its manifest doesn’t declare, and an import Marianne doesn’t give', { timeout: 60_000 }, async () => {
    const undeclared = copyOfExample('tools')
    const pkg = JSON.parse(readFileSync(join(undeclared, 'package.json'), 'utf8'))
    pkg.marianne.tools = []
    writeFileSync(join(undeclared, 'package.json'), JSON.stringify(pkg))
    await expect(pack(undeclared, { out: join(root, 'tools') })).rejects.toThrow('the tool "greet" is not declared in "marianne.tools"')
    delete pkg.marianne.tools
    writeFileSync(join(undeclared, 'package.json'), JSON.stringify(pkg))
    await expect(pack(undeclared, { out: join(root, 'tools') })).rejects.toThrow('"marianne.tools" must list every tool')

    const node = copyOfExample('node')
    writeFileSync(
      join(node, 'src/greet.ts'),
      `import { readFileSync } from 'node:fs'\n${readFileSync(join(EXAMPLE, 'src/greet.ts'), 'utf8')}\nexport const leak = () => readFileSync('/etc/passwd')\n`
    )
    await expect(pack(node, { out: join(root, 'node') })).rejects.toThrow('Node is not available to a community service')
  })
})
