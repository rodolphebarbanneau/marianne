import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLE_FILE, CONTENT_FILES, ContentError, readContent, SIGNATURE_FILE, writeBundle } from '@marianne/content'

/**
 * Builds the content bundle: content/dist/content.json, every file of content/ (skills,
 * procedures, the catalogs) by its path, with its version, the time of the build. With
 * MARIANNE_CONTENT_KEY naming the project's ed25519 private key (a PEM file outside the
 * repository), also its signature, content/dist/content.json.sig. Refuses content that doesn't
 * validate, and a key that doesn't match content/signing-key.pem. See docs/content.md.
 *
 *   MARIANNE_CONTENT_KEY=/path/to/content-key.pem npm run content:bundle
 */

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const root = join(contentDir, '..')
const out = join(contentDir, 'dist')

function fail(message) {
  console.error(message)
  process.exit(1)
}

/** Every file of a folder of the content, by its path in the package; dot files aside, as in the app's build. */
function walk(dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, files)
    else files[relative(contentDir, path).split(sep).join('/')] = readFileSync(path, 'utf8')
  }
}

const files = {}
for (const dir of ['skills', 'procedures']) walk(join(contentDir, dir), files)
for (const name of CONTENT_FILES) if (existsSync(join(contentDir, name))) files[name] = readFileSync(join(contentDir, name), 'utf8')

let content
try {
  content = readContent(files)
} catch (err) {
  if (err instanceof ContentError) fail(err.message)
  throw err
}

const version = new Date().toISOString()
const data = Buffer.from(writeBundle(files, version))
mkdirSync(out, { recursive: true })
writeFileSync(join(out, BUNDLE_FILE), data)
// Never the signature of an earlier build beside this bundle.
rmSync(join(out, SIGNATURE_FILE), { force: true })

// npm runs the script in content/: a relative path is the caller's.
const keyFile = process.env.MARIANNE_CONTENT_KEY && resolve(process.env.INIT_CWD ?? process.cwd(), process.env.MARIANNE_CONTENT_KEY)
if (keyFile) {
  if (!existsSync(keyFile)) fail(`MARIANNE_CONTENT_KEY: ${keyFile} does not exist`)
  const inRepo = relative(root, realpathSync(keyFile))
  if (!isAbsolute(inRepo) && inRepo.split(sep)[0] !== '..')
    fail(`MARIANNE_CONTENT_KEY: ${keyFile} is inside the repository; the private key must be kept outside it`)
  const key = createPrivateKey(readFileSync(keyFile))
  if (key.asymmetricKeyType !== 'ed25519') fail(`MARIANNE_CONTENT_KEY: ${keyFile} is an ${key.asymmetricKeyType} key, not ed25519`)
  const publicFile = join(contentDir, 'signing-key.pem')
  if (!existsSync(publicFile)) fail('content/signing-key.pem is missing: the app would take no bundle (node scripts/content-key.mjs creates the pair)')
  const signature = sign(null, data, key)
  if (!verify(null, data, createPublicKey(readFileSync(publicFile)), signature))
    fail(`MARIANNE_CONTENT_KEY: ${keyFile} does not match content/signing-key.pem: the app would refuse the bundle`)
  writeFileSync(join(out, SIGNATURE_FILE), signature)
}

const counts = `${content.skills.length} skills, ${content.procedures.length} démarches, ${content.calendar.length} dates, ${content.sites.length} sites, ${content.newsSources.length} news sources`
console.log(`content/dist/${BUNDLE_FILE}: version ${version}, ${counts}, last change ${content.updated}`)
console.log(keyFile ? `content/dist/${SIGNATURE_FILE}: signed` : 'not signed: set MARIANNE_CONTENT_KEY to the private key to sign it')
