import { describe, expect, it } from 'vitest'
import app from '../../package.json'
import { SERVICE_VIEWS } from '../../src/renderer/src/host/registry'

describe('built-in services', () => {
  it('each have their screen in the window', () => {
    // Built-in services are named after their code (see test/services.test.ts).
    const codes = Object.keys(app.devDependencies)
      .filter((name) => name.startsWith('@marianne/service-'))
      .map((name) => name.slice('@marianne/service-'.length))
    expect(Object.keys(SERVICE_VIEWS).sort()).toEqual(codes.sort())
  })
})
