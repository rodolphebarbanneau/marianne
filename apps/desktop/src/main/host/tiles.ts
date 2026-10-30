import { EventEmitter } from 'node:events'
import { readTile, tileMinutes, type ServiceManifest, type ServiceTile } from '@marianne/sdk'
import type { TileState } from '../../shared/types'
import { logLine } from '../community/runtime/limits'

/**
 * The tiles of the pinned services: what each service's `tile()` returned last, kept in the
 * account's archive so that the Services page shows it at once, with its age, while a newer one
 * is asked for. A tile is asked again when it is older than the service's `tile.everyMinutes`,
 * only while the page asks for them (it does while it shows), one call at a time per service. A
 * call that fails or takes too long leaves the last tile on the page.
 */

/** The archive's records of the last tiles, by service code. */
export const TILE_KIND = 'service-tile'

/** A tile that takes longer than this is given up on: the last one stays. */
export const TILE_TIMEOUT_MS = 10_000

/** After a failure, a tile is asked again this soon, then twice as late each time, never later than its period. */
export const TILE_RETRY_MS = 2 * 60_000

interface Kept {
  tile: ServiceTile | null
  /** When the service returned it (ISO). */
  at: string
}

/** What the tile host needs of the service host, and of the account's archive. */
export interface TileSource {
  manifest: ServiceManifest
  /** The service's tile(), when it has one. */
  tile?: () => Promise<ServiceTile | null>
  /** Its `tile.everyMinutes`. */
  everyMinutes?: number
}

export interface TileStore {
  get(id: string): unknown
  put(id: string, value: unknown): void
}

type Logger = { warn(...args: unknown[]): void }

export class TileHost extends EventEmitter {
  private kept = new Map<string, Kept>()
  /** When each service was last asked (ms), whatever came of it: a failing one is not asked at every look. */
  private asked = new Map<string, number>()
  private running = new Set<string>()
  private errors = new Map<string, string>()
  /** The failures in a row, by service: how long to wait before asking again. */
  private failures = new Map<string, number>()

  constructor(
    private store: () => TileStore | null,
    private log: Logger,
    private now: () => number = Date.now
  ) {
    super()
  }

  /** The tiles of these services, as they are; `ask`: the stale ones are asked again. */
  states(sources: TileSource[], ask = true): Record<string, TileState> {
    const out: Record<string, TileState> = {}
    for (const source of sources) {
      const id = source.manifest.id
      const kept = this.read(id)
      if (ask && source.tile && this.due(source, kept)) void this.ask(source)
      out[id] = {
        tile: kept?.tile ?? null,
        at: kept?.at ?? null,
        loading: this.running.has(id),
        ...(this.errors.has(id) ? { error: this.errors.get(id) } : {})
      }
    }
    return out
  }

  /**
   * Ask a service's tile again at the next look, or every one's (the address changed, a permission
   * was given). `own`: the service wrote it itself; what it writes while its tile is being made (a
   * cache) doesn't make that tile stale, while a change from elsewhere then (the user's, on its
   * screen) asks it again once it is done.
   */
  invalidate(id?: string, own = false): void {
    if (id && this.running.has(id)) {
      if (!own) this.dirty.add(id)
      return
    }
    if (id) this.versions.set(id, (this.versions.get(id) ?? 0) + 1)
    else this.version++
  }

  /**
   * Forget what is held in memory (the account was locked: the next one has its own tiles). A tile
   * still being made then is dropped when it comes: it was the last account's.
   */
  clear(): void {
    this.generation++
    this.kept.clear()
    this.asked.clear()
    this.errors.clear()
    this.failures.clear()
    this.running.clear()
    this.dirty.clear()
    this.version = 0
    this.versions.clear()
    this.askedAt.clear()
  }

  /** Bumped by `clear`: what an ask begun before brings back belongs to the account that was open. */
  private generation = 0
  /** Changed from elsewhere while their tile was being made: asked again once it is done. */
  private dirty = new Set<string>()

  /**
   * What tiles are worth: bumped for all of them, or one, by `invalidate`. A tile asked at an older
   * version (or kept from before, once one was bumped) is asked again whatever its age.
   */
  private version = 0
  private versions = new Map<string, number>()
  private askedAt = new Map<string, string>()
  private mark = (id: string) => `${this.version}:${this.versions.get(id) ?? 0}`

  private read(id: string): Kept | null {
    if (this.kept.has(id)) return this.kept.get(id)!
    const stored = this.store()?.get(id)
    if (!stored || typeof stored !== 'object' || typeof (stored as Kept).at !== 'string') return null
    // What an older version kept is read as a service's tile is: held to today's limits.
    const kept = { tile: readTile((stored as Kept).tile).tile, at: (stored as Kept).at }
    this.kept.set(id, kept)
    return kept
  }

  private due(source: TileSource, kept: Kept | null): boolean {
    const id = source.manifest.id
    if (this.running.has(id)) return false
    if ((this.version > 0 || this.versions.has(id)) && this.askedAt.get(id) !== this.mark(id)) return true
    const last = Math.max(kept ? Date.parse(kept.at) : 0, this.asked.get(id) ?? 0)
    const period = tileMinutes(source.everyMinutes) * 60_000
    const failed = this.failures.get(id) ?? 0
    // A failure (offline, a slow site) is worth trying again sooner than the period: the tile may be the default one meanwhile.
    const wait = failed ? Math.min(period, TILE_RETRY_MS * 2 ** (failed - 1)) : period
    return this.now() - last >= wait
  }

  private async ask(source: TileSource): Promise<void> {
    const id = source.manifest.id
    // The account's, captured now: the answer goes to it, or nowhere if it was locked meanwhile.
    const generation = this.generation
    const store = this.store()
    this.running.add(id)
    this.asked.set(id, this.now())
    this.askedAt.set(id, this.mark(id))
    this.emit('change')
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const raw = await Promise.race([
        source.tile!(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`no tile after ${TILE_TIMEOUT_MS / 1000} s`)), TILE_TIMEOUT_MS)
        })
      ])
      if (generation !== this.generation) return
      const { tile, problems } = readTile(raw)
      // The problems quote the tile's own texts, and a community service's tile is its code's: one line in the log.
      if (problems.length) this.log.warn(`Tile of 3615 ${id.toUpperCase()}:`, logLine(problems.join('; ')))
      const kept = { tile, at: new Date(this.now()).toISOString() }
      this.kept.set(id, kept)
      this.errors.delete(id)
      this.failures.delete(id)
      store?.put(id, kept)
    } catch (err) {
      if (generation !== this.generation) return
      const message = (err as Error).message
      this.log.warn(`Tile of 3615 ${id.toUpperCase()}:`, logLine(String(message)))
      this.errors.set(id, message)
      this.failures.set(id, (this.failures.get(id) ?? 0) + 1)
    } finally {
      clearTimeout(timer)
      if (generation === this.generation) {
        this.running.delete(id)
        if (this.dirty.delete(id)) this.versions.set(id, (this.versions.get(id) ?? 0) + 1)
        this.emit('change')
      }
    }
  }
}
