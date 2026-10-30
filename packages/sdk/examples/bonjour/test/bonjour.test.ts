import { readManifest } from '@marianne/sdk'
import type { ServiceTool } from '@marianne/sdk/main'
import { checkTile, fakeContext } from '@marianne/sdk/testing'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import pkg from '../package.json'
import { greeting, weekBlocks } from '../src/greet'
import { service } from '../src/main'

const THURSDAY = new Date(2026, 9, 29, 10)

describe('3615 BONJOUR', () => {
  it('greets by name, capitalised, with the day', () => {
    expect(greeting('  camille ', THURSDAY)).toBe('Bonjour Camille, et bon jeudi !')
    expect(greeting('', THURSDAY)).toBe('Bonjour, et bon jeudi !')
    expect(weekBlocks(THURSDAY).map((b) => b.color)).toEqual(['cyan-clair', 'cyan-clair', 'cyan-clair', 'jaune', null, null, null])
  })

  it('counts the visits in the user’s storage', () => {
    const { ctx, stored } = fakeContext(pkg, { home: { code: '35238', name: 'Rennes', postcode: '35000' } })
    const runtime = service.activate(ctx)
    const methods = runtime.methods as unknown as { greet(n: string): { visits: number; from: string | null }; reset(): number; visits(): number }
    expect(methods.greet('Camille')).toMatchObject({ visits: 1, from: 'Rennes' })
    expect(methods.greet('Camille').visits).toBe(2)
    expect(stored.get('visits')).toBe(2)
    expect(methods.reset()).toBe(0)
    expect(methods.visits()).toBe(0)
  })

  it('lends the tools its manifest declares, and only those', async () => {
    const { ctx } = fakeContext(pkg)
    const runtime = service.activate(ctx)
    const declared = readManifest(pkg).tools
    expect((runtime.tools ?? []).map((t) => ({ name: t.name, label: t.label }))).toEqual(declared)
    const tool = runtime.tools![0] as ServiceTool
    expect(await tool.run(z.object(tool.input).parse({ name: ' Camille ' }), {})).toMatch(/^3615 BONJOUR says: "Bonjour Camille, et bon /)
    expect(z.object(tool.input).safeParse({ name: '' }).success).toBe(false)
  })

  it('keeps its tile within Marianne’s limits', async () => {
    const { ctx } = fakeContext(pkg)
    const tile = checkTile(await service.activate(ctx).tile!())
    expect(tile).toMatchObject({ value: { text: '0', unit: 'visite' }, visual: { kind: 'blocks' } })
  })
})
