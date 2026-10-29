import { EventEmitter } from 'node:events'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  readManifest,
  type DomainId,
  type ProfileField,
  type ServiceDeadline,
  type ServiceManifest,
  type ServiceState,
  type ServiceSummary
} from '@marianne/sdk'
import type { ServiceModule, ServiceRuntime } from '@marianne/sdk/main'
import type { TodayEvent } from '../../shared/public'
import { accounts } from '../account'
import { configStore } from '../config'
import { log } from '../log'
import { paths } from '../paths'
import { session } from '../session'
import type { Tool } from '../tools/tool'
import { grantedFields, serviceContext, storageKind } from './context'
import { BUILTIN_SERVICES } from './registry'
import { ServiceSync } from './sync'

/**
 * The service host: activates each service with its context, keeps what the user made of them
 * (on, starred), and is the one way the rest of the app reaches them: their views' calls, their
 * engine tools, guides and instructions, their lines of "Aujourd'hui", their sync jobs. A service
 * that fails to load is left out; the others work.
 */

interface Loaded {
  manifest: ServiceManifest
  module: ServiceModule
  runtime: ServiceRuntime | null
  sync: ServiceSync
  error?: string
  /** Shipped with Marianne (its registry); community services will not be. */
  builtIn: boolean
}

const SYNC_CHECK_MS = 3600_000

/** Services that changed their code: what the user kept follows them (3615 ASSEMBLEE became 3615 PARLEMENT). */
const RENAMED: Record<string, string> = { assemblee: 'parlement' }

class ServiceHost extends EventEmitter {
  private loaded: Loaded[] = []

  /** Read the manifests and activate the services; once, at start. */
  start(): void {
    const seen = new Set<string>()
    for (const { pkg, module } of BUILTIN_SERVICES) {
      let manifest: ServiceManifest
      try {
        manifest = readManifest(pkg)
        if (seen.has(manifest.id)) throw new Error(`two services named ${manifest.id}`)
      } catch (err) {
        log.error('Service left out:', (err as Error).message)
        continue
      }
      seen.add(manifest.id)
      const entry: Loaded = { manifest, module, runtime: null, sync: null as unknown as ServiceSync, builtIn: true }
      entry.sync = new ServiceSync(manifest, module.sync?.everyHours ?? 0, () => entry.runtime?.synced?.())
      entry.sync.on('change', () => this.emit('change'))
      try {
        entry.runtime = module.activate(serviceContext(manifest, entry.sync))
        this.checkTools(entry)
      } catch (err) {
        entry.runtime = null
        entry.error = (err as Error).message
        log.error(`3615 ${manifest.id.toUpperCase()} failed to start:`, entry.error)
      }
      this.loaded.push(entry)
    }
    // The public data of a renamed service is downloaded again under its new code.
    for (const from of Object.keys(RENAMED)) rmSync(join(paths.services, from), { recursive: true, force: true })
    session.on('unlocked', () => this.followRenamed())
    session.on('unlocked', () => setTimeout(() => void this.syncDue(), 10_000).unref())
    setInterval(() => void this.syncDue(), SYNC_CHECK_MS).unref()
  }

  /**
   * The user's data of a renamed service (favorites, clips…) and its star or switch, moved to its new
   * code, once. What it may read of the profile is asked again: the new service asks for other fields.
   */
  private followRenamed(): void {
    const archive = session.archive
    for (const [from, to] of Object.entries(RENAMED)) {
      for (const id of archive.ids(storageKind(from))) {
        if (archive.get(storageKind(to), id) === null) archive.put(storageKind(to), id, archive.get(storageKind(from), id))
        archive.remove(storageKind(from), id)
      }
      const { starred, disabled, access } = accounts.settings().services
      if (!starred.includes(from) && !disabled.includes(from) && !(from in access)) continue
      const rename = (list: string[]) => [...new Set(list.map((x) => (x === from ? to : x)))]
      const { [from]: _dropped, ...kept } = access
      accounts.updateSettings({ services: { starred: rename(starred), disabled: rename(disabled), access: kept } })
    }
  }

  private checkTools(entry: Loaded): void {
    const names = new Set<string>()
    for (const t of entry.runtime?.tools ?? []) {
      if (!/^[a-z][a-z0-9_]*$/.test(t.name) || names.has(t.name)) throw new Error(`tool name "${t.name}" must be unique, lowercase, with underscores`)
      names.add(t.name)
    }
  }

  private find(id: string): Loaded {
    const entry = this.loaded.find((s) => s.manifest.id === id)
    if (!entry) throw new Error(`Service inconnu : ${id}`)
    return entry
  }

  /** Every service, with what the user made of it (none starred nor off while locked). */
  states(): ServiceState[] {
    const connections = configStore.get().sources as Record<string, { enabled: boolean } | undefined>
    const chosen = session.unlocked
      ? accounts.settings().services
      : { starred: [], disabled: [], access: {} as Record<string, string[]>, reads: {} as Record<string, string> }
    return this.loaded.map(({ manifest, module, runtime, sync, error, builtIn }) => {
      const available = !!runtime && manifest.connections.every((c) => connections[c]?.enabled)
      return {
        manifest,
        available,
        on: available && !chosen.disabled.includes(manifest.id),
        starred: chosen.starred.includes(manifest.id),
        tools: (runtime?.tools ?? []).map((t) => ({ name: toolName(manifest, t.name), label: t.label })),
        ...(module.sync ? { sync: sync.status() } : {}),
        ...(error ? { error } : {}),
        builtIn,
        access: {
          asked: manifest.permissions.profile,
          granted: manifest.id in chosen.access ? grantedFields(manifest) : null,
          ...(chosen.reads[manifest.id] ? { readAt: chosen.reads[manifest.id] } : {})
        }
      }
    })
  }

