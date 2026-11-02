import { EventEmitter } from 'node:events'
import { optionValue, optionValues, type ServiceManifest, type ServiceOptionValues } from '@marianne/sdk'
import type { ServiceOptions } from '@marianne/sdk/main'
import { accounts } from '../account'
import { log } from '../log'
import { session } from '../session'

/**
 * A service's own options (its manifest's `options`): what the user chose in the service's settings,
 * on the Services page, kept with the account's settings in its archive. Marianne checks each value
 * against the manifest before keeping it, and gives the service its values (`ctx.options`); the service
 * only reads them. Never in Réglages, which is the application's and the user's.
 */

/** Options changed, by service id: each service hears its own. */
const changes = new EventEmitter()
changes.setMaxListeners(0)

/** A service's options as it gets them: the open account's choice, else the defaults (and the defaults while locked). */
export function optionsOf(m: ServiceManifest): ServiceOptionValues {
  return optionValues(m.options, session.unlocked ? accounts.settings().services.options?.[m.id] : undefined)
}

/** `ctx.options`: the values, and their changes. A listener that throws is logged, not heard again for that change only. */
export function serviceOptions(m: ServiceManifest): ServiceOptions {
  return {
    get: () => optionsOf(m),
    onChange(listener) {
      const heard = (values: ServiceOptionValues) => {
        try {
          listener({ ...values })
        } catch (err) {
          log.warn(`[3615 ${m.id.toUpperCase()}] its options' listener failed:`, err instanceof Error ? err.message : String(err))
        }
      }
      changes.on(m.id, heard)
      return () => void changes.off(m.id, heard)
    }
  }
}

/** Tells a service its options as they are now: another account opened (its choices), or none (the defaults). */
export function announceOptions(m: ServiceManifest): void {
  if (m.options.length) changes.emit(m.id, optionsOf(m))
}

/** The user's choice for one of a service's options: checked against its manifest, kept, and told to the service. */
export function setOption(m: ServiceManifest, key: string, value: unknown): ServiceOptionValues {
  const option = m.options.find((o) => o.key === key)
  if (!option) throw new Error(`3615 ${m.id.toUpperCase()} n’a pas de réglage « ${String(key).slice(0, 40)} ».`)
  const checked = optionValue(option, value)
  if (checked === null) throw new Error(`3615 ${m.id.toUpperCase()} : cette valeur ne convient pas à « ${option.label} ».`)
  const kept = accounts.settings().services.options ?? {}
  // Only what the user chose is kept: an option they never set follows its default, should a later version change it.
  // A choice the manifest no longer takes (an option gone, a type changed) goes with this write.
  const stored: Record<string, unknown> = kept[m.id] ?? {}
  const chosen = m.options.filter((o) => o.key !== key && Object.hasOwn(stored, o.key) && optionValue(o, stored[o.key]) !== null)
  const choice = { ...Object.fromEntries(chosen.map((o) => [o.key, stored[o.key]])), [key]: checked }
  accounts.updateSettings({ services: { options: { ...kept, [m.id]: choice } } })
  const values = optionValues(m.options, choice)
  changes.emit(m.id, values)
  return values
}
