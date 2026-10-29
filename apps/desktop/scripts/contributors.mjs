// The authors the app names (GUIDE, Réglages › À propos): the repository's contributors on GitHub,
// its owner first, then in GitHub's order (most contributions first), bots left out. Written to
// src/shared/contributors.json, which the app bundles: it shows them without going online.
//
//   node scripts/contributors.mjs      (GH_TOKEN or GITHUB_TOKEN, if set, raises the API's limits)
//
// The release workflow runs it before building. When GitHub can't be reached, the list already
// there stays, with a warning: a release isn't held back for it.
import { readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const repo = new URL(pkg.homepage).pathname.replace(/^\/|\/$/g, '')
const owner = repo.split('/')[0]
const OUT = new URL('../src/shared/contributors.json', import.meta.url)
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN

async function get(path) {
  const res = await fetch(`https://api.github.com/${path}`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': `${pkg.name}-build`, ...(token ? { authorization: `Bearer ${token}` } : {}) }
  })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}

try {
  // The first hundred, by contributions: far more than this project has.
  const users = (await get(`repos/${repo}/contributors?per_page=100`)).filter((c) => c.type === 'User')
  // A stable sort: the owner moves up, the others keep GitHub's order.
  users.sort((a, b) => Number(b.login === owner) - Number(a.login === owner))
  const people = []
  for (const c of users) {
    const user = await get(`users/${c.login}`)
    people.push({ login: c.login, name: user.name?.trim() || c.login, url: c.html_url })
  }
  writeFileSync(OUT, `${JSON.stringify(people, null, 2)}\n`)
  console.log(`${people.length} contributor(s) of ${repo}: ${people.map((p) => p.login).join(', ')}`)
} catch (err) {
  const message = `Contributors not refreshed, the list already there stays: ${err instanceof Error ? err.message : err}`
  console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message)
}
