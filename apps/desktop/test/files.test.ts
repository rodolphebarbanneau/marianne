import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The rename can be made to fail, as Windows does while another program holds the file.
const failures: string[] = []
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return {
    ...fs,
    renameSync: (from: string, to: string) => {
      const code = failures.shift()
      if (code) throw Object.assign(new Error(`${code}: rename`), { code })
      fs.renameSync(from, to)
    }
  }
})

const { samePath, writeFileAtomic } = await import('../src/main/files')

const dir = mkdtempSync(join(tmpdir(), 'marianne-files-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
beforeEach(() => void failures.splice(0))

describe('writeFileAtomic', () => {
  it('writes the whole file, and leaves nothing beside it', () => {
    const file = join(dir, 'config.json')
    writeFileAtomic(file, '{"a":1}')
    writeFileAtomic(file, '{"a":2}')
    expect(readFileSync(file, 'utf8')).toBe('{"a":2}')
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })

  it('tries again while another program holds the file', () => {
    const file = join(dir, 'held.json')
    failures.push('EPERM', 'EBUSY', 'EACCES')
    writeFileAtomic(file, 'saved')
    expect(readFileSync(file, 'utf8')).toBe('saved')
    expect(failures).toEqual([])
  })

  it('gives up at once on any other error, and after a while on a file that stays held', () => {
    failures.push('ENOSPC')
    expect(() => writeFileAtomic(join(dir, 'full.json'), 'x')).toThrow('ENOSPC')
    failures.push(...Array(20).fill('EPERM'))
    expect(() => writeFileAtomic(join(dir, 'locked.json'), 'x')).toThrow('EPERM')
  })
})

describe('samePath', () => {
  it('names one file whatever the way it is written', () => {
    expect(samePath(join(dir, 'a', '..', 'b.marianne'), join(dir, 'b.marianne'))).toBe(true)
    expect(samePath(join(dir, 'a.marianne'), join(dir, 'b.marianne'))).toBe(false)
    if (process.platform === 'win32') expect(samePath('C:/Users/Camille/A.marianne', 'c:\\users\\camille\\a.MARIANNE')).toBe(true)
  })
})
