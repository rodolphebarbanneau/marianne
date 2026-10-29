import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { DEFAULT_ACCOUNT_SETTINGS, DEFAULT_CONFIG } from '../shared/config'
import type { AccountSettings, DeepPartial, DeviceConfig } from '../shared/types'
import { writeFileAtomic } from './files'
import { log } from './log'
import { paths } from './paths'

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Deep-merge `patch` into `base`, ignoring keys that don't exist in `base` and type mismatches.
 * Arrays are replaced as a whole. Records whose keys are open (shortcuts) are listed in `open`.
 */
export function merge<T>(base: T, patch: unknown, open: string[] = []): T {
  if (!isObject(base) || !isObject(patch)) return base
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (open.includes(key) && isObject(value)) {
      out[key] = value
      continue
    }
    if (!(key in out)) continue
    const current = out[key]
    if (isObject(current)) out[key] = merge(current, value, open)
    else if (Array.isArray(current)) out[key] = Array.isArray(value) ? value : current
    else if (typeof value === typeof current) out[key] = value
  }
  return out as T
}

const OPEN_KEYS = ['shortcuts']

/** In an account's settings, the services' access is keyed by service id: a record taken whole. */
const ACCOUNT_OPEN_KEYS = ['access']

/** An account's settings: what its archive keeps, over the defaults, and `patch` on top. */
export function accountSettings(stored: unknown, patch?: DeepPartial<AccountSettings>): AccountSettings {
  const current = merge(structuredClone(DEFAULT_ACCOUNT_SETTINGS), stored ?? {}, ACCOUNT_OPEN_KEYS)
  return patch ? merge(current, patch, ACCOUNT_OPEN_KEYS) : current
}

/** This computer's preferences (config.json). */
class ConfigStore extends EventEmitter {
  private config: DeviceConfig = structuredClone(DEFAULT_CONFIG)

  load(): DeviceConfig {
    try {
      this.config = merge(structuredClone(DEFAULT_CONFIG), JSON.parse(readFileSync(paths.config, 'utf8')), OPEN_KEYS)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log.warn('Invalid config.json, using defaults:', err)
      this.config = structuredClone(DEFAULT_CONFIG)
      this.save()
    }
    return this.config
  }

  get(): DeviceConfig {
    return this.config
  }

  update(patch: DeepPartial<DeviceConfig>): DeviceConfig {
    const previous = this.config
    const next = merge(structuredClone(previous), patch, OPEN_KEYS)
    this.config = next
    this.save()
    this.emit('change', next, previous)
    return next
  }

  private save(): void {
    writeFileAtomic(paths.config, JSON.stringify(this.config, null, 2))
  }
}

export const configStore = new ConfigStore()
