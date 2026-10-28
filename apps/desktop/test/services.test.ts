import { readManifest } from '@marianne/sdk'
import { describe, expect, it } from 'vitest'
import app from '../package.json'
import { BUILTIN_SERVICES } from '../src/main/host/registry'

/** The services the app depends on: those its build bundles (electron.vite.config.ts). */
const dependencies = Object.keys(app.devDependencies).filter((name) => name.startsWith('@marianne/service-'))

describe('built-in services', () => {
  it('are the app’s service packages, each named after its code', () => {
    const names = BUILTIN_SERVICES.map((s) => {
      const name = (s.pkg as { name: string }).name
      expect(name).toBe(`@marianne/service-${readManifest(s.pkg).id}`)
      return name
    })
    expect(names.sort()).toEqual(dependencies.sort())
  })
})
