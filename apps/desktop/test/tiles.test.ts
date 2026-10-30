import { readManifest, type ServiceTile } from '@marianne/sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TILE_RETRY_MS, TILE_TIMEOUT_MS, TileHost, type TileSource } from '../src/main/host/tiles'

const manifest = readManifest({
  name: '@marianne/service-meteo',
  version: '1.0.0',
  marianne: { code: 'meteo', name: 'Météo', description: 'le temps', category: 'daily', hosts: [] }
})

const T0 = Date.parse('2026-10-30T08:00:00.000Z')

function setup(stored: Record<string, unknown> = {}) {
  let now = T0
  const records = new Map(Object.entries(stored))
  const warnings: string[] = []
  const host = new TileHost(
    () => ({ get: (id) => records.get(id) ?? null, put: (id, value) => void records.set(id, value) }),
    { warn: (...args: unknown[]) => void warnings.push(args.join(' ')) },
    () => now
  )
  const changes = vi.fn()
  host.on('change', changes)
  return { host, records, warnings, changes, later: (ms: number) => (now += ms) }
}

const source = (tile: () => Promise<ServiceTile | null>, everyMinutes?: number): TileSource => ({ manifest, tile, everyMinutes })
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('the tiles of the pinned services', () => {
  it('asks a service for its tile, keeps it in the archive, and shows the last one at once', async () => {
    const { host, records, changes } = setup()
    const tile = vi.fn(async () => ({ value: { text: '12°', unit: 'Rennes' } }))
    expect(host.states([source(tile)])).toEqual({ meteo: { tile: null, at: null, loading: true } })
    await settle()
    expect(tile).toHaveBeenCalledTimes(1)
    expect(changes).toHaveBeenCalledTimes(2)
    const shown = { tile: { value: { text: '12°', unit: 'Rennes' } }, at: new Date(T0).toISOString(), loading: false }
    expect(host.states([source(tile)])).toEqual({ meteo: shown })
    expect(records.get('meteo')).toEqual({ tile: shown.tile, at: shown.at })
    expect(tile).toHaveBeenCalledTimes(1)
  })

  it('reads the tile kept by an earlier start, and asks again once it is older than the service’s period', async () => {
    const at = new Date(T0 - 5 * 60_000).toISOString()
    const { host, later } = setup({ meteo: { tile: { title: 'hier' }, at } })
    const tile = vi.fn(async () => ({ title: 'aujourd’hui' }))
    expect(host.states([source(tile)])).toEqual({ meteo: { tile: { title: 'hier' }, at, loading: false } })
    later(10 * 60_000)
    expect(host.states([source(tile)]).meteo.loading).toBe(true)
    await settle()
    expect(host.states([source(tile)]).meteo.tile).toEqual({ title: 'aujourd’hui' })
    // Every 30 minutes, as the service asked.
    later(20 * 60_000)
    host.states([source(tile, 30)])
    expect(tile).toHaveBeenCalledTimes(1)
  })

  it('asks nothing while the page doesn’t show the tiles', () => {
    const { host } = setup()
    const tile = vi.fn(async () => null)
    host.states([source(tile)], false)
    expect(tile).not.toHaveBeenCalled()
  })

  it('holds a tile to its limits, saying so in the log', async () => {
    const { host, warnings } = setup()
    host.states([source(async () => ({ value: { text: '123456789' } }))])
    await settle()
    expect(host.states([source(async () => null)]).meteo.tile).toEqual({ value: { text: '12345…' } })
    expect(warnings[0]).toMatch(/Tile of 3615 METEO: value.text is cut to 6 characters/)
  })

  it('writes what a tile says wrong, or its failure, on one line of the log: a community service’s words are its code’s', async () => {
    const { host, warnings } = setup()
    host.states([source(async () => ({ value: { text: '12\n2026-10-30T09:00:00.000Z [error] faux' } }))])
    await settle()
    host.invalidate()
    host.states([
      source(async () => {
        throw new Error('down\r\n2026-10-30T09:00:00.000Z [error] faux')
      })
    ])
    await settle()
    expect(warnings).toHaveLength(2)
    for (const w of warnings) expect(w, w).not.toMatch(/[\r\n]/)
    expect(warnings[1]).toBe('Tile of 3615 METEO: down 2026-10-30T09:00:00.000Z [error] faux')
  })

  it('keeps the last tile when a service fails, and doesn’t ask it again at every look', async () => {
    const at = new Date(T0 - 60 * 60_000).toISOString()
    const { host, later } = setup({ meteo: { tile: { title: 'avant' }, at } })
    const tile = vi.fn(async (): Promise<ServiceTile> => {
      throw new Error('offline')
    })
    host.states([source(tile)])
    await settle()
    expect(host.states([source(tile)]).meteo).toEqual({ tile: { title: 'avant' }, at, loading: false, error: 'offline' })
    later(60_000)
    host.states([source(tile)])
    expect(tile).toHaveBeenCalledTimes(1)
  })

  it('asks a failing service again after 2 minutes, then twice as late, never later than its period', async () => {
    const { host, later } = setup()
    const tile = vi.fn(async (): Promise<ServiceTile> => {
      throw new Error('offline')
    })
    const look = async () => {
      host.states([source(tile, 15)])
      await settle()
    }
    await look()
    later(TILE_RETRY_MS)
    await look()
    expect(tile).toHaveBeenCalledTimes(2)
    later(TILE_RETRY_MS)
    await look()
    expect(tile).toHaveBeenCalledTimes(2)
    later(TILE_RETRY_MS)
    await look()
    expect(tile).toHaveBeenCalledTimes(3)
    // 8 minutes, then 15 (the period) rather than 16.
    later(8 * 60_000)
    await look()
    later(15 * 60_000)
    await look()
    expect(tile).toHaveBeenCalledTimes(5)
  })

  it('asks one service once at a time', () => {
    const { host } = setup()
    const tile = vi.fn(() => new Promise<null>(() => {}))
    host.states([source(tile)])
    host.states([source(tile)])
    expect(tile).toHaveBeenCalledTimes(1)
  })

  it('asks again at the next look whatever their age, once invalidated (the address changed)', async () => {
    const { host } = setup()
    const tile = vi.fn(async () => ({ title: 'Rennes' }))
    host.states([source(tile)])
    await settle()
    host.invalidate()
    host.states([source(tile)])
    await settle()
    expect(tile).toHaveBeenCalledTimes(2)
    host.invalidate('carte')
    host.states([source(tile)])
    expect(tile).toHaveBeenCalledTimes(2)
  })

  it('isn’t made stale by what its own service writes while making it', async () => {
    const { host } = setup()
    const tile = vi.fn(async () => {
      host.invalidate('meteo', true)
      return { title: 'Rennes' }
    })
    host.states([source(tile)])
    await settle()
    host.states([source(tile)])
    expect(tile).toHaveBeenCalledTimes(1)
  })

  it('drops a tile still being made when the account is locked: it was that account’s', async () => {
    const { host, records } = setup()
    let answer: (tile: ServiceTile) => void = () => {}
    host.states([source(() => new Promise<ServiceTile>((resolve) => (answer = resolve)))])
    host.clear()
    answer({ title: 'le compte d’avant' })
    await settle()
    expect(records.has('meteo')).toBe(false)
    const tile = vi.fn(async () => ({ title: 'le compte ouvert' }))
    expect(host.states([source(tile)]).meteo.loading).toBe(true)
    await settle()
    expect(host.states([source(tile)], false).meteo.tile).toEqual({ title: 'le compte ouvert' })
  })

  it('asks again once done when the user changed something while it was being made', async () => {
    const { host } = setup()
    let answer: (tile: ServiceTile) => void = () => {}
    const slow = () => new Promise<ServiceTile>((resolve) => (answer = resolve))
    host.states([source(slow)])
    host.invalidate('meteo')
    answer({ title: 'avant' })
    await settle()
    const tile = vi.fn(async () => ({ title: 'après' }))
    host.states([source(tile)])
    expect(tile).toHaveBeenCalledTimes(1)
  })

  it('forgets what it held when the account is locked', async () => {
    const { host, records } = setup()
    host.states([source(async () => ({ title: 'Camille' }))])
    await settle()
    records.clear()
    host.clear()
    expect(host.states([source(async () => null)], false).meteo.tile).toBeNull()
  })
})

describe('a tile that takes too long', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  it('is given up on: the last one stays', async () => {
    const { host } = setup()
    host.states([source(() => new Promise<null>(() => {}))])
    await vi.advanceTimersByTimeAsync(TILE_TIMEOUT_MS)
    expect(host.states([source(async () => null)], false).meteo).toEqual({ tile: null, at: null, loading: false, error: 'no tile after 10 s' })
  })
})
