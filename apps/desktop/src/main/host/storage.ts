import type { ServiceStorage } from '@marianne/sdk/main'

/**
 * A service's storage: the user's data for it, as records of the account's archive under its own
 * kind (`service:<code>`). One service never names another's records: it only gives keys. A
 * community service's storage is also held to a quota (its records and their size).
 */

/** The archive records of a service's stored data. */
export const storageKind = (code: string) => `service:${code}`

/** What a service's storage needs of the archive. */
export interface RecordStore {
  get<T>(kind: string, id: string): T | null
  put(kind: string, id: string, value: unknown): void
  remove(kind: string, id: string): void
  ids?(kind: string): string[]
}

/** The storage of the service `code` in the archive `store()` gives (it throws while locked); `stored`: it wrote. */
export function serviceStorage(code: string, store: () => RecordStore, stored: () => void = () => {}): ServiceStorage {
  const kind = storageKind(code)
  return {
    get: <T>(key: string) => store().get<T>(kind, key),
    set: (key, value) => {
      store().put(kind, key, value)
      stored()
    },
    remove: (key) => {
      store().remove(kind, key)
      stored()
    }
  }
}

/** A storage held to a quota: `put` writes without telling (the window's writes tell otherwise); `reset` forgets the tally (another account). */
export interface QuotaStorage extends ServiceStorage {
  put(key: string, value: unknown): void
  reset(): void
}

const sizeOf = (value: unknown) => {
  const json = JSON.stringify(value ?? null)
  return json === undefined ? 0 : Buffer.byteLength(json)
}

/**
 * The storage of a community service, at most `quota.records` records and `quota.bytes` of them
 * as JSON: a write past either fails with a French error, nothing written. The tally is read from
 * the archive once (the first write after `reset`), then kept with each write.
 */
export function quotaStorage(
  code: string,
  label: string,
  store: () => RecordStore,
  stored: () => void,
  quota: { records: number; bytes: number }
): QuotaStorage {
  const kind = storageKind(code)
  let sizes: Map<string, number> | null = null
  let total = 0
  const tally = () => {
    if (sizes) return sizes
    const s = store()
    sizes = new Map((s.ids?.(kind) ?? []).map((id) => [id, sizeOf(s.get(kind, id))]))
    total = [...sizes.values()].reduce((a, b) => a + b, 0)
    return sizes
  }
  const put = (key: string, value: unknown) => {
    const known = tally()
    const size = sizeOf(value)
    if (!known.has(key) && known.size >= quota.records) throw new Error(`${label} garde déjà ${quota.records} données : il n’en garde pas davantage.`)
    const next = total - (known.get(key) ?? 0) + size
    if (next > quota.bytes) throw new Error(`${label} garde déjà ${Math.round(quota.bytes / 1024 / 1024)} Mo de données : il n’en garde pas davantage.`)
    store().put(kind, key, value)
    known.set(key, size)
    total = next
  }
  return {
    get: <T>(key: string) => store().get<T>(kind, key),
    put,
    set: (key, value) => {
      put(key, value)
      stored()
    },
    remove: (key) => {
      const known = tally()
      store().remove(kind, key)
      total -= known.get(key) ?? 0
      known.delete(key)
      stored()
    },
    reset: () => {
      sizes = null
      total = 0
    }
  }
}
