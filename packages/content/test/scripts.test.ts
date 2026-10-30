import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('the content scripts', () => {
  it('load the content, TypeScript and the SDK it imports, with plain Node', () => {
    // What scripts/bundle.mjs does before reading the content, without writing a bundle in dist/.
    const hook = pathToFileURL(join(contentDir, 'scripts', 'typescript.mjs')).href
    const code = `await import(${JSON.stringify(hook)}); const c = await import('@marianne/content'); console.log(typeof c.readContent, typeof c.writeBundle)`
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: contentDir, encoding: 'utf8' })
    expect(out.trim()).toBe('function function')
  })
})
