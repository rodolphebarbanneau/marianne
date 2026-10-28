import { generateKeyPairSync } from 'node:crypto'
import { existsSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Creates the project's content-signing key pair (ed25519). The private key goes to the path
 * given, outside the repository: whoever holds it can change what every Marianne tells its users,
 * so keep it offline or in a secret store. The public key goes to content/signing-key.pem, built
 * into the app. Refuses to replace an existing public key: the apps already released only take
 * bundles signed with theirs. See docs/content.md.
 *
 *   npm run content:key -- /path/outside/the/repository/content-key.pem
 */

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const root = join(contentDir, '..')
const publicFile = join(contentDir, 'signing-key.pem')

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!process.argv[2]) fail('usage: npm run content:key -- <path of the private key, outside the repository>')
// npm runs the script in content/: a relative path is the caller's.
const target = resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[2])
if (!existsSync(dirname(target))) fail(`${dirname(target)} does not exist`)
const file = join(realpathSync(dirname(target)), basename(target))
const inRepo = relative(root, file)
if (!isAbsolute(inRepo) && inRepo.split(sep)[0] !== '..') fail(`${file} is inside the repository: the private key must be kept outside it`)
if (existsSync(file)) fail(`${file} exists: choose another path`)
if (existsSync(publicFile))
  fail('content/signing-key.pem exists: apps already released only take bundles signed with its key. To rotate the key, remove it first, knowingly.')

const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
})
writeFileSync(file, privateKey, { mode: 0o600, flag: 'wx' })
writeFileSync(publicFile, publicKey, { flag: 'wx' })
console.log(`private key: ${file} (keep it safe, never in the repository)`)
console.log('public key: content/signing-key.pem (commit it: the app is built with it)')
console.log(`sign the bundles with: MARIANNE_CONTENT_KEY=${file} npm run content:bundle`)
