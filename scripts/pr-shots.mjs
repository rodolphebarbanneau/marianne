#!/usr/bin/env node
// Puts a pull request's screenshots on GitHub and links them in its description, without a browser:
//
//   npm run pr:shots -- <number> [--from <folder>] [--again] [--dry]
//
// In the description, write each screenshot as `![what it shows](shot:<file>)`; the script finds each
// <file> in the folder (tmp/shots by default), uploads them in one commit to the ref
// refs/shots/pr-<number> of the pull request's repository, and puts their addresses in place of
// `shot:<file>`. The ref is not a branch: a clone doesn't download them, and the branch list doesn't
// show them. Each address names its commit, so a description keeps showing what it showed when a
// screenshot is replaced; with --again, the ones already linked are uploaded again from the folder,
// for a new version of the same files; --dry says what it would upload, and uploads nothing.
// Code and HTML comments in the description (the templates' hints) are left as they are.
//
// The command line has no way to attach an image to a pull request (the web page's drop is the only
// one), which made every pull request with screenshots a manual step. Needs gh, signed in, with the
// right to push to the repository. What a screenshot shows is public: invented data only.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const TYPES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const MAX_BYTES = 10 * 1024 * 1024

function usage(message) {
  if (message) console.error(message)
  console.error('Usage: npm run pr:shots -- <number> [--from <folder>] [--again] [--dry]')
  process.exit(1)
}

const args = process.argv.slice(2)
const number = args.find((a) => /^\d+$/.test(a))
if (!number) usage()
const fromAt = args.indexOf('--from')
const from = fromAt >= 0 ? args[fromAt + 1] : 'tmp/shots'
if (!from) usage('--from needs a folder.')
const again = args.includes('--again')
// Says what it would upload, and uploads nothing.
const dry = args.includes('--dry')

/** gh, its JSON answer; `input` goes to its standard input. */
function gh(argv, input) {
  const out = execFileSync('gh', argv, { input, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  return out.trim() ? JSON.parse(out) : null
}
const api = (method, path, body) => gh(['api', '-X', method, path, ...(body ? ['--input', '-'] : [])], body ? JSON.stringify(body) : undefined)

const pr = gh(['pr', 'view', number, '--json', 'body,headRepository,headRepositoryOwner'])
const repo = `${pr.headRepositoryOwner.login}/${pr.headRepository.name}`
const ref = `shots/pr-${number}`
const raw = `https://raw.githubusercontent.com/${repo}/`

// `shot:<file>` in a link or an image; with --again, the addresses this script gave before.
// Without --again, the second alternative never matches ((?!)), so that the groups stay the same.
const escaped = raw.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const linked = again ? `${escaped}[0-9a-f]{40}/` : '(?!)'
const pattern = new RegExp(`(\\]\\(|src=")(shot:([^)"\\s]+)|${linked}([^)"\\s]+))`, 'g')
// Only the description's prose: code (a fence, `inline`) and HTML comments (the templates' hints)
// may show the syntax as an example. Split keeps them, at the odd places.
const parts = pr.body.split(/(```[\s\S]*?```|`[^`\n]*`|<!--[\s\S]*?-->)/)
const prose = parts.filter((_, i) => i % 2 === 0).join('\n')
const files = new Map()
for (const m of prose.matchAll(pattern)) {
  const name = decodeURIComponent(m[3] ?? m[4])
  if (basename(name) !== name) usage(`« ${name} »: a file name, not a path (the folder is given by --from).`)
  if (!TYPES.has(extname(name).toLowerCase())) usage(`« ${name} »: an image (${[...TYPES].join(', ')}).`)
  const path = join(from, name)
  if (!existsSync(path)) usage(`« ${name} » is not in ${from}.`)
  if (statSync(path).size > MAX_BYTES) usage(`« ${name} » is over 10 MB.`)
  files.set(name, path)
}
if (!files.size) usage(`The description of #${number} has no shot:<file> to upload${again ? ', nor a screenshot linked before' : ''}.`)
if (dry) {
  for (const [name, path] of files) console.log(`${name}  ${path}  (${Math.round(statSync(path).size / 1024)} KB)`)
  console.log(`--dry: nothing uploaded to refs/${ref} of ${repo}.`)
  process.exit(0)
}

// One commit with all of them, on the pull request's ref (made at the first upload).
let base = null
try {
  base = api('GET', `repos/${repo}/git/ref/${ref}`).object.sha
} catch {
  // No screenshots yet for this pull request.
}
const tree = api('POST', `repos/${repo}/git/trees`, {
  ...(base ? { base_tree: api('GET', `repos/${repo}/git/commits/${base}`).tree.sha } : {}),
  tree: [...files].map(([name, path]) => ({
    path: name,
    mode: '100644',
    type: 'blob',
    sha: api('POST', `repos/${repo}/git/blobs`, { content: readFileSync(path).toString('base64'), encoding: 'base64' }).sha
  }))
})
const commit = api('POST', `repos/${repo}/git/commits`, {
  message: `Screenshots of pull request #${number}`,
  tree: tree.sha,
  parents: base ? [base] : []
})
if (base) api('PATCH', `repos/${repo}/git/refs/${ref}`, { sha: commit.sha, force: true })
else api('POST', `repos/${repo}/git/refs`, { ref: `refs/${ref}`, sha: commit.sha })

const url = (name) => `${raw}${commit.sha}/${encodeURIComponent(name)}`
const body = parts
  .map((part, i) => (i % 2 ? part : part.replace(pattern, (_all, open, _ref, shot, before) => `${open}${url(decodeURIComponent(shot ?? before))}`)))
  .join('')
execFileSync('gh', ['pr', 'edit', number, '--body-file', '-'], { input: body, stdio: ['pipe', 'inherit', 'inherit'] })
for (const name of files.keys()) console.log(`${name}  ${url(name)}`)
