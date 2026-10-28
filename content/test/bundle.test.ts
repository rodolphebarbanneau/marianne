import { generateKeyPairSync, sign, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { files } from '../src/files'
import { ContentError, readBundle, readContent, writeBundle } from '../src/index'

const VERSION = '2026-11-02T10:15:00.000Z'

describe('content bundles', () => {
  it('give the same bytes for the same content, whatever the order and the line endings', () => {
    const reversed = Object.fromEntries(Object.entries(files).reverse())
    const crlf = Object.fromEntries(Object.entries(files).map(([path, text]) => [path, text.replace(/\n/g, '\r\n')]))
    const text = writeBundle(files, VERSION)
    expect(writeBundle(reversed, VERSION)).toBe(text)
    expect(writeBundle(crlf, VERSION)).toBe(text)
    expect(Object.keys(JSON.parse(text))).toEqual(['files', 'version'])
    expect(Object.keys(JSON.parse(text).files)).toEqual(Object.keys(files).sort())
  })

  it('round-trip, signed: the signature holds for these bytes only, and the content reads the same', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const data = Buffer.from(writeBundle(files, VERSION))
    const signature = sign(null, data, privateKey)
    expect(signature).toHaveLength(64)
    expect(verify(null, data, publicKey, signature)).toBe(true)
    const tampered = Buffer.from(data.toString('utf8').replace('Impôts', 'Imp0ts'))
    expect(verify(null, tampered, publicKey, signature)).toBe(false)
    expect(verify(null, data, generateKeyPairSync('ed25519').publicKey, signature)).toBe(false)

    const bundle = readBundle(data.toString('utf8'))
    expect(bundle.version).toBe(VERSION)
    expect(readContent(bundle.files)).toEqual(readContent(files))
  })

  it('refuses what is not a bundle', () => {
    const problems = (text: string) => {
      try {
        readBundle(text)
      } catch (err) {
        if (err instanceof ContentError) return err.problems
        throw err
      }
      return []
    }
    expect(problems('{')[0]).toMatch(/^content\.json: not JSON: /)
    expect(problems('[]')).toEqual(['content.json: must be an object: { "files", "version" }'])
    expect(problems(JSON.stringify({ files: { 'a.md': 1 }, version: '2026-11-02', signedBy: 'x' }))).toEqual([
      'content.json: signedBy: unknown key (expected: files, version)',
      'content.json: version: "2026-11-02" is not an ISO timestamp (UTC)',
      'content.json: files.a.md: must be text'
    ])
    expect(() => writeBundle(files, 'now')).toThrow('"now" is not an ISO timestamp (UTC)')
  })
})
