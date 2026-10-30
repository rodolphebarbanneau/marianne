import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/shared/config'
import { accountSettings, merge } from '../src/main/config'

describe('config merge', () => {
  it('keeps known keys and types, replaces arrays', () => {
    const next = merge(structuredClone(DEFAULT_CONFIG), {
      ui: { theme: 'monochrome', fontSize: 'big', unknown: 1 },
      sources: { legifrance: { enabled: true } },
      otherArchives: ['E:\marianne.archive'],
      extra: true
    })
    expect(next.ui.theme).toBe('monochrome')
    expect(next.ui.fontSize).toBe(DEFAULT_CONFIG.ui.fontSize)
    expect((next.ui as Record<string, unknown>).unknown).toBeUndefined()
    expect(next.sources.legifrance).toEqual({ enabled: true, url: '' })
    expect(next.sources.datagouv.enabled).toBe(true)
    expect(next.otherArchives).toEqual(['E:\marianne.archive'])
    expect((next as unknown as Record<string, unknown>).extra).toBeUndefined()
  })

  it('takes open records as they are', () => {
    const next = merge(structuredClone(DEFAULT_CONFIG), { shortcuts: { palette: 'CommandOrControl+K' } }, ['shortcuts'])
    expect(next.shortcuts).toEqual({ palette: 'CommandOrControl+K' })
    expect(merge(structuredClone(DEFAULT_CONFIG), { shortcuts: { palette: 'CommandOrControl+K' } }).shortcuts).toEqual({})
  })

  it('reads back the services’ access, keyed by service, as it was saved', () => {
    const saved = accountSettings({}, { services: { access: { peage: ['vehicles.plate'], meteo: [] } } })
    const read = accountSettings(JSON.parse(JSON.stringify(saved)))
    expect(read.services.access).toEqual({ peage: ['vehicles.plate'], meteo: [] })
    expect(read.services.pinned).toEqual([])
    // A patch carries the whole record.
    expect(accountSettings(read, { services: { access: { peage: [] } } }).services.access).toEqual({ peage: [] })
  })

  it('reads the services an older Marianne starred as the pinned ones, in their order, once', () => {
    const older = { services: { starred: ['peage', 'meteo'], disabled: ['carte'], access: {} } }
    const read = accountSettings(older)
    expect(read.services.pinned).toEqual(['peage', 'meteo'])
    expect(read.services.disabled).toEqual(['carte'])
    expect((read.services as Record<string, unknown>).starred).toBeUndefined()
    // Once pinned in this Marianne, what was starred is left aside.
    expect(accountSettings({ services: { starred: ['peage'], pinned: ['meteo'] } }).services.pinned).toEqual(['meteo'])
    expect(accountSettings({ services: { opened: { meteo: '2026-10-30T08:00:00.000Z' } } }).services.opened).toEqual({ meteo: '2026-10-30T08:00:00.000Z' })
  })
})
