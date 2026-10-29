import { describe, expect, it } from 'vitest'
import app from '../../package.json'
import { SERVICE_HELP, SERVICE_VIEWS } from '../../src/renderer/src/host/registry'

// Built-in services are named after their code (see test/services.test.ts).
const codes = Object.keys(app.devDependencies)
  .filter((name) => name.startsWith('@marianne/service-'))
  .map((name) => name.slice('@marianne/service-'.length))

describe('built-in services', () => {
  it('each have their screen in the window', () => {
    expect(Object.keys(SERVICE_VIEWS).sort()).toEqual(codes.sort())
  })

  it('each give a few lines of help for the guide (F1), without a heading of their own: the guide has Marianne’s', () => {
    expect(Object.keys(SERVICE_HELP).sort()).toEqual(codes.sort())
    for (const [code, help] of Object.entries(SERVICE_HELP)) {
      expect(help.trim().length, code).toBeGreaterThan(40)
      expect(help.length, code).toBeLessThan(900)
      expect(help, code).not.toMatch(/^#/m)
    }
  })
})
