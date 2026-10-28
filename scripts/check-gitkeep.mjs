import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * A .gitkeep only holds a folder that is empty and still needed: next to other files it is a
 * leftover. Lists them and fails, so `npm run check` catches them.
 */

const SKIP = new Set(['node_modules', '.git', 'out', 'dist', 'tmp'])
const root = process.cwd()
const leftovers = []

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  if (entries.some((e) => e.name === '.gitkeep') && entries.length > 1) leftovers.push(relative(root, join(dir, '.gitkeep')))
  for (const e of entries) if (e.isDirectory() && !SKIP.has(e.name)) walk(join(dir, e.name))
}

walk(root)
if (leftovers.length) {
  console.error(`.gitkeep next to other files (remove it):\n${leftovers.map((f) => `  ${f}`).join('\n')}`)
  process.exit(1)
}