  private active(): Loaded[] {
    const on = new Set(
      this.states()
        .filter((s) => s.on)
        .map((s) => s.manifest.id)
    )
    return this.loaded.filter((s) => on.has(s.manifest.id) && s.runtime)
  }

  /** A method of a service, called by its view. */
  async call(id: string, method: string, args: unknown[]): Promise<unknown> {
    const entry = this.find(id)
    if (!this.active().includes(entry)) throw new Error(`Le service ${entry.manifest.name} est désactivé.`)
    const fn = (entry.runtime!.methods as Record<string, (...a: unknown[]) => unknown>)[method]
    if (typeof fn !== 'function') throw new Error(`${entry.manifest.name} : méthode inconnue (${method})`)
    return fn(...args)
  }

  /** The tools of the services that are on, as the app's MCP server serves them. */
  tools(): Tool[] {
    return this.active().flatMap(({ manifest, runtime }) =>
      (runtime!.tools ?? []).map((t): Tool => ({
        name: toolName(manifest, t.name),
        title: `${manifest.name} · ${t.label}`,
        description: t.description,
        input: t.input,
        readOnly: t.readOnly,
        // A service never sees the user's identifiers: [[tokens]] are refused in its arguments.
        tokens: false,
        run: (args, ctx) => t.run(args as never, { folderId: ctx.folderId })
      }))
    )
  }

  /** The guides of the services that are on (Markdown with front matter). */
  skills(): Array<{ service: string; text: string }> {
    return this.active().flatMap(({ manifest, runtime }) => (runtime!.skills ?? []).map((text) => ({ service: manifest.id, text })))
  }

  /** The services that are on, for the engines' instructions: each with what it adds, or what it is. */
  instructions(): string {
    return this.active()
      .map(
        ({ manifest, runtime }) =>
          `## 3615 ${manifest.id.toUpperCase()} · ${manifest.name} (code ${manifest.id})\n\n${runtime!.instructions?.trim() || manifest.description}`
      )
      .join('\n\n')
  }

  /** Their lines of "Aujourd'hui"; a failing service is left out. */
  async today(day: string): Promise<TodayEvent[]> {
    const parts = await Promise.allSettled(
      this.active()
        .filter((s) => s.runtime!.today)
        .map(async ({ manifest, runtime }) =>
          (await runtime!.today!(day)).map((item): TodayEvent => ({ ...item, id: `${manifest.id}:${item.id}`, kind: 'service', service: manifest.id }))
        )
    )
    return parts.flatMap((p) => (p.status === 'fulfilled' ? p.value : (log.warn('Today, from a service:', (p.reason as Error).message), [])))
  }

  /** The lines of the services that are on and useful for a domain, for its dashboard. */
  async summaries(domain: DomainId): Promise<Array<{ service: string; summary: ServiceSummary }>> {
    const parts = await Promise.allSettled(
      this.active()
        .filter((s) => s.manifest.domains.includes(domain) && s.runtime!.summary)
        .map(async ({ manifest, runtime }) => ({ service: manifest.id, summary: await runtime!.summary!(domain) }))
    )
    return parts.flatMap((p) =>
      p.status === 'fulfilled'
        ? p.value.summary
          ? [p.value as { service: string; summary: ServiceSummary }]
          : []
        : (log.warn('Summary, from a service:', (p.reason as Error).message), [])
    )
  }

  /** The deadlines the services that are on know of; a failing service is left out. */
  deadlines(): Array<ServiceDeadline & { service: string }> {
    return this.active().flatMap(({ manifest, runtime }) => {
      try {
        return (runtime!.deadlines?.() ?? []).filter((d) => manifest.domains.includes(d.domain)).map((d) => ({ ...d, service: manifest.id }))
      } catch (err) {
        log.warn(`Deadlines of 3615 ${manifest.id.toUpperCase()}:`, (err as Error).message)
        return []
      }
    })
  }

  /** The user's answer to what a service asks to read: the fields granted (none: refused). */
  setAccess(id: string, granted: ProfileField[]): void {
    const { manifest } = this.find(id)
    const access = { ...accounts.settings().services.access, [id]: manifest.permissions.profile.filter((f) => granted.includes(f)) }
    accounts.updateSettings({ services: { access } })
  }

  /** The user's stored data for a service, read and written by its view. */
  data(id: string, key: string): unknown {
    this.find(id)
    return session.archive.get(storageKind(id), key) ?? null
  }

  setData(id: string, key: string, value: unknown): void {
    this.find(id)
    session.archive.put(storageKind(id), key, value)
  }

  /** Run a service's sync job now. */
  sync(id: string): Promise<void> {
    return this.find(id).sync.run()
  }

  /** The services that are on and whose data is old or missing. */
  private async syncDue(): Promise<void> {
    for (const s of this.active()) if (s.sync.due()) await s.sync.run()
  }
}

/** Engines see a service's tool as "<code>_<name>": parlement_ballots. */
const toolName = (m: ServiceManifest, name: string) => `${m.id}_${name}`

export const services = new ServiceHost()

export const serviceTools = () => services.tools()
export const serviceToday = (day: string) => services.today(day)
