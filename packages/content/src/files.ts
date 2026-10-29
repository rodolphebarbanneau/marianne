/**
 * The content built into the app: every file of the package, by its path in it
 * ("skills/benefits.md", "procedures/taxes/declare-income.md", "calendar.json"…), as text, for
 * readContent. Vite puts them in the build: nothing is read from disk at run time.
 */

const raw = import.meta.glob<string>(
  ['../skills/**/*', '../procedures/**/*', '../calendar.json', '../sites.json', '../news-sources.json', '../parliament.json'],
  {
    query: '?raw',
    import: 'default',
    eager: true
  }
)

export const files: Record<string, string> = Object.fromEntries(Object.entries(raw).map(([path, text]) => [path.replace(/^\.\.\//, ''), text]))

/**
 * The public key (PEM, ed25519) that content bundles must be signed with, or null: without
 * signing-key.pem, the app never takes a bundle and keeps the content it was built with.
 */
export const signingKey: string | null =
  Object.values(import.meta.glob<string>('../signing-key.pem', { query: '?raw', import: 'default', eager: true }))[0] ?? null
